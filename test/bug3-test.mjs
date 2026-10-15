// BUG-3: --fingerprint-platform windows flag -> UA Windows, then runtime switch to macos -> UA macOS
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "cloak-browser-mcp-termux",
  args: ["--caps", "all", "--headless", "--fingerprint-platform", "windows"],
  stderr: "pipe",
});
transport.stderr?.on?.("data", d => { const s = d.toString(); if (/unknown|invalid|option|flag|error/i.test(s)) console.log("STDERR:", s.slice(0,300)); });
const c = new Client({ name: "bug3", version: "0.1" });
try { await c.connect(transport); } catch (e) { console.log("CONNECT FAILED:", e.message.slice(0,400)); process.exit(1); }
const call = async (name, args={}) => {
  try { const r = await c.callTool({ name, arguments: args });
    return { err: !!r.isError, text: (r.content?.[0]?.text || JSON.stringify(r)).slice(0, 2000) };
  } catch (e) { return { err: true, text: e.message.slice(0,2000) }; }
};

let r = await call("browser_navigate", { url: "https://httpbin.org/user-agent" });
await new Promise(s => setTimeout(s, 5000));
r = await call("browser_snapshot");
console.log("=== UA with --fingerprint-platform windows ===");
console.log("err:", r.err, "| text:", r.text.slice(0, 400));

r = await call("cloak_set_fingerprint", { platform: "macos" });
console.log("=== cloak_set_fingerprint macos ===");
console.log("err:", r.err, "| text:", r.text.slice(0, 400));

r = await call("browser_navigate", { url: "https://httpbin.org/user-agent" });
await new Promise(s => setTimeout(s, 5000));
r = await call("browser_snapshot");
console.log("=== UA after switch to macos ===");
console.log("err:", r.err, "| text:", r.text.slice(0, 400));
await call("browser_close");
await c.close();
