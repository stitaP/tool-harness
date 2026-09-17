import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadManual } from "@/lib/docs/manual";

/**
 * Button that generates and downloads the complete stitaP Platform Manual
 * as a PDF, built entirely client-side by the in-house PDF writer.
 */
export function PdfManualButton({ variant = "primary" }: { variant?: "primary" | "ghost" }) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    // yield a frame so the spinner paints before the synchronous build
    await new Promise((r) => setTimeout(r, 30));
    try {
      await downloadManual();
    } finally {
      setBusy(false);
    }
  };

  const base =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "stitap-gradient text-white hover:opacity-90"
      : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white";

  return (
    <button onClick={handle} disabled={busy} className={`${base} ${styles}`}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
      {busy ? "Generating PDF…" : "Download Full Manual (PDF)"}
    </button>
  );
}
