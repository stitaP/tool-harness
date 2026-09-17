/* ─── stitaP Video Editor — Assets Index ─── */

export {
  ALL_STICKERS,
  STICKER_CATEGORIES,
  renderStickerSVG,
  searchStickers,
  getStickersByCategory,
  type StickerDef,
  type StickerCategory,
} from "./stickers";

export {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  type VideoTemplate,
  type TemplateCategory,
  type TemplateGenerateOpts,
  type TemplateGenerateResult,
} from "./templates";

export {
  TEXT_PRESETS,
  FONT_PRESETS,
  TEXT_COLOR_PALETTES,
  applyTextPreset,
  getAnimationProgress,
  type TextPreset,
  type AnimationStyle,
  type FontPreset,
  type TextColorPalette,
} from "./textPresets";

export {
  ALL_COLOR_GRADES,
  GRADING_CATEGORIES,
  applyColorGrade,
  getGradesByCategory,
  GRADE_COUNT,
  type ColorGrade,
  type GradingCategory,
} from "./colorGrades";

export {
  ALL_AUDIO_ASSETS,
  AUDIO_CATEGORIES,
  getAudioByCategory,
  searchAudio,
  samplesToWav,
  AUDIO_ASSET_COUNT,
  type AudioAsset,
  type AudioCategory,
} from "./audioLibrary";
