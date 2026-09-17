/* ─── stitaP — SLM Audio Tutorial Generation ─── */

/**
 * Audio tools for SLM-generated video tutorials.
 * All audio is synthesized from scratch using Web Audio API.
 * Zero external dependencies, zero CDN calls.
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Audio Scene Types
   ═══════════════════════════════════════════════════════════ */

export type AudioSceneType = "narration" | "bgm" | "sfx" | "silence" | "ambient";

export interface AudioScene {
  type: AudioSceneType;
  /** For narration: text to synthesize */
  text?: string;
  /** For sfx: effect type */
  sfxType?: "click" | "whoosh" | "success" | "error" | "pop" | "typing" | "notification";
  /** For bgm: music style */
  bgmStyle?: "corporate" | "upbeat" | "calm" | "dramatic" | "minimal";
  /** Duration override (seconds) */
  duration?: number;
  /** Volume 0..1 */
  volume?: number;
  /** Fade in/out seconds */
  fadeIn?: number;
  fadeOut?: number;
}

export interface AudioTrack {
  scenes: AudioScene[];
  sampleRate: number;
  voiceId: string;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: TTS (Formant Synthesis)
   ═══════════════════════════════════════════════════════════ */

/** Voice configuration */
export interface SynthVoice {
  id: string;
  baseFreq: number;
  rate: number;
  pitch: number;
}

export const SYNTH_VOICES: Record<string, SynthVoice> = {
  narrator: { id: "narrator", baseFreq: 140, rate: 1, pitch: 1 },
  female: { id: "female", baseFreq: 200, rate: 1.05, pitch: 1.15 },
  male: { id: "male", baseFreq: 120, rate: 0.95, pitch: 0.85 },
  child: { id: "child", baseFreq: 280, rate: 1.1, pitch: 1.3 },
};

/** Synthesize text to Float32Array */
export function synthesizeText(
  text: string,
  voice: SynthVoice = SYNTH_VOICES.narrator,
  sampleRate = 44100,
): Float32Array {
  const words = text.split(/\s+/);
  const buffers: Float32Array[] = [];
  let totalLen = 0;

  for (const word of words) {
    const buf = synthesizeWord(word, voice, sampleRate);
    buffers.push(buf);
    totalLen += buf.length;
    // Small gap between words
    const gapLen = Math.floor(sampleRate * 0.03);
    buffers.push(new Float32Array(gapLen));
    totalLen += gapLen;
  }

  const output = new Float32Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    output.set(buf, offset);
    offset += buf.length;
  }
  return output;
}

function synthesizeWord(word: string, voice: SynthVoice, sampleRate: number): Float32Array {
  const chars = word.toLowerCase().split("");
  const charDuration = 0.04 * voice.rate;
  const numSamples = Math.floor(sampleRate * charDuration * chars.length);
  const buf = new Float32Array(numSamples);
  const freq = voice.baseFreq * voice.pitch;

  let pos = 0;
  for (const ch of chars) {
    const charSamples = Math.floor(sampleRate * charDuration);
    const isVowel = "aeiou".includes(ch);

    for (let i = 0; i < charSamples && pos < numSamples; i++, pos++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * i / charSamples) * Math.sin(Math.PI * pos / numSamples);

      if (isVowel) {
        // Harmonic series for vowels
        let sample = 0;
        for (let h = 1; h <= 6; h++) {
          sample += Math.sin(2 * Math.PI * freq * h * t + Math.sin(t * 0.5 * h) * 0.3) / (h * h);
        }
        buf[pos] = sample * envelope * 0.35;
      } else if (/[a-z]/.test(ch)) {
        // Noise-based consonants
        const noise = (Math.random() * 2 - 1) * 0.2;
        const voiced = "bvdgmnz".includes(ch) ? Math.sin(2 * Math.PI * freq * t) * 0.15 : 0;
        buf[pos] = (noise + voiced) * envelope;
      }
    }
  }

  return buf;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Background Music Generators
   ═══════════════════════════════════════════════════════════ */

export function generateBGM(
  style: string,
  durationSec: number,
  sampleRate = 44100,
): Float32Array {
  const len = Math.floor(sampleRate * durationSec);
  const buf = new Float32Array(len);

  switch (style) {
    case "corporate": return genCorporateBGM(len, sampleRate, buf);
    case "upbeat": return genUpbeatBGM(len, sampleRate, buf);
    case "calm": return genCalmBGM(len, sampleRate, buf);
    case "dramatic": return genDramaticBGM(len, sampleRate, buf);
    case "minimal": return genMinimalBGM(len, sampleRate, buf);
    default: return genCorporateBGM(len, sampleRate, buf);
  }
}

function genCorporateBGM(len: number, sr: number, buf: Float32Array): Float32Array {
  const bpm = 110;
  const beatLen = 60 / bpm;
  const chords = [[261.63, 329.63, 392], [293.66, 369.99, 440], [261.63, 329.63, 392], [220, 277.18, 329.63]];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const beat = t / beatLen;
    const bp = beat % 1;
    const ci = Math.floor(beat / 2) % chords.length;
    let v = 0;
    for (const f of chords[ci]) v += Math.sin(2 * Math.PI * f * t) * Math.exp(-bp * 3) * 0.04;
    v += (Math.random() * 2 - 1) * 0.015 * (bp < 0.03 ? 1 : 0); // shaker
    buf[i] = v;
  }
  return buf;
}

function genUpbeatBGM(len: number, sr: number, buf: Float32Array): Float32Array {
  const bpm = 120;
  const beatLen = 60 / bpm;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const beat = t / beatLen;
    const bp = beat % 1;
    // Kick
    let kick = 0;
    if ((Math.floor(beat) % 4 === 0 || Math.floor(beat) % 4 === 2) && bp < 0.1) {
      kick = Math.sin(2 * Math.PI * 150 * Math.exp(-bp * 40) * bp) * Math.exp(-bp * 20) * 0.35;
    }
    // Bass
    const bassNote = [110, 110, 146.83, 130.81][Math.floor(beat) % 4];
    const bass = Math.sin(2 * Math.PI * bassNote * t) * 0.12 * Math.max(0, 1 - bp * 4);
    // Melody
    const melNotes = [440, 494, 523, 587, 659, 587, 523, 494];
    const melody = Math.sin(2 * Math.PI * melNotes[Math.floor(beat * 2) % melNotes.length] * t) * 0.06 * Math.max(0, 1 - bp * 4);
    buf[i] = Math.max(-1, Math.min(1, kick + bass + melody));
  }
  return buf;
}

function genCalmBGM(len: number, sr: number, buf: Float32Array): Float32Array {
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freqs = [220, 277.18, 329.63, 440];
    let pad = 0;
    for (const f of freqs) pad += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.3 * t) * 0.5) * 0.03;
    pad *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
    const bass = Math.sin(2 * Math.PI * 110 * t) * 0.08;
    buf[i] = pad + bass;
  }
  return buf;
}

function genDramaticBGM(len: number, sr: number, buf: Float32Array): Float32Array {
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const progress = t / (len / sr);
    const vol = 0.1 + progress * 0.4;
    const drone = Math.sin(2 * Math.PI * 65.41 * t) * vol * 0.25;
    const strings = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 329.63 * t)) * vol * 0.12;
    const hitInterval = Math.max(0.3, 1.5 - progress * 1);
    const hitPhase = t % hitInterval;
    const hit = hitPhase < 0.06 ? (Math.random() * 2 - 1) * Math.exp(-hitPhase * 30) * vol * 0.3 : 0;
    buf[i] = Math.max(-1, Math.min(1, drone + strings + hit));
  }
  return buf;
}

function genMinimalBGM(len: number, sr: number, buf: Float32Array): Float32Array {
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freqs = [261.63, 329.63];
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) * 0.02;
    v *= 0.3 + 0.3 * Math.sin(2 * Math.PI * 0.15 * t);
    buf[i] = v;
  }
  return buf;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: SFX Generators
   ═══════════════════════════════════════════════════════════ */

export function generateSFX(type: string, sampleRate = 44100): Float32Array {
  switch (type) {
    case "click": return genSFXClick(sampleRate);
    case "whoosh": return genSFXWhoosh(sampleRate);
    case "success": return genSFXSuccess(sampleRate);
    case "error": return genSFXError(sampleRate);
    case "pop": return genSFXPop(sampleRate);
    case "typing": return genSFXTyping(sampleRate);
    case "notification": return genSFXNotification(sampleRate);
    default: return genSFXClick(sampleRate);
  }
}

function genSFXClick(sr: number): Float32Array {
  const len = Math.floor(sr * 0.08);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    buf[i] = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 50) * 0.4;
  }
  return buf;
}

function genSFXWhoosh(sr: number): Float32Array {
  const len = Math.floor(sr * 0.4);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const p = t / 0.4;
    const freq = 200 + 1500 * p;
    buf[i] = Math.max(-1, Math.min(1,
      (Math.random() * 2 - 1) * 0.25 * Math.sin(Math.PI * p) +
      Math.sin(2 * Math.PI * freq * t) * 0.15 * Math.sin(Math.PI * p)
    ));
  }
  return buf;
}

function genSFXSuccess(sr: number): Float32Array {
  const len = Math.floor(sr * 0.5);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    buf[i] = (
      Math.sin(2 * Math.PI * 523.25 * t) * 0.2 +
      Math.sin(2 * Math.PI * 659.25 * t) * 0.15 +
      Math.sin(2 * Math.PI * 783.99 * t) * 0.1
    ) * Math.exp(-t * 4) * Math.sin(Math.PI * Math.min(1, t / 0.1));
  }
  return buf;
}

function genSFXError(sr: number): Float32Array {
  const len = Math.floor(sr * 0.4);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    buf[i] = (
      Math.sin(2 * Math.PI * 300 * t) * 0.2 +
      Math.sin(2 * Math.PI * 250 * t) * 0.2
    ) * Math.exp(-t * 5) * Math.sin(Math.PI * Math.min(1, t / 0.05));
  }
  return buf;
}

function genSFXPop(sr: number): Float32Array {
  const len = Math.floor(sr * 0.12);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    buf[i] = Math.sin(2 * Math.PI * 800 * Math.exp(-t * 20) * t) * Math.exp(-t * 30) * 0.5;
  }
  return buf;
}

function genSFXTyping(sr: number): Float32Array {
  const len = Math.floor(sr * 0.15);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    buf[i] = (Math.random() * 2 - 1) * 0.08 * Math.exp(-t * 20) +
      Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 40) * 0.1;
  }
  return buf;
}

function genSFXNotification(sr: number): Float32Array {
  const len = Math.floor(sr * 0.6);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const decay = Math.exp(-t * 6);
    buf[i] = (
      Math.sin(2 * Math.PI * 880 * t) * 0.25 +
      Math.sin(2 * Math.PI * 1320 * t) * 0.12
    ) * decay;
  }
  return buf;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: Audio Track Compositor
   ═══════════════════════════════════════════════════════════ */

/** Compose an entire audio track from scenes */
export function composeTrack(
  track: AudioTrack,
  onProgress?: (scene: number, total: number) => void,
): Float32Array {
  const buffers: Float32Array[] = [];
  let totalLen = 0;
  const sr = track.sampleRate || 44100;
  const voice = SYNTH_VOICES[track.voiceId] || SYNTH_VOICES.narrator;

  for (let i = 0; i < track.scenes.length; i++) {
    const scene = track.scenes[i];
    onProgress?.(i, track.scenes.length);

    let buf: Float32Array;
    const vol = scene.volume ?? 1;

    switch (scene.type) {
      case "narration":
        buf = scene.text ? synthesizeText(scene.text, voice, sr) : new Float32Array(0);
        break;
      case "bgm":
        buf = generateBGM(scene.bgmStyle || "corporate", scene.duration || 10, sr);
        break;
      case "sfx":
        buf = generateSFX(scene.sfxType || "click", sr);
        break;
      case "silence":
        buf = new Float32Array(Math.floor(sr * (scene.duration || 1)));
        break;
      case "ambient":
        buf = genCalmBGM(Math.floor(sr * (scene.duration || 5)), sr, new Float32Array(Math.floor(sr * (scene.duration || 5))));
        break;
      default:
        buf = new Float32Array(0);
    }

    // Apply volume
    if (vol !== 1) {
      for (let j = 0; j < buf.length; j++) buf[j] *= vol;
    }

    // Apply fade in/out
    if (scene.fadeIn && scene.fadeIn > 0) {
      const fadeSamples = Math.floor(sr * scene.fadeIn);
      for (let j = 0; j < Math.min(fadeSamples, buf.length); j++) {
        buf[j] *= j / fadeSamples;
      }
    }
    if (scene.fadeOut && scene.fadeOut > 0) {
      const fadeSamples = Math.floor(sr * scene.fadeOut);
      for (let j = 0; j < Math.min(fadeSamples, buf.length); j++) {
        buf[buf.length - 1 - j] *= j / fadeSamples;
      }
    }

    buffers.push(buf);
    totalLen += buf.length;

    // Add gap between scenes
    const gapLen = Math.floor(sr * 0.2);
    buffers.push(new Float32Array(gapLen));
    totalLen += gapLen;
  }

  const output = new Float32Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    output.set(buf, offset);
    offset += buf.length;
  }
  return output;
}

/** Convert samples to WAV Blob */
export function toWavBlob(samples: Float32Array, sampleRate = 44100): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Download a WAV file */
export function downloadWav(samples: Float32Array, filename: string, sampleRate = 44100) {
  const blob = toWavBlob(samples, sampleRate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
