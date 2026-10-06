/** Public SDK surface: embed the stitaP agent runtime in your own Node app. */
export { Runtime, VERSION } from "./runtime/runtime.js";
export { runTurn } from "./loop/agent.js";
export { ConfigStore, DEFAULT_CONFIG, resolveHome } from "./config.js";
export { openState } from "./state/db.js";
export * from "./providers/index.js";
export { startServer } from "./server/http.js";
export { GatewayManager } from "./gateway/manager.js";
export { serveMcp } from "./mcp/server.js";
export { runCommand, listCommands } from "./runtime/commands.js";
export { runBatch } from "./batch/runner.js";
