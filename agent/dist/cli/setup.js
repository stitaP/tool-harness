/** `harness setup` — interactive first-run wizard (model, approvals, terminal, gateway). */
import { createInterface } from "node:readline/promises";
import { bold, cyan, gray, green } from "./ui.js";
const PRESETS = {
    "1": { provider: "openai", base_url: "http://localhost:11434/v1", name: "qwen2.5:7b-instruct", ctx: 32768 },
    "2": { provider: "openai", base_url: "http://localhost:8080/v1", name: "local", ctx: 16384 },
    "3": { provider: "openai", base_url: "http://localhost:1234/v1", name: "local-model", ctx: 16384 },
    "4": { provider: "openai", base_url: "https://openrouter.ai/api/v1", name: "qwen/qwen-2.5-72b-instruct", key: "OPENROUTER_API_KEY", ctx: 32768 },
    "5": { provider: "openai", base_url: "https://api.openai.com/v1", name: "gpt-4.1-mini", key: "OPENAI_API_KEY", ctx: 128000 },
    "6": { provider: "anthropic", base_url: "", name: "claude-sonnet-4-5", key: "ANTHROPIC_API_KEY", ctx: 200000 },
    "7": { provider: "openai", base_url: "", name: "", key: "OPENAI_API_KEY", ctx: 32768 },
};
export async function setup(cfg, opts = {}) {
    if (opts.nonInteractive) {
        for (const [k, v] of Object.entries(opts.nonInteractive))
            cfg.set(k, /^\d+$/.test(v) ? Number(v) : v);
        return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q, def = "") => (await rl.question(`${q}${def ? gray(` [${def}]`) : ""}: `)).trim() || def;
    console.log(bold(cyan("stitaP setup")) + gray(`  (writes ${cfg.path})\n`));
    console.log(`Which model server?\n  1) Ollama (local)\n  2) llama.cpp server (local)\n  3) LM Studio (local)\n  4) OpenRouter\n  5) OpenAI\n  6) Anthropic\n  7) Other OpenAI-compatible endpoint (company gateway, vLLM, Azure …)`);
    const choice = await ask("Choice", "1");
    const p = PRESETS[choice] ?? PRESETS["1"];
    const base = p.provider === "anthropic" ? "" : await ask("Base URL", p.base_url);
    const name = await ask("Model name", p.name);
    const ctx = Number(await ask("Context window (tokens)", String(p.ctx)));
    cfg.set("model", { provider: p.provider, base_url: base, name, api_key_env: p.key ?? "OPENAI_API_KEY", tool_mode: "auto", context_window: ctx });
    if (p.key) {
        const key = await ask(`API key for ${p.key} (stored in .env; leave empty to skip)`);
        if (key)
            cfg.setSecret(p.key, key);
    }
    const small = /\b(0\.5|1\.5|1|2|3|4)b\b/i.test(name);
    cfg.set("agent.tool_profile", await ask("Tool profile: slm (small models) | standard | full", small ? "slm" : "standard"));
    cfg.set("approvals.mode", await ask("Dangerous commands: ask | deny | yolo", "ask"));
    cfg.set("terminal.backend", await ask("Run commands: local | docker | ssh", "local"));
    if (cfg.data.terminal.backend === "ssh")
        cfg.set("terminal.ssh_host", await ask("SSH host (user@host)"));
    if ((await ask("Connect Telegram now? (y/n)", "n")).toLowerCase().startsWith("y")) {
        const tok = await ask("Telegram bot token (from @BotFather)");
        if (tok) {
            cfg.setSecret("TELEGRAM_BOT_TOKEN", tok);
            cfg.set("gateway.telegram.enabled", true);
        }
    }
    rl.close();
    console.log(green(`\nSaved. Next: ${bold("harness doctor")} to verify, then ${bold("harness")} (terminal chat) or ${bold("harness ui")} (web chat).`));
}
