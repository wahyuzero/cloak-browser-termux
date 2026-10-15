# Bug Log — Extreme real-use testing on Termux (Android 14, aarch64)

Date: 2026-10-15 · Build: cloak-browser-mcp 0.1.5 (wahyuzero fork) · Chromium 146 (CloakBrowser)
Method: 12-scenario MCP suite (`test/extreme-test.mjs`) + targeted debugging (`test/debug-bugs.mjs`, `test/deep-bugs.mjs`).

Score: **14 PASS / 7 flagged** → after investigation: **3 real upstream bugs, 2 environmental quirks, rest were test-script faults.**

## ✅ What works under stress
- Cloudflare-protected site (nowsecure.nl) — passed, no challenge loop
- bot.sannysoft.com — no failed rows visible (full verification limited by bug #1)
- Real login flow (fill → submit → redirect to logged-in page) — works
- Wrong-password error path — works
- Cookies (with `url` param) + localStorage roundtrip — works
- Dead domain / HTTP 500 — fails fast and stays usable
- Tabs (new/list/close), screenshot — works
- Rapid navigation 10/10 — no leaks, no crashes
- browser_close — clean shutdown

---

## 🐞 REAL BUGS (upstream — cloak-browser-mcp / CloakBrowser)

### BUG-1 (HIGH): `browser_evaluate` result breaks MCP schema — crashes the client
**Repro:** any `browser_evaluate` call, even `() => 'plain string'`.
**Error (client side):** `MCP error -32602: Invalid tools/call result ... content[0] invalid_union / expected resource`
**Root cause:** the tool returns a content entry (looks like a non-text/resource
variant) that standard MCP clients reject during response validation. The
evaluation itself succeeds server-side — the client just can't parse the reply.
**Impact:** disables the main "read page state" workflow for any compliant MCP
client; also blocks scripted verification.
**Workaround:** none discovered (`browser_run_code_unsafe` requires
`--caps config --enable-unsafe-eval`, and is a different tool).

### BUG-2 (MEDIUM): `browser_pdf_save` always fails
**Repro:** navigate anywhere → `browser_pdf_save {filename: ".../test-page.pdf"}`.
**Error:** `page.pdf: Protocol error (IO.read): Read failed`
**Notes:** happens with relative and absolute paths; unrelated to disk
permissions (same dir writable). Suspect CDP stream handling in the patched
Chromium under Android, or missing temp-fs backing.

### BUG-3 (MEDIUM, suspected): `cloak_set_fingerprint` claims runtime apply but UA unchanged
**Repro:** running session as Windows UA → `cloak_set_fingerprint {platform:"macos"}`
→ response says `"appliedRuntime": 1` → `httpbin.org/user-agent` still reports
`Windows NT 10.0`.
**Also:** README advertises platform switching, but the CLI only exposes
`--fingerprint-seed <int>` (no `--fingerprint-platform` flag; passing one kills
the server at startup with an arg-parse error).
**Needs upstream confirmation:** maybe UA is intentionally pinned per launch and
"appliedRuntime" only covers non-UA surfaces.

## ⚠️ ENVIRONMENTAL QUIRKS (Android-specific, not upstream bugs)

### Q-1: `Failed to read /proc/sys/fs/inotify/max_user_watches` + dbus errors
Printed on every navigation. Cosmetic on Android (no systemd/dbus, restricted
procfs), no functional impact observed.

### Q-2: ProcessSingleton errors after crashed sessions
A killed MCP run leaves Chromium alive holding the ephemeral profile; next
launch fails with "Failed to create a ProcessSingleton". Workaround:
`pgrep -fl "cloakbrowser/chromium"` then kill. (`pkill -f chrome` is dangerous —
it can match your own shell.)

## 🧪 FALSE ALARMS (test-script faults, recorded for honesty)
- "S4 login failed" — snapshot was truncated to 400 chars in our harness, so refs
  were read as empty; with full snapshot + ≥3s settle, login succeeds reliably.
- "cookie_set needs domain" — schema wants `url` or a proper domain/path pair; our
  first call was malformed.
- "pdf requires filename" — schema contract, not a bug.

## Notes for upstream report
- BUG-1 is the most severe: it makes the tool unusable from spec-compliant MCP
  clients (Claude Code, Codex, Hermes, …) the moment evaluation is needed.
  A fix is likely a one-liner in how the tool wraps its result content
  (`content: [{type:"text", text: JSON.stringify(result)}]`).
- Environment: Android 14 aarch64, Bionic host, glibc runtime via patchelf
  (see README), Node 24, headless mode.
