/**
 * Hardware Access — Mobile-native and web hardware APIs for agents.
 * Provides unified access to camera, GPS, accelerometer, contacts, clipboard, etc.
 */

export interface HardwareCapability {
  name: string;
  available: boolean;
  reason?: string;
}

// ─── Capability Detection ─────────────────────────────────────────

/**
 * Detect which hardware APIs are available in the current environment.
 */
export function detectCapabilities(): HardwareCapability[] {
  if (typeof window === "undefined") {
    return [
      { name: "camera", available: false, reason: "Server environment — no browser APIs" },
      { name: "gps", available: false, reason: "Server environment" },
      { name: "accelerometer", available: false, reason: "Server environment" },
      { name: "clipboard", available: false, reason: "Server environment" },
      { name: "notifications", available: false, reason: "Server environment" },
      { name: "speech", available: false, reason: "Server environment" },
      { name: "bluetooth", available: false, reason: "Server environment" },
      { name: "usb", available: false, reason: "Server environment" },
      { name: "fileSystem", available: false, reason: "Server environment" },
    ];
  }

  return [
    {
      name: "camera",
      available: typeof navigator !== 'undefined' && typeof navigator.mediaDevices !== 'undefined',
      reason: typeof navigator !== 'undefined' && typeof navigator.mediaDevices !== 'undefined' ? undefined : "getUserMedia not supported",
    },
    {
      name: "gps",
      available: "geolocation" in navigator,
      reason: "geolocation" in navigator ? undefined : "Geolocation API not available",
    },
    {
      name: "accelerometer",
      available: "DeviceMotionEvent" in window,
      reason: "DeviceMotionEvent" in window ? undefined : "DeviceMotion not supported",
    },
    {
      name: "clipboard",
      available: "clipboard" in navigator,
      reason: "clipboard" in navigator ? undefined : "Clipboard API not available",
    },
    {
      name: "notifications",
      available: "Notification" in window,
      reason: "Notification" in window ? undefined : "Notifications not supported",
    },
    {
      name: "speech",
      available: "speechSynthesis" in window,
      reason: "speechSynthesis" in window ? undefined : "Speech synthesis not available",
    },
    {
      name: "bluetooth",
      available: "bluetooth" in navigator,
      reason: "bluetooth" in navigator ? undefined : "Web Bluetooth not supported",
    },
    {
      name: "usb",
      available: "usb" in navigator,
      reason: "usb" in navigator ? undefined : "WebUSB not supported",
    },
    {
      name: "fileSystem",
      available: "showOpenFilePicker" in window,
      reason: "showOpenFilePicker" in window ? undefined : "File System Access not supported",
    },
  ];
}

// ─── Camera ───────────────────────────────────────────────────────

export interface CameraOptions {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
  quality?: number; // 0-1
}

/**
 * Capture a photo from the device camera.
 * Returns a data URL of the captured image.
 */
export async function capturePhoto(
  options: CameraOptions = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (typeof navigator === "undefined") {
    throw new Error("Camera requires a browser environment");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: options.facingMode ?? "environment",
      width: { ideal: options.width ?? 1920 },
      height: { ideal: options.height ?? 1080 },
    },
  });

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const canvas = document.createElement("canvas");
  canvas.width = settings.width ?? options.width ?? 1920;
  canvas.height = settings.height ?? options.height ?? 1080;

  const video = document.createElement("video");
  video.srcObject = stream;
  await video.play();

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  track.stop();
  stream.getTracks().forEach((t) => t.stop());

  const dataUrl = canvas.toDataURL("image/jpeg", options.quality ?? 0.92);
  return { dataUrl, width: canvas.width, height: canvas.height };
}

/**
 * Start video stream and return a stop handle.
 */
export async function startVideoStream(
  videoElement: HTMLVideoElement,
  options: CameraOptions = {}
): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: options.facingMode ?? "environment",
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 720 },
    },
  });
  videoElement.srcObject = stream;
  await videoElement.play();

  return {
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      videoElement.srcObject = null;
    },
  };
}

// ─── GPS / Location ───────────────────────────────────────────────

export interface LocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

/**
 * Get current GPS position.
 */
export function getCurrentLocation(
  options: LocationOptions = {}
): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          timestamp: position.timestamp,
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        timeout: options.timeout ?? 10000,
        maximumAge: options.maximumAge ?? 0,
      }
    );
  });
}

/**
 * Watch GPS position continuously.
 * Returns a stop handle.
 */
export function watchLocation(
  onUpdate: (location: LocationResult) => void,
  onError?: (error: GeolocationPositionError) => void,
  options: LocationOptions = {}
): { stop: () => void } {
  if (!navigator.geolocation) {
    throw new Error("Geolocation not supported");
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude ?? undefined,
        heading: position.coords.heading ?? undefined,
        speed: position.coords.speed ?? undefined,
        timestamp: position.timestamp,
      });
    },
    onError,
    {
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      timeout: options.timeout ?? 10000,
      maximumAge: options.maximumAge ?? 30000,
    }
  );

  return { stop: () => navigator.geolocation.clearWatch(watchId) };
}

// ─── Motion / Accelerometer ───────────────────────────────────────

export interface MotionData {
  acceleration: { x: number; y: number; z: number };
  rotation: { alpha: number; beta: number; gamma: number };
  timestamp: number;
}

/**
 * Watch device motion (accelerometer + gyroscope).
 */
export function watchMotion(
  onUpdate: (data: MotionData) => void,
  options: { updateInterval?: number } = {}
): { stop: () => void } {
  if (typeof DeviceMotionEvent === "undefined") {
    throw new Error("DeviceMotion not supported");
  }

  const handler = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    const rot = event.rotationRate;
    onUpdate({
      acceleration: {
        x: acc?.x ?? 0,
        y: acc?.y ?? 0,
        z: acc?.z ?? 0,
      },
      rotation: {
        alpha: rot?.alpha ?? 0,
        beta: rot?.beta ?? 0,
        gamma: rot?.gamma ?? 0,
      },
      timestamp: event.timeStamp,
    });
  };

  window.addEventListener("devicemotion", handler);
  return {
    stop: () => window.removeEventListener("devicemotion", handler),
  };
}

// ─── Clipboard ────────────────────────────────────────────────────

/**
 * Read text from clipboard.
 */
export async function clipboardReadText(): Promise<string> {
  if (!navigator.clipboard) throw new Error("Clipboard API not available");
  return navigator.clipboard.readText();
}

/**
 * Write text to clipboard.
 */
export async function clipboardWriteText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error("Clipboard API not available");
  await navigator.clipboard.writeText(text);
}

/**
 * Read image from clipboard.
 */
export async function clipboardReadImage(): Promise<Blob | null> {
  if (!navigator.clipboard) throw new Error("Clipboard API not available");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith("image/")) {
        return item.getType(type);
      }
    }
  }
  return null;
}

// ─── Speech ───────────────────────────────────────────────────────

/**
 * Text-to-speech synthesis.
 */
export function speak(
  text: string,
  options: {
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    voice?: string;
  } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang ?? "en-US";
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;

    if (options.voice) {
      const voices = speechSynthesis.getVoices();
      const found = voices.find((v) => v.name === options.voice);
      if (found) utterance.voice = found;
    }

    utterance.onend = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

// ─── Notifications ────────────────────────────────────────────────

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  silent?: boolean;
}

/**
 * Send a browser notification.
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<Notification | null> {
  if (typeof Notification === "undefined") return null;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    return new Notification(options.title, {
      body: options.body,
      icon: options.icon,
      badge: options.badge,
      tag: options.tag,
      silent: options.silent,
    });
  }

  return null;
}

/**
 * Request notification permission.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  return Notification.requestPermission();
}

// ─── File System (Modern API) ─────────────────────────────────────

/**
 * Open a file picker dialog.
 */
export async function openFilePicker(
  options: {
    accept?: string[];
    multiple?: boolean;
    description?: string;
  } = {}
): Promise<Array<{ name: string; content: ArrayBuffer; type: string }>> {
  if (typeof window === "undefined" || !("showOpenFilePicker" in window)) {
    throw new Error("File System Access API not available");
  }

  const picker = await (window as unknown as { showOpenFilePicker: (opts: Record<string, unknown>) => Promise<Array<{ getFile: () => Promise<File> }>> }).showOpenFilePicker({
    multiple: options.multiple ?? false,
    types: options.accept
      ? [
          {
            description: options.description ?? "Files",
            accept: { "*/*": options.accept },
          },
        ]
      : undefined,
  });

  const results: Array<{ name: string; content: ArrayBuffer; type: string }> = [];
  for (const handle of picker) {
    const file = await handle.getFile();
    const content = await file.arrayBuffer();
    results.push({ name: file.name, content, type: file.type });
  }
  return results;
}

/**
 * Save a file using the save picker.
 */
export async function saveFilePicker(
  filename: string,
  content: string | ArrayBuffer,
  options: { type?: string; extension?: string } = {}
): Promise<{ saved: boolean; name: string }> {
  if (typeof window === "undefined" || !("showSaveFilePicker" in window)) {
    throw new Error("File System Access API not available");
  }

  const handle = await (window as unknown as { showSaveFilePicker: (opts: Record<string, unknown>) => Promise<{ createWritable: () => Promise<{ write: (c: string | ArrayBuffer) => Promise<void>; close: () => Promise<void> }>; name: string }> }).showSaveFilePicker({
    suggestedName: filename,
    types: options.type
      ? [
          {
            description: options.type,
            accept: { [options.type]: [`.${options.extension ?? "txt"}`] },
          },
        ]
      : undefined,
  });

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();

  return { saved: true, name: handle.name };
}
