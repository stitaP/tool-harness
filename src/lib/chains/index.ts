// ─── stitaP Chains ────────────────────────────────────────────────────────────
// In-house LangChain-style orchestration. Zero external dependencies.

// Types
export type {
  MessageRole,
  ChatMessage,
  GenerateOptions,
  ChatModel,
  Runnable,
  RunConfig,
  StepTrace,
  ChainResult,
  PromptTemplateConfig,
  FewShotExample,
  ParsedOutput,
  AgentTool,
  AgentStep,
  AgentResult,
} from "./types";

// Model layer
export {
  stitaPChatModel,
  defaultModel,
  registerModelHook,
  unregisterModelHook,
  activeBackend,
} from "./llm";
export type { ModelHook } from "./llm";

// Prompts & parsers
export {
  BaseRunnable,
  PromptTemplate,
  JsonOutputParser,
  ListOutputParser,
  TextOutputParser,
  extractVariables,
  parseLooseJson,
} from "./prompts";

// Chains
export { LLMChain, SequentialChain, runFn, pickField, simpleJsonChain } from "./chains";
export type { LLMChainConfig, SequentialChainConfig } from "./chains";

// Agent executor
export {
  AgentExecutor,
  REACT_SYSTEM,
  parseReactResponse,
} from "./agent-executor";
export type { AgentExecutorConfig, ParsedAgentResponse } from "./agent-executor";
