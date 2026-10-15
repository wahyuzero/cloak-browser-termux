# Extreme Test Results

## PASS
PASS S1 detection_test — PROBE: https://bot.sannysoft.com/

Intoli.com tests + additions
Test Name	Result
PASS S2 navigate sannysoft
PASS S2 sannysoft no visible failed rows
PASS S3 nowsecure passed — URL: https://nowsecure.nl/
Title: nowsecure.nl

- generic "NOWSECURE\n          
PASS S5 localstorage roundtrip
PASS S6 dead domain fails fast+clean — 0s
PASS S6 500 returns err (acceptable)
PASS S7 tab new
PASS S7 tab close
PASS S8 screenshot — {"content":[{"type":"image","data":"iVBORw0KGgoAAAANSUhEUgAA
PASS S9 set_fingerprint macos — {
  "appliedRuntime": 1,
  "deferredUntilNextLaunch": [],
  "notice": "Runtime o
PASS S10 rapid nav 10/10
PASS S11 humanize_set — {
  "humanize": true,
  "preset": "default",
  "mistypeChanc
PASS S12 browser_close clean

## BUGS
BUG  S1 stealth_audit — [NO_PAGE] No active page. Call browser_navigate first.
BUG  S4 error message NOT shown — URL: https://practicetestautomation.com/practice-test-login/
Title: Test Login | Practice Test Autom
BUG  S4 correct login failed — URL: https://practicetestautomation.com/practice-test-login/
Title: Test Login | Practice Test Autom
BUG  S5 cookie_set — browserContext.addCookies: Cookie should have a url or a domain/path pair
BUG  S5 cookie_get — (not found)
BUG  S6 snapshot after 500 — page.evaluate: Execution context was destroyed, most likely because of a navigat
BUG  S8 pdf — MCP error -32602: Input validation error: Invalid arguments for tool browser_pdf_save: Required at filename
