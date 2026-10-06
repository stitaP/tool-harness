export const needs = [];
export default async ({ run, m, clip, ocrImage, dataDir }) => {
  const c = await run("design.canvas.create", { name: "Shop", description: "test" });
  const ab = (await run("design.artboard.add", { canvasId: c.canvasId, breakpoint: "desktop" })).artboard;
  const t = (await run("design.element.add", { canvasId: c.canvasId, artboardId: ab.id, kind: "text", x: 80, y: 80, width: 600, height: 80, text: "Fresh deals every day", fontSize: "48px", fontWeight: "700" })).element;
  const b = (await run("design.element.add", { canvasId: c.canvasId, artboardId: ab.id, kind: "button", x: 80, y: 200, width: 180, height: 52, text: "Shop now", href: "/shop" })).element;
  await run("design.element.add", { canvasId: c.canvasId, artboardId: ab.id, kind: "text", x: 80, y: 280, width: 600, height: 80, text: "తెలుగు ఆఫర్లు ఇక్కడ" });
  await run("design.preset.add", { canvasId: c.canvasId, artboardId: ab.id, preset: "card-grid" });
  await run("design.element.update", { canvasId: c.canvasId, elementId: b.id, patch: { backgroundColor: "#16a34a", text: "Shop the sale" } });
  await run("design.element.group", { canvasId: c.canvasId, artboardId: ab.id, elementIds: [t.id, b.id], name: "Hero copy" });
  await run("design.layer.reorder", { canvasId: c.canvasId, elementId: t.id, direction: "top" });
  await run("design.layout.auto", { canvasId: c.canvasId, artboardId: ab.id, mode: "column", gap: 24, padding: 40 });
  const c2 = await run("design.canvas.create", { name: "Landing" });
  await run("design.landing.create", { canvasId: c2.canvasId, title: "stitaP", subtitle: "Agents that finish the job", cta: "Start", brand: "stitaP" });
  for (const f of ["react", "html", "svg", "figma-json", "png"]) await run("design.export", { canvasId: c2.canvasId, format: f });
  await run("design.export", { canvasId: c.canvasId, format: "png" });
  await run("design.element.remove", { canvasId: c.canvasId, elementId: b.id });
  const ic = await run("design.indic.create", { script: "telugu", layout: "newspaper" });
  await run("design.export", { canvasId: ic.canvasId, format: "png" });
  await run("typography.indic.detect", { text: "Hello తెలుగు नमस्ते" });
  await run("typography.indic.rules", { script: "tamil" });
  await run("typography.indic.css", { script: "devanagari", selector: ".hi" });
  await run("typography.indic.tokens", { script: "kannada" });
  await run("typography.indic.validate", { script: "telugu", css: "font-size: 12px; line-height: 1.2; letter-spacing: 2px" });
  await run("typography.indic.newspaper", { script: "bengali", preset: "headline" });
  for (const l of ["telugu", "kannada", "tamil", "malayalam"]) { await run(`typography.${l}.css`, {}); await run(`typography.${l}.validate`, { css: { fontSize: "14px", lineHeight: "1.4", letterSpacing: "1px" } }); await run(`typography.${l}.newspaper`, { preset: "breaking" }); await run(`typography.${l}.tailwind`, {}); }
  await run("typography.south-indian.compare", {});
};
