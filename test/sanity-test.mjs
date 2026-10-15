// SANITY: nowsecure snapshot (not stuck), sannysoft snapshot text, screenshot, browser_close
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps", "all", "--headless"], stderr: "ignore",
});
const c = new Client({ name: "sanity", version: "0.1" });
await c.connect(transport);
const call = async (name, args={}) => {
  try { const r = await c.callTool({ name, arguments: args });
    return { err: !!r.isError, text: (r.content?.[0]?.text || JSON.stringify(r)) };
  } catch (e) { return { err: true, text: e.message }; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

let r = await call("browser_navigate", { url: "https://nowsecure.nl" });
console.log("nowsecure nav err:", r.err);
await sleep(12000);
r = await call("browser_snapshot");
console.log("nowsecure snapshot:", /challenge|just a moment/i.test(r.text) ? "STUCK: " + r.text.slice(0,150) : "PASSED — " + r.text.slice(0,120));

r = await call("browser_navigate", { url: "https://bot.sannysoft.com" });
await sleep(8000);
r = await call("browser_snapshot");
const t = r.text || "";
console.log("sannysoft snapshot text len:", t.length, "| has table:", /WebDriver|Chrome/i.test(t) ? "yes" : "no");

r = await call("browser_take_screenshot");
console.log("screenshot err:", r.err, "| is image:", (r.text||"").includes("image") || (r.text||"").length > 100);

r = await call("browser_close");
console.log("browser_close err:", r.err);
await c.close();
