/* ─── stitaP Video Editor — Audio Library ─── */

export type AudioCategory = "music" | "sfx" | "ambient" | "transition";

export interface AudioAsset {
  id: string;
  name: string;
  category: AudioCategory;
  description: string;
  /** Duration in seconds */
  duration: number;
  icon: string;
  tags: string[];
  /** Generator function: returns a Float32Array of audio samples */
  generate: (sampleRate: number) => Float32Array;
}

/* ─── Music Generators ─── */

const musicAssets: AudioAsset[] = [
  {
    id: "music_upbeat",
    name: "Upbeat Loop",
    category: "music",
    description: "Energetic upbeat music loop",
    duration: 8,
    icon: "🎵",
    tags: ["upbeat", "energetic", "happy"],
    generate: (sr) => {
      const len = sr * 8;
      const buf = new Float32Array(len);
      const bpm = 120;
      const beatLen = 60 / bpm;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beat = t / beatLen;
        const beatPhase = beat % 1;
        // Kick on beats 1, 3
        let kick = 0;
        if ((Math.floor(beat) % 4 === 0 || Math.floor(beat) % 4 === 2) && beatPhase < 0.1) {
          const f = 150 * Math.exp(-beatPhase * 40);
          kick = Math.sin(2 * Math.PI * f * beatPhase) * Math.exp(-beatPhase * 20) * 0.4;
        }
        // Hi-hat on every beat
        let hh = 0;
        if (beatPhase < 0.05) {
          hh = (Math.random() * 2 - 1) * Math.exp(-beatPhase * 80) * 0.15;
        }
        // Bass line
        const bassNote = [110, 110, 146.83, 130.81][Math.floor(beat / 1) % 4];
        const bass = Math.sin(2 * Math.PI * bassNote * t) * 0.15 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t));
        // Melody
        const melodyNotes = [440, 494, 523, 587, 659, 587, 523, 494];
        const melIdx = Math.floor(beat * 2) % melodyNotes.length;
        const melody = Math.sin(2 * Math.PI * melodyNotes[melIdx] * t) * 0.08 * Math.max(0, 1 - beatPhase * 4);
        buf[i] = Math.max(-1, Math.min(1, kick + hh + bass + melody));
      }
      return buf;
    },
  },
  {
    id: "music_chill",
    name: "Chill Vibes",
    category: "music",
    description: "Relaxing lo-fi style ambient music",
    duration: 10,
    icon: "🎶",
    tags: ["chill", "lofi", "relaxing", "ambient"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Pad chords
        const chordFreqs = [220, 277.18, 329.63, 440];
        let pad = 0;
        for (const f of chordFreqs) {
          pad += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.3 * t) * 0.5) * 0.04;
        }
        pad *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
        // Sub bass
        const bass = Math.sin(2 * Math.PI * 110 * t) * 0.1;
        // Gentle arp
        const arpFreqs = [440, 554.37, 659.25, 880];
        const arpIdx = Math.floor(t * 4) % arpFreqs.length;
        const arpPhase = (t * 4) % 1;
        const arp = Math.sin(2 * Math.PI * arpFreqs[arpIdx] * t) * 0.06 * Math.exp(-arpPhase * 5);
        // Vinyl crackle
        const crackle = (Math.random() * 2 - 1) * 0.005 * (Math.random() > 0.97 ? 5 : 1);
        buf[i] = Math.max(-1, Math.min(1, pad + bass + arp + crackle));
      }
      return buf;
    },
  },
  {
    id: "music_epic",
    name: "Epic Build",
    category: "music",
    description: "Dramatic orchestral build-up",
    duration: 12,
    icon: "🎺",
    tags: ["epic", "dramatic", "orchestral", "build"],
    generate: (sr) => {
      const len = sr * 12;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const progress = t / 12;
        // Rising tension: volume and filter sweep
        const vol = 0.1 + progress * 0.5;
        // Drone
        const drone = Math.sin(2 * Math.PI * 65.41 * t) * vol * 0.3;
        // Strings build
        const strings = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 329.63 * t)) * vol * 0.15;
        // Percussion hits
        const hitInterval = Math.max(0.3, 1.5 - progress * 1.2);
        const hitPhase = t % hitInterval;
        let hit = 0;
        if (hitPhase < 0.08) {
          hit = (Math.random() * 2 - 1) * Math.exp(-hitPhase * 30) * vol * 0.4;
        }
        // Cymbal swell
        const cymbal = (Math.random() * 2 - 1) * Math.exp(-((t % 3) * 2)) * 0.05 * vol;
        buf[i] = Math.max(-1, Math.min(1, drone + strings + hit + cymbal));
      }
      return buf;
    },
  },
  {
    id: "music_funky",
    name: "Funky Groove",
    category: "music",
    description: "Funky bass-driven groove",
    duration: 8,
    icon: "🎸",
    tags: ["funky", "groove", "bass", "dance"],
    generate: (sr) => {
      const len = sr * 8;
      const buf = new Float32Array(len);
      const bpm = 100;
      const beatLen = 60 / bpm;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beat = t / beatLen;
        const bp = beat % 1;
        // Funky bass
        const bassNotes = [82.41, 110, 82.41, 130.81, 98, 82.41, 110, 146.83];
        const bassIdx = Math.floor(beat * 2) % bassNotes.length;
        const bassEnv = Math.exp(-bp * 8);
        const bass = Math.sin(2 * Math.PI * bassNotes[bassIdx] * t) * bassEnv * 0.25;
        // Clap on 2 and 4
        let clap = 0;
        const measureBeat = Math.floor(beat) % 4;
        if ((measureBeat === 1 || measureBeat === 3) && bp < 0.06) {
          clap = (Math.random() * 2 - 1) * Math.exp(-bp * 50) * 0.2;
        }
        // Wah synth
        const wahFreq = 800 + 600 * Math.sin(2 * Math.PI * 0.5 * t);
        const synth = Math.sin(2 * Math.PI * wahFreq * t * 0.01) * 0.05 * Math.max(0, 1 - bp * 3);
        buf[i] = Math.max(-1, Math.min(1, bass + clap + synth));
      }
      return buf;
    },
  },
  {
    id: "music_corporate",
    name: "Corporate",
    category: "music",
    description: "Clean, professional background music",
    duration: 10,
    icon: "💼",
    tags: ["corporate", "professional", "clean"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      const bpm = 110;
      const beatLen = 60 / bpm;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beat = t / beatLen;
        const bp = beat % 1;
        // Piano-like chord
        const chords = [
          [261.63, 329.63, 392],
          [293.66, 369.99, 440],
          [261.63, 329.63, 392],
          [220, 277.18, 329.63],
        ];
        const chordIdx = Math.floor(beat / 2) % chords.length;
        let piano = 0;
        for (const f of chords[chordIdx]) {
          piano += Math.sin(2 * Math.PI * f * t) * Math.exp(-bp * 3) * 0.06;
        }
        // Shaker
        const shaker = (Math.random() * 2 - 1) * 0.02 * (bp < 0.03 ? 1 : 0);
        // Soft pad
        let pad = 0;
        for (const f of chords[chordIdx]) {
          pad += Math.sin(2 * Math.PI * f * 0.5 * t) * 0.03;
        }
        buf[i] = Math.max(-1, Math.min(1, piano + shaker + pad));
      }
      return buf;
    },
  },
];

/* ─── Sound Effects ─── */

const sfxAssets: AudioAsset[] = [
  {
    id: "sfx_whoosh",
    name: "Whoosh",
    category: "sfx",
    description: "Fast whoosh transition sound",
    duration: 0.5,
    icon: "💨",
    tags: ["whoosh", "transition", "fast"],
    generate: (sr) => {
      const len = sr * 0.5;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / 0.5;
        const freq = 200 + 2000 * p;
        const noise = (Math.random() * 2 - 1) * 0.3 * Math.sin(Math.PI * p);
        const tone = Math.sin(2 * Math.PI * freq * t) * 0.2 * Math.sin(Math.PI * p);
        buf[i] = Math.max(-1, Math.min(1, noise + tone));
      }
      return buf;
    },
  },
  {
    id: "sfx_pop",
    name: "Pop",
    category: "sfx",
    description: "Short pop/click sound",
    duration: 0.15,
    icon: "🔘",
    tags: ["pop", "click", "short"],
    generate: (sr) => {
      const len = sr * 0.15;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 1000 * Math.exp(-t * 30);
        buf[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 40) * 0.5;
      }
      return buf;
    },
  },
  {
    id: "sfx_swoosh_down",
    name: "Swoosh Down",
    category: "sfx",
    description: "Descending swoosh for reveals",
    duration: 0.8,
    icon: "⬇️",
    tags: ["swoosh", "down", "reveal"],
    generate: (sr) => {
      const len = sr * 0.8;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / 0.8;
        const freq = 3000 * Math.exp(-p * 3);
        const noise = (Math.random() * 2 - 1) * 0.25 * Math.sin(Math.PI * p);
        const tone = Math.sin(2 * Math.PI * freq * t) * 0.15 * Math.sin(Math.PI * p);
        buf[i] = Math.max(-1, Math.min(1, noise + tone));
      }
      return buf;
    },
  },
  {
    id: "sfx_ding",
    name: "Ding",
    category: "sfx",
    description: "Bell ding for notifications",
    duration: 0.6,
    icon: "🔔",
    tags: ["ding", "bell", "notification"],
    generate: (sr) => {
      const len = sr * 0.6;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const decay = Math.exp(-t * 8);
        buf[i] = (
          Math.sin(2 * Math.PI * 880 * t) * 0.3 +
          Math.sin(2 * Math.PI * 1320 * t) * 0.15 +
          Math.sin(2 * Math.PI * 1760 * t) * 0.05
        ) * decay;
      }
      return buf;
    },
  },
  {
    id: "sfx_beep",
    name: "Beep",
    category: "sfx",
    description: "Digital beep sound",
    duration: 0.2,
    icon: "🔊",
    tags: ["beep", "digital", "electronic"],
    generate: (sr) => {
      const len = sr * 0.2;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        buf[i] = Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t * 15) * 0.4;
      }
      return buf;
    },
  },
  {
    id: "sfx_thud",
    name: "Thud",
    category: "sfx",
    description: "Heavy impact thud",
    duration: 0.3,
    icon: "🔨",
    tags: ["thud", "impact", "heavy"],
    generate: (sr) => {
      const len = sr * 0.3;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = 80 * Math.exp(-t * 10);
        buf[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 12) * 0.5 +
          (Math.random() * 2 - 1) * 0.1 * Math.exp(-t * 20);
      }
      return buf;
    },
  },
  {
    id: "sfx_magic_sparkle",
    name: "Magic Sparkle",
    category: "sfx",
    description: "Magical sparkle/twinkle sound",
    duration: 1,
    icon: "✨",
    tags: ["magic", "sparkle", "twinkle"],
    generate: (sr) => {
      const len = sr * 1;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let v = 0;
        for (let k = 0; k < 5; k++) {
          const freq = 1200 + k * 400 + Math.sin(t * 20 + k) * 200;
          const delay = k * 0.08;
          const env = t > delay ? Math.exp(-(t - delay) * 6) * Math.sin(Math.PI * (t - delay) * 8) : 0;
          v += Math.sin(2 * Math.PI * freq * t) * env * 0.08;
        }
        buf[i] = Math.max(-1, Math.min(1, v));
      }
      return buf;
    },
  },
  {
    id: "sfx_glitch",
    name: "Glitch",
    category: "sfx",
    description: "Digital glitch/distortion sound",
    duration: 0.4,
    icon: "👾",
    tags: ["glitch", "digital", "distortion"],
    generate: (sr) => {
      const len = sr * 0.4;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const glitch = (Math.random() > 0.7 ? (Math.random() * 2 - 1) : 0) * 0.5;
        const tone = Math.sin(2 * Math.PI * (200 + Math.random() * 2000) * t) * 0.2;
        const buzz = Math.sin(2 * Math.PI * 60 * t) * 0.1 * (Math.random() > 0.5 ? 1 : 0);
        buf[i] = Math.max(-1, Math.min(1, glitch + tone + buzz));
      }
      return buf;
    },
  },
];

/* ─── Ambient Sounds ─── */

const ambientAssets: AudioAsset[] = [
  {
    id: "ambient_rain",
    name: "Rain",
    category: "ambient",
    description: "Gentle rain ambience",
    duration: 10,
    icon: "🌧️",
    tags: ["rain", "water", "nature"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Filtered noise for rain
        const noise = (Math.random() * 2 - 1) * 0.08;
        // Rain drops (random plops)
        let drop = 0;
        if (Math.random() > 0.999) {
          drop = (Math.random() * 2 - 1) * 0.05;
        }
        // Low rumble
        const rumble = Math.sin(2 * Math.PI * 40 * t + Math.sin(2 * Math.PI * 0.1 * t) * 5) * 0.03;
        buf[i] = Math.max(-1, Math.min(1, noise + drop + rumble));
      }
      return buf;
    },
  },
  {
    id: "ambient_ocean",
    name: "Ocean Waves",
    category: "ambient",
    description: "Ocean wave ambience",
    duration: 10,
    icon: "🌊",
    tags: ["ocean", "waves", "water", "nature"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Wave cycle (8 second period)
        const wave = Math.sin(2 * Math.PI * 0.125 * t);
        const noise = (Math.random() * 2 - 1) * 0.1 * (0.5 + 0.5 * wave);
        const lowRumble = Math.sin(2 * Math.PI * 30 * t) * 0.03 * Math.max(0, wave);
        buf[i] = Math.max(-1, Math.min(1, noise + lowRumble));
      }
      return buf;
    },
  },
  {
    id: "ambient_forest",
    name: "Forest",
    category: "ambient",
    description: "Forest ambience with birds",
    duration: 10,
    icon: "🌲",
    tags: ["forest", "nature", "birds", "outdoor"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Wind rustle
        const wind = (Math.random() * 2 - 1) * 0.03 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.2 * t));
        // Bird chirps
        let bird = 0;
        const birdTime = Math.sin(t * 0.7 + Math.sin(t * 1.3) * 2);
        if (birdTime > 0.95) {
          const chirpFreq = 2000 + Math.sin(t * 50) * 500;
          bird = Math.sin(2 * Math.PI * chirpFreq * t) * 0.04 * (1 - (birdTime - 0.95) * 20);
        }
        buf[i] = Math.max(-1, Math.min(1, wind + bird));
      }
      return buf;
    },
  },
  {
    id: "ambient_wind",
    name: "Wind",
    category: "ambient",
    description: "Howling wind ambience",
    duration: 10,
    icon: "🌬️",
    tags: ["wind", "nature", "cold"],
    generate: (sr) => {
      const len = sr * 10;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const windSpeed = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * t);
        const noise = (Math.random() * 2 - 1) * 0.06 * windSpeed;
        const howl = Math.sin(2 * Math.PI * 200 * t + Math.sin(2 * Math.PI * 0.3 * t) * 100) * 0.02 * windSpeed;
        buf[i] = Math.max(-1, Math.min(1, noise + howl));
      }
      return buf;
    },
  },
];

/* ─── Transition Sounds ─── */

const transitionAssets: AudioAsset[] = [
  {
    id: "trans_soft_swoosh",
    name: "Soft Swoosh",
    category: "transition",
    description: "Gentle swoosh for scene transitions",
    duration: 0.6,
    icon: "🌊",
    tags: ["swoosh", "soft", "transition"],
    generate: (sr) => {
      const len = sr * 0.6;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / 0.6;
        const freq = 300 + 800 * Math.sin(Math.PI * p);
        buf[i] = Math.sin(2 * Math.PI * freq * t) * 0.15 * Math.sin(Math.PI * p) +
          (Math.random() * 2 - 1) * 0.05 * Math.sin(Math.PI * p);
      }
      return buf;
    },
  },
  {
    id: "trans_reverse_cymbal",
    name: "Reverse Cymbal",
    category: "transition",
    description: "Rising reverse cymbal sound",
    duration: 1,
    icon: "🔉",
    tags: ["cymbal", "reverse", "rising"],
    generate: (sr) => {
      const len = sr * 1;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / 1;
        const noise = (Math.random() * 2 - 1) * 0.2 * p * p;
        const tone = Math.sin(2 * Math.PI * 800 * t) * 0.05 * p;
        buf[i] = Math.max(-1, Math.min(1, noise + tone));
      }
      return buf;
    },
  },
  {
    id: "trans_click",
    name: "Sharp Click",
    category: "transition",
    description: "Quick click for cuts",
    duration: 0.1,
    icon: "✂️",
    tags: ["click", "cut", "sharp"],
    generate: (sr) => {
      const len = sr * 0.1;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        buf[i] = Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 80) * 0.4;
      }
      return buf;
    },
  },
  {
    id: "trans_ambient_swell",
    name: "Ambient Swell",
    category: "transition",
    description: "Warm ambient pad swell",
    duration: 2,
    icon: "🎵",
    tags: ["ambient", "swell", "warm"],
    generate: (sr) => {
      const len = sr * 2;
      const buf = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / 2;
        const env = Math.sin(Math.PI * p);
        const freqs = [220, 277.18, 329.63];
        let v = 0;
        for (const f of freqs) {
          v += Math.sin(2 * Math.PI * f * t) * 0.05;
        }
        buf[i] = v * env;
      }
      return buf;
    },
  },
];

/* ─── All audio assets ─── */

export const ALL_AUDIO_ASSETS: AudioAsset[] = [
  ...musicAssets,
  ...sfxAssets,
  ...ambientAssets,
  ...transitionAssets,
];

export const AUDIO_CATEGORIES: { id: AudioCategory; label: string; icon: string }[] = [
  { id: "music", label: "Background Music", icon: "🎵" },
  { id: "sfx", label: "Sound Effects", icon: "💥" },
  { id: "ambient", label: "Ambient", icon: "🌿" },
  { id: "transition", label: "Transitions", icon: "🔀" },
];

/** Get audio assets by category */
export function getAudioByCategory(category: AudioCategory): AudioAsset[] {
  return ALL_AUDIO_ASSETS.filter((a) => a.category === category);
}

/** Search audio assets by name or tags */
export function searchAudio(query: string): AudioAsset[] {
  const q = query.toLowerCase();
  return ALL_AUDIO_ASSETS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q))
  );
}

/** Convert Float32Array samples to WAV Blob */
export function samplesToWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave and write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Total number of audio assets */
export const AUDIO_ASSET_COUNT = ALL_AUDIO_ASSETS.length;
