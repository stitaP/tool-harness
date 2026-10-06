import type { Runtime } from "../runtime/runtime.js";
import type { Session } from "../state/db.js";

export type Tier = "slm" | "standard" | "full";

export interface ApprovalRequest { tool: string; command: string; reason: string; sessionId: string }

export interface ToolContext {
  rt: Runtime;
  session: Session;
  /** current working directory for this session (terminal cd persists) */
  cwd: string;
  setCwd(p: string): void;
  signal: AbortSignal;
  toolCallId: string;
  /** stream partial output to clients (terminal output, progress) */
  progress(text: string): void;
  requestApproval(req: Omit<ApprovalRequest, "sessionId">): Promise<boolean>;
  clarify(question: string, choices?: string[]): Promise<string | null>;
  /** delegation depth: 0 for top-level sessions */
  depth: number;
  /** restricted toolset (subagents, webhooks) */
  allowedTools?: Set<string>;
  /** budget shared with subagents */
  budget: { remaining: number };
  /** characters of tool output the model will see; tools that can page (read_file) stay under it */
  maxOutputChars?: number;
}

export interface ToolResult { content: string; images?: string[]; meta?: Record<string, any> }

export interface Tool {
  name: string;
  description: string;
  parameters: any; // JSON Schema object
  toolset: string;
  tier?: Tier; // smallest profile that exposes this tool (default "standard")
  parallelSafe?: boolean;
  /** only reachable through tool_search/use_tool, never in the default schema */
  deferred?: boolean;
  /** availability check; return string reason when unavailable */
  available?(rt: Runtime): boolean | string;
  handler(args: any, ctx: ToolContext): Promise<string | ToolResult>;
}

export const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
export const str = (description: string, extra: any = {}) => ({ type: "string", description, ...extra });
export const num = (description: string, extra: any = {}) => ({ type: "number", description, ...extra });
export const int = (description: string, extra: any = {}) => ({ type: "integer", description, ...extra });
export const bool = (description: string) => ({ type: "boolean", description });
export const arr = (items: any, description: string) => ({ type: "array", items, description });
export const enm = (values: string[], description: string) => ({ type: "string", enum: values, description });
