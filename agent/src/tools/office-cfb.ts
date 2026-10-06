/**
 * Compound File Binary reader ([MS-CFB]) — the container inside legacy Office files (.doc .xls .ppt) and
 * encrypted/password-protected OOXML. Pure TypeScript, no dependencies. Read-only.
 *
 * Layout (MS-CFB §2): 512-byte header; sectors of 512 (v3) or 4096 (v4) bytes; the FAT chains sectors; DIFAT lists the
 * FAT sectors (109 in the header, the rest in a DIFAT chain); the directory is a red-black tree of 128-byte entries;
 * streams under the mini-stream cutoff (4096 bytes) live in the mini stream (64-byte mini sectors, MiniFAT).
 */

const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ENDOFCHAIN = 0xfffffffe, FREESECT = 0xffffffff, NOSTREAM = 0xffffffff;
const MAX_STREAM = 512 * 1024 * 1024; // refuse absurd sizes (corrupt or hostile files)

export interface CfbEntry { name: string; type: "storage" | "stream" | "root"; size: number; path: string }

export function isCfb(buf: Buffer): boolean { return buf.length >= 512 && buf.subarray(0, 8).equals(SIGNATURE); }

export class Cfb {
  private sectorSize: number;
  private fat: number[] = [];
  private miniFat: number[] = [];
  private miniStream: Buffer = Buffer.alloc(0);
  private miniCutoff: number;
  private dir: { name: string; type: number; left: number; right: number; child: number; start: number; size: number }[] = [];
  readonly entries: CfbEntry[] = [];
  private byPath = new Map<string, number>(); // lower-case path → directory id

  constructor(private buf: Buffer) {
    if (!isCfb(buf)) throw new Error("not a Compound File (OLE2) document");
    const major = buf.readUInt16LE(0x1a);
    const shift = buf.readUInt16LE(0x1e);
    if ((major === 3 && shift !== 9) || (major === 4 && shift !== 12) || (major !== 3 && major !== 4)) throw new Error(`unsupported compound file version ${major}`);
    this.sectorSize = 1 << shift;
    this.miniCutoff = buf.readUInt32LE(0x38);
    const numFat = buf.readUInt32LE(0x2c);
    const dirStart = buf.readUInt32LE(0x30);
    const miniFatStart = buf.readUInt32LE(0x3c), numMiniFat = buf.readUInt32LE(0x40);
    let difatSector = buf.readUInt32LE(0x44), numDifat = buf.readUInt32LE(0x48);

    // DIFAT: first 109 FAT sector numbers in the header, then a chain of DIFAT sectors (last slot = next DIFAT sector)
    const fatSectors: number[] = [];
    for (let i = 0; i < 109 && fatSectors.length < numFat; i++) fatSectors.push(buf.readUInt32LE(0x4c + i * 4));
    const perSector = this.sectorSize / 4;
    const seenDifat = new Set<number>();
    while (fatSectors.length < numFat && numDifat-- > 0 && difatSector < ENDOFCHAIN && !seenDifat.has(difatSector)) {
      seenDifat.add(difatSector);
      const s = this.sector(difatSector);
      for (let i = 0; i < perSector - 1 && fatSectors.length < numFat; i++) fatSectors.push(s.readUInt32LE(i * 4));
      difatSector = s.readUInt32LE((perSector - 1) * 4);
    }
    for (const fs of fatSectors) {
      if (fs >= ENDOFCHAIN) continue;
      const s = this.sector(fs);
      for (let i = 0; i < perSector; i++) this.fat.push(s.readUInt32LE(i * 4));
    }

    // directory entries (128 bytes each) along the directory chain
    const dirBuf = this.chain(dirStart, Infinity);
    for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
      const nameLen = dirBuf.readUInt16LE(off + 0x40);
      const name = dirBuf.toString("utf16le", off, off + Math.max(0, Math.min(64, nameLen) - 2));
      const size = major === 3 ? dirBuf.readUInt32LE(off + 0x78) : Number(dirBuf.readBigUInt64LE(off + 0x78));
      this.dir.push({ name, type: dirBuf[off + 0x42], left: dirBuf.readUInt32LE(off + 0x44), right: dirBuf.readUInt32LE(off + 0x48), child: dirBuf.readUInt32LE(off + 0x4c), start: dirBuf.readUInt32LE(off + 0x74), size });
    }
    if (!this.dir.length || this.dir[0].type !== 5) throw new Error("compound file has no root entry");

    // MiniFAT and the mini stream (stored as the root entry's stream)
    if (numMiniFat > 0 && miniFatStart < ENDOFCHAIN) {
      const mf = this.chain(miniFatStart, numMiniFat * this.sectorSize);
      for (let i = 0; i + 4 <= mf.length; i += 4) this.miniFat.push(mf.readUInt32LE(i));
    }
    const root = this.dir[0];
    if (root.start < ENDOFCHAIN && root.size > 0) this.miniStream = this.chain(root.start, root.size);

    // flatten the tree into paths ("WordDocument", "ObjectPool/_123/\u0001Ole")
    const walk = (id: number, prefix: string, seen: Set<number>) => {
      if (id === NOSTREAM || id >= this.dir.length || seen.has(id)) return;
      seen.add(id);
      const e = this.dir[id];
      walk(e.left, prefix, seen);
      if (e.type === 1 || e.type === 2) {
        const path = prefix + e.name;
        this.entries.push({ name: e.name, type: e.type === 1 ? "storage" : "stream", size: e.size, path });
        this.byPath.set(path.toLowerCase(), id);
        if (e.type === 1) walk(e.child, path + "/", seen);
      }
      walk(e.right, prefix, seen);
    };
    walk(root.child, "", new Set());
  }

  private sector(n: number): Buffer {
    const off = (n + 1) * this.sectorSize;
    if (off + this.sectorSize > this.buf.length + this.sectorSize) throw new Error(`sector ${n} is outside the file`);
    return this.buf.subarray(off, Math.min(off + this.sectorSize, this.buf.length));
  }

  /** Follow a FAT chain from `start`, returning up to `size` bytes. Detects loops. */
  private chain(start: number, size: number): Buffer {
    const parts: Buffer[] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let s = start; s < ENDOFCHAIN && s !== FREESECT && total < size; s = this.fat[s] ?? ENDOFCHAIN) {
      if (seen.has(s)) throw new Error("corrupt compound file (sector loop)");
      seen.add(s);
      const b = this.sector(s);
      parts.push(b);
      total += b.length;
      if (total > MAX_STREAM) throw new Error("stream too large");
    }
    const out = Buffer.concat(parts);
    return Number.isFinite(size) ? out.subarray(0, size) : out;
  }

  private miniChain(start: number, size: number): Buffer {
    const parts: Buffer[] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let s = start; s < ENDOFCHAIN && total < size; s = this.miniFat[s] ?? ENDOFCHAIN) {
      if (seen.has(s)) throw new Error("corrupt compound file (mini sector loop)");
      seen.add(s);
      parts.push(this.miniStream.subarray(s * 64, s * 64 + 64));
      total += 64;
    }
    return Buffer.concat(parts).subarray(0, size);
  }

  has(path: string): boolean { return this.entries.some((e) => e.type === "stream" && e.path.toLowerCase() === path.toLowerCase()); }

  /** Read a stream by path (case-insensitive, "/" between storages). Throws if missing. */
  read(path: string): Buffer {
    const idx = this.byPath.get(path.toLowerCase());
    if (idx === undefined || this.dir[idx].type !== 2) throw new Error(`stream "${path}" not found`);
    const e = this.dir[idx];
    if (e.size > MAX_STREAM) throw new Error("stream too large");
    return e.size < this.miniCutoff ? this.miniChain(e.start, e.size) : this.chain(e.start, e.size);
  }

}
