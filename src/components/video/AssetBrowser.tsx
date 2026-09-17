/* ─── stitaP Video Editor — Asset Browser ─── */

import React, { useState, useMemo } from "react";
import {
  ALL_STICKERS,
  STICKER_CATEGORIES,
  renderStickerSVG,
  type StickerDef,
  type StickerCategory,
} from "../../lib/video/assets/stickers";
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type VideoTemplate,
  type TemplateCategory,
} from "../../lib/video/assets/templates";
import {
  TEXT_PRESETS,
  FONT_PRESETS,
  TEXT_COLOR_PALETTES,
  type TextPreset,
  type AnimationStyle,
} from "../../lib/video/assets/textPresets";
import {
  ALL_COLOR_GRADES,
  GRADING_CATEGORIES,
  type ColorGrade,
  type GradingCategory,
} from "../../lib/video/assets/colorGrades";
import {
  ALL_AUDIO_ASSETS,
  AUDIO_CATEGORIES,
  getAudioByCategory,
  type AudioAsset,
  type AudioCategory,
} from "../../lib/video/assets/audioLibrary";

type AssetTab = "stickers" | "templates" | "text" | "colors" | "audio";

interface AssetBrowserProps {
  onAddSticker: (sticker: StickerDef) => void;
  onApplyTemplate: (template: VideoTemplate) => void;
  onApplyTextPreset: (preset: TextPreset) => void;
  onApplyColorGrade: (grade: ColorGrade) => void;
  onAddAudio: (asset: AudioAsset) => void;
}

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  onAddSticker,
  onApplyTemplate,
  onApplyTextPreset,
  onApplyColorGrade,
  onAddAudio,
}) => {
  const [activeTab, setActiveTab] = useState<AssetTab>("stickers");
  const [search, setSearch] = useState("");
  const [stickerCategory, setStickerCategory] = useState<StickerCategory | "all">("all");
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory | "all">("all");
  const [audioCategory, setAudioCategory] = useState<AudioCategory | "all">("all");
  const [gradingCategory, setGradingCategory] = useState<GradingCategory | "all">("all");

  const tabs: { key: AssetTab; label: string; icon: string; count: number }[] = [
    { key: "stickers", label: "Stickers", icon: "⭐", count: ALL_STICKERS.length },
    { key: "templates", label: "Templates", icon: "🎬", count: ALL_TEMPLATES.length },
    { key: "text", label: "Text", icon: "Aa", count: TEXT_PRESETS.length },
    { key: "colors", label: "Colors", icon: "🎨", count: ALL_COLOR_GRADES.length },
    { key: "audio", label: "Audio", icon: "🎵", count: ALL_AUDIO_ASSETS.length },
  ];

  /* ─── Sticker Search ─── */
  const filteredStickers = useMemo(() => {
    let list = ALL_STICKERS;
    if (stickerCategory !== "all") {
      list = list.filter((s) => s.category === stickerCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q))
      );
    }
    return list;
  }, [stickerCategory, search]);

  /* ─── Template Search ─── */
  const filteredTemplates = useMemo(() => {
    let list = ALL_TEMPLATES;
    if (templateCategory !== "all") {
      list = list.filter((t) => t.category === templateCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [templateCategory, search]);

  /* ─── Audio Search ─── */
  const filteredAudio = useMemo(() => {
    let list = ALL_AUDIO_ASSETS;
    if (audioCategory !== "all") {
      list = getAudioByCategory(audioCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q))
      );
    }
    return list;
  }, [audioCategory, search]);

  /* ─── Color Grade Search ─── */
  const filteredGrades = useMemo(() => {
    let list = ALL_COLOR_GRADES;
    if (gradingCategory !== "all") {
      list = list.filter((g) => g.category === gradingCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [gradingCategory, search]);

  /* ─── Text Preset Search ─── */
  const filteredTextPresets = useMemo(() => {
    if (!search) return TEXT_PRESETS;
    const q = search.toLowerCase();
    return TEXT_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(""); }}
            className={`flex items-center gap-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "text-indigo-400 border-b-2 border-indigo-500 bg-zinc-800/50"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="text-zinc-600 ml-0.5">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets..."
          className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ─── Stickers Tab ─── */}
        {activeTab === "stickers" && (
          <>
            {/* Category filter */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setStickerCategory("all")}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  stickerCategory === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                All ({ALL_STICKERS.length})
              </button>
              {STICKER_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setStickerCategory(cat.id)}
                  className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                    stickerCategory === cat.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Sticker grid */}
            <div className="grid grid-cols-4 gap-2">
              {filteredStickers.map((sticker) => (
                <button
                  key={sticker.id}
                  onClick={() => onAddSticker(sticker)}
                  className="aspect-square bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-2 flex flex-col items-center justify-center gap-1 transition-colors group"
                  title={sticker.name}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors [&_svg]:w-full [&_svg]:h-full"
                    dangerouslySetInnerHTML={{
                      __html: renderStickerSVG(sticker, "#d4d4d8", 32),
                    }}
                  />
                  <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300 truncate w-full text-center">
                    {sticker.name}
                  </span>
                </button>
              ))}
            </div>
            {filteredStickers.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-8">No stickers found</div>
            )}
          </>
        )}

        {/* ─── Templates Tab ─── */}
        {activeTab === "templates" && (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTemplateCategory("all")}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  templateCategory === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                All ({ALL_TEMPLATES.length})
              </button>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setTemplateCategory(cat.id)}
                  className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                    templateCategory === cat.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => onApplyTemplate(tpl)}
                  className="w-full text-left bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-3 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-8 rounded flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${tpl.gradient[0]}, ${tpl.gradient[1]})`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-200 group-hover:text-white">
                        {tpl.icon} {tpl.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">{tpl.description}</div>
                      <div className="text-[9px] text-zinc-600 mt-0.5">
                        {tpl.duration}s • {tpl.width}×{tpl.height}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {filteredTemplates.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-8">No templates found</div>
            )}
          </>
        )}

        {/* ─── Text Presets Tab ─── */}
        {activeTab === "text" && (
          <>
            {/* Animation style grid */}
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Animation Style</h4>
              <div className="grid grid-cols-3 gap-1.5">
                {filteredTextPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onApplyTextPreset(preset)}
                    className="bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-2 text-center transition-colors group"
                  >
                    <div className="text-lg mb-1">{preset.icon}</div>
                    <div className="text-[10px] text-zinc-300 group-hover:text-white">{preset.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font presets */}
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Fonts</h4>
              <div className="space-y-1">
                {FONT_PRESETS.map((font) => (
                  <div
                    key={font.family}
                    className="px-2 py-1.5 bg-zinc-800/30 rounded text-xs text-zinc-300"
                    style={{ fontFamily: font.family }}
                  >
                    <span className="text-zinc-500 text-[9px] mr-1.5">[{font.category}]</span>
                    {font.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Color palettes */}
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Color Palettes</h4>
              <div className="space-y-2">
                {TEXT_COLOR_PALETTES.map((palette) => (
                  <div key={palette.name} className="bg-zinc-800/30 rounded-lg p-2">
                    <div className="text-[10px] text-zinc-400 mb-1">{palette.name}</div>
                    <div className="flex gap-1">
                      {palette.colors.map((color) => (
                        <div
                          key={color}
                          className="w-5 h-5 rounded-full border border-zinc-700"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── Color Grading Tab ─── */}
        {activeTab === "colors" && (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setGradingCategory("all")}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  gradingCategory === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                All ({ALL_COLOR_GRADES.length})
              </button>
              {GRADING_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setGradingCategory(cat.id)}
                  className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                    gradingCategory === cat.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {filteredGrades.map((grade) => (
                <button
                  key={grade.id}
                  onClick={() => onApplyColorGrade(grade)}
                  className="bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-3 transition-colors group text-left"
                >
                  <div
                    className="w-full h-8 rounded mb-2"
                    style={{
                      background: `linear-gradient(135deg, ${grade.preview[0]}, ${grade.preview[1]})`,
                    }}
                  />
                  <div className="text-[11px] font-medium text-zinc-200 group-hover:text-white">
                    {grade.icon} {grade.name}
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-0.5">{grade.description}</div>
                  <div className="text-[9px] text-zinc-600 mt-1">
                    {grade.effects.length} effect{grade.effects.length !== 1 ? "s" : ""}
                  </div>
                </button>
              ))}
            </div>
            {filteredGrades.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-8">No color grades found</div>
            )}
          </>
        )}

        {/* ─── Audio Tab ─── */}
        {activeTab === "audio" && (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setAudioCategory("all")}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  audioCategory === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                All ({ALL_AUDIO_ASSETS.length})
              </button>
              {AUDIO_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setAudioCategory(cat.id)}
                  className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                    audioCategory === cat.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {filteredAudio.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => onAddAudio(asset)}
                  className="w-full text-left bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg px-3 py-2 flex items-center gap-3 transition-colors group"
                >
                  <span className="text-lg">{asset.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 group-hover:text-white">{asset.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{asset.description}</div>
                  </div>
                  <span className="text-[9px] text-zinc-600 flex-shrink-0">
                    {asset.duration}s
                  </span>
                </button>
              ))}
            </div>
            {filteredAudio.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-8">No audio assets found</div>
            )}
          </>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-1.5 border-t border-zinc-800 text-[9px] text-zinc-600 flex justify-between">
        <span>
          {activeTab === "stickers" && `${filteredStickers.length} stickers`}
          {activeTab === "templates" && `${filteredTemplates.length} templates`}
          {activeTab === "text" && `${filteredTextPresets.length} text presets • ${FONT_PRESETS.length} fonts`}
          {activeTab === "colors" && `${filteredGrades.length} color grades`}
          {activeTab === "audio" && `${filteredAudio.length} audio assets`}
        </span>
        <span>All from-scratch • Zero dependencies</span>
      </div>
    </div>
  );
};
