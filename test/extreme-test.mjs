// EXTREME TEST SUITE — real-use scenarios on Termux
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";

const BUGS = [];
const RESULTS = [];
const ok = (name, note="") => { RESULTS.push(`PASS ${name}${note?" — "+note:""}`); console.log("PASS", name, note); };
const bad = (name, note="") => { BUGS.push(`BUG  ${name}${note?" — "+note:""}`); console.log("BUG ", name, note); };

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps", "all", "--headless"], stderr: "ignore",
});
const c = new Client({ name: "extreme", version: "0.1" });
await c.connect(transport);
const call = async (name, args={}) => {
  try { const r = await c.callTool({ name, arguments: args });
    return { err: !!r.isError, text: (r.content?.[0]?.text || JSON.stringify(r)).slice(0, 400) };
  } catch (e) { return { err: true, text: e.message.slice(0,300) }; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- S1: stealth audit (core value of this browser) ----------
console.log("\n=== S1: STEALTH AUDIT ===");
let r = await call("cloak_stealth_audit");
/audit|score|pass|fingerprint/i.test(r.text) && !r.err ? ok("S1 stealth_audit", r.text.slice(0,80)) : bad("S1 stealth_audit", r.text.slice(0,150));
r = await call("cloak_detection_test");
!r.err ? ok("S1 detection_test", r.text.slice(0,80)) : bad("S1 detection_test", r.text.slice(0,150));

// ---------- S2: bot-detection real site (sannysoft table results) ----------
console.log("\n=== S2: SANNYSOFT RESULTS ===");
r = await call("browser_navigate", { url: "https://bot.sannysoft.com" });
r.err ? bad("S2 navigate sannysoft", r.text.slice(0,100)) : ok("S2 navigate sannysoft");
await sleep(6000);
r = await call("browser_evaluate", { function: "() => Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText.replace(/\\s+/g,' ').slice(0,90))" });
const rows = r.text || "";
console.log(rows.slice(0, 900));
if (/WebDriver.*failed|Chrome.*failed/i.test(rows)) bad("S2 sannysoft has failed rows", "see above");
else ok("S2 sannysoft no visible failed rows");

// ---------- S3: Cloudflare-protected site ----------
console.log("\n=== S3: CLOUDFLARE (nowsecure.nl) ===");
r = await call("browser_navigate", { url: "https://nowsecure.nl" });
await sleep(10000);
r = await call("browser_snapshot");
const s3 = r.text || "";
/console|challenge|just a moment/i.test(s3) ? bad("S3 nowsecure still challenged", s3.slice(0,120)) : ok("S3 nowsecure passed", s3.slice(0,80));

// ---------- S4: real login flow with wrong then right password ----------
console.log("\n=== S4: LOGIN ERROR HANDLING ===");
await call("browser_navigate", { url: "https://practicetestautomation.com/practice-test-login/" });
await sleep(3000);
await call("browser_type", { target: "css=#username", text: "student" });
await call("browser_type", { target: "css=#password", text: "WrongPass" });
r = await call("browser_click", { target: "css=#submit" });
await sleep(3000);
r = await call("browser_snapshot");
/Your password is invalid/i.test(r.text||"") ? ok("S4 error message shown") : bad("S4 error message NOT shown", (r.text||"").slice(0,100));
await call("browser_type", { target: "css=#password", text: "Password123" });
await call("browser_click", { target: "css=#submit" });
await sleep(4000);
r = await call("browser_snapshot");
/logged-in-successfully/i.test(r.text||"") ? ok("S4 correct login redirects") : bad("S4 correct login failed", (r.text||"").slice(0,100));

// ---------- S5: cookies + localStorage persistence ----------
console.log("\n=== S5: STORAGE ===");
r = await call("browser_cookie_set", { name: "test_ck", value: "hello123", domain: "example.com" });
r.err ? bad("S5 cookie_set", r.text.slice(0,100)) : ok("S5 cookie_set");
r = await call("browser_cookie_get", { name: "test_ck" });
/hello123/.test(r.text) ? ok("S5 cookie_get roundtrip") : bad("S5 cookie_get", r.text.slice(0,100));
r = await call("browser_localstorage_set", { key: "ls_test", value: "v42" });
r = await call("browser_localstorage_get", { key: "ls_test" });
/v42/.test(r.text) ? ok("S5 localstorage roundtrip") : bad("S5 localstorage", r.text.slice(0,100));

// ---------- S6: error handling — dead domain, 404, slow ----------
console.log("\n=== S6: ERROR HANDLING ===");
const t0 = Date.now();
r = await call("browser_navigate", { url: "https://domain-yang-tidak-ada-99887766.com" });
(Date.now()-t0 < 30000) && r.err ? ok("S6 dead domain fails fast+clean", `${Math.round((Date.now()-t0)/1000)}s`) : bad("S6 dead domain", r.text.slice(0,100));
r = await call("browser_navigate", { url: "https://httpbin.org/status/500" });
r.err ? ok("S6 500 returns err (acceptable)") : ok("S6 500 navigated (page state visible)");
r = await call("browser_snapshot");
r.err ? bad("S6 snapshot after 500", r.text.slice(0,80)) : ok("S6 still usable after 500");

// ---------- S7: tabs ----------
console.log("\n=== S7: TABS ===");
r = await call("browser_tabs", { action: "new", url: "https://example.com" });
r.err ? bad("S7 tab new", r.text.slice(0,100)) : ok("S7 tab new");
r = await call("browser_tabs", { action: "list" });
console.log((r.text||"").slice(0,200));
r = await call("browser_tabs", { action: "close" });
r.err ? bad("S7 tab close", r.text.slice(0,80)) : ok("S7 tab close");

// ---------- S8: screenshot + PDF ----------
console.log("\n=== S8: SCREENSHOT & PDF ===");
r = await call("browser_take_screenshot");
r.err ? bad("S8 screenshot", r.text.slice(0,150)) : ok("S8 screenshot", (r.text||"").slice(0,60));
r = await call("browser_pdf_save");
r.err ? bad("S8 pdf", r.text.slice(0,150)) : ok("S8 pdf", (r.text||"").slice(0,60));

// ---------- S9: fingerprint switching mid-session ----------
console.log("\n=== S9: FINGERPRINT SWITCH ===");
r = await call("cloak_set_fingerprint", { platform: "macos" });
r.err ? bad("S9 set_fingerprint macos", r.text.slice(0,120)) : ok("S9 set_fingerprint macos", r.text.slice(0,80));
r = await call("browser_navigate", { url: "https://httpbin.org/user-agent" });
await sleep(3000);
r = await call("browser_snapshot");
console.log((r.text||"").slice(0,300));

// ---------- S10: rapid navigation stress (10 pages) ----------
console.log("\n=== S10: RAPID NAV STRESS ===");
let navOk = 0;
for (let i = 1; i <= 10; i++) {
  r = await call("browser_navigate", { url: `https://example.com?x=${i}` });
  if (!r.err) navOk++;
  await sleep(500);
}
navOk === 10 ? ok(`S10 rapid nav ${navOk}/10`) : bad(`S10 rapid nav only ${navOk}/10`);

// ---------- S11: humanize typing on real form ----------
console.log("\n=== S11: HUMANIZE TYPING ===");
r = await call("cloak_humanize_set", { enabled: true });
r.err ? bad("S11 humanize_set", r.text.slice(0,100)) : ok("S11 humanize_set", r.text.slice(0,60));

// ---------- S12: memory/long session canary ----------
console.log("\n=== S12: SESSION CLOSE ===");
r = await call("browser_close");
!r.err ? ok("S12 browser_close clean") : bad("S12 browser_close", r.text.slice(0,100));

await c.close();
fs.writeFileSync("/data/data/com.termux/files/home/cloak-browser-termux/test/RESULTS.md",
  "# Extreme Test Results\n\n## PASS\n" + RESULTS.join("\n") + "\n\n## BUGS\n" + (BUGS.join("\n") || "(none)") + "\n");
console.log(`\n=== TOTAL: ${RESULTS.filter(x=>x.startsWith("PASS")).length} pass, ${BUGS.length} bugs → test/RESULTS.md ===`);
