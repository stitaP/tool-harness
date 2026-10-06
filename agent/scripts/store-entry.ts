// Entry for the Node bundle of the Tool Store (npm run build:store).
// getStore() registers every executor (src/lib/store/executors); the agent can add
// Node-only executors (browser automation, OS, sandboxes) with registerNodeExecutors().
import { getStore } from "@/lib/store/registry";
import type { ToolExecutor } from "@/lib/store/tool-types";

const store = () => getStore();
const executable = (id: string) => !!(store() as any).executors?.has?.(id);

export function registerNodeExecutors(map: Record<string, ToolExecutor>): void {
  for (const [id, ex] of Object.entries(map)) store().registerExecutor(id, ex);
}

export function listTools() {
  return store().getAll().map((t: any) => ({
    id: t.id, name: t.name, category: t.category, description: t.description, tags: t.tags ?? [],
    slmFriendly: !!t.slmFriendly, executable: executable(t.id),
    parameters: (t.parameters ?? []).map((p: any) => ({ name: p.name, type: p.type, description: p.description, required: !!p.required, enum: p.enum })),
  }));
}
export async function executeTool(id: string, input: Record<string, unknown>) {
  return store().execute(id, input);
}

// Host hooks: the agent runtime supplies its secrets, model and capabilities.
export { setSecretResolver } from "@/lib/store/executors/util";
export { setLlmCaller, setAgentHost } from "@/lib/store/executors/hooks";
export { closeStoreBrowsers } from "@/lib/store/executors/browser";
