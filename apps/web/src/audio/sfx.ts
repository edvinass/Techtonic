/**
 * Procedural SFX via Web Audio — matches Techtonic's generated art style.
 * No binary assets; unlock on first user gesture (browser autoplay policy).
 */

export type SfxId =
  | "ui"
  | "place"
  | "place_fail"
  | "deposit"
  | "research_start"
  | "research_done"
  | "building_done"
  | "age_up"
  | "pop_grow"
  | "raid_warn"
  | "raid_win"
  | "raid_lose"
  | "season"
  | "event"
  | "pause"
  | "resume"
  | "victory_ascent"
  | "victory_harmony"
  | "defeat"
  | "new_game"
  | "load_game";

const MUTE_KEY = "techtonic_mute";
const MASTER = 0.28;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = readMute();
const lastPlayed = new Map<SfxId, number>();

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a click/keydown so the AudioContext can leave "suspended". */
export function unlockAudio(): void {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER;
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

function now(): number {
  return ensureCtx()?.currentTime ?? 0;
}

function out(): GainNode | null {
  ensureCtx();
  return masterGain;
}

function throttle(id: SfxId, ms: number): boolean {
  const t = performance.now();
  const prev = lastPlayed.get(id) ?? 0;
  if (t - prev < ms) return false;
  lastPlayed.set(id, t);
  return true;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  opts: { gain?: number; attack?: number; decay?: number; delay?: number; detune?: number } = {},
): void {
  const c = ensureCtx();
  const g = out();
  if (!c || !g || muted) return;
  const t0 = now() + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
  const peak = opts.gain ?? 0.35;
  const atk = opts.attack ?? 0.008;
  const dec = opts.decay ?? duration;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(atk + 0.01, dec));
  osc.connect(env);
  env.connect(g);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noiseBurst(duration: number, opts: { gain?: number; hp?: number; lp?: number; delay?: number } = {}): void {
  const c = ensureCtx();
  const g = out();
  if (!c || !g || muted) return;
  const t0 = now() + (opts.delay ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const env = c.createGain();
  const peak = opts.gain ?? 0.2;
  env.gain.setValueAtTime(peak, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  let node: AudioNode = src;
  if (opts.hp) {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.hp;
    node.connect(hp);
    node = hp;
  }
  if (opts.lp) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.lp;
    node.connect(lp);
    node = lp;
  }
  node.connect(env);
  env.connect(g);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

function sweep(
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  opts: { gain?: number; delay?: number } = {},
): void {
  const c = ensureCtx();
  const g = out();
  if (!c || !g || muted) return;
  const t0 = now() + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
  const peak = opts.gain ?? 0.3;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env);
  env.connect(g);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function chord(freqs: number[], duration: number, type: OscillatorType, gain = 0.18): void {
  for (const f of freqs) {
    tone(f, duration, type, { gain: gain / freqs.length, decay: duration * 0.9 });
  }
}

const PLAYERS: Record<SfxId, () => void> = {
  ui: () => tone(660, 0.06, "square", { gain: 0.12, decay: 0.05 }),

  place: () => {
    tone(180, 0.08, "triangle", { gain: 0.28 });
    tone(320, 0.12, "triangle", { gain: 0.18, delay: 0.04 });
    noiseBurst(0.06, { gain: 0.1, lp: 900, delay: 0.02 });
  },

  place_fail: () => {
    tone(140, 0.1, "sawtooth", { gain: 0.12, decay: 0.1 });
    tone(100, 0.14, "sawtooth", { gain: 0.1, delay: 0.06 });
  },

  deposit: () => {
    tone(420 + Math.random() * 40, 0.07, "triangle", { gain: 0.14, decay: 0.06 });
    tone(620, 0.05, "sine", { gain: 0.08, delay: 0.03 });
  },

  research_start: () => {
    tone(480, 0.1, "sine", { gain: 0.16 });
    tone(600, 0.12, "sine", { gain: 0.12, delay: 0.07 });
  },

  research_done: () => {
    chord([523, 659, 784], 0.35, "triangle", 0.22);
    tone(1046, 0.2, "sine", { gain: 0.1, delay: 0.12 });
  },

  building_done: () => {
    noiseBurst(0.08, { gain: 0.14, lp: 1200 });
    tone(220, 0.12, "triangle", { gain: 0.2, delay: 0.02 });
    tone(330, 0.15, "triangle", { gain: 0.14, delay: 0.08 });
  },

  age_up: () => {
    chord([261, 329, 392, 523], 0.55, "triangle", 0.28);
    sweep(200, 800, 0.4, "sine", { gain: 0.12, delay: 0.1 });
  },

  pop_grow: () => {
    tone(520, 0.08, "sine", { gain: 0.12 });
    tone(680, 0.1, "sine", { gain: 0.1, delay: 0.06 });
  },

  raid_warn: () => {
    tone(160, 0.25, "sawtooth", { gain: 0.18, decay: 0.22 });
    tone(140, 0.3, "sawtooth", { gain: 0.14, delay: 0.18 });
    noiseBurst(0.2, { gain: 0.08, hp: 200, lp: 800, delay: 0.05 });
  },

  raid_win: () => {
    chord([392, 494, 587], 0.4, "triangle", 0.24);
    tone(784, 0.2, "sine", { gain: 0.12, delay: 0.15 });
  },

  raid_lose: () => {
    sweep(280, 90, 0.45, "sawtooth", { gain: 0.2 });
    noiseBurst(0.25, { gain: 0.12, lp: 600, delay: 0.05 });
  },

  season: () => {
    tone(300, 0.15, "sine", { gain: 0.12 });
    tone(450, 0.2, "sine", { gain: 0.1, delay: 0.1 });
    tone(360, 0.18, "triangle", { gain: 0.08, delay: 0.18 });
  },

  event: () => {
    tone(200, 0.15, "triangle", { gain: 0.18 });
    tone(250, 0.2, "triangle", { gain: 0.14, delay: 0.12 });
    noiseBurst(0.12, { gain: 0.08, lp: 700, delay: 0.05 });
  },

  pause: () => tone(240, 0.1, "square", { gain: 0.1, decay: 0.09 }),
  resume: () => tone(360, 0.1, "square", { gain: 0.1, decay: 0.09 }),

  victory_ascent: () => {
    chord([261, 329, 392], 0.4, "triangle", 0.22);
    chord([392, 494, 587], 0.45, "triangle", 0.2);
    sweep(400, 1200, 0.7, "sine", { gain: 0.14, delay: 0.25 });
    tone(1046, 0.5, "sine", { gain: 0.12, delay: 0.55 });
  },

  victory_harmony: () => {
    chord([220, 277, 329, 440], 0.7, "sine", 0.24);
    tone(554, 0.5, "triangle", { gain: 0.1, delay: 0.2 });
    tone(659, 0.55, "sine", { gain: 0.08, delay: 0.35 });
  },

  defeat: () => {
    sweep(220, 60, 0.8, "sawtooth", { gain: 0.22 });
    tone(80, 0.9, "triangle", { gain: 0.16, delay: 0.15 });
    noiseBurst(0.5, { gain: 0.1, lp: 400, delay: 0.1 });
  },

  new_game: () => {
    chord([196, 247, 294], 0.4, "triangle", 0.2);
    tone(392, 0.25, "sine", { gain: 0.12, delay: 0.15 });
  },

  load_game: () => {
    tone(330, 0.1, "sine", { gain: 0.14 });
    tone(440, 0.14, "sine", { gain: 0.12, delay: 0.08 });
  },
};

const THROTTLE_MS: Partial<Record<SfxId, number>> = {
  deposit: 280,
  ui: 80,
  place: 120,
};

export function play(id: SfxId): void {
  const ms = THROTTLE_MS[id];
  if (ms != null && !throttle(id, ms)) return;
  unlockAudio();
  PLAYERS[id]();
}

/** Install once: resume AudioContext on first user gesture. */
export function installAudioUnlock(): void {
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}
