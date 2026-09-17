import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { downloadManual } from "@/lib/docs/manual";

/**
 * /docs/pdf — generates and downloads the full manual, then returns to /docs.
 * A stable URL that always yields the freshest generated PDF.
 */
export default function DocsPdf() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 30));
      if (!cancelled) {
        try {
          await downloadManual();
        } finally {
          navigate("/docs", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteNav />
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-violet-400" />
        <p className="text-sm text-zinc-400">
          Generating <span className="font-mono text-zinc-200">stitap-platform-manual.pdf</span>…
        </p>
        <p className="max-w-md text-xs text-zinc-600">
          The manual is rendered locally by stitaP's in-house PDF engine — no server,
          no network, no external libraries.
        </p>
      </div>
    </div>
  );
}
