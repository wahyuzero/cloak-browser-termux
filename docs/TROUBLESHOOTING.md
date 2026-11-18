# Troubleshooting — every error we hit, root cause, and fix

A field log from getting CloakBrowser's Chromium 146 running natively in Termux
(Android 14, aarch64, Bionic libc). If your install fails, find your error here.

---

## 1. `Unsupported platform: android`

**Where:** `cloakbrowser/dist/config.js` `getPlatformTag()`
**Cause:** `process.platform` is `"android"` in Termux; only linux/darwin/win32 are accepted.
**Fix:** preload this before anything else runs in the Node process:

```js
// spoof-platform.mjs
Object.defineProperty(process, "platform", { value: "linux" });
```

Wire it via `NODE_OPTIONS="--import /path/to/spoof-platform.mjs"` so every
child MCP server process gets it.

---

## 2. `no such file or directory: .../chrome`

**Cause:** ELF interpreter `/lib/ld-linux-aarch64.so.1` doesn't exist on Android (Bionic).
**Fix:**
```bash
pkg install tur-repo && pkg install glibc-runner   # bundle lives in $PREFIX/glibc
patchelf --set-interpreter $PREFIX/glibc/lib/ld-linux-aarch64.so.1 chrome
```

---

## 3. `error while loading shared libraries: libX.so`

**Cause:** Chromium needs ~40 desktop Linux libraries that Bionic/Termux lacks.
**Fix:** automated in `install.sh` step 4. Manual loop:

```bash
# download index once
curl -sL http://deb.debian.org/debian/dists/stable/main/binary-arm64/Packages.xz | xz -dc > idx
# repeat: get missing lib name, fetch its deb, extract into glibc lib dir
MISS=$(chrome --version 2>&1 | grep -oP 'libraries: +\K\S+' | head -1 | cut -d: -f1)
FILE=$(grep -A30 "^Package: <deb-package>\$" idx | grep ^Filename: | awk '{print $2}')
curl -sL "http://deb.debian.org/debian/$FILE" -o d.deb && dpkg -x d.deb x
find x -name "*.so*" -exec cp -a {} $PREFIX/glibc/lib/ \;
```

Gotchas:
- Debian trixie renamed many packages with a `t64` suffix (`libgnutls30t64`,
  `libhogweed6t64`, `libasound2t64`, …). If "GAK ADA DI REPO"/"unable to locate",
  try the `t64` name.
- `/tmp` is not writable in Termux — use `$HOME/.cache/...` for temp files.
- `grep -A15` is too short for the Debian index; use `-A30`.

---

## 4. `Invalid file descriptor to ICU data received` (icu_util.cc)

**The sneakiest failure.** Chromium appears to launch but dies at ICU init.

**Cause:** if you launch chrome *through* the loader (`ld.so ./chrome`), ld.so
maps the binary into its own process — `/proc/self/exe` points to the **loader**.
Chromium resolves `icudtl.dat` relative to `/proc/self/exe`, finds the glibc dir,
and open() fails.

**Fix:** don't run through `ld.so`. Use patchelf to embed interpreter + rpath so
the kernel execs chrome directly:

```bash
patchelf --set-interpreter $PREFIX/glibc/lib/ld-linux-aarch64.so.1 chrome
patchelf --force-rpath --set-rpath $PREFIX/glibc/lib chrome
```

Verification: `readlink /proc/self/exe` inside a loader-spawned process shows the
loader path, not your binary.

---

## 5. `liblog.so: cannot open shared object file`

**Cause:** Termux/Hermes export `LD_LIBRARY_PATH` with Bionic dirs. Library
search order is: `DT_RPATH` → `LD_LIBRARY_PATH` → `DT_RUNPATH`. We used
`--set-rpath` (= `DT_RUNPATH`, *lowest* priority), so the polluted env won.

**Fix:** two layers:
```bash
patchelf --force-rpath --set-rpath $GLIB chrome   # DT_RPATH beats LD_LIBRARY_PATH
# AND launch with a clean env:
env -u LD_LIBRARY_PATH -u LD_PRELOAD chrome ...
```

The `LD_PRELOAD` variant is nastier: Termux preloads `libtermux-exec-ld-preload.so`,
whose `NEEDED` is literally `libc.so` — in the glibc tree that's an ASCII linker
script → `invalid ELF header`. With a glibc-resolved chain this can cascade into
missing `liblog.so` lookups from wrong paths.

---

## 6. `invalid ELF header` on `libc.so` / `libm.so`

**Cause:** `$PREFIX/glibc/lib/libc.so` is a linker *script* (ASCII text), not an
ELF. Chrome's load chain tries to dlopen it.
**Fix:** replace scripts with real binaries for the ones requested at runtime:
```bash
cp $GLIB/libc.so.6  $GLIB/libc.so
cp $GLIB/libm.so.6  $GLIB/libm.so    # repeat for libdl/libpthread if hit
```
Keep backups (`libc.so.script.bak`) in case a TUR tool needs the script form.

---

## 7. `libpixman-1.so.0: version 'GLIBC_2.43' not found`

**Cause:** TUR bundle ships a pixman built against a newer glibc than its own libc
(max 2.42). Check with:
```bash
strings $GLIB/libc.so.6 | grep GLIBC_2. | sort -uV | tail -1
strings $GLIB/libpixman-1.so.0 | grep GLIBC_2. | sort -uV | tail -1
```
**Fix:** overwrite with Debian's build (built against older glibc):
```bash
# from the Debian index: libpixman-1-0 → dpkg -x → cp to $GLIB
```

---

## 8. `launched a headed browser without having a XServer running`

**Cause:** cloak-browser-mcp defaults to headed (for stealth realism).
**Fix:** pass `--headless` to the MCP server args. For headed mode on Android:
```bash
pkg install x11-repo && pkg install xorg-server-xvfb
xvfb-run cloak-browser-mcp-termux --caps all
```

---

## 9. `FATAL:crypto/nss_util.cc ... libsqlite3.so.0: cannot open` (HTTPS pages)

**Cause:** without a persistent NSS database, Chrome falls back to in-memory and
still needs sqlite. HTTPS navigation then dies.
**Fix:** `dpkg -x` `libsqlite3-0` (Debian arm64) into `$GLIB`, plus
`libfontconfig1` + a font package + `FONTCONFIG_PATH=$GLIB/../etc/fonts`.
Symptom before fonts: `Fontconfig error: Cannot load default config file`.

---

## 10. `posix_spawn .../chrome_crashpad_handler: No such file or directory`

**Cause:** crashpad handler binary also needs the patchelf treatment.
**Fix:** `--set-interpreter` + `--force-rpath` on it too (installer does both), or
run chrome with `--disable-crashpad`.

---

## 11. MCP tool calls: `Required at target`

**Cause:** cloak-browser-mcp's interaction tools take `target` (a snapshot ref
like `e25` OR a raw selector), not Playwright-MCP's classic `ref` param.
**Fix:** read `browser_snapshot` refs, pass as `target`.

---

## 12. `env: bad interpreter` / `cloak-browser-mcp: not found` saat di-spawn MCP client

**Cause:** under a clean env (`LD_PRELOAD=""`), Termux's `termux-exec` preload is
inactive, so the kernel resolves shebangs literally. `#!/usr/bin/env bash` fails
(`/usr/bin/env` doesn't exist on Android), and `dist/index.js` has **no shebang at
all** (kernel exec fails → `ENOENT`/`not found`).
**Fix:**
- launcher uses `#!/data/data/com.termux/files/usr/bin/bash` (direct path)
- launcher execs `node $PREFIX/lib/node_modules/@devinwangd/cloak-browser-mcp/dist/index.js`
  directly instead of relying on a `bin` shim
- also note: `sed -i` on `$PREFIX/bin/cloak-browser-mcp` **breaks the npm symlink**
  (it becomes a regular file that can't resolve `@modelcontextprotocol/sdk`). Use the
  launcher instead; never edit the global bin in place.

---

## 13. `Failed to create a ProcessSingleton for your profile directory`

**Cause:** a previous Chromium instance is still alive holding the profile
(typically after a crashed MCP run), or stale Playwright temp profiles.
**Fix:**
```bash
pgrep -fl "cloakbrowser/chromium"    # find zombies
kill -9 <pid>                        # careful: pkill -f chrome can kill your own shell
```
The launcher also pins `TMPDIR=$PREFIX/usr/tmp` so temp profile paths stay short
and predictable.

---

## Working baseline (the flags that matter)

```bash
env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  FONTCONFIG_PATH=$GLIB/../etc/fonts \
  chrome --headless --no-sandbox --disable-gpu --disable-crashpad \
         --disable-dev-shm-usage --dump-dom https://example.com
```

If this prints HTML, everything above is satisfied and the MCP layer will work.

---

## Field log round 2 — installer bugs found on a fresh device (Android 12, Termux, Node 26)

### 7. `npm install -g .` fails with a wall of TS2307/TS7006/TS7031

**Where:** `npm run build` inside the global install's prepare script.
**Cause:** two separate things: (a) `node_modules` was never populated in the
source checkout, so `zod` cannot be resolved; (b) the strict tsconfig produces
implicit-any errors across many files (not just the one `testing.ts` the old
patch touched).
**Fix (automated in install.sh):** run `npm ci`/`npm i` in `$REPO_SRC` before
building, and on strict-build failure relax the tsconfig flags (`strict`,
`noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`),
then retry. npm output goes to `$WORK/npm-*.log` instead of `/dev/null` so
failures are actually visible.

### 8. `install.sh: line NNN: .../debian-arm64-packages.idx: No such file or directory`

**Where:** Step 4 index download.
**Cause:** `$PREFIX/var/tmp` does not exist on all Termux installs; the redirect
into it fails with "Read-only file system"-adjacent errors.
**Fix:** `mkdir -p "$(dirname "$IDX")"` before the curl.

### 9. `ERR_MODULE_NOT_FOUND: Cannot find package 'cloakbrowser'` in dl.mjs

**Where:** Step 2 downloader.
**Cause:** `dl.mjs` lives in `$WORK` where there is no `node_modules`, and ESM
resolution never looks at global npm packages. The empty `DL_OUT` cascaded into
`CHROME_DIR="."`, which passed the `-d` check — a **false-positive** download
that silently skipped patchelf (no binaries found) and the lib loop (chrome
never ran, so no missing-lib output), until the smoke test failed with no
diagnostic context.
**Fix:** dl.mjs now resolves `cloakbrowser` by absolute path: deterministic
candidate list (global MCP install + local source checkout), with a
`find -L ... -name cloakbrowser` fallback. Step 2 validation now requires
`$CHROME_DIR/chrome` to actually exist instead of trusting `dirname`.

### 10. `find` returns nothing even though the directory obviously exists

**Cause:** npm's global install can leave a **symlink** behind
(`node_modules/@devinwangd/cloak-browser-mcp -> ~/cloak-browser-mcp-src`), and
GNU find does not follow symlinks by default. Verified with
`ls -la node_modules/@devinwangd/`.
**Fix:** `find -L` with `-maxdepth 6` (the nested package sits 4–5 levels deep).

### 11. `cloak-browser-mcp-termux --self-test` prints 33 tools, not 80

**Cause:** the default capability set is a subset; 80 tools only register with
`--caps all`.
**Fix:** use `--self-test --caps all`; the MCP client config already passes
`--caps all`.
