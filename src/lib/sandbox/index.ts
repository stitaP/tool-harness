// ─── Sandbox Environment ──────────────────────────────────────────────────────

export type {
  SandboxConfig,
  SandboxState,
  SandboxStatus,
  SandboxExecution,
  SandboxScenario,
  SandboxPolicy,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxEvent,
  NetworkLogEntry,
  ResourceUsage,
  VFSFile,
  VFSDirectory,
  VFSSnapshot,
  IsolationLevel,
  SandboxWorkerMessage,
  SandboxWorkerResponse,
} from "./types";

export {
  DEFAULT_NETWORK_POLICY,
  OPEN_NETWORK_POLICY,
  RESTRICTED_NETWORK_POLICY,
  matchesPattern,
  NetworkPolicyChecker,
  generateNetworkInterceptor,
} from "./network-policy";

export { VirtualFS } from "./virtual-fs";

export {
  SCENARIOS,
  getScenario,
  getScenariosByCategory,
  getScenariosByIsolation,
  searchScenarios,
  buildPolicyFromScenario,
} from "./scenarios";

export { SandboxManager, getSandboxManager } from "./manager";

export {
  createContainer,
  execInContainer,
  writeFileInContainer,
  readFileFromContainer,
  stopContainer,
  destroyContainer,
  listContainers,
  getContainer,
  provisionCodingEnvironment,
  provisionModel,
  runAgentCode,
  detectBackends,
  RUNTIME_CATALOG,
} from "./container-engine";
export type {
  Container,
  ContainerConfig,
  ContainerBackend,
  RuntimeLanguage,
  ExecutionResult,
} from "./container-engine";

export {
  createAgent,
  submitTask,
  stopAgent,
  getAgent,
  listAgents,
  getTaskResult,
} from "../agent/persistent-executor";
export type {
  PersistentAgent,
  AgentConfig,
  Task,
  CompletedTask,
  HealthStatus,
} from "../agent/persistent-executor";

export {
  autoDispatch,
  autoSubmit,
  autoPipeline,
  classifyIntent,
  detectRequiredPackages,
  generateCode,
} from "../agent/auto-dispatch";
export type {
  AutoTask,
  AutoTaskResult,
} from "../agent/auto-dispatch";
