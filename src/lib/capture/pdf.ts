/**
 * Minimal single-page PDF export (blueprint §14 export). Dependency-free:
 * builds a one-page PDF that embeds a JPEG image via DCTDecode. Pure and
 * smoke-testable — used by the editor's PDF export.
 */

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface PdfOptions {
  width: number; // PDF points (1 pt = 1/72 in). For a 96dpi web canvas, pass px * 72/96.
  height: number;
  jpegBase64: string; // raw JPEG payload (no data: prefix)
  title?: string;
}

export function buildPdf(opts: PdfOptions): Uint8Array {
  const { width, height, title } = opts;
  const jpeg = base64ToBytes(opts.jpegBase64);

  const enc = new TextEncoder();
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

  const objects: Uint8Array[] = [];

  // 1: Catalog
  objects.push(enc.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  // 2: Pages
  objects.push(enc.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  // 3: Page
  const info = title ? `\n/Title (${esc(title)})` : "";
  objects.push(
    enc.encode(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R${info} >>\nendobj\n`,
    ),
  );
  // 4: Image XObject (JPEG)
  objects.push(
    enc.encode(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
  );
  objects.push(jpeg);
  objects.push(enc.encode("\nendstream\nendobj\n"));
  // 5: Content stream — draw the image over the full page
  const content = `q\n${width.toFixed(2)} 0 0 ${height.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(
    enc.encode(
      `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
    ),
  );

  // Assemble with an xref table.
  const header = enc.encode("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  const body = new Uint8Array(objects.reduce((n, o) => n + o.length, 0));
  const offsets: number[] = [];
  let off = 0;
  for (const o of objects) {
    offsets.push(off);
    body.set(o, off);
    off += o.length;
  }
  const xrefPos = header.length + body.length;
  const xref = enc.encode(
    `xref\n0 6\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`,
  );
  const out = new Uint8Array(header.length + body.length + xref.length);
  out.set(header, 0);
  out.set(body, header.length);
  out.set(xref, header.length + body.length);
  return out;
}
