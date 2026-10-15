# CloakBrowser MCP — native Termux (Android) support

Run [**cloak-browser-mcp**](https://github.com/wahyuzero/cloak-browser-mcp) — the stealth-Chromium MCP server — **natively in Termux on Android. No root, no proot, no chroot.**

CloakHQ/CloakBrowser only ships Linux-x64/arm64 (glibc) builds and rejects `process.platform === "android"`. This repo contains a fully automated installer that bridges that gap with `patchelf` + a curated glibc library set, so the **same 80-tool stealth MCP server** (Cloudflare Turnstile, reCAPTCHA v3, FingerprintJS, BrowserScan bypass) runs on your phone.

Verified working on: **Android 14, aarch64, Termux (Node 24), Chromium 146 (CloakBrowser), MCP 80 tools registered, HTTPS navigation, form-fill + login flow.**

---

## Quick start

```bash
git clone https://github.com/wahyuzero/cloak-browser-termux.git
cd cloak-browser-termux
bash install.sh
```

The installer (~10–20 min, mostly the 200 MB Chromium download) does everything:

| Step | What it does |
|---|---|
| 0 | Installs `patchelf`, `glibc-runner`, `xz`, Node deps |
| 1 | Clones & builds cloak-browser-mcp, installs it globally |
| 2 | Downloads CloakBrowser Chromium (linux-arm64) |
| 3 | `patchelf` — injects glibc interpreter + RPATH into `chrome` / `chrome_crashpad_handler` |
| 4 | Loops until **every** shared library Chromium needs is resolved from Debian arm64 + TUR glibc |
| 5 | Installs fontconfig + fonts (Chromium crashes without them) |
| 6 | Writes the `cloak-browser-mcp-termux` launcher + platform spoof |
| 7 | Smoke test: renders `https://example.com` headlessly |

## Wire it into your MCP client

```json
{
  "mcpServers": {
    "cloak-browser": {
      "command": "cloak-browser-mcp-termux",
      "args": ["--caps", "all", "--headless"]
    }
  }
}
```

> `--headless` is **required** on Android (no X server). The default mode is headed and will fail with "launched a headed browser without an XServer".

Quick check without a client:

```bash
cloak-browser-mcp-termux --self-test      # should print: 80 tools registered
```

## Why this is non-trivial (the interesting part)

Running a glibc Chromium on Android's Bionic libc breaks in **six independent ways**. Each one produces a misleading error message:

1. **`Unsupported platform: android`** — `cloakbrowser` checks `process.platform`. Fix: preload an ESM module that redefines it to `linux` via `NODE_OPTIONS=--import spoof-platform.mjs`.

2. **`no such file or directory: chrome`** — the ELF interpreter `/lib/ld-linux-aarch64.so.1` doesn't exist on Bionic. Fix: `pkg install glibc-runner` (bundle at `$PREFIX/glibc`) + `patchelf --set-interpreter`.

3. **Missing ~40 shared libraries** (`libnss3`, `libatk`, `libgbm`, `libcups`, `libasound`, …). Fix: `install.sh` step 4 downloads the Debian arm64 package index once, then loops: run chrome → parse the loader's "cannot open shared object file" → map lib → download `.deb` → `dpkg -x` into `$PREFIX/glibc/lib` → repeat until clean.

4. **`Invalid file descriptor to ICU data received`** — the sneakiest one. If you launch `chrome` *through* `ld.so` (`ld.so ./chrome`), the loader maps the binary into its own process, so `/proc/self/exe` points at **the loader**, and Chromium looks for `icudtl.dat` next to the loader instead of next to chrome. Fix: `patchelf --set-interpreter` so chrome is exec'd directly by the kernel.

5. **`liblog.so: cannot open`** — Termux/Hermes environments export `LD_LIBRARY_PATH` pointing at Bionic libs, and `DT_RUNPATH` has *lower* priority than `LD_LIBRARY_PATH`. Fix: `patchelf --force-rpath` (creates `DT_RPATH`, which wins) and launch with `LD_LIBRARY_PATH="" LD_PRELOAD=""`.

6. **`libpixman requires GLIBC_2.43`** — the TUR glibc bundle ships a pixman newer than its own libc. Fix: overwrite it with Debian's build (handled automatically in the lib loop / step 4 heuristic).

Also required: `--disable-dev-shm-usage` (no `/dev/shm` on Android) and fonts (headless rendering crashes at NSS/Fontconfig without them — both fixed by the installer).

## Launcher environment contract

`cloak-browser-mcp-termux` sets, then execs the MCP server:

```
LD_LIBRARY_PATH=""          # must not leak Bionic libs into the glibc process
LD_PRELOAD=""               # termux-exec preload needs libc.so (script) → crash
FONTCONFIG_PATH=~../usr/glibc/etc/fonts
NODE_OPTIONS="--import .../spoof-platform.mjs"
```

Any process spawning this launcher (MCP client) just works; nothing else needs configuring.

## Files

| File | Purpose |
|---|---|
| `install.sh` | One-command installer (steps 0–7 above) |
| `launcher/cloak-browser-mcp-termux` | Standalone launcher (also installed to `$PREFIX/bin` by installer) |
| `launcher/spoof-platform.mjs` | `process.platform` spoof for the Node MCP server |
| `docs/TROUBLESHOOTING.md` | Every error we hit, root cause, and fix |

## Known limitations

- **Headless only** — install `x11-repo` + `xorg-server-xvfb` and run under `xvfb-run` if you need headed mode (stealth audit may score differently).
- **aarch64 only.**
- Chromium is version-locked to whatever CloakHQ ships; a future CloakBrowser update may require re-running the lib loop (just re-run `install.sh` — it is idempotent).
- ~1.5 GB disk total (glibc bundle + Chromium + libs + fonts).

## Credits

- [wahyuzero/cloak-browser-mcp](https://github.com/wahyuzero/cloak-browser-mcp) — the MCP server (fork of devinwang's work)
- [CloakHQ/CloakBrowser](https://github.com/CloakHQ/cloakbrowser) — the patched stealth Chromium
- [Termux glibc-runner (TUR)](https://github.com/termux-user-repository/tur) — glibc bundle

## License

Follows upstream licenses. The scripts here are MIT.
