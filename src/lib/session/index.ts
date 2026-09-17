// ─── stitaP Session Module System ─────────────────────────────────────────────

export type {
  ModuleCategory,
  SessionModule,
  SessionProfileId,
  SessionModuleState,
  SessionBudget,
} from "./modules";

export {
  MODULE_REGISTRY,
  SESSION_PRESETS,
  getModule,
  createSessionState,
  setModuleEnabled,
  applyPreset,
  resolveEnable,
  resolveDisable,
  computeBudget,
  persistSessionState,
  loadPersistedSessionState,
} from "./modules";
