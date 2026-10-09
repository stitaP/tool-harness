/**
 * Configuration: ~/.stitap/config.yaml (behaviour) + ~/.stitap/.env (secrets only)
 * + an optional admin policy file that enforces settings across the machine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { parseYaml, stringifyYaml } from "./util/yaml.js";
import { deepMerge, getPath, setPath } from "./util/misc.js";
import { ROUTER_DEFAULTS } from "./providers/router.js";
export const DEFAULT_CONFIG = {
    model: {
        provider: "openai",
        base_url: "http://localhost:11434/v1",
        name: "qwen2.5:7b-instruct",
        api_key_env: "OPENAI_API_KEY",
        tool_mode: "auto",
        context_window: 32768,
        max_output_tokens: 4096,
        temperature: 0.3,
    },
    fallback_models: [],
    aux: {},
    agent: {
        max_iterations: 60,
        tool_profile: "standard", // slm | standard | full
        tool_selection: "auto", // planner picks per-task tools from a one-line catalog: auto = only when the full tool set would crowd the window
        max_tool_output_chars: 12000,
        parallel_tools: true,
        memory_nudge_every: 8,
        personality: "",
        default_cwd: "", // folder new chats start in (like opening Claude Code in a project); "" = where the harness started
        stream: true,
        retries: 3,
    },
    compression: { enabled: true, threshold: 0.6, keep_last: 8 },
    goals: { max_turns: 20, max_idle_turns: 4 }, // pause a goal after this many consecutive turns that called no tool (0 = never)
    loops: { max_ticks: 100 },
    terminal: { backend: "local", shell: "auto", timeout: 120, docker_image: "python:3.12-slim", ssh_host: "", cwd: "" },
    approvals: { mode: "ask", allow_patterns: [], timeout: 300 },
    checkpoints: { enabled: true, max_files: 20000 },
    tools: { disabled: [], deferred: [], enabled: [] },
    browser: { mode: "launch", headless: true, executable_path: "", channel: "", cdp_url: "http://127.0.0.1:9222", user_data_dir: "", args: [] },
    desktop: { enabled: true, approve_reads: false },
    capture: { enabled: true, skip_permission_check: false }, // screen_capture / screen_record / camera_capture
    web: { search_provider: "duckduckgo", searxng_url: "", brave_api_key_env: "BRAVE_API_KEY", tavily_api_key_env: "TAVILY_API_KEY", allow_private: false, egress_allowlist: [],
        docs_lookup: "ask", // docs_lookup tool: ask once per chat (headless runs: no), always, never
        docs_domains: [] }, // extra official documentation sites for docs_lookup (host or host/path)
    memory: { memory_chars: 2200, user_chars: 1375 },
    skills: { external_dirs: [] },
    curator: { enabled: true, min_tool_calls: 6, auto_save_skills: true },
    delegation: { max_concurrent: 3, max_iterations: 30 },
    cron: { enabled: true, approval_mode: "deny" },
    server: { host: "127.0.0.1", port: 7420, cors_origins: ["http://localhost:5173", "http://127.0.0.1:5173"], api_key: "" },
    gateway: {
        telegram: { enabled: false, token_env: "TELEGRAM_BOT_TOKEN", allowed_users: [] },
        discord: { enabled: false, token_env: "DISCORD_BOT_TOKEN", allowed_users: [] },
        slack: { enabled: false, bot_token_env: "SLACK_BOT_TOKEN", app_token_env: "SLACK_APP_TOKEN", allowed_users: [] },
        webhooks: {},
    },
    mcp_servers: {},
    agents: {},
    mcp_serve: { toolsets: ["files", "web", "memory", "skills", "store"] },
    security: { redact_tool_output: true, blocked_paths: ["~/.ssh", "~/.aws", "~/.gnupg"], protected_paths: [] }, // protected: file tools never write there (also .stitap-protected files)
    plugins: { enabled: true },
    store_bridge: { enabled: true, path: "" },
    hooks: {},
    kanban: { workers: 1, enabled: true, project_key: "PT", cwd: "", max_attempts: 5, test_timeout_s: 600, enforce_commit_keys: true, verify: true, worker_tier: "auto", default_board: "Main", tier_by_kind: { tests: "fast", gate: "fast" } }, // tier_by_kind: which router tier a kind of ticket prefers (the small model for testing work),
    lsp: { enabled: true, servers: {} }, // lsp tool: extra/override language servers
    router: ROUTER_DEFAULTS, // starts/stops llama-server and picks a fast or strong model per request
};
export function stitapRoot() {
    return process.env.STITAP_ROOT || join(homedir(), ".stitap");
}
/** Resolve the home for a profile. Profiles are fully isolated homes. */
export function resolveHome(profile) {
    if (process.env.STITAP_HOME && !profile)
        return process.env.STITAP_HOME;
    const root = stitapRoot();
    if (!profile || profile === "default")
        return process.env.STITAP_HOME || root;
    if (!/^[A-Za-z0-9_.-]+$/.test(profile))
        throw new Error(`invalid profile name: ${profile}`);
    return join(root, "profiles", profile);
}
export function policyPath() {
    if (process.env.STITAP_POLICY_FILE)
        return process.env.STITAP_POLICY_FILE;
    const p = platform();
    if (p === "win32")
        return join(process.env.ProgramData || "C:\\ProgramData", "stitap", "policy.yaml");
    if (p === "darwin")
        return "/Library/Application Support/stitap/policy.yaml";
    return "/etc/stitap/policy.yaml";
}
export function parseEnv(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m)
            continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
            v = v.slice(1, -1);
        out[m[1]] = v;
    }
    return out;
}
export class ConfigStore {
    home;
    data;
    env = {};
    policy = null;
    path;
    /** what config.yaml itself contains (before defaults are merged in) */
    user = {};
    constructor(home) {
        this.home = home;
        this.path = join(home, "config.yaml");
        ensureHome(home);
        this.data = DEFAULT_CONFIG;
        this.reload();
    }
    reload() {
        let user = {};
        if (existsSync(this.path)) {
            try {
                user = parseYaml(readFileSync(this.path, "utf8")) ?? {};
            }
            catch (e) {
                throw new Error(`config.yaml is invalid: ${e.message}`);
            }
        }
        this.user = user;
        let data = deepMerge(DEFAULT_CONFIG, user);
        const envPath = join(this.home, ".env");
        this.env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
        const pp = policyPath();
        if (existsSync(pp)) {
            try {
                this.policy = parseYaml(readFileSync(pp, "utf8"));
                for (const [k, v] of Object.entries(this.policy?.enforce ?? {}))
                    setPath(data, k, v);
            }
            catch {
                this.policy = null;
            }
        }
        this.data = data;
    }
    /** Secret lookup: process env wins, then ~/.stitap/.env */
    secret(name) {
        if (!name)
            return undefined;
        return process.env[name] ?? this.env[name];
    }
    allSecretValues() {
        return Object.values(this.env).filter((v) => v && v.length >= 8);
    }
    isLocked(path) {
        return !!this.policy?.enforce && Object.prototype.hasOwnProperty.call(this.policy.enforce, path);
    }
    get(path) { return getPath(this.data, path); }
    /** True when config.yaml (or the admin policy) sets this key, i.e. the value is a choice, not a default. */
    userSet(path) {
        return getPath(this.user, path) !== undefined || (!!this.policy?.enforce && Object.prototype.hasOwnProperty.call(this.policy.enforce, path));
    }
    set(path, value) {
        if (this.isLocked(path))
            throw new Error(`"${path}" is enforced by the administrator policy (${policyPath()})`);
        let user = {};
        if (existsSync(this.path))
            user = parseYaml(readFileSync(this.path, "utf8")) ?? {};
        setPath(user, path, value);
        writeFileSync(this.path, stringifyYaml(user) + "\n");
        this.reload();
    }
    setSecret(name, value) {
        const envPath = join(this.home, ".env");
        const cur = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
        const lines = cur.split(/\r?\n/).filter((l) => l && !l.startsWith(`${name}=`));
        lines.push(`${name}=${value}`);
        writeFileSync(envPath, lines.join("\n") + "\n");
        try {
            chmodSync(envPath, 0o600);
        }
        catch { /* windows */ }
        this.reload();
    }
}
export function ensureHome(home) {
    for (const d of ["", "logs", "memories", "skills", "spill", "checkpoints", "cron", "plugins", "tmp", "files"]) {
        const p = join(home, d);
        if (!existsSync(p))
            mkdirSync(p, { recursive: true });
    }
    const cfg = join(home, "config.yaml");
    if (!existsSync(cfg))
        writeFileSync(cfg, STARTER_CONFIG);
}
const STARTER_CONFIG = `# stitaP agent configuration. Secrets go in .env next to this file, never here.
# Full reference: docs/agent-runtime.md
model:
  provider: openai              # openai = any OpenAI-compatible server (Ollama, llama.cpp, LM Studio, vLLM, OpenRouter, Azure gateway)
  base_url: http://localhost:11434/v1
  name: qwen2.5:7b-instruct
  api_key_env: OPENAI_API_KEY   # name of the variable in .env (optional for local servers)
  tool_mode: auto               # auto | native | react (text protocol for models without tool calling)
  context_window: 32768

agent:
  tool_profile: standard        # slm (~10 tools) | standard | full
  max_iterations: 60

approvals:
  mode: ask                     # ask | yolo | deny

terminal:
  backend: local                # local | docker | ssh
`;
