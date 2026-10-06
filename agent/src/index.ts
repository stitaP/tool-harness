/** Public SDK surface: embed the stitaP agent runtime in your own Node app. */
export { Runtime, VERSION, type RuntimeOptions, type SendOptions } from "./runtime/runtime.js";
export { runTurn, type TurnOptions, type TurnResult } from "./loop/agent.js";
export { ConfigStore, DEFAULT_CONFIG, resolveHome } from "./config.js";
export { openState, type StateDB, type Msg, type Session } from "./state/db.js";
export * from "./providers/index.js";
export type { Tool, ToolContext, ToolResult } from "./tools/types.js";
export { startServer } from "./server/http.js";
export { GatewayManager } from "./gateway/manager.js";
export { serveMcp } from "./mcp/server.js";
export { runCommand, listCommands } from "./runtime/commands.js";
export { runBatch } from "./batch/runner.js";
