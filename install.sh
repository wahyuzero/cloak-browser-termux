#!/data/data/com.termux/files/usr/bin/env bash
# ============================================================================
# cloak-browser-termux — one-command installer
# Runs cloak-browser-mcp (CloakBrowser stealth Chromium) natively in Termux.
# Repo: https://github.com/wahyuzero/cloak-browser-mcp
# ============================================================================
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
die()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  CloakBrowser for Termux — native installer  ║"
echo "  ║  stealth Chromium · no root · no proot       ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

[[ "$(uname -m)" == "aarch64" ]] || die "Only aarch64 (arm64) is supported. Your arch: $(uname -m)"
command -v pkg >/dev/null || die "This must run inside Termux."
command -v node >/dev/null || pkg install -y nodejs || die "Install nodejs first: pkg install nodejs"
ok "Environment check passed (Termux aarch64 + Node $(node --version))"

REPO_SRC="${HOME}/cloak-browser-mcp-src"
GLIB="$HOME/../usr/glibc/lib"
DEBFIX="${HOME}/.cache/debfix"
WORK="${HOME}/.cloakbrowser-termux"

mkdir -p "$DEBFIX" "$WORK"

# ----------------------------------------------------------------------------
# Step 0 — packages needed by the installer itself
# ----------------------------------------------------------------------------
echo ""
warn "Step 0/7 — installing build tools (patchelf, typescript, xz)..."
pkg install -y patchelf xz-utils tur-repo >/dev/null 2>&1
pkg install -y glibc-runner >/dev/null 2>&1   # provides the glibc bundle at $PREFIX/glibc
command -v patchelf >/dev/null || die "patchelf failed to install"
command -v npm >/dev/null || die "npm not found"
ok "Build tools ready"

# ----------------------------------------------------------------------------
# Step 1 — clone repo + install MCP server globally
# ----------------------------------------------------------------------------
echo ""
warn "Step 1/7 — cloning cloak-browser-mcp and building..."
if [[ ! -d "$REPO_SRC" ]]; then
  git clone --depth 1 https://github.com/wahyuzero/cloak-browser-mcp.git "$REPO_SRC" \
    || die "git clone failed"
fi
cd "$REPO_SRC"

# TypeScript >=5.6 ships native binaries that do not support Android; use 5.5 (pure JS).
npm i -g typescript@5.5.4 >/dev/null 2>&1 || die "typescript install failed"
if ! npm i -g . >/dev/null 2>&1; then
  warn "Strict build failed (known upstream issue on TS>=5.6); retrying with relaxed build..."
  # Patch the one file that fails TS7006 under 5.5
  sed -i 's/\.map((el: any)/.map((el: any)/' src/tools/testing.ts 2>/dev/null
  sed -i 's/data\.map((el)/data.map((el: any)/' src/tools/testing.ts 2>/dev/null
  npm i -g . >/dev/null 2>&1 || die "npm install -g . failed even after patching"
fi
command -v cloak-browser-mcp >/dev/null || die "cloak-browser-mcp binary not on PATH"
ok "MCP server installed globally (80 tools)"

# ----------------------------------------------------------------------------
# Step 2 — download CloakBrowser Chromium (linux-arm64 build, ~200 MB)
# ----------------------------------------------------------------------------
echo ""
warn "Step 2/7 — downloading CloakBrowser Chromium (~200 MB, be patient)..."
cat > "$WORK/dl.mjs" <<'EOF'
Object.defineProperty(process, 'platform', { value: 'linux' });
const mod = await import('cloakbrowser/dist/download.js');
const ensure = mod.ensureBinary || mod.installChromium;
const r = await ensure();
console.log('OK:', typeof r === 'string' ? r : JSON.stringify(r));
EOF
DL_OUT=$(node "$WORK/dl.mjs" 2>&1 | grep "^OK:" | cut -d' ' -f2-)
CHROME_DIR=$(dirname "${DL_OUT:-}")
[[ -n "$CHROME_DIR" && -d "$CHROME_DIR" ]] || die "Chromium download failed. Output: ${DL_OUT:-<empty>}"
ok "Chromium downloaded to $CHROME_DIR"

# ----------------------------------------------------------------------------
# Step 3 — patchelf: give the binary a glibc interpreter + RPATH
# ----------------------------------------------------------------------------
echo ""
warn "Step 3/7 — patchelf-ing Chromium binaries..."
[[ -f "$GLIB/ld-linux-aarch64.so.1" ]] || die "glibc bundle missing — is glibc-runner installed?"
for BIN in chrome chrome_crashpad_handler; do
  [[ -f "$CHROME_DIR/$BIN" ]] || continue
  patchelf --set-interpreter "$GLIB/ld-linux-aarch64.so.1" "$CHROME_DIR/$BIN"
  patchelf --force-rpath --set-rpath "$GLIB" "$CHROME_DIR/$BIN"
done
ok "patchelf done (interpreter + RPATH)"

# ----------------------------------------------------------------------------
# Step 4 — pull every shared library Chromium needs from Debian arm64
# ----------------------------------------------------------------------------
echo ""
warn "Step 4/7 — resolving shared libraries (this loops until none are missing)..."

# Termux's env pollutes the loader; always run with a clean env.
run_chrome() { env -u LD_LIBRARY_PATH -u LD_PRELOAD "$CHROME_DIR/chrome" "$@"; }

IDX="$HOME/../usr/var/tmp/debian-arm64-packages.idx"
if [[ ! -s "$IDX" ]]; then
  echo "    downloading Debian arm64 package index (~9 MB)..."
  curl -sL http://deb.debian.org/debian/dists/stable/main/binary-arm64/Packages.xz \
    | xz -dc > "$IDX" || die "Debian package index download failed"
fi

# lib name -> Debian package. Sorted by likelihood of being needed.
declare -A PKGMAP=(
  [libnspr4.so]=libnspr4 [libnss3.so]=libnss3 [libnssutil3.so]=libnss3
  [libsmime3.so]=libnss3 [libssl3.so]=libnss3 [libsqlite3.so.0]=libsqlite3-0
  [libatk-1.0.so.0]=libatk1.0-0t64 [libatk-bridge-2.0.so.0]=libatk-bridge2.0-0t64
  [libatspi.so.0]=libatspi2.0-0t64 [libcups.so.2]=libcups2t64
  [libgbm.so.1]=libgbm1 [libwayland-client.so.0]=libwayland-client0
  [libpango-1.0.so.0]=libpango-1.0-0 [libpangocairo-1.0.so.0]=libpango-1.0-0
  [libpangoft2-1.0.so.0]=libpango-1.0-0 [libasound.so.2]=libasound2t64
  [libXdamage.so.1]=libxdamage1 [libXrandr.so.2]=libxrandr2 [libXfixes.so.3]=libxfixes3
  [libXcomposite.so.1]=libxcomposite1 [libXcursor.so.1]=libxcursor1 [libXi.so.6]=libxi6
  [libjpeg.so.62]=libjpeg62-turbo [libpng16.so.16]=libpng16-16t64
  [libfontconfig.so.1]=libfontconfig1 [libfreetype.so.6]=libfreetype6
  [libharfbuzz.so.0]=libharfbuzz0b [libthai.so.0]=libthai0 [libdatrie.so.1]=libdatrie1
  [libgraphite2.so.3]=libgraphite2-3 [libX11-xcb.so.1]=libx11-xcb1
  [libudev.so.1]=libudev1 [libgudev-1.0.so.0]=libgudev-1.0-0
  [libfribidi.so.0]=libfribidi0 [libXrender.so.1]=libxrender1
  [libxcb-render.so.0]=libxcb-render0 [libxcb-shm.so.0]=libxcb-shm0
  [libmount.so.1]=libmount1 [libblkid.so.1]=libblkid1 [libselinux.so.1]=libselinux1
  [libpcre2-8.so.0]=libpcre2-8-0 [libzstd.so.1]=libzstd1 [liblzma.so.5]=liblzma5
  [libmd.so.0]=libmd0 [libbsd.so.0]=libbsd0
  [libavahi-common.so.3]=libavahi-common3 [libavahi-client.so.3]=libavahi-client3
  [libavahi-glib.so.1]=libavahi-glib1
  [libgssapi_krb5.so.2]=libgssapi-krb5-2 [libkrb5.so.3]=libkrb5-3 [libk5crypto.so.3]=libkrb5-3
  [libkrb5support.so.0]=libkrb5-support0 [libcom_err.so.2]=libcom-err2 [libkeyutils.so.1]=libkeyutils1
  [libgnutls.so.30]=libgnutls30t64 [libhogweed.so.6]=libhogweed6t64 [libnettle.so.8]=libnettle8t64
  [libgmp.so.10]=libgmp10 [libidn2.so.0]=libidn2-0 [libunistring.so.5]=libunistring5
  [libtasn1.so.6]=libtasn1-6 [libp11-kit.so.0]=libp11-kit0 [libffi.so.8]=libffi8
  [libcrypt.so.2]=libcrypt2 [libcap-ng.so.0]=libcap-ng0 [libaudit.so.1]=libaudit1 [libcap2.so.0]=libcap2
  [libxml2.so.2]=libxml2 [libicuuc.so.72]=libicu72 [libicuuc.so.73]=libicu73
  [libicui18n.so.72]=libicu72 [libicui18n.so.73]=libicu73
  [libicudata.so.72]=libicu72 [libicudata.so.73]=libicu73
  [libFLAC.so.12]=libflac12 [libvorbis.so.0]=libvorbis0a [libvorbisenc.so.2]=libvorbisenc2
  [libogg.so.0]=libogg0 [libopus.so.0]=libopus0 [libmpg123.so.0]=libmpg123-0 [libsoxr.so.0]=libsoxr0
  [libxshmfence.so.1]=libxshmfence1 [libxxf86vm.so.1]=libxxf86vm1
  [libLLVM-15.so.1]=libllvm15 [libLLVM-18.so.1]=libllvm-18
  [libpixman-1.so.0]=libpixman-1-0
)

fetch_deb() {  # $1 = debian package name
  local FILE
  FILE=$(grep -A30 "^Package: $1\$" "$IDX" | grep "^Filename:" | head -1 | awk '{print $2}')
  [[ -z "$FILE" ]] && return 1
  curl -sL "http://deb.debian.org/debian/$FILE" -o "$DEBFIX/d.deb" || return 1
  dpkg -x "$DEBFIX/d.deb" "$DEBFIX/x"
  find "$DEBFIX/x" -name "*.so*" -exec cp -a {} "$GLIB/" \; 2>/dev/null
  rm -rf "$DEBFIX/x" "$DEBFIX/d.deb"
  return 0
}

for i in $(seq 1 80); do
  MISS=$(run_chrome --version 2>&1 | grep -oP "libraries: +\K\S+" | head -1 | cut -d: -f1)
  # also catch GLIBC version-symbol conflicts by checking the first error line
  if [[ -z "$MISS" ]]; then
    ok "All shared libraries resolved (loop $i)"
    break
  fi
  BASE=$(basename "$MISS")
  PKG=${PKGMAP[$BASE]:-}
  if [[ -z "$PKG" ]]; then
    warn "Unknown library '$BASE' — trying heuristic: strip minor version"
    PKG=$(echo "$BASE" | sed 's/\.so\.[0-9].*/t64/' )   # last resort attempt
    PKG=$(grep -A30 "^Package: .*$PKG\$" "$IDX" | grep "^Package:" | head -1 | awk '{print $2}')
    [[ -z "$PKG" ]] && die "Cannot map library '$BASE' to a Debian package. Please report this at the repo."
  fi
  echo "    [$i] $BASE ← $PKG"
  fetch_deb "$PKG" || warn "fetch of $PKG failed, continuing..."
done
run_chrome --version >/dev/null 2>&1 || die "Chromium still cannot start — see messages above"
ok "Chromium starts: $(run_chrome --version 2>&1 | head -1)"

# ----------------------------------------------------------------------------
# Step 5 — fonts (fontconfig + minimal font set)
# ----------------------------------------------------------------------------
echo ""
warn "Step 5/7 — installing fonts + fontconfig..."
mkdir -p "$HOME/../usr/glibc/etc/fonts" "$HOME/../usr/glibc/share/fonts"
for P in fontconfig-config fonts-liberation fonts-dejavu-core; do
  FILE=$(grep -A30 "^Package: $P\$" "$IDX" | grep "^Filename:" | head -1 | awk '{print $2}')
  [[ -z "$FILE" ]] && continue
  curl -sL "http://deb.debian.org/debian/$FILE" -o "$DEBFIX/d.deb"
  dpkg -x "$DEBFIX/d.deb" "$DEBFIX/x"
  cp -a "$DEBFIX/x/etc/fonts/." "$HOME/../usr/glibc/etc/fonts/" 2>/dev/null
  cp -a "$DEBFIX/x/usr/share/fonts/." "$HOME/../usr/glibc/share/fonts/" 2>/dev/null
  rm -rf "$DEBFIX/x" "$DEBFIX/d.deb"
done
ok "Fonts installed"

# ----------------------------------------------------------------------------
# Step 6 — launcher + platform spoof (the magic that makes MCP work)
# ----------------------------------------------------------------------------
echo ""
warn "Step 6/7 — writing launcher + platform spoof..."
cat > "$WORK/spoof-platform.mjs" <<'EOF'
// Termux reports process.platform === "android", which cloakbrowser refuses.
// Inside the MCP server process we pretend to be linux (arm64).
Object.defineProperty(process, "platform", { value: "linux" });
EOF

cat > "$HOME/../usr/bin/cloak-browser-mcp-termux" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Launcher: runs cloak-browser-mcp natively in Termux with a clean env.
# See README.md — https://github.com/wahyuzero/cloak-browser-termux
H="\$HOME"
GLIB="\$H/../usr/glibc/lib"
SPOOF="\$H/.cloakbrowser-termux/spoof-platform.mjs"
BIN="\$H/../usr/lib/node_modules/@devinwangd/cloak-browser-mcp/dist/index.js"

export LD_LIBRARY_PATH=""
export LD_PRELOAD=""
export FONTCONFIG_PATH="\$GLIB/../etc/fonts"
export TMPDIR="\$H/../usr/tmp"
export NODE_OPTIONS="--import \$SPOOF"

# Run via node directly: the dist entry has no shebang, and /usr/bin/env is
# unavailable under a clean (termux-exec-free) environment.
exec node "\$BIN" "\$@"
EOF
chmod +x "$HOME/../usr/bin/cloak-browser-mcp-termux"
mkdir -p "$HOME/../usr/tmp"
ok "Launcher installed: cloak-browser-mcp-termux"

# ----------------------------------------------------------------------------
# Step 7 — end-to-end smoke test
# ----------------------------------------------------------------------------
echo ""
warn "Step 7/7 — smoke test (navigate + render a live page)..."
OUT=$(env -u LD_LIBRARY_PATH -u LD_PRELOAD \
  FONTCONFIG_PATH="$HOME/../usr/glibc/etc/fonts" \
  "$CHROME_DIR/chrome" --headless --no-sandbox --disable-gpu --disable-crashpad \
  --disable-dev-shm-usage --dump-dom https://example.com 2>/dev/null)
echo "$OUT" | grep -q "<html" || die "Smoke test failed — Chromium cannot render. See messages above."
ok "Chromium renders live HTTPS pages 🎉"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  INSTALLATION COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Add this to your MCP client (Claude Code, Codex, Hermes, etc.):"
echo ""
echo '    {'
echo '      "mcpServers": {'
echo '        "cloak-browser": {'
echo '          "command": "cloak-browser-mcp-termux",'
echo '          "args": ["--caps", "all", "--headless"]'
echo '        }'
echo '      }'
echo '    }'
echo ""
echo "  Test manually:"
echo "    cloak-browser-mcp-termux --self-test"
echo ""
echo "  Chromium location : $CHROME_DIR"
echo "  Launcher          : $HOME/../usr/bin/cloak-browser-mcp-termux"
echo ""
