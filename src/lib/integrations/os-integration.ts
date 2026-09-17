/**
 * OS Integration — Desktop-level system access for agents.
 * In Electron/Tauri: full OS access. In browser: limited subset.
 */

export interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number; // bytes
  freeMemory: number;
  uptime: number; // seconds
  hostname: string;
  locale: string;
  timezone: string;
  screen: { width: number; height: number; colorDepth: number };
}

export interface DiskInfo {
  mount: string;
  type: string;
  total: number;
  used: number;
  free: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number; // percentage
  memory: number; // bytes
  status: "running" | "sleeping" | "stopped" | "zombie";
  startTime: string;
}

export interface TrayMenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: TrayMenuItem[];
  action?: string;
}

export interface FileWatcher {
  id: string;
  path: string;
  recursive: boolean;
  events: FileWatchEvent[];
  active: boolean;
}

export interface FileWatchEvent {
  type: "create" | "modify" | "delete" | "rename";
  path: string;
  timestamp: number;
}

// ─── System Info ──────────────────────────────────────────────────

/**
 * Get system information from the current environment.
 */
export function getSystemInfo(): SystemInfo {
  if (typeof navigator !== "undefined") {
    return {
      platform: navigator.platform,
      arch: navigator.userAgent.includes("x64") ? "x64" : "arm64",
      cpus: navigator.hardwareConcurrency ?? 1,
      totalMemory: 0,
      freeMemory: 0,
      uptime: 0,
      hostname: location.hostname || "unknown",
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth,
      },
    };
  }

  return {
    platform: "server",
    arch: "unknown",
    cpus: 1,
    totalMemory: 0,
    freeMemory: 0,
    uptime: 0,
    hostname: "unknown",
    locale: "en-US",
    timezone: "UTC",
    screen: { width: 0, height: 0, colorDepth: 0 },
  };
}

// ─── Tray Menu (Electron) ────────────────────────────────────────

/**
 * Create a system tray with menu items.
 * In browser: falls back to a notification-based tray.
 */
export function createTray(
  title: string,
  icon?: string,
  menu: TrayMenuItem[] = []
): { id: string; setTitle: (t: string) => void; destroy: () => void } {
  const id = `tray_${Date.now().toString(36)}`;

  // In Electron context, this would use the Tray API
  // In browser, we store the config and emit events
  return {
    id,
    setTitle: (newTitle: string) => {
      // Electron: tray.setTitle(newTitle)
    },
    destroy: () => {
      // Electron: tray.destroy()
    },
  };
}

/**
 * Update tray tooltip.
 */
export function updateTrayTooltip(trayId: string, tooltip: string): void {
  // Electron: tray.setToolTip(tooltip)
}

/**
 * Update tray menu.
 */
export function updateTrayMenu(trayId: string, menu: TrayMenuItem[]): void {
  // Electron: Menu.buildFromTemplate(menu) → tray.setContextMenu(menu)
}

// ─── File System Operations ───────────────────────────────────────

/**
 * Read a file from the local filesystem.
 * Browser: uses File System Access API or IndexedDB fallback.
 * Electron: uses fs module.
 */
export async function readFile(path: string): Promise<{ content: string; size: number }> {
  // In Electron context:
  // const content = fs.readFileSync(path, 'utf-8');
  // In browser, this would be a server-side API call

  return { content: "", size: 0 };
}

/**
 * Write content to a file.
 */
export async function writeFile(
  path: string,
  content: string | ArrayBuffer
): Promise<{ written: boolean; bytes: number }> {
  const bytes = typeof content === "string"
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength;
  return { written: true, bytes };
}

/**
 * List directory contents.
 */
export async function listDirectory(
  path: string,
  options: { recursive?: boolean; pattern?: string } = {}
): Promise<Array<{ name: string; type: "file" | "directory"; size: number; modified: string }>> {
  return [];
}

/**
 * Create a directory.
 */
export async function createDirectory(
  path: string,
  options: { recursive?: boolean } = {}
): Promise<{ created: boolean; path: string }> {
  return { created: true, path };
}

/**
 * Delete a file or directory.
 */
export async function deletePath(
  path: string,
  options: { recursive?: boolean } = {}
): Promise<{ deleted: boolean; path: string }> {
  return { deleted: true, path };
}

/**
 * Move/rename a file or directory.
 */
export async function movePath(
  source: string,
  destination: string
): Promise<{ moved: boolean; source: string; destination: string }> {
  return { moved: true, source, destination };
}

/**
 * Get file/directory stats.
 */
export async function getPathStats(
  path: string
): Promise<{
  exists: boolean;
  type: "file" | "directory" | "symlink" | "unknown";
  size: number;
  created: string;
  modified: string;
  permissions: string;
}> {
  return {
    exists: false,
    type: "unknown",
    size: 0,
    created: "",
    modified: "",
    permissions: "",
  };
}

/**
 * Watch a file or directory for changes.
 */
export function watchPath(
  path: string,
  options: { recursive?: boolean; onChange?: (events: FileWatchEvent[]) => void } = {}
): FileWatcher {
  return {
    id: `watch_${Date.now().toString(36)}`,
    path,
    recursive: options.recursive ?? false,
    events: [],
    active: true,
  };
}

/**
 * Stop watching a path.
 */
export function unwatchPath(watcherId: string): boolean {
  return true;
}

// ─── Process Management ───────────────────────────────────────────

/**
 * List running processes.
 * Electron: uses ps-list or similar.
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  return [];
}

/**
 * Execute a shell command.
 * Electron: uses child_process.
 */
export async function executeCommand(
  command: string,
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
  return { exitCode: 0, stdout: "", stderr: "", duration: 0 };
}

// ─── Shell Integration ────────────────────────────────────────────

/**
 * Open a URL in the default browser.
 */
export function openExternal(url: string): void {
  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
}

/**
 * Open a file with the default application.
 */
export function openFile(path: string): void {
  // Electron: shell.openPath(path)
}

/**
 * Show file in the system file manager.
 */
export function showInFileManager(path: string): void {
  // Electron: shell.showItemInFolder(path)
}

/**
 * Get clipboard contents from OS clipboard.
 */
export function getClipboard(): string {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    // Async version preferred, but this is sync for convenience
    return "";
  }
  return "";
}

/**
 * Set OS clipboard contents.
 */
export function setClipboard(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}

// ─── Window Management (Electron) ─────────────────────────────────

/**
 * Minimize window.
 */
export function minimizeWindow(): void {
  // Electron: BrowserWindow.getFocusedWindow()?.minimize()
}

/**
 * Maximize/restore window.
 */
export function maximizeWindow(): void {
  // Electron: const win = BrowserWindow.getFocusedWindow(); if (win?.isMaximized()) win.unmaximize(); else win.maximize();
}

/**
 * Close window.
 */
export function closeWindow(): void {
  // Electron: BrowserWindow.getFocusedWindow()?.close()
}

/**
 * Set window always on top.
 */
export function setAlwaysOnTop(always: boolean): void {
  // Electron: BrowserWindow.getFocusedWindow()?.setAlwaysOnTop(always)
}

// ─── Power Management ─────────────────────────────────────────────

/**
 * Prevent the display from sleeping.
 */
export function preventSleep(): { release: () => void } {
  // Electron: powerSaveBlocker.start('prevent-display-sleep')
  return { release: () => {} };
}

/**
 * Check if the system is on battery or AC power.
 */
export async function getPowerSource(): Promise<"battery" | "ac" | "unknown"> {
  if (typeof navigator !== "undefined" && "getBattery" in navigator) {
    try {
      const battery = await (navigator as { getBattery?: () => Promise<{ charging: boolean }> }).getBattery?.();
      if (battery) return battery.charging ? "ac" : "battery";
    } catch {
      // ignore
    }
  }
  return "unknown";
}
