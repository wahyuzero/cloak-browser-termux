// BUG-2: pdf_save with absolute filename must give clean error + PNG fallback on disk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";

const OUT = "/data/data/com.termux/files/home/cloak-browser-termux/test/out.pdf";
const PNG = "/data/data/com.termux/files/home/cloak-browser-termux/test/out.png";
for (const f of [OUT, PNG]) { try { fs.unlinkSync(f); } catch {} }

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux", args: ["--caps", "all", "--headless"], stderr: "ignore",
});
const c = new Client({ name: "bug2", version: "0.1" });
await c.connect(transport);
const call = async (name, args={}) => {
  try { const r = await c.callTool({ name, arguments: args });
    return { err: !!r.isError, text: (r.content?.[0]?.text || JSON.stringify(r)).slice(0, 2000) };
  } catch (e) { return { err: true, text: e.message.slice(0,2000) }; }
};

let r = await call("browser_navigate", { url: "https://example.com" });
console.log("navigate err:", r.err, r.text.slice(0,200));

r = await call("browser_pdf_save", { filename: OUT });
console.log("=== pdf_save result ===");
console.log("err:", r.err);
console.log("text:", r.text);

const clean = !/Protocol error \(IO\.read\)/i.test(r.text);
console.log("clean error (no raw IO.read):", clean);
const m = r.text.match(/\/[\w./-]+\.png/gi) || [];
const mentioned = [...new Set([PNG, ...m])];
let pngFound = null;
for (const p of mentioned) {
  try { const st = fs.statSync(p); if (st.size > 1000) pngFound = p + " (" + st.size + " bytes)"; } catch {}
}
console.log("PNG fallback on disk:", pngFound || "NOT FOUND");
await call("browser_close");
await c.close();
