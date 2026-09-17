import { lazy, Suspense, useState } from "react";
import { Settings2, Loader2 } from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * Notebook — lightweight shell.
 *
 * The configure drawer imports 8 heavy engine modules (device-prober,
 * model-download, quantizer, swarm, provider-keys, failover, etc.).
 * Vite's code-splitter bundles them into one chunk; if that chunk exceeds
 * the browser's dynamic-import size ceiling the page crashes with
 * "Failed to fetch dynamically imported module".
 *
 * Fix: the shell holds only the chat UI and lazily imports the drawer
 * component, so the heavy engines are a separate chunk loaded on demand.
 */
const ConfigureDrawer = lazy(() => import("./NotebookDrawer"));

export default function Notebook() {
  const [configOpen, setConfigOpen] = useState(true);
  const [chatState, setChatState] = useState<{
    messages: Array<{ role: "user" | "system"; text: string }>;
    draft: string;
    setMessages: React.Dispatch<React.SetStateAction<Array<{ role: "user" | "system"; text: string }>>>;
    setDraft: React.Dispatch<React.SetStateAction<string>>;
  } | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200">
      <SiteNav />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row">
        {/* ── Chat column ── */}
        <main className="flex min-h-[70vh] flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Notebook</h1>
              <p className="text-xs text-gray-400">Configure and chat</p>
            </div>
            <button
              onClick={() => setConfigOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-gray-300 transition hover:border-white/40 hover:text-white"
            >
              <Settings2 className="h-4 w-4" /> Configure
            </button>
          </div>

          {/* The heavy drawer creates and owns all chat + config state.
              We render a loading placeholder until it loads. */}
          {configOpen ? (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading notebook…
                </div>
              }
            >
              <ConfigureDrawer onChatReady={setChatState} />
            </Suspense>
          ) : (
            /* Collapsed mode: show a minimal chat placeholder */
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Open the configuration drawer to set up your notebook session.
            </div>
          )}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
