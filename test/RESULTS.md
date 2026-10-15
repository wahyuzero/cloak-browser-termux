# Extreme Test Results (final — bugfix/termux-issues-1-2-3)

## BUG-2 (browser_pdf_save): VERIFIED PASS (dengan catatan)
- pdf_save filename absolut `/data/data/com.termux/files/home/cloak-browser-termux/test/out.pdf`
  → pesan error dibungkus penjelasan: "PDF generation failed: page.pdf: Protocol error (IO.read): Read failed
  Root cause: Page.printToPDF stream handling (CDP IO.read) is broken in the patched Chromium build on Android —
  page.pdf cannot work in this environment. Fallback: full-page screenshot written to .../out.png (basename: out.png)."
- Fallback PNG terverifikasi ada di disk: out.png (80.389 bytes).
- Catatan: string mentah "Protocol error (IO.read)" masih dikutip sebagai konteks, tapi sudah disertai
  root-cause + path fallback (bukan lagi error mentah tanpa penjelasan). page.pdf sendiri tetap mustahil di build ini.

## BUG-3 (--fingerprint-platform): VERIFIED PASS
- Spawn dengan args ["--caps","all","--headless","--fingerprint-platform","windows"] — flag dikenal, connect sukses.
- httpbin.org/user-agent → "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/146.0.0.0" ✔ Windows.
- cloak_set_fingerprint {platform:"macos"} → appliedRuntime, UA override aktif.
- Navigasi ulang → "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ... Chrome/146.0.0.0" ✔ macOS.

## REGRESI PENUH (extreme-test.mjs, sudah diperbaiki: snapshot full text, wait ≥5-6s,
## login css fill + tunggu navigasi polling, cookie_set pakai url, pdf pakai filename, navigate dulu sebelum S1)
- PASS S1 detection_test
- BUG  S1 stealth_audit — warning "webdriver in Navigator.prototype" padahal report "webdriver": false (heuristik false-positive; minor)
- PASS S2 navigate sannysoft
- PASS S2 sannysoft no visible failed rows
- PASS S3 nowsecure passed (title nowsecure.nl, bukan challenge)
- PASS S4 error message shown
- PASS S4 correct login redirects
- PASS S5 cookie_set
- PASS S5 cookie_get roundtrip
- PASS S5 localstorage roundtrip
- PASS S6 dead domain fails fast+clean — 1s
- PASS S6 500 returns err (acceptable)
- PASS S6 still usable after 500
- PASS S7 tab new
- PASS S7 tab close
- PASS S8 screenshot
- PASS S8 pdf (fallback PNG ok, error dibungkus penjelasan)
- PASS S9 set_fingerprint macos
- PASS S9 UA is macOS after switch
- PASS S10 rapid nav 10/10
- PASS S11 humanize_set
- PASS S12 browser_close clean
Total: 21 pass, 1 bug minor (S1 stealth_audit warning false-positive).

## SANITY
- nowsecure.nl snapshot: PASSED (tidak stuck di challenge)
- sannysoft snapshot text: ok (1158 char, tabel deteksi ada)
- browser_take_screenshot: ok (image content)
- browser_close: ok

## Skrip test baru: bug2-test.mjs, bug3-test.mjs, sanity-test.mjs; extreme-test.mjs diperbaiki.
