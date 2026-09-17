/**
 * Minimal dependency-free ZIP writer (store method, no compression).
 *
 * Used for multi-file downloads such as sliced SVG exports of extremely
 * tall captures. Pure — works in the browser and in Bun smoke tests.
 * Entries are stored uncompressed with CRC-32 checksums, which is valid
 * ZIP (method 0) and universally readable by `unzip`/`tar`/Explorer.
 */

/* ---------------- CRC-32 (IEEE 802.3 polynomial) ---------------- */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function dosDateTime(): { time: number; date: number } {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Build a store-method ZIP archive from the given files. */
export function buildZip(files: ZipFile[]): Uint8Array {
  const { time, date } = dosDateTime();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of files) {
    const name = new TextEncoder().encode(e.name);
    const n = name.length;
    const crc = crc32(e.data);

    // Local file header (30 bytes) + name + data
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // "PK\x03\x04"
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true); // compressed size
    lv.setUint32(22, e.data.length, true); // uncompressed size
    lv.setUint16(26, n, true);
    lv.setUint16(28, 0, true); // extra field length
    chunks.push(lh, name, e.data);

    // Central directory header (46 bytes) + name
    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); // "PK\x01\x02"
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method: store
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, n, true);
    cv.setUint32(42, offset, true); // local header offset
    central.push(ch, name);

    offset += 30 + n + e.data.length;
  }

  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // "PK\x05\x06"
  ev.setUint16(8, files.length, true); // total entries (same disk)
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // comment length

  return concat([...chunks, ...central, eocd]);
}
