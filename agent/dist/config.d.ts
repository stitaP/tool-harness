/** A named agent (config.yaml `agents:`): a chat or subagent runs with these instructions, tools and model. */
export interface AgentDef {
    description?: string;
    instructions?: string;
    tool_profile?: "slm" | "standard" | "full";
    tools?: string[];
    model?: {
        name?: string;
        base_url?: string;
        provider?: string;
        temperature?: number;
    };
    personality?: string;
    max_iterations?: number;
}
export interface ModelConfig {
    provider: string;
    base_url: string;
    name: string;
    api_key_env?: string;
    api_key?: string;
    tool_mode?: "auto" | "native" | "react";
    context_window?: number;
    max_output_tokens?: number;
    temperature?: number;
    headers?: Record<string, string>;
    extra_body?: Record<string, any>;
    /** seconds to wait for one model response (default 600); raise it for large local models on CPU */
    request_timeout?: number;
}
export declare const DEFAULT_CONFIG: {
    model: ModelConfig;
    fallback_models: ModelConfig[];
    aux: Partial<ModelConfig>;
    agent: {
        max_iterations: number;
        tool_profile: string;
        max_tool_output_chars: number;
        parallel_tools: boolean;
        memory_nudge_every: number;
        personality: string;
        default_cwd: string;
        stream: boolean;
        retries: number;
    };
    compression: {
        enabled: boolean;
        threshold: number;
        keep_last: number;
    };
    goals: {
        max_turns: number;
    };
    loops: {
        max_ticks: number;
    };
    terminal: {
        backend: string;
        shell: string;
        timeout: number;
        docker_image: string;
        ssh_host: string;
        cwd: string;
    };
    approvals: {
        mode: string;
        allow_patterns: string[];
        timeout: number;
    };
    checkpoints: {
        enabled: boolean;
        max_files: number;
    };
    tools: {
        disabled: string[];
        deferred: string[];
        enabled: string[];
    };
    browser: {
        mode: string;
        headless: boolean;
        executable_path: string;
        channel: string;
        cdp_url: string;
        user_data_dir: string;
        args: string[];
    };
    desktop: {
        enabled: boolean;
        approve_reads: boolean;
    };
    capture: {
        enabled: boolean;
        skip_permission_check: boolean;
    };
    web: {
        search_provider: string;
        searxng_url: string;
        brave_api_key_env: string;
        tavily_api_key_env: string;
        allow_private: boolean;
        egress_allowlist: string[];
        docs_lookup: "ask" | "always" | "never";
        docs_domains: string[];
    };
    memory: {
        memory_chars: number;
        user_chars: number;
    };
    skills: {
        external_dirs: string[];
    };
    curator: {
        enabled: boolean;
        min_tool_calls: number;
        auto_save_skills: boolean;
    };
    delegation: {
        max_concurrent: number;
        max_iterations: number;
    };
    cron: {
        enabled: boolean;
        approval_mode: string;
    };
    server: {
        host: string;
        port: number;
        cors_origins: string[];
        api_key: string;
    };
    gateway: {
        telegram: {
            enabled: boolean;
            token_env: string;
            allowed_users: string[];
        };
        discord: {
            enabled: boolean;
            token_env: string;
            allowed_users: string[];
        };
        slack: {
            enabled: boolean;
            bot_token_env: string;
            app_token_env: string;
            allowed_users: string[];
        };
        webhooks: Record<string, {
            secret_env?: string;
            prompt?: string;
        }>;
    };
    mcp_servers: Record<string, any>;
    agents: Record<string, AgentDef>;
    mcp_serve: {
        toolsets: string[];
    };
    security: {
        redact_tool_output: boolean;
        blocked_paths: string[];
        protected_paths: string[];
    };
    plugins: {
        enabled: boolean;
    };
    store_bridge: {
        enabled: boolean;
        path: string;
    };
    hooks: Record<string, string[]>;
    kanban: {
        workers: number;
        enabled: boolean;
    };
};
export type Config = typeof DEFAULT_CONFIG;
export declare function stitapRoot(): string;
/** Resolve the home for a profile. Profiles are fully isolated homes. */
export declare function resolveHome(profile?: string): string;
export declare function policyPath(): string;
export interface AdminPolicy {
    enforce?: Record<string, any>;
    disable_tools?: string[];
    message?: string;
}
export declare function parseEnv(text: string): Record<string, string>;
export declare class ConfigStore {
    readonly home: string;
    data: Config;
    env: Record<string, string>;
    policy: AdminPolicy | null;
    readonly path: string;
    /** what config.yaml itself contains (before defaults are merged in) */
    private user;
    constructor(home: string);
    reload(): void;
    /** Secret lookup: process env wins, then ~/.stitap/.env */
    secret(name?: string): string | undefined;
    allSecretValues(): string[];
    isLocked(path: string): boolean;
    get(path: string): any;
    /** True when config.yaml (or the admin policy) sets this key, i.e. the value is a choice, not a default. */
    userSet(path: string): boolean;
    set(path: string, value: any): void;
    setSecret(name: string, value: string): void;
}
export declare function ensureHome(home: string): void;
