import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { buildProvider } from "../providers/index.js";
import { resolvePath } from "../safety/paths.js";
import { guardedFetch } from "./web.js";
import { type Tool, obj, str } from "./types.js";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp" };

export const visionTool: Tool = {
  name: "vision_analyze", toolset: "vision", tier: "standard", parallelSafe: true,
  description: "Look at an image (local path or URL) and answer a question about it: describe, read text, inspect a screenshot/chart/UI. Requires a vision-capable model (config: vision_model, or the main model).",
  parameters: obj({ image: str("file path or http(s) URL"), question: str("what to find out (default: describe it)") }, ["image"]),
  async handler(a, ctx) {
    const rt = ctx.rt;
    let dataUrl: string;
    const src = String(a.image);
    if (/^https?:\/\//.test(src)) {
      const res = await guardedFetch(rt, src, {}, ctx.signal);
      const ct = res.headers.get("content-type") ?? "image/png";
      dataUrl = `data:${ct.split(";")[0]};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    } else if (src.startsWith("data:")) dataUrl = src;
    else {
      const p = resolvePath(ctx.cwd, src);
      if (!existsSync(p)) return `error: image not found: ${p}`;
      dataUrl = `data:${MIME[extname(p).toLowerCase()] ?? "image/png"};base64,${readFileSync(p).toString("base64")}`;
    }
    const vm = (rt.cfg.data as any).vision_model;
    const prov = vm ? buildProvider({ ...rt.cfg.data.model, ...vm, tool_mode: "native" }, rt.cfg) : rt.aux();
    const r = await prov.chat({
      messages: [{ role: "user", content: String(a.question || "Describe this image in detail, including any visible text."), meta: { images: [dataUrl] } }],
      maxTokens: 1200, signal: ctx.signal, stream: false,
    });
    return r.content || "(the model returned no description — it may not support images; set vision_model in config.yaml)";
  },
};
