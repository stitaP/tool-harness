/**
 * Executors for video editing and media generation, backed by ffmpeg/ffprobe
 * on the agent's machine. The video.* tools edit one persisted "project": a
 * source clip (screen recording or opened file) plus a timeline of
 * annotations, overlays, captions and transitions that video.export renders.
 */
import { generateStickerSVG, generateWaveformSVG, generateThumbnailSVG } from "@/lib/store/tools/media-tools";
import { execs, json, num, str, bool, list, persisted, secret, nodeModule, isNode, dataDir, uid, r2, type ExecMap } from "./util";

// ─── process helpers ─────────────────────────────────────────────────────────

function need(): { cp: any; fs: any; path: any; os: any } {
  const cp = nodeModule("node:child_process");
  if (!cp || !isNode()) throw new Error("media processing needs the agent runtime (Node.js + ffmpeg)");
  return { cp, fs: nodeModule("node:fs"), path: nodeModule("node:path"), os: nodeModule("node:os") };
}
function which(cmd: string): boolean {
  const { cp } = need();
  try { cp.execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }); return true; } catch { return false; }
}
function ffmpegBin(name = "ffmpeg"): string {
  const env = secret(name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH");
  if (env) return env;
  if (which(name)) return name;
  throw new Error(`${name} is not installed — install it (macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg · Linux: apt install ffmpeg) or set FFMPEG_PATH`);
}
function run(bin: string, args: string[], opts: { input?: string | Uint8Array; timeout?: number } = {}): Promise<{ code: number; stdout: string; stderr: string; out: Uint8Array }> {
  const { cp } = need();
  return new Promise((resolve) => {
    const c = cp.spawn(bin, args, { windowsHide: true });
    const chunks: Uint8Array[] = []; let stderr = "";
    const t = setTimeout(() => c.kill("SIGKILL"), opts.timeout ?? 600000);
    c.stdout.on("data", (d: Uint8Array) => chunks.push(d));
    c.stderr.on("data", (d: any) => { stderr += d; if (stderr.length > 200000) stderr = stderr.slice(-100000); });
    c.on("error", (e: Error) => { clearTimeout(t); resolve({ code: 127, stdout: "", stderr: e.message, out: new Uint8Array() }); });
    c.on("close", (code: number) => { clearTimeout(t); const out = (globalThis as any).Buffer.concat(chunks); resolve({ code: code ?? 1, stdout: out.toString(), stderr, out }); });
    if (opts.input !== undefined) c.stdin.end(opts.input); else c.stdin.end();
  });
}
async function ffmpeg(args: string[], timeout?: number): Promise<void> {
  const r = await run(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout });
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.stderr.trim().split("\n").slice(-4).join(" | ")}`);
}
async function probe(file: string): Promise<{ duration: number; width?: number; height?: number; fps?: number; hasAudio: boolean; sizeBytes: number; codec?: string }> {
  const { fs } = need();
  const r = await run(ffmpegBin("ffprobe"), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", file]);
  const j = json<any>(r.stdout || "{}", {});
  const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
  const [a, b] = String(v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return { duration: r2(Number(j.format?.duration ?? 0), 3), width: v?.width, height: v?.height, fps: b ? r2(a / b, 2) : undefined, hasAudio: (j.streams ?? []).some((s: any) => s.codec_type === "audio"), sizeBytes: fs.statSync(file).size, codec: v?.codec_name };
}
function outFile(prefix: string, ext: string): string {
  const { fs, path } = need();
  const dir = path.join(dataDir() ?? need().os.tmpdir(), "media");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`);
}
function localFile(src: string): string {
  const { fs, path, os } = need();
  const p = src.startsWith("~") ? path.join(os.homedir(), src.slice(1)) : src;
  if (/^https?:\/\//.test(src)) return src; // ffmpeg reads URLs directly
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(src);
  if (m) { const f = outFile("input", m[1].split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg")); fs.writeFileSync(f, (globalThis as any).Buffer.from(m[2], "base64")); return f; }
  if (!fs.existsSync(p)) throw new Error(`file not found: ${src}`);
  return path.resolve(p);
}

/** A TrueType font for drawtext (ffmpeg needs a file path on most builds). */
let fontCache: string | null | undefined;
function font(): string | null {
  if (fontCache !== undefined) return fontCache;
  const { fs } = need();
  const cands = [secret("STITAP_FONT"), "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/noto/NotoSans-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"].filter(Boolean) as string[];
  fontCache = cands.find((f) => fs.existsSync(f)) ?? null;
  if (!fontCache && which("fc-match")) { try { const f = String(need().cp.execFileSync("fc-match", ["-f", "%{file}", "sans"], { encoding: "utf8" })).trim(); if (f && fs.existsSync(f)) fontCache = f; } catch { /* none */ } }
  return fontCache;
}
/** Escape text for an ffmpeg filter argument (drawtext text='…'). */
const esc = (s: string) => s.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/,/g, "\\,");
const escPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
const color = (c: unknown, d: string) => { const s = str(c, d).trim(); return /^#[0-9a-f]{3}$/i.test(s) ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : /^rgba?\(/.test(s) ? d : s; };
function drawtext(text: string, o: { x: string; y: string; size: number; color: string; box?: string; enable?: string; border?: boolean; alpha?: string }): string {
  const f = font();
  return `drawtext=${f ? `fontfile='${escPath(f)}':` : ""}text='${esc(text)}':expansion=none:x=${o.x}:y=${o.y}:fontsize=${o.size}:fontcolor=${o.color}${o.alpha ? `:alpha='${o.alpha}'` : ""}${o.box ? `:box=1:boxcolor=${o.box}:boxborderw=12` : ""}${o.border ? ":borderw=3:bordercolor=black" : ""}${o.enable ? `:enable='${o.enable}'` : ""}`;
}

/** Render SVG to PNG with whatever is on the machine: sharp → rsvg-convert → ImageMagick → Playwright. */
async function rasterize(svg: string, out: string, width?: number): Promise<string | null> {
  const { fs, os, path } = need();
  try {
    const req = nodeModule("node:module").createRequire(process.cwd() + "/");
    const sharp = req("sharp");
    await sharp((globalThis as any).Buffer.from(svg), { density: 144 }).resize(width ? { width } : undefined).png().toFile(out);
    return "sharp";
  } catch { /* next */ }
  const tmp = path.join(os.tmpdir(), `stitap-${Date.now()}.svg`);
  fs.writeFileSync(tmp, svg);
  if (which("rsvg-convert")) { const r = await run("rsvg-convert", [...(width ? ["-w", String(width)] : []), "-o", out, tmp]); if (!r.code) return "rsvg-convert"; }
  for (const bin of ["magick", "convert"]) if (which(bin)) { const r = await run(bin, ["-background", "none", "-density", "144", tmp, ...(width ? ["-resize", `${width}x`] : []), out]); if (!r.code && fs.existsSync(out)) return bin; }
  try {
    const req = nodeModule("node:module").createRequire(process.cwd() + "/");
    const pw = req("playwright");
    const b = await pw.chromium.launch({ executablePath: secret("STITAP_CHROMIUM") });
    try { const p = await b.newPage(); await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`); await (await p.$("svg")).screenshot({ path: out, omitBackground: true }); return "playwright"; } finally { await b.close(); }
  } catch { return null; }
}
const svgSize = (svg: string) => { const m = /viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg) ?? /width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg); return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 512, h: 512 }; };
/** Ensure the root <svg> has explicit width/height so rasterizers size it correctly. */
const sized = (svg: string, w: number, h: number) => (/<svg[^>]*\swidth=/.test(svg) ? svg : svg.replace("<svg ", `<svg width="${w}" height="${h}" `));

async function imageResult(prefix: string, svg: string, fmt: string, width?: number) {
  const { fs } = need();
  const { w, h } = svgSize(svg);
  const svgFile = outFile(prefix, "svg");
  fs.writeFileSync(svgFile, sized(svg, w, h));
  if (fmt === "svg") return { file: svgFile, format: "svg", width: w, height: h, svg };
  const png = outFile(prefix, "png");
  const via = await rasterize(sized(svg, w, h), png, width);
  if (!via) return { file: svgFile, format: "svg", width: w, height: h, svg, note: "no SVG rasterizer found (install sharp, librsvg or ImageMagick) — returned SVG" };
  let file = png;
  if (fmt === "webp" || fmt === "jpg" || fmt === "jpeg") { file = outFile(prefix, fmt === "webp" ? "webp" : "jpg"); await ffmpeg(["-i", png, file]); }
  return { file, format: fmt || "png", width: width ?? w, height: width ? Math.round((h * width) / w) : h, svgFile, rasterizer: via, bytes: fs.statSync(file).size };
}

// ─── video project (persisted) ───────────────────────────────────────────────

interface TItem { id: string; kind: "annotation" | "overlay" | "caption" | "transition"; [k: string]: unknown }
interface Project { source?: string; recording?: { pid: number; file: string; startedAt: string }; timeline: TItem[] }
const proj = persisted<Project>("video-project", () => ({ timeline: [] }));
let recorder: any = null;

function sourceOf(i: Record<string, unknown>): string {
  const s = i.source ? localFile(str(i.source)) : proj.get().source;
  if (!s) throw new Error("no video loaded — record one with video.record (action=start/stop) or pass source (a video file path)");
  return s;
}
const add = (item: Omit<TItem, "id">) => { const p = proj.get(); const it = { id: uid("T").toLowerCase(), ...item } as TItem; p.timeline.push(it); proj.save(); return { item: it, timelineItems: p.timeline.length, source: p.source ?? null }; };
const win = (a: unknown, b: unknown) => { const s = num(a, 0), e = b === undefined || b === null || b === "" ? Infinity : num(b); return e === Infinity ? `gte(t,${s})` : `between(t,${s},${e})`; };

/** Build the ffmpeg -filter_complex for the timeline. */
async function renderTimeline(src: string, o: { format: string; fps?: number; width?: number; height?: number; quality: number; start?: number; end?: number }) {
  const p = proj.get(), info = await probe(src);
  const W = info.width ?? 1280, H = info.height ?? 720;
  const inputs = ["-i", src];
  const chains: string[] = [];
  let v = "[0:v]";
  let label = 0;
  const next = () => `[v${++label}]`;
  // transitions split the clip and xfade the parts
  const trans = p.timeline.filter((t) => t.kind === "transition").sort((a, b) => num(a.atTime) - num(b.atTime)).filter((t) => num(t.atTime) > 0 && num(t.atTime) < info.duration);
  if (trans.length) {
    const cuts = [0, ...trans.map((t) => num(t.atTime)), info.duration];
    const parts: string[] = [];
    chains.push(`${v}split=${cuts.length - 1}${cuts.slice(1).map((_, k) => `[s${k}]`).join("")}`);
    cuts.slice(1).forEach((end, k) => { const d = k > 0 ? num(trans[k - 1].duration, 0.6) / 2 : 0; const lab = `[p${k}]`; chains.push(`[s${k}]trim=${Math.max(0, cuts[k] - d)}:${end + (k < trans.length ? num(trans[k].duration, 0.6) / 2 : 0)},setpts=PTS-STARTPTS${lab}`); parts.push(lab); });
    const XF: Record<string, string> = { fade: "fade", dissolve: "dissolve", wipeLeft: "wipeleft", wipeRight: "wiperight", slideUp: "slideup", slideDown: "slidedown", zoomIn: "zoomin", zoomOut: "fadeblack" };
    let acc = parts[0], offset = 0;
    trans.forEach((t, k) => {
      const d = num(t.duration, 0.6), segLen = (k === 0 ? cuts[1] + d / 2 : cuts[k + 1] - cuts[k] + d);
      offset += segLen - d;
      const out = next();
      chains.push(`${acc}${parts[k + 1]}xfade=transition=${XF[str(t.type)] ?? "fade"}:duration=${d}:offset=${r2(offset, 3)}${out}`);
      acc = out;
    });
    v = acc;
  }
  // overlays with images need extra inputs
  for (const it of p.timeline) {
    const en = win(it.startTime, it.endTime);
    if (it.kind === "annotation") {
      const x = num(it.x), y = num(it.y), w = num(it.width, 120), h = num(it.height, 60), c = color(it.color, "#ef4444"), out = next();
      const t = str(it.type);
      let f: string;
      if (t === "rect" || t === "circle") f = `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${c}@0.9:t=4:enable='${en}'`;
      else if (t === "highlight") f = `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=yellow@0.35:t=fill:enable='${en}'`;
      else if (t === "blur") { const a = next(), b = next(); chains.push(`${v}split${a}${b}`); chains.push(`${b}crop=${w}:${h}:${x}:${y},boxblur=12:2[bl${label}]`); f = ""; chains.push(`${a}[bl${label}]overlay=${x}:${y}:enable='${en}'${out}`); v = out; continue; }
      else if (t === "number") f = drawtext(str(it.content, "1"), { x: String(x), y: String(y), size: num(it.fontSize, 40), color: "white", box: `${c}@0.95`, enable: en });
      else if (t === "arrow") { const ex = num(it.endX, x + 120), ey = num(it.endY, y); f = `drawbox=x=${Math.min(x, ex)}:y=${Math.min(y, ey) - 2}:w=${Math.max(4, Math.abs(ex - x))}:h=${Math.max(4, Math.abs(ey - y))}:color=${c}:t=fill:enable='${en}',${drawtext("➤", { x: String(ex - 16), y: String(ey - 24), size: 44, color: c, enable: en })}`; }
      else f = drawtext(str(it.content), { x: String(x), y: String(y), size: num(it.fontSize, 36), color: c, box: "black@0.5", enable: en });
      chains.push(`${v}${f}${out}`); v = out;
    } else if (it.kind === "caption") {
      const pos = str(it.position, "bottom"), y = pos === "top" ? "h*0.06" : pos === "center" ? "(h-text_h)/2" : "h-text_h-h*0.08";
      const style = str(it.style, "box"), out = next();
      chains.push(`${v}${drawtext(str(it.text), { x: "(w-text_w)/2", y, size: num(it.fontSize, Math.round(H / 18)), color: color(it.textColor, "white"), box: style === "outline" || style === "default" ? undefined : `${color(it.bgColor, "black")}@0.6`, border: style === "outline" || style === "default", enable: win(it.startTime, it.endTime) })}${out}`);
      v = out;
    } else if (it.kind === "overlay") {
      const t = str(it.type), out = next();
      const x = it.x !== undefined ? num(it.x) : t === "watermark" || t === "logo" ? W - 40 - 160 : 40, y = it.y !== undefined ? num(it.y) : t === "watermark" || t === "logo" ? H - 40 - 80 : 40;
      const op = num(it.opacity, t === "watermark" ? 0.5 : 1), anim = str(it.animation, "none"), s0 = num(it.startTime, 0);
      const alpha = anim === "fadeIn" ? `if(lt(t,${s0}),0,min(1,(t-${s0})/0.6))*${op}` : String(op);
      if (it.imageUrl) {
        inputs.push("-i", localFile(str(it.imageUrl)));
        const idx = inputs.filter((x) => x === "-i").length - 1, il = `[im${idx}]`;
        chains.push(`[${idx}:v]scale=iw*${num(it.scale, 1)}:-1,format=rgba,colorchannelmixer=aa=${op}${il}`);
        const xe = anim === "slideLeft" ? `if(lt(t,${s0}+0.6),W-(W-${x})*(t-${s0})/0.6,${x})` : String(x), ye = anim === "slideUp" ? `if(lt(t,${s0}+0.6),H-(H-${y})*(t-${s0})/0.6,${y})` : String(y);
        chains.push(`${v}${il}overlay=x='${xe}':y='${ye}':enable='${en}'${out}`);
      } else chains.push(`${v}${drawtext(str(it.content, t === "watermark" ? "© stitaP" : ""), { x: it.x !== undefined ? String(x) : t === "watermark" || t === "logo" ? "w-text_w-30" : "30", y: it.y !== undefined ? String(y) : t === "watermark" || t === "logo" ? "h-text_h-30" : "30", size: Math.round(num(it.scale, 1) * 36), color: "white", alpha, border: true, enable: en })}${out}`);
      v = out;
    }
  }
  const post: string[] = [];
  if (o.fps) post.push(`fps=${o.fps}`);
  if (o.width || o.height) post.push(`scale=${o.width ?? -2}:${o.height ?? -2}`);
  if (o.format === "gif") post.push("split[g1][g2];[g1]palettegen=stats_mode=diff[pal];[g2][pal]paletteuse=dither=bayer");
  const final = "[vout]";
  chains.push(`${v}${post.length ? post.join(",") : "null"}${final}`);
  const out = outFile("export", o.format);
  const crf = Math.round(51 - (Math.max(0, Math.min(1, o.quality > 1 ? o.quality / 100 : o.quality)) * 33)); // quality 1 → crf 18
  const codec = o.format === "webm" ? ["-c:v", "libvpx-vp9", "-crf", String(crf + 6), "-b:v", "0", "-c:a", "libopus"] : o.format === "gif" ? [] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"];
  const trim = [...(o.start ? ["-ss", String(o.start)] : []), ...(o.end ? ["-to", String(o.end)] : [])];
  await ffmpeg([...inputs, "-filter_complex", chains.join(";"), "-map", final, ...(info.hasAudio && o.format !== "gif" ? ["-map", "0:a?", "-shortest"] : []), ...trim, ...codec, out]);
  return { file: out, ...(await probe(out)), timelineItems: p.timeline.length, filter: chains.length };
}

// ─── audio synthesis ─────────────────────────────────────────────────────────

const CHORDS: Record<string, number[][]> = {
  corporate: [[261.6, 329.6, 392], [196, 246.9, 293.7], [220, 261.6, 329.6], [174.6, 220, 261.6]],
  upbeat: [[293.7, 370, 440], [329.6, 415.3, 493.9], [246.9, 311.1, 370], [220, 277.2, 329.6]],
  calm: [[220, 277.2, 329.6], [196, 246.9, 293.7]],
  dramatic: [[146.8, 174.6, 220], [130.8, 155.6, 196], [116.5, 146.8, 174.6], [110, 130.8, 164.8]],
  minimal: [[261.6, 392], [220, 329.6]],
};
function musicExpr(preset: string): string {
  const ch = CHORDS[preset] ?? CHORDS.corporate, beat = preset === "upbeat" ? 1.5 : preset === "calm" ? 4 : 2;
  const n = ch.length;
  const terms = ch.map((c, k) => `(eq(mod(floor(t/${beat}),${n}),${k}))*(${c.map((f) => `sin(2*PI*${f}*t)`).join("+")})`).join("+");
  const env = preset === "upbeat" ? `(0.55+0.45*abs(sin(PI*t*2)))` : preset === "dramatic" ? `(0.5+0.5*sin(PI*t/${beat}))` : `0.8`;
  return `0.12*(${terms})*${env}`;
}
const SFX: Record<string, { expr?: string; noise?: boolean; d: number; filt?: string }> = {
  click: { expr: "0.6*sin(2*PI*2200*t)*exp(-120*t)", d: 0.06 },
  pop: { expr: "0.7*sin(2*PI*(700-2500*t)*t)*exp(-25*t)", d: 0.15 },
  success: { expr: "0.4*(lt(t,0.15)*sin(2*PI*659*t)+gte(t,0.15)*sin(2*PI*880*t))*exp(-3*t)", d: 0.5 },
  error: { expr: "0.35*sgn(sin(2*PI*180*t))*exp(-4*t)", d: 0.45 },
  whoosh: { noise: true, d: 0.7, filt: "highpass=f=600,lowpass=f=4000,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.35" },
};

/** Local or cloud TTS → WAV file. */
async function tts(text: string, o: { voice: string; speed: number; pitch: number }): Promise<{ file: string; engine: string }> {
  const { fs } = need();
  const plat = process.platform, out = outFile("speech", "wav");
  const el = secret("ELEVENLABS_API_KEY"), az = secret("AZURE_SPEECH_KEY"), oa = secret("OPENAI_API_KEY");
  const pref = secret("TTS_PROVIDER");
  const cloud = async (): Promise<Uint8Array | null> => {
    if ((pref === "elevenlabs" || !pref) && el) {
      const voices: Record<string, string> = { narrator: "21m00Tcm4TlvDq8Ny2RM", female: "EXAVITQu4vr4xnSDxMaL", male: "pNInz6obpgDQGcFmaJgB", child: "jBpfuIE2acCO8z3wKNLl" };
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voices[o.voice] ?? voices.narrator}`, { method: "POST", headers: { "xi-api-key": el, "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }) });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    if ((pref === "openai" || (!pref && !el && !az)) && oa && !secret("OPENAI_BASE_URL")) {
      const voices: Record<string, string> = { narrator: "alloy", female: "nova", male: "onyx", child: "shimmer" };
      const res = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { authorization: `Bearer ${oa}`, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voices[o.voice] ?? "alloy", input: text, speed: o.speed, response_format: "wav" }) });
      if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    if (az && secret("AZURE_SPEECH_REGION")) {
      const voices: Record<string, string> = { narrator: "en-US-GuyNeural", female: "en-US-JennyNeural", male: "en-US-DavisNeural", child: "en-US-AnaNeural" };
      const res = await fetch(`https://${secret("AZURE_SPEECH_REGION")}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": az, "content-type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm" }, body: `<speak version="1.0" xml:lang="en-US"><voice name="${voices[o.voice] ?? voices.narrator}"><prosody rate="${Math.round((o.speed - 1) * 100)}%" pitch="${Math.round((o.pitch - 1) * 50)}%">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</prosody></voice></speak>` });
      if (!res.ok) throw new Error(`Azure TTS ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    return null;
  };
  const audio = await cloud();
  if (audio) { const tmp = outFile("speech-raw", "bin"); fs.writeFileSync(tmp, audio); await ffmpeg(["-i", tmp, "-ar", "44100", "-ac", "1", out]); fs.unlinkSync(tmp); return { file: out, engine: el ? "elevenlabs" : az ? "azure" : "openai" }; }
  if (plat === "darwin") {
    const voices: Record<string, string> = { narrator: "Samantha", female: "Samantha", male: "Daniel", child: "Junior" };
    const aiff = outFile("speech", "aiff");
    const r = await run("say", ["-v", voices[o.voice] ?? "Samantha", "-r", String(Math.round(175 * o.speed)), "-o", aiff, text]);
    if (r.code) { const r2_ = await run("say", ["-r", String(Math.round(175 * o.speed)), "-o", aiff, text]); if (r2_.code) throw new Error(`say: ${r2_.stderr}`); }
    await ffmpeg(["-i", aiff, out]); fs.unlinkSync(aiff);
    return { file: out, engine: "macOS say" };
  }
  if (plat === "win32") {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${o.voice === "male" ? "try { $s.SelectVoiceByHints('Male') } catch {}" : o.voice === "female" ? "try { $s.SelectVoiceByHints('Female') } catch {}" : ""} $s.Rate = ${Math.max(-10, Math.min(10, Math.round((o.speed - 1) * 8)))}; $s.SetOutputToWaveFile('${out.replace(/'/g, "''")}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
    const r = await run("powershell", ["-NoProfile", "-Command", ps], { input: text });
    if (r.code) throw new Error(`Windows speech: ${r.stderr.trim()}`);
    return { file: out, engine: "Windows SAPI" };
  }
  for (const bin of ["espeak-ng", "espeak"]) if (which(bin)) {
    const v = o.voice === "female" ? "en+f3" : o.voice === "child" ? "en+f5" : o.voice === "male" ? "en+m3" : "en";
    const r = await run(bin, ["-v", v, "-s", String(Math.round(165 * o.speed)), "-p", String(Math.round(50 * o.pitch)), "-w", out, text]);
    if (!r.code) return { file: out, engine: bin };
  }
  if (which("pico2wave")) { const r = await run("pico2wave", ["-w", out, text]); if (!r.code) return { file: out, engine: "pico2wave" }; }
  throw new Error("no text-to-speech engine: install espeak-ng (Linux) or set ELEVENLABS_API_KEY / OPENAI_API_KEY / AZURE_SPEECH_KEY+AZURE_SPEECH_REGION");
}

/** Decode audio to mono f32 and reduce to `n` peak values (0..1). */
async function peaks(src: string, n: number): Promise<number[]> {
  const r = await run(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"]);
  if (r.code) throw new Error(`ffmpeg decode failed: ${r.stderr.trim().slice(-200)}`);
  const buf = r.out as any;
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const per = Math.max(1, Math.floor(f.length / n)), out: number[] = [];
  for (let k = 0; k < n && k * per < f.length; k++) { let m = 0; for (let j = k * per; j < Math.min(f.length, (k + 1) * per); j++) m = Math.max(m, Math.abs(f[j])); out.push(r2(m, 4)); }
  return out;
}

// ─── executors ───────────────────────────────────────────────────────────────

export const MEDIA_EXECUTORS: ExecMap = execs({
  "video.record": async (i) => {
    const action = str(i.action, "start"), p = proj.get();
    if (action === "open") { const s = localFile(str(i.source)); p.source = s; p.timeline = bool(i.keepTimeline) ? p.timeline : []; proj.save(); return { source: s, ...(await probe(s)) }; }
    if (action === "stop") {
      if (!recorder && !p.recording) throw new Error("no recording in progress");
      const file = p.recording?.file;
      if (recorder) { recorder.stdin.write("q"); await new Promise((r) => { recorder.once("close", r); setTimeout(r, 8000); }); recorder = null; }
      else if (p.recording?.pid) { try { process.kill(p.recording.pid, "SIGINT"); } catch { /* gone */ } }
      p.recording = undefined;
      if (!file || !need().fs.existsSync(file)) { proj.save(); throw new Error("recording produced no file (capture permission denied?)"); }
      p.source = file; p.timeline = []; proj.save();
      return { stopped: true, source: file, ...(await probe(file)) };
    }
    if (recorder) throw new Error("already recording — call video.record action=stop");
    const fps = num(i.frameRate, 30), max = num(i.maxDuration, 600), file = outFile("recording", "mp4"), plat = process.platform;
    const audio = bool(i.includeAudio);
    let args: string[];
    if (plat === "darwin") args = ["-f", "avfoundation", "-capture_cursor", "1", "-framerate", String(fps), "-i", `${secret("SCREEN_DEVICE") ?? "1"}:${audio ? "0" : "none"}`];
    else if (plat === "win32") args = ["-f", "gdigrab", "-framerate", String(fps), "-i", "desktop", ...(audio ? ["-f", "dshow", "-i", `audio=${secret("AUDIO_DEVICE") ?? "virtual-audio-capturer"}`] : [])];
    else {
      if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("no display to record (headless machine) — use video.record action=open with an existing video file");
      args = ["-f", "x11grab", "-framerate", String(fps), "-i", process.env.DISPLAY ?? ":0", ...(audio ? ["-f", "pulse", "-i", "default"] : [])];
    }
    const { cp } = need();
    recorder = cp.spawn(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args, "-t", String(max), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file], { windowsHide: true });
    let err = "";
    recorder.stderr.on("data", (d: any) => (err += d));
    recorder.on("close", () => { recorder = null; });
    await new Promise((r) => setTimeout(r, 1200));
    if (!recorder || recorder.exitCode !== null) throw new Error(`screen capture failed: ${err.trim().split("\n").pop() || "ffmpeg exited"} (macOS: grant Screen Recording permission to the terminal/app)`);
    p.recording = { pid: recorder.pid, file, startedAt: new Date().toISOString() }; proj.save();
    return { recording: true, file, maxDuration: max, note: bool(i.includeWebcam) ? "webcam overlay is not captured by screen recording; add the webcam clip with video.addOverlay" : undefined };
  },
  "video.annotate": (i) => add({ kind: "annotation", type: str(i.type), x: num(i.x), y: num(i.y), content: i.content, width: i.width, height: i.height, color: i.color, endX: i.endX, endY: i.endY, fontSize: i.fontSize, startTime: num(i.startTime, 0), endTime: i.endTime }),
  "video.addOverlay": (i) => { if (!i.content && !i.imageUrl && str(i.type) !== "watermark") throw new Error("overlay needs content (text) or imageUrl"); return add({ kind: "overlay", type: str(i.type), content: i.content, imageUrl: i.imageUrl, x: i.x, y: i.y, scale: i.scale, opacity: i.opacity, startTime: num(i.startTime, 0), endTime: i.endTime, animation: i.animation }); },
  "video.addCaption": (i) => { if (num(i.endTime) <= num(i.startTime)) throw new Error("endTime must be after startTime"); return add({ kind: "caption", text: str(i.text), startTime: num(i.startTime), endTime: num(i.endTime), position: i.position, fontSize: i.fontSize, bgColor: i.bgColor, textColor: i.textColor, style: i.style }); },
  "video.addTransition": (i) => add({ kind: "transition", type: str(i.type, "fade"), duration: num(i.duration, 0.6), atTime: num(i.atTime) }),
  "video.captureFrame": async (i) => {
    const src = sourceOf(i), fmt = str(i.format, "png"), info = await probe(src);
    const ts = Math.min(num(i.timestamp, 0), Math.max(0, info.duration - 0.05));
    const out = outFile("frame", fmt === "jpeg" ? "jpg" : fmt);
    const q = num(i.quality, 0.9);
    await ffmpeg(["-ss", String(ts), "-i", src, "-frames:v", "1", ...(i.scale && num(i.scale) !== 1 ? ["-vf", `scale=iw*${num(i.scale)}:-2`] : []), ...(fmt === "jpeg" ? ["-q:v", String(Math.round(31 - (q > 1 ? q / 100 : q) * 29))] : fmt === "webp" ? ["-quality", String(Math.round((q > 1 ? q / 100 : q) * 100))] : []), out]);
    const st = need().fs.statSync(out);
    return { file: out, timestamp: ts, format: fmt, bytes: st.size, base64: st.size < 400000 ? need().fs.readFileSync(out).toString("base64") : undefined };
  },
  "video.export": async (i) => {
    const src = sourceOf(i), fps = i.fps ? num(i.fps) : undefined, info = await probe(src);
    const f = info.fps ?? 30;
    const r = await renderTimeline(src, { format: str(i.format, "mp4"), fps: fps ?? (str(i.format) === "gif" ? 12 : undefined), width: i.width ? num(i.width) : str(i.format) === "gif" ? 640 : undefined, height: i.height ? num(i.height) : undefined, quality: num(i.quality, 0.8), start: i.startFrame ? num(i.startFrame) / f : undefined, end: i.endFrame ? num(i.endFrame) / f : undefined });
    if (bool(i.clearTimeline)) { proj.get().timeline = []; proj.save(); }
    return r;
  },

  "media.renderVideo": async (i) => {
    const scenes = json<any[]>(i.scenes, []);
    if (!Array.isArray(scenes) || !scenes.length) throw new Error("scenes must be a non-empty array of {text, background, duration}");
    const W = num(i.width, 1280), H = num(i.height, 720), fps = num(i.fps, 30), fmt = str(i.format, "mp4");
    const parts: string[] = [];
    for (const [k, s] of scenes.entries()) {
      const d = num(s.duration, 4), bg = str(s.background ?? s.backgroundColor, "#1e293b");
      const part = outFile(`scene${k}`, "mp4");
      const isImg = /\.(png|jpe?g|webp|gif|bmp)$|^data:image|^https?:/i.test(bg);
      const src = isImg ? ["-loop", "1", "-t", String(d), "-i", localFile(bg)] : /^(linear-)?gradient|,/.test(bg) ? ["-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=${color(bg.split(",")[0].replace(/^.*\(/, ""), "#667eea")}:c1=${color(bg.split(",")[1]?.replace(/\).*$/, ""), "#764ba2")}:d=${d}:r=${fps}`] : ["-f", "lavfi", "-i", `color=c=${color(bg, "#1e293b")}:s=${W}x${H}:d=${d}:r=${fps}`];
      const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, "setsar=1", `fps=${fps}`];
      const title = str(s.title ?? s.heading), text = str(s.text ?? s.narration ?? s.caption);
      if (title) vf.push(drawtext(title, { x: "(w-text_w)/2", y: "h*0.3", size: Math.round(H / 11), color: color(s.titleColor ?? s.textColor, "white"), border: isImg, alpha: "min(1,t/0.5)" }));
      if (text) {
        const wrapped = text.match(new RegExp(`.{1,${Math.max(20, Math.round(W / (H / 22)))}}(\\s|$)`, "g"))?.map((l) => l.trim()) ?? [text];
        wrapped.slice(0, 6).forEach((l, n) => vf.push(drawtext(l, { x: "(w-text_w)/2", y: `h*${title ? 0.5 : 0.4}+${n}*${Math.round(H / 16)}`, size: Math.round(H / 22), color: color(s.textColor, "white"), border: isImg, alpha: "min(1,t/0.7)" })));
      }
      for (const ov of Array.isArray(s.overlays) ? s.overlays : []) if (ov.text) vf.push(drawtext(str(ov.text), { x: String(num(ov.x, 40)), y: String(num(ov.y, 40)), size: num(ov.fontSize, Math.round(H / 26)), color: color(ov.color, "white"), box: "black@0.4" }));
      vf.push(`fade=t=in:st=0:d=0.3,fade=t=out:st=${Math.max(0, d - 0.3)}:d=0.3`);
      const audio = s.audio ? ["-i", localFile(str(s.audio))] : ["-f", "lavfi", "-t", String(d), "-i", "anullsrc=r=44100:cl=stereo"];
      await ffmpeg([...src, ...audio, "-t", String(d), "-vf", vf.join(","), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", part]);
      parts.push(part);
    }
    const { fs } = need();
    const list_ = outFile("concat", "txt");
    fs.writeFileSync(list_, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    const out = outFile("video", fmt);
    const enc = fmt === "gif" ? ["-vf", `fps=${Math.min(fps, 15)},scale=${Math.min(W, 800)}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`] : fmt === "webm" ? ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus"] : ["-c", "copy"];
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", list_, ...enc, out]);
    for (const p of [...parts, list_]) fs.unlinkSync(p);
    return { file: out, scenes: scenes.length, ...(await probe(out)) };
  },
  "media.synthesizeSpeech": async (i) => {
    const text = str(i.text);
    if (!text.trim()) throw new Error("text is empty");
    const r = await tts(text, { voice: str(i.voice, "narrator"), speed: num(i.speed, 1), pitch: num(i.pitch, 1) });
    let file = r.file;
    const vol = num(i.volume, 1);
    if (vol !== 1 || (r.engine !== "macOS say" && num(i.pitch, 1) !== 1 && !/espeak/.test(r.engine))) {
      const adj = outFile("speech", "wav"), p = num(i.pitch, 1);
      await ffmpeg(["-i", file, "-af", [vol !== 1 ? `volume=${vol}` : "", p !== 1 && !/espeak/.test(r.engine) ? `asetrate=44100*${p},aresample=44100,atempo=${r2(1 / p, 3)}` : ""].filter(Boolean).join(",") || "anull", adj]);
      need().fs.unlinkSync(file); file = adj;
    }
    if (str(i.format) === "mp3") { const mp3 = file.replace(/\.wav$/, ".mp3"); await ffmpeg(["-i", file, "-b:a", "128k", mp3]); need().fs.unlinkSync(file); file = mp3; }
    return { file, engine: r.engine, ...(await probe(file)) };
  },
  "media.composeAudio": async (i) => {
    const layers = json<any[]>(i.layers, []);
    if (!Array.isArray(layers) || !layers.length) throw new Error("layers must be an array of {type, startTime, duration, volume}");
    const sr = num(i.sampleRate, 44100);
    const ends = layers.map((l) => num(l.startTime, 0) + num(l.duration, 0));
    const total = i.duration ? num(i.duration) : Math.max(1, ...ends);
    const args: string[] = [], filters: string[] = [];
    for (const [k, l] of layers.entries()) {
      const type = str(l.type ?? l.preset ?? l.kind).toLowerCase(), start = num(l.startTime, 0), d = num(l.duration, Math.max(0.1, total - start)), vol = num(l.volume, type === "music" || CHORDS[type] ? 0.35 : 1);
      if (l.source || l.file) args.push("-i", localFile(str(l.source ?? l.file)));
      else if (type === "narration" || type === "speech" || l.text) { const t = await tts(str(l.text), { voice: str(l.voice, "narrator"), speed: num(l.speed, 1), pitch: 1 }); args.push("-i", t.file); }
      else if (CHORDS[type] || CHORDS[str(l.preset)] || type === "music") args.push("-f", "lavfi", "-t", String(d), "-i", `aevalsrc='${musicExpr(CHORDS[type] ? type : str(l.preset, "corporate"))}':s=${sr}`);
      else if (SFX[type] || SFX[str(l.preset)]) { const s = SFX[SFX[type] ? type : str(l.preset)]; args.push("-f", "lavfi", "-t", String(s.d), "-i", s.noise ? `anoisesrc=d=${s.d}:c=pink:r=${sr}:a=0.5` : `aevalsrc='${s.expr}':s=${sr}`); if (s.filt) filters.push(`__pre${k}:${s.filt}`); }
      else if (type === "silence") args.push("-f", "lavfi", "-t", String(d), "-i", `anullsrc=r=${sr}:cl=mono`);
      else if (type === "tone") args.push("-f", "lavfi", "-t", String(d), "-i", `sine=f=${num(l.frequency, 440)}:r=${sr}`);
      else throw new Error(`layer ${k}: unknown type "${type}" (music presets: ${Object.keys(CHORDS).join(", ")}; sfx: ${Object.keys(SFX).join(", ")}; narration {text}; file {source}; tone; silence)`);
      const pre = filters.find((f) => f.startsWith(`__pre${k}:`))?.split(":").slice(1).join(":");
      const chain = [pre, `atrim=0:${d}`, l.fadeIn ? `afade=t=in:d=${num(l.fadeIn)}` : "", l.fadeOut ? `afade=t=out:st=${Math.max(0, d - num(l.fadeOut))}:d=${num(l.fadeOut)}` : "", `volume=${vol}`, `aresample=${sr}`, "aformat=channel_layouts=stereo", `adelay=${Math.round(start * 1000)}:all=1`].filter(Boolean).join(",");
      filters.push(`[${k}:a]${chain}[l${k}]`);
    }
    const mixes = filters.filter((f) => !f.startsWith("__pre"));
    const g = [i.fadeIn ? `afade=t=in:d=${num(i.fadeIn)}` : "", i.fadeOut ? `afade=t=out:st=${Math.max(0, total - num(i.fadeOut))}:d=${num(i.fadeOut)}` : "", "alimiter=limit=0.95"].filter(Boolean).join(",");
    const out = outFile("mix", str(i.format) === "mp3" ? "mp3" : "wav");
    await ffmpeg([...args, "-filter_complex", `${mixes.join(";")};${layers.map((_, k) => `[l${k}]`).join("")}amix=inputs=${layers.length}:duration=longest:normalize=0,apad,atrim=0:${total},${g}[out]`, "-map", "[out]", "-ar", String(sr), out]);
    return { file: out, layers: layers.length, ...(await probe(out)) };
  },
  "media.generateSticker": async (i) => {
    const svg = generateStickerSVG(str(i.type), str(i.variant, "default"), num(i.size, 128), str(i.color, "#ef4444"), str(i.backgroundColor), i.label ? str(i.label) : undefined);
    if (!isNode()) return { format: "svg", svg };
    return imageResult("sticker", svg, str(i.format, "png"), i.size ? num(i.size) : undefined);
  },
  "media.generateThumbnail": async (i) => {
    const W = num(i.width, 1280), H = num(i.height, 720);
    const g = list(i.gradientColors);
    const bg = str(i.background, "gradient");
    let svg = generateThumbnailSVG(str(i.title), W, H, g[0] ?? (bg === "solid" ? str(i.backgroundColor, "#1e293b") : "#667eea"), bg === "solid" ? g[0] ?? str(i.backgroundColor, "#1e293b") : g[1] ?? "#764ba2", str(i.titleColor, "#ffffff"), num(i.titleSize, 64));
    if (!isNode()) return { format: "svg", svg };
    if ((bg === "image" || bg === "blur" || i.backgroundImage || i.video) && (i.backgroundImage || i.video)) {
      // background from an image or a video frame, title rendered on top with ffmpeg
      let img = localFile(str(i.backgroundImage ?? i.video));
      if (i.video || /\.(mp4|mov|webm|mkv|avi)$/i.test(img)) { const fr = outFile("thumbframe", "png"); const info = await probe(img); await ffmpeg(["-ss", String(num(i.timestamp, info.duration * 0.3)), "-i", img, "-frames:v", "1", fr]); img = fr; }
      const out = outFile("thumbnail", "png");
      const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, ...(bg === "blur" ? ["boxblur=20:2"] : []), "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill", drawtext(str(i.title), { x: "(w-text_w)/2", y: "(h-text_h)/2", size: num(i.titleSize, 64), color: color(i.titleColor, "white"), border: true })];
      await ffmpeg(["-i", img, "-frames:v", "1", "-vf", vf.join(","), out]);
      return { file: out, format: "png", width: W, height: H, bytes: need().fs.statSync(out).size };
    }
    return imageResult("thumbnail", svg, str(i.format, "png"));
  },
  "media.generateWaveform": async (i) => {
    const W = num(i.width, 800), H = num(i.height, 128);
    let samples = i.samples !== undefined ? json<any>(i.samples, []) : [];
    let source: string | undefined;
    if (typeof samples === "string" || (!Array.isArray(samples) && i.source)) samples = [];
    if ((!Array.isArray(samples) || !samples.length) && (i.source || typeof i.samples === "string")) { source = localFile(str(i.source ?? i.samples)); samples = await peaks(source, Math.min(400, Math.round(W / 3))); }
    const s = (samples as any[]).map(Number).filter((x) => Number.isFinite(x));
    if (!s.length) throw new Error("samples must be an array of numbers, or pass source (an audio/video file)");
    const mx = Math.max(...s.map(Math.abs)) || 1;
    const norm = s.map((x) => Math.abs(x) / mx);
    const svg = generateWaveformSVG(norm, W, H, str(i.color, "#8b5cf6"), str(i.style, "bars"));
    if (!isNode()) return { format: "svg", svg, samples: norm.length };
    const img = await imageResult("waveform", svg, str(i.format, "svg"));
    return { ...img, samples: norm.length, peakCount: norm.length, source, duration: source ? (await probe(source)).duration : undefined };
  },
});
