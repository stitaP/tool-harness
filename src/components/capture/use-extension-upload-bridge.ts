/**
 * Current-tab extension upload bridge (Phase D).
 *
 * The extension is the capture controller but has no Convex session. Instead
 * of handing credentials to the extension, the *workspace page* performs the
 * upload: the extension relays a stitched PNG (window.postMessage), this hook
 * saves it through the workspace's own authenticated Convex client
 * (`createExtensionUpload` → PUT → `saveExtensionCapture`), and replies with
 * an upload result the popup can surface.
 *
 * Security: only messages parsed by `parseExtensionMessage` (source-tagged
 * `stitap-extension`) are accepted, and the reply is a plain success/error —
 * no tokens, cookies, or page data ever leave the app.
 */
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  EXT_EVENT_UPLOAD_REQUEST,
  ExtensionUploadRequestPayload,
  extensionUploadResult,
  parseExtensionMessage,
} from "@/lib/capture/extension";

const PUT_RETRIES = 2;

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob());
}

/** Downscale the captured PNG to a library thumbnail (max 480px wide, WebP). */
async function makeThumbnail(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode the capture for a thumbnail"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, 480 / Math.max(1, img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

export function useExtensionUploadBridge() {
  const { isAuthenticated } = useAuth();
  const createUpload = useMutation(api.captures.createExtensionUpload);
  const saveExtensionCapture = useMutation(api.captures.saveExtensionCapture);

  // Re-register the listener when auth or the mutation handles change (both
  // are stable per mount, so this is effectively once).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = parseExtensionMessage(e.data);
      if (!msg || msg.type !== EXT_EVENT_UPLOAD_REQUEST) return;
      const payload = msg.payload as ExtensionUploadRequestPayload;
      const requestId = payload.requestId;

      const reply = (result: { ok: boolean; captureId?: string; error?: string }) => {
        window.postMessage(extensionUploadResult(requestId, result), "*");
      };

      void (async () => {
        if (!isAuthenticated) {
          reply({ ok: false, error: "not-signed-in" });
          return;
        }
        try {
          const { uploadUrl } = await createUpload();
          const blob = await dataUrlToBlob(payload.dataUrl);

          // Retry the PUT on transient failures (docs Phase D: two retries).
          let res: Response | null = null;
          for (let attempt = 0; attempt <= PUT_RETRIES; attempt++) {
            res = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": "image/png" },
              body: blob,
            });
            if (res.ok) break;
            if (attempt < PUT_RETRIES) {
              await new Promise((r) => window.setTimeout(r, 400 * (attempt + 1)));
            }
          }
          if (!res?.ok) throw new Error("Upload to storage failed");
          const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
          const thumbnail = await makeThumbnail(payload.dataUrl);
          await saveExtensionCapture({
            storageId,
            title: payload.title || "Current tab capture",
            url: payload.url,
            width: payload.width,
            height: payload.height,
            deviceScaleFactor: payload.deviceScaleFactor,
            mode: payload.mode,
            capturedAt: payload.capturedAt,
            thumbnail,
            description: payload.description,
            tags: payload.tags,
          });
          toast.success(
            `“${payload.title || "Capture"}” saved to your library from your current tab`,
            { description: `${payload.width}×${payload.height} px` },
          );
          reply({ ok: true });
        } catch (err) {
          console.error("Extension upload failed:", err);
          reply({
            ok: false,
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      })();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isAuthenticated, createUpload, saveExtensionCapture]);
}
