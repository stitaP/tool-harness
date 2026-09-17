/* ─── stitaP — SLM Tutorial Generation Tools ─── */

// Video tutorial pipeline
export {
  buildTutorialScript,
  serializeScript,
  deserializeScript,
  synthesizeSpeech,
  samplesToWavBlob,
  renderTutorial,
  exportAsHTML,
  SCRIPT_PROMPTS,
  VOICE_PRESETS,
} from "./video-tutorial";
export type {
  TutorialScript,
  Scene,
  VisualContent,
  Annotation,
  TransitionType,
  SceneType,
  VoicePreset,
  RenderOptions,
} from "./video-tutorial";

// Audio tutorial pipeline
export {
  synthesizeText as synthesizeTextAudio,
  generateBGM,
  generateSFX,
  composeTrack,
  toWavBlob,
  downloadWav,
  SYNTH_VOICES,
} from "./audio-tutorial";
export type {
  AudioScene,
  AudioTrack,
  AudioSceneType,
  SynthVoice,
} from "./audio-tutorial";

// Website crawling & documentation parsing
export {
  extractContent,
  extractNavLinks,
  extractTitle,
  blocksToText,
  processCrawledPages,
  deduplicatePages,
  generateLoginCommands,
  planCrawl,
} from "./website-crawler";
export type {
  CrawlConfig,
  ExtractedPage,
  ContentBlock,
  CrawlResult,
} from "./website-crawler";

export {
  parseDocumentation,
  tutorialToText,
  extractStepsFromPage,
  detectDocType,
  isStepGuide,
} from "./doc-parser";
export type {
  ParsedTutorial,
  TutorialSection,
  TutorialStep,
} from "./doc-parser";

// LLM integration pipeline
export {
  PROMPTS,
  generateFromParsedDocs,
  parseLLMOutput,
  mergeWithFallback,
  runPipeline,
} from "./llm-pipeline";
export type {
  PromptTemplate,
  PipelineConfig,
  PipelineResult,
} from "./llm-pipeline";

// Automated capture orchestrator
export {
  generateCDPCommands,
  buildCaptureSteps,
  buildLoginSteps,
  simulateCaptures,
  prepareExport,
  generateManifest,
} from "./auto-capture";
export type {
  CaptureStep,
  CaptureAction,
  CaptureTarget,
  CaptureResult,
  OrchestratorConfig,
} from "./auto-capture";
