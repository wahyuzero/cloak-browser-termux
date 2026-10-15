import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// FINAL VERIFICATION — uses ONLY the repo launcher, zero manual env.
const t = new StdioClientTransport({
  command: "cloak-browser-mcp-termux",
  args: ["--caps", "all", "--headless"],
  stderr: "ignore",
});
const c = new Client({ name: "final-verify", version: "0.1" });
await c.connect(t);
const tools = await c.listTools();
console.log("TOOLS:", tools.tools.length);

await c.callTool({ name: "browser_navigate", arguments: { url: "https://example.com" } });
await new Promise(r => setTimeout(r, 2000));
const s = await c.callTool({ name: "browser_snapshot", arguments: {} });
const txt = s.content?.[0]?.text || "";
console.log("LIVE PAGE OK:", txt.includes("Example Domain") ? "YES ✅" : "NO — " + txt.slice(0, 200));
console.log("UA SPOOFED:", /Windows NT 10/.test(txt) ? "YES (Windows Chrome)" : "check");
await c.close();
