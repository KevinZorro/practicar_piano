/**
 * Test-only simulation of a piano, a room and the browser's AnalyserNode, so the detector
 * can be measured without a microphone. Not part of the app bundle.
 */
import { pitchToHz, type SpectrumFrame } from '../noteDetector';

export const SAMPLE_RATE = 48000;

/** Small deterministic PRNG so measurements are repeatable. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}

export interface RoomOptions {
  /** RMS of the white background noise (full scale = 1). */
  noiseRms: number;
  /** Small speakers lose the bass: high-pass corner in Hz (0 = flat). */
  speakerCornerHz?: number;
  /** Keyboard tuning error in cents. */
  detuneCents?: number;
  /** 50/60 Hz mains hum amplitude. */
  hum?: number;
}

export interface Strike {
  pitch: number;
  startS: number;
  /** Peak-ish amplitude of this note. */
  amplitude: number;
  durationS?: number;
}

/** Additive piano: three slightly detuned strings, stretched partials, faster decay up high. */
export function renderNote(
  out: Float32Array,
  strike: Strike,
  room: RoomOptions,
  rand: () => number,
): void {
  const f0 = pitchToHz(strike.pitch, room.detuneCents ?? 0);
  const start = Math.floor(strike.startS * SAMPLE_RATE);
  const length = Math.floor((strike.durationS ?? 2.5) * SAMPLE_RATE);
  const inharmonicity = 0.00008 * (1 + (strike.pitch - 36) / 20);
  const corner = room.speakerCornerHz ?? 0;
  const decay0 = 3.2 - strike.pitch * 0.025; // seconds, shorter for high notes
  const partials: { f: number; a: number; tau: number; phase: number; detune: number[] }[] = [];
  for (let h = 1; h <= 20; h++) {
    const f = f0 * h * Math.sqrt(1 + inharmonicity * h * h);
    if (f > 9000) break;
    let a = (strike.amplitude * 0.6) / h ** 1.1;
    if (corner > 0) a /= Math.sqrt(1 + (corner / f) ** 4);
    partials.push({
      f,
      a,
      tau: Math.max(0.15, decay0 / (1 + 0.35 * h)),
      phase: rand() * 2 * Math.PI,
      detune: [-0.8, 0, 0.9],
    });
  }
  for (let i = 0; i < length && start + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.004);
    let v = 0;
    for (const p of partials) {
      let s = 0;
      for (const d of p.detune) s += Math.sin(2 * Math.PI * p.f * 2 ** (d / 1200) * t + p.phase);
      v += (p.a / 3) * Math.exp(-t / p.tau) * s;
    }
    const thump = t < 0.012 ? (rand() - 0.5) * strike.amplitude * 0.15 * (1 - t / 0.012) : 0;
    out[start + i] = (out[start + i] ?? 0) + (v + thump) * attack;
  }
}

export function renderRoom(
  durationS: number,
  strikes: readonly Strike[],
  room: RoomOptions,
  seed: number,
): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(Math.floor(durationS * SAMPLE_RATE));
  for (const strike of strikes) renderNote(out, strike, room, rand);
  const hum = room.hum ?? 0;
  let low = 0; // one-pole low-pass makes the noise pinkish, like a real room
  for (let i = 0; i < out.length; i++) {
    const white = gauss(rand) * room.noiseRms;
    low += (white - low) * 0.25;
    out[i] =
      (out[i] ?? 0) +
      0.6 * white +
      0.8 * low +
      hum * Math.sin((2 * Math.PI * 100 * i) / SAMPLE_RATE);
  }
  return out;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const xi = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Frames like `AnalyserNode.getFloatFrequencyData` (Blackman window, no smoothing). */
export function* analyserFrames(
  signal: Float32Array,
  fftSize: number,
  hopS: number,
): Generator<SpectrumFrame> {
  const window = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const x = (2 * Math.PI * i) / fftSize;
    window[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  const hop = Math.round(hopS * SAMPLE_RATE);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let end = fftSize; end <= signal.length; end += hop) {
    for (let i = 0; i < fftSize; i++) {
      re[i] = (signal[end - fftSize + i] ?? 0) * (window[i] ?? 0);
      im[i] = 0;
    }
    fft(re, im);
    const db = new Float32Array(fftSize / 2);
    for (let k = 0; k < db.length; k++) {
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0) / fftSize;
      db[k] = Math.max(-120, 20 * Math.log10(mag + 1e-12));
    }
    yield { db, sampleRate: SAMPLE_RATE, timeS: end / SAMPLE_RATE };
  }
}
