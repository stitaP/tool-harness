import type { McpServerConfig } from "./client.js";
export interface McpPreset {
    description: string;
    usage: string;
    build(args: string[], cwd: string): McpServerConfig;
}
export declare const MCP_PRESETS: Record<string, McpPreset>;
export declare function presetConfig(name: string, args: string[], cwd: string): McpServerConfig;
export declare function presetList(): string;
