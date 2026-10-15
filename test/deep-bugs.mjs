// Deep dive: evaluate crash, login root cause, pdf, fingerprint UA
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps", "all", "--headless"], stderr: "pipe",
});
transport.stderr?.on?.("data", d => { const s=d.toString(); if(/error|Error|FATAL/.test(s)) console.log("SRV:", s.slice(0,150)); });
const c = new Client({ name: "deep", version: "0.1", });
await c.connect(transport);
const call = async (n, a={}) => { try { const r = await c.callTool({name:n, arguments:a}); return {err:!!r.isError, raw:r, text:(r.content?.[0]?.text||JSON.stringify(r)).slice(0,400)}; } catch(e){ return {err:true, text:"CRASH: "+e.message.slice(0,250)}; } };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

console.log("=== 1. evaluate: string return vs object ===");
await call("browser_navigate", { url: "https://example.com" });
await sleep(2000);
let r = await call("browser_evaluate", { function: "() => 'plain string'" });
console.log("string ret:", r.err ? "CRASH/ERR: "+r.text.slice(0,180) : "OK: "+r.text.slice(0,80));
r = await call("browser_evaluate", { function: "() => ({a:1})" });
console.log("object ret:", r.err ? "CRASH/ERR: "+r.text.slice(0,180) : "OK: "+r.text.slice(0,80));

console.log("=== 2. login root cause (humanize off, press_key path) ===");
await call("browser_navigate", { url: "https://practicetestautomation.com/practice-test-login/" });
await sleep(3500);
r = await call("browser_run_code_unsafe", { code: "async page => { await page.fill('#username','student'); await page.fill('#password','WrongPass'); return await page.inputValue('#username') + '|' + await page.inputValue('#password'); }" });
console.log("fill+values:", r.err ? "ERR: "+r.text.slice(0,200) : r.text.slice(0,120));
r = await call("browser_run_code_unsafe", { code: "async page => { await page.click('#submit'); await page.waitForLoadState('domcontentloaded'); return page.url(); }" });
console.log("click+url:", r.err ? "ERR: "+r.text.slice(0,200) : r.text.slice(0,150));
await sleep(2500);
r = await call("browser_snapshot");
console.log("page has error msg:", /password is invalid/i.test(r.text||"") ? "YES" : "NO — "+(r.text||"").slice(0,100));

console.log("=== 3. pdf: absolute path ===");
r = await call("browser_navigate", { url: "https://example.com" });
await sleep(2000);
r = await call("browser_pdf_save", { filename: "/data/data/com.termux/files/home/cloak-browser-termux/test/test-page.pdf" });
console.log("pdf abs:", r.err ? "ERR: "+r.text.slice(0,200) : "OK: "+r.text.slice(0,150));
console.log("file exists:", fs.existsSync("/data/data/com.termux/files/home/cloak-browser-termux/test/test-page.pdf") ? "YES ✅" : "NO ❌");

console.log("=== 4. fingerprint: fresh client relaunch with macos BEFORE navigate ===");
await c.close();
const t2 = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps","all","--headless","--fingerprint-platform","macos"], stderr: "ignore",
});
const c2 = new Client({ name: "deep2", version: "0.1" });
await c2.connect(t2);
const call2 = async (n,a={}) => { try { const r = await c2.callTool({name:n,arguments:a}); return {err:!!r.isError, text:(r.content?.[0]?.text||"").slice(0,300)}; } catch(e){ return {err:true,text:"CRASH: "+e.message.slice(0,150)}; } };
r = await call2("browser_navigate", { url: "https://httpbin.org/user-agent" });
await sleep(4000);
r = await call2("browser_snapshot");
console.log("UA with launch flag macos:", (r.text.match(/\{[^}]*user-agent[^}]*\}/i)||["?"])[0].slice(0,180));
await c2.close();
