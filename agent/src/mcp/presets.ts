/**
 * One-line setup for common MCP servers: `harness mcp add filesystem ~/code`, `harness mcp add sqlite ./app.db`.
 * A preset is just an `mcp_servers` entry with the right command, so it shows up in /api/mcp, tool_search and
 * `harness mcp list` like any hand-written one. Servers with more than 20 tools are deferred automatically,
 * which keeps a small model's prompt short.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { McpServerConfig } from "./client.js";

export interface McpPreset { description: string; usage: string; build(args: string[], cwd: string): McpServerConfig }

const abs = (p: string, cwd: string) => resolve(cwd, p.replace(/^~(?=\/|$)/, homedir()));

export const MCP_PRESETS: Record<string, McpPreset> = {
  filesystem: {
    description: "Read/write/search files in the folders you list (sandboxed to them)",
    usage: "filesystem [folder…]   (default: the current folder)",
    build: (a, cwd) => ({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", ...(a.length ? a : ["."]).map((p) => abs(p, cwd))] }),
  },
  fetch: {
    description: "Fetch a URL and return it as markdown",
    usage: "fetch",
    build: () => ({ command: "uvx", args: ["mcp-server-fetch"] }),
  },
  sqlite: {
    description: "Query and modify a SQLite database",
    usage: "sqlite <database file>",
    build: (a, cwd) => {
      if (!a[0]) throw new Error("sqlite needs a database file: harness mcp add sqlite ./app.db");
      return { command: "uvx", args: ["mcp-server-sqlite", "--db-path", abs(a[0], cwd)] };
    },
  },
  postgres: {
    description: "Read-only SQL against a Postgres database (the URL is taken from POSTGRES_URL in ~/.stitap/.env unless given)",
    usage: "postgres [postgresql://…]",
    build: (a) => ({ command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", a[0] ?? "${POSTGRES_URL}"] }),
  },
  memory: {
    description: "Knowledge-graph memory that persists between chats",
    usage: "memory",
    build: () => ({ command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] }),
  },
};

export function presetConfig(name: string, args: string[], cwd: string): McpServerConfig {
  const p = MCP_PRESETS[name];
  if (!p) throw new Error(`unknown preset "${name}" (available: ${Object.keys(MCP_PRESETS).join(", ")})`);
  return p.build(args, cwd);
}

export function presetList(): string {
  return Object.entries(MCP_PRESETS).map(([n, p]) => `  ${n.padEnd(11)} ${p.description}\n  ${" ".repeat(11)} harness mcp add ${p.usage}`).join("\n");
}
