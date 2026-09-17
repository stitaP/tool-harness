// ─── Agent Systems ────────────────────────────────────────────────────────────

export type {
  MemoryType,
  MemoryEntry,
  MemoryStore,
  MemoryQuery,
  MemoryStats,
} from "./memory";

export { AgentMemory, getAgentMemory } from "./memory";

export type {
  SkillStep,
  Skill,
  SkillRun,
} from "./skills";

export { SkillManager, getSkillManager } from "./skills";

export type {
  TaskRecord,
  PerformancePattern,
  ImprovementSuggestion,
  PerformanceStats,
} from "./self-improve";

export { SelfImprover, getSelfImprover } from "./self-improve";

export type {
  TerminalBackend,
  TerminalConfig,
  TerminalResult,
  BackgroundProcess,
} from "./terminal";

export { Terminal, getTerminal } from "./terminal";

export type {
  TaskStatus,
  TaskPriority,
  KanbanTask,
  KanbanComment,
  KanbanAttachment,
  KanbanBoard,
  KanbanWorker,
  BoardSnapshot,
} from "./kanban";

export { KanbanManager, getKanbanManager } from "./kanban";

export type {
  SwarmTopology,
  WorkerRole,
  SystemSpecs,
  ModelSlot,
  SwarmWorker,
  SwarmConfig,
  BlackboardEntry,
  SwarmSizing,
} from "./swarm";

export {
  sizeSwarm,
  createSwarm,
  estimateModelMemoryBytes,
  SwarmBlackboard,
} from "./swarm";

export type { ScheduleKind, ScheduleJob } from "./scheduler";
export {
  Scheduler,
  getScheduler,
  parseCron,
  nextCronFire,
  cronMatches,
} from "./scheduler";

export type { KnowledgeChunk, KnowledgeSource, SearchHit, KnowledgeStats } from "./knowledge";
export {
  KnowledgeBase,
  getKnowledgeBase,
  embed,
  cosine,
  EMBED_DIMS,
} from "./knowledge";

export type {
  Severity,
  NotificationChannel,
  NotificationMessage,
} from "./notifications";
export { NotificationDispatcher, getNotifications } from "./notifications";

export type { SpanStatus, TraceSpan, AgentTrace, TraceSummary } from "./tracing";
export { RunTracer, getTracer } from "./tracing";

export type {
  RiskLevel,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalPolicy,
} from "./approvals";
export {
  ApprovalGate,
  getApprovalGate,
  BALANCED_POLICY,
  STRICT_POLICY,
  AUTONOMOUS_POLICY,
} from "./approvals";
