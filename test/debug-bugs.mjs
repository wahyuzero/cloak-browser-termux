// Bug-by-bug investigation
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps", "all", "--headless"], stderr: "pipe",
});
transport.stderr?.on?.("data", d => console.log("SRV:", d.toString().slice(0,200)));
const c = new Client({ name: "debug", version: "0.1" });
await c.connect(transport);
const call = async (n, a={}) => { try { const r = await c.callTool({name:n, arguments:a}); return {err:!!r.isError, text:(r.content?.[0]?.text||JSON.stringify(r)).slice(0,500)}; } catch(e) { return {err:true, text:"CLIENT-CRASH: "+e.message.slice(0,200)}; } };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// BUG-A: sannysoft via evaluate (proper args)
console.log("--- A: sannysoft evaluate ---");
await call("browser_navigate", { url: "https://bot.sannysoft.com" });
await sleep(6000);
let r = await call("browser_evaluate", { function: "() => Array.from(document.querySelectorAll('tr')).map(tr=>tr.innerText.replace(/\\n/g,' | ').slice(0,80)).join('\\n')" });
console.log(r.err ? "EVAL-ERR: "+r.text.slice(0,200) : r.text.slice(0,1000));

// BUG-B: login flow — inspect what happens after typing
console.log("--- B: login debug ---");
await call("browser_navigate", { url: "https://practicetestautomation.com/practice-test-login/" });
await sleep(3000);
r = await call("browser_snapshot");
console.log("fields:", (r.text.match(/textbox \[\w+\][^\n]*/gi)||[]).join(" || "));
r = await call("browser_type", { target: "css=#username", text: "student" });
console.log("type u:", r.err ? r.text.slice(0,150) : "ok");
r = await call("browser_type", { target: "css=#password", text: "WrongPass" });
console.log("type p:", r.err ? r.text.slice(0,150) : "ok");
r = await call("browser_evaluate", { function: "() => document.querySelector('#username')?.value + ' / ' + document.querySelector('#password')?.value" });
console.log("field values:", r.text.slice(0,120));
r = await call("browser_click", { target: "css=#submit" });
console.log("click:", r.err ? r.text.slice(0,150) : "ok");
await sleep(3000);
r = await call("browser_snapshot");
console.log("after wrong login:", (r.text.match(/invalid[^\n]*/i)||["no error msg"])[0].slice(0,120));
r = await call("browser_type", { target: "css=#password", text: "Password123" });
r = await call("browser_click", { target: "css=#submit" });
await sleep(4000);
r = await call("browser_snapshot");
console.log("URL now:", (r.text||"").slice(0,80));

// BUG-C: cookie with url
console.log("--- C: cookie with url ---");
await call("browser_navigate", { url: "https://example.com" });
await sleep(2000);
r = await call("browser_cookie_set", { name: "t1", value: "v1", url: "https://example.com" });
console.log("cookie_set url:", r.err ? r.text.slice(0,150) : "ok");
r = await call("browser_cookie_get", { name: "t1" });
console.log("cookie_get:", r.err ? r.text.slice(0,100) : r.text.slice(0,120));

// BUG-D: pdf with filename
console.log("--- D: pdf ---");
r = await call("browser_pdf_save", { filename: "test-page.pdf" });
console.log("pdf:", r.err ? r.text.slice(0,150) : r.text.slice(0,150));

// BUG-E: fingerprint change → new page UA
console.log("--- E: fingerprint + UA ---");
r = await call("cloak_set_fingerprint", { platform: "macos" });
console.log("set fp:", r.err ? r.text.slice(0,120) : r.text.slice(0,100));
r = await call("browser_tabs", { action: "new", url: "https://httpbin.org/user-agent" });
await sleep(4000);
r = await call("browser_snapshot");
console.log("UA in new tab:", (r.text.match(/user-agent[^\n]*/i)||["?"])[0].slice(0,150));

// BUG-F: snapshot right after 500 + wait
console.log("--- F: 500 then wait then snapshot ---");
await call("browser_navigate", { url: "https://httpbin.org/status/500" });
await sleep(2000);
r = await call("browser_snapshot");
console.log("snapshot after wait:", r.err ? "ERR: "+r.text.slice(0,150) : "OK: "+r.text.slice(0,100));

await c.close();
