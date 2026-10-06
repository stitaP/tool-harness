/**
 * Compound File Binary reader ([MS-CFB]) — the container inside legacy Office files (.doc .xls .ppt) and
 * encrypted/password-protected OOXML. Pure TypeScript, no dependencies. Read-only.
 *
 * Layout (MS-CFB §2): 512-byte header; sectors of 512 (v3) or 4096 (v4) bytes; the FAT chains sectors; DIFAT lists the
 * FAT sectors (109 in the header, the rest in a DIFAT chain); the directory is a red-black tree of 128-byte entries;
 * streams under the mini-stream cutoff (4096 bytes) live in the mini stream (64-byte mini sectors, MiniFAT).
 */
export interface CfbEntry {
    name: string;
    type: "storage" | "stream" | "root";
    size: number;
    path: string;
}
export declare function isCfb(buf: Buffer): boolean;
export declare class Cfb {
    private buf;
    private sectorSize;
    private fat;
    private miniFat;
    private miniStream;
    private miniCutoff;
    private dir;
    readonly entries: CfbEntry[];
    private byPath;
    constructor(buf: Buffer);
    private sector;
    /** Follow a FAT chain from `start`, returning up to `size` bytes. Detects loops. */
    private chain;
    private miniChain;
    has(path: string): boolean;
    /** Read a stream by path (case-insensitive, "/" between storages). Throws if missing. */
    read(path: string): Buffer;
}
