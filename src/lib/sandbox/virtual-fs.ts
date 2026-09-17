/**
 * Virtual File System
 *
 * An in-memory file system for each sandbox. Provides:
 * - Isolated file storage per sandbox
 * - Path normalization and directory creation
 * - Snapshot and restore for state preservation
 * - Size limits enforcement
 * - File watching (callbacks on change)
 */

import type { VFSFile, VFSDirectory, VFSSnapshot } from "./types";

// ─── VFS Implementation ──────────────────────────────────────────────────────

export class VirtualFS {
  private files: Map<string, VFSFile> = new Map();
  private directories: Map<string, VFSDirectory> = new Map();
  private maxFileCount: number;
  private maxTotalSizeBytes: number;
  private watchers: Map<string, Array<(event: "create" | "modify" | "delete", path: string) => void>> = new Map();
  private totalSizeBytes: number = 0;

  constructor(maxFileCount = 1000, maxTotalSizeMB = 100) {
    this.maxFileCount = maxFileCount;
    this.maxTotalSizeBytes = maxTotalSizeMB * 1024 * 1024;
    // Create root directory
    this.directories.set("/", { path: "/", children: [], createdAt: new Date().toISOString() });
  }

  /** Normalize a file path */
  normalizePath(path: string): string {
    const parts = path.split("/").filter(Boolean);
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        normalized.pop();
      } else if (part !== ".") {
        normalized.push(part);
      }
    }
    return "/" + normalized.join("/");
  }

  /** Ensure parent directories exist */
  private ensureDirectories(filePath: string): void {
    const parts = filePath.split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += "/" + parts[i];
      const normalized = this.normalizePath(currentPath);
      if (!this.directories.has(normalized)) {
        this.directories.set(normalized, {
          path: normalized,
          children: [],
          createdAt: new Date().toISOString(),
        });
        // Add to parent's children
        const parentPath = this.normalizePath(normalized + "/..");
        const parent = this.directories.get(parentPath);
        if (parent) {
          const dirName = normalized.split("/").pop()!;
          if (!parent.children.includes(dirName)) {
            parent.children.push(dirName);
          }
        }
      }
    }
  }

  /** Write a file */
  writeFile(path: string, content: string, mimeType = "text/plain"): void {
    const normalizedPath = this.normalizePath(path);
    const size = new TextEncoder().encode(content).byteLength;

    // Check limits
    const existing = this.files.get(normalizedPath);
    const existingSize = existing?.size || 0;

    if (!existing && this.files.size >= this.maxFileCount) {
      throw new Error(`File count limit reached (${this.maxFileCount})`);
    }
    if (this.totalSizeBytes - existingSize + size > this.maxTotalSizeBytes) {
      throw new Error(`Total size limit reached (${this.maxTotalSizeBytes / 1024 / 1024}MB)`);
    }

    this.ensureDirectories(normalizedPath);

    const event = existing ? "modify" : "create";

    const file: VFSFile = {
      path: normalizedPath,
      content,
      mimeType,
      size,
      createdAt: existing?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      readOnly: false,
    };

    this.totalSizeBytes = this.totalSizeBytes - existingSize + size;
    this.files.set(normalizedPath, file);

    // Update parent directory
    const parentPath = this.normalizePath(normalizedPath + "/..");
    const parent = this.directories.get(parentPath);
    if (parent) {
      const fileName = normalizedPath.split("/").pop()!;
      if (!parent.children.includes(fileName)) {
        parent.children.push(fileName);
      }
    }

    // Notify watchers
    this.notifyWatchers(event, normalizedPath);
  }

  /** Read a file */
  readFile(path: string): VFSFile | undefined {
    return this.files.get(this.normalizePath(path));
  }

  /** Read file content as string */
  readText(path: string): string | undefined {
    const file = this.files.get(this.normalizePath(path));
    if (!file) return undefined;
    if (typeof file.content === "string") return file.content;
    return new TextDecoder().decode(file.content);
  }

  /** Delete a file */
  deleteFile(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const file = this.files.get(normalizedPath);
    if (!file) return false;

    this.totalSizeBytes -= file.size;
    this.files.delete(normalizedPath);

    // Remove from parent directory
    const parentPath = this.normalizePath(normalizedPath + "/..");
    const parent = this.directories.get(parentPath);
    if (parent) {
      const fileName = normalizedPath.split("/").pop()!;
      parent.children = parent.children.filter(c => c !== fileName);
    }

    this.notifyWatchers("delete", normalizedPath);
    return true;
  }

  /** Check if a file exists */
  exists(path: string): boolean {
    return this.files.has(this.normalizePath(path)) ||
           this.directories.has(this.normalizePath(path));
  }

  /** List files in a directory */
  listDir(path: string): string[] {
    const normalizedPath = this.normalizePath(path);
    const dir = this.directories.get(normalizedPath);
    return dir ? [...dir.children] : [];
  }

  /** List all files (recursive) */
  listAll(prefix = "/"): VFSFile[] {
    const results: VFSFile[] = [];
    for (const file of this.files.values()) {
      if (file.path.startsWith(prefix)) {
        results.push(file);
      }
    }
    return results;
  }

  /** Get file count */
  getFileCount(): number {
    return this.files.size;
  }

  /** Get total size in bytes */
  getTotalSizeBytes(): number {
    return this.totalSizeBytes;
  }

  /** Create a snapshot of the current state */
  createSnapshot(sandboxId: string): VFSSnapshot {
    return {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sandboxId,
      createdAt: new Date().toISOString(),
      files: Array.from(this.files.values()).map(f => ({ ...f })),
      directories: Array.from(this.directories.values()).map(d => ({ ...d })),
    };
  }

  /** Restore from a snapshot */
  restoreSnapshot(snapshot: VFSSnapshot): void {
    this.files.clear();
    this.directories.clear();
    this.totalSizeBytes = 0;

    for (const dir of snapshot.directories) {
      this.directories.set(dir.path, { ...dir });
    }
    for (const file of snapshot.files) {
      this.files.set(file.path, { ...file });
      this.totalSizeBytes += file.size;
    }
  }

  /** Watch for file changes */
  on(event: "create" | "modify" | "delete", callback: (path: string) => void): () => void {
    if (!this.watchers.has(event)) {
      this.watchers.set(event, []);
    }
    this.watchers.get(event)!.push(callback as (event: "create" | "modify" | "delete", path: string) => void);

    // Return unsubscribe function
    return () => {
      const callbacks = this.watchers.get(event);
      if (callbacks) {
        this.watchers.set(event, callbacks.filter(cb => cb !== callback));
      }
    };
  }

  private notifyWatchers(event: "create" | "modify" | "delete", path: string): void {
    const callbacks = this.watchers.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(event, path); } catch { /* ignore */ }
      }
    }
  }

  /** Clear all files */
  clear(): void {
    this.files.clear();
    this.directories.clear();
    this.directories.set("/", { path: "/", children: [], createdAt: new Date().toISOString() });
    this.totalSizeBytes = 0;
  }
}
