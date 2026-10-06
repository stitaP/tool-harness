import { test } from "node:test";
import assert from "node:assert/strict";
import { dist } from "./helpers.mjs";

const { Cfb, isCfb } = await import(dist("tools/office-cfb.js"));

const END = 0xfffffffe, FREE = 0xffffffff, FATSECT = 0xfffffffd, NOSTREAM = 0xffffffff;

/**
 * A minimal version-3 compound file: Root → Big (5000 bytes, regular sectors), Small (100 bytes, mini stream),
 * Sub/ → Inner (50 bytes, mini stream). Sectors: 0 FAT · 1–2 directory · 3 MiniFAT · 4 mini stream · 5–14 Big.
 */
function buildCfb({ loop = false } = {}) {
  const S = 512;
  const big = Buffer.alloc(5000, 0); for (let i = 0; i < big.length; i++) big[i] = i % 251;
  const small = Buffer.from("small stream ".repeat(8).slice(0, 100));
  const inner = Buffer.from("inner stream in a storage".padEnd(50, "."));
  const sectors = Array.from({ length: 15 }, () => Buffer.alloc(S, 0));
  // FAT
  const fat = new Array(S / 4).fill(FREE);
  fat[0] = FATSECT; fat[1] = 2; fat[2] = END; fat[3] = END; fat[4] = END;
  for (let s = 5; s < 14; s++) fat[s] = s + 1;
  fat[14] = END;
  if (loop) fat[6] = 5; // 5 → 6 → 5 → … long before the stream's 5000 bytes are read
  fat.forEach((v, i) => sectors[0].writeUInt32LE(v >>> 0, i * 4));
  // directory
  const dir = Buffer.alloc(S * 2, 0);
  const entry = (i, name, type, { left = NOSTREAM, right = NOSTREAM, child = NOSTREAM, start = END, size = 0 } = {}) => {
    const o = i * 128;
    const n = Buffer.from(name + "\0", "utf16le"); n.copy(dir, o);
    dir.writeUInt16LE(n.length, o + 0x40); dir[o + 0x42] = type; dir[o + 0x43] = 1;
    dir.writeUInt32LE(left >>> 0, o + 0x44); dir.writeUInt32LE(right >>> 0, o + 0x48); dir.writeUInt32LE(child >>> 0, o + 0x4c);
    dir.writeUInt32LE(start >>> 0, o + 0x74); dir.writeUInt32LE(size, o + 0x78);
  };
  entry(0, "Root Entry", 5, { child: 1, start: 4, size: 192 });
  entry(1, "Big", 2, { right: 2, start: 5, size: big.length });
  entry(2, "Small", 2, { right: 3, start: 0, size: small.length });
  entry(3, "Sub", 1, { child: 4 });
  entry(4, "Inner", 2, { start: 2, size: inner.length });
  dir.copy(sectors[1], 0, 0, S); dir.copy(sectors[2], 0, S, 2 * S);
  // MiniFAT: Small = mini sectors 0→1, Inner = 2
  const mf = new Array(S / 4).fill(FREE); mf[0] = 1; mf[1] = END; mf[2] = END;
  mf.forEach((v, i) => sectors[3].writeUInt32LE(v >>> 0, i * 4));
  // mini stream (192 bytes) in sector 4
  small.copy(sectors[4], 0); inner.copy(sectors[4], 128);
  // Big in sectors 5–14
  for (let s = 0; s < 10; s++) big.copy(sectors[5 + s], 0, s * S, Math.min((s + 1) * S, big.length));
  // header
  const h = Buffer.alloc(S, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(h, 0);
  h.writeUInt16LE(0x3e, 0x18); h.writeUInt16LE(3, 0x1a); h.writeUInt16LE(0xfffe, 0x1c); h.writeUInt16LE(9, 0x1e); h.writeUInt16LE(6, 0x20);
  h.writeUInt32LE(1, 0x2c); h.writeUInt32LE(1, 0x30); h.writeUInt32LE(4096, 0x38); h.writeUInt32LE(3, 0x3c); h.writeUInt32LE(1, 0x40);
  h.writeUInt32LE(END >>> 0, 0x44); h.writeUInt32LE(0, 0x48);
  for (let i = 0; i < 109; i++) h.writeUInt32LE(i === 0 ? 0 : FREE >>> 0, 0x4c + i * 4);
  return { file: Buffer.concat([h, ...sectors]), big, small, inner };
}

test("compound file: directory paths, mini-stream and regular streams", () => {
  const { file, big, small, inner } = buildCfb();
  assert.ok(isCfb(file));
  const c = new Cfb(file);
  assert.deepEqual(c.entries.map((e) => `${e.type}:${e.path}:${e.size}`), ["stream:Big:5000", "stream:Small:100", "storage:Sub:0", "stream:Sub/Inner:50"]);
  assert.ok(c.read("Big").equals(big), "regular sector chain");
  assert.ok(c.read("small").equals(small), "mini stream, case-insensitive path");
  assert.ok(c.read("Sub/Inner").equals(inner), "stream inside a storage");
  assert.ok(c.has("Sub/Inner") && !c.has("Sub") && !c.has("Missing"));
  assert.throws(() => c.read("Missing"), /not found/);
});

test("compound file: rejects non-OLE input and sector loops instead of hanging", () => {
  assert.equal(isCfb(Buffer.from("PK\x03\x04 not ole")), false);
  assert.throws(() => new Cfb(Buffer.alloc(600)), /not a Compound File/);
  const { file } = buildCfb({ loop: true });
  assert.throws(() => new Cfb(file).read("Big"), /sector loop/);
});
