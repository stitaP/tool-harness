/**
 * All Tool Store executors. `registerAllExecutors(store)` wires them into the
 * ToolStore so every manifest in the catalog is callable (in the web app and,
 * via the bundled store, in the agent runtime).
 */
import type { ToolExecutor } from "../tool-types";
import { ANALYTICS_EXECUTORS } from "./analytics";
import { BUSINESS_EXECUTORS } from "./business";
import { INTEGRATION_EXECUTORS } from "./integrations";
import { DEVTOOLS_EXECUTORS } from "./devtools";
import { AI_EXECUTORS } from "./ai";
import { MEDIA_EXECUTORS } from "./media";
import { RUNTIME_EXECUTORS } from "./runtime";
import { ECOMMERCE_EXECUTORS } from "./ecommerce";
import { DESIGN_EXECUTORS } from "./design";
import { BROWSER_CORE_EXECUTORS } from "./browser";
import { BROWSER_QA_EXECUTORS } from "./browser-qa";
import { legacyExecutors } from "./legacy";

export const STORE_EXECUTORS: Record<string, ToolExecutor> = {
  ...ANALYTICS_EXECUTORS,
  ...BUSINESS_EXECUTORS,
  ...INTEGRATION_EXECUTORS,
  ...DEVTOOLS_EXECUTORS,
  ...AI_EXECUTORS,
  ...MEDIA_EXECUTORS,
  ...RUNTIME_EXECUTORS,
  ...ECOMMERCE_EXECUTORS,
  ...DESIGN_EXECUTORS,
  ...BROWSER_CORE_EXECUTORS,
  ...BROWSER_QA_EXECUTORS,
};

export function registerAllExecutors(store: { registerExecutor(id: string, ex: ToolExecutor): void }, extra: Record<string, ToolExecutor> = {}): void {
  for (const [id, ex] of Object.entries({ ...legacyExecutors(), ...STORE_EXECUTORS, ...extra })) store.registerExecutor(id, ex);
}
