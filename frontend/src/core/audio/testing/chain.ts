/**
 * Test-only signal chain between a piano and the detector: the keyboard's small speakers,
 * the room, the microphone and its high-pass filter, or a cable straight from the
 * headphone jack. Used to measure the detector with recorded piano notes instead of the
 * additive model alone. Not part of the app bundle.
 */
import { rng, SAMPLE_RATE } from './simulate';

/** RBJ biquad, applied in place. */
function biquad(
  x: Float32Array,
  kind: 'highpass' | 'lowpass',
  cornerHz: number,
  q: number,
  sampleRate = SAMPLE_RATE,
): void {
  const w = (2 * Math.PI * cornerHz) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const b0 = kind === 'highpass' ? (1 + cos) / 2 : (1 - cos) / 2;
  const b1 = kind === 'highpass' ? -(1 + cos) : 1 - cos;
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i] ?? 0;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

/** A few comb and all-pass filters: enough of a room for the partials to smear and linger. */
function reverb(x: Float32Array, rt60S: number, wet: number): void {
  const dry = Float32Array.from(x);
  const out = new Float32Array(x.length);
  for (const delayS of [0.0297, 0.0371, 0.0411, 0.0437]) {
    const d = Math.round(delayS * SAMPLE_RATE);
    const g = 10 ** ((-3 * delayS) / rt60S);
    const buf = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      buf[i] = (dry[i] ?? 0) + (i >= d ? g * (buf[i - d] ?? 0) : 0);
      out[i] = (out[i] ?? 0) + (buf[i] ?? 0) / 4;
    }
  }
  for (const [delayS, g] of [
    [0.005, 0.7],
    [0.0017, 0.7],
  ] as const) {
    const d = Math.round(delayS * SAMPLE_RATE);
    const input = Float32Array.from(out);
    for (let i = 0; i < x.length; i++) {
      out[i] = -g * (input[i] ?? 0) + (i >= d ? (input[i - d] ?? 0) + g * (out[i - d] ?? 0) : 0);
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = (dry[i] ?? 0) + wet * (out[i] ?? 0);
}

export interface ChainOptions {
  /** Keyboard speakers: high-pass corner in Hz (0 = straight from the headphone jack). */
  speakerHz: number;
  /** Microphone high-pass corner in Hz (laptop and phone mics cut the low end). */
  micHz: number;
  /** Room reverberation time in seconds (0 = none). */
  rt60S: number;
  /** RMS of the pinkish room noise, full scale = 1. */
  noiseRms: number;
  /** Mains hum amplitude. */
  hum: number;
}

export const CHAINS: Record<string, ChainOptions> = {
  /** Cable from the keyboard's headphone jack to the computer's microphone input. */
  cable: { speakerHz: 0, micHz: 0, rt60S: 0, noiseRms: 0.0003, hum: 0 },
  /** Small keyboard speakers heard by a laptop microphone in a quiet room. */
  'altavoz + micro': { speakerHz: 180, micHz: 120, rt60S: 0.4, noiseRms: 0.0015, hum: 0.001 },
  /** The same with more noise and a livelier room. */
  'altavoz + micro + ruido': {
    speakerHz: 200,
    micHz: 150,
    rt60S: 0.6,
    noiseRms: 0.004,
    hum: 0.003,
  },
  /** Tiny speakers and a phone or webcam microphone that cuts even more of the low end. */
  'altavoz diminuto + micro lejos': {
    speakerHz: 260,
    micHz: 200,
    rt60S: 0.6,
    noiseRms: 0.003,
    hum: 0.002,
  },
};

/** Applies the speaker, room and microphone to a dry piano signal, in place, then adds noise. */
export function applyChain(signal: Float32Array, chain: ChainOptions, seed: number): void {
  if (chain.speakerHz > 0) {
    // A small sealed box: second order with a little resonance at the corner.
    biquad(signal, 'highpass', chain.speakerHz, 1.0);
    biquad(signal, 'lowpass', 9000, 0.7);
  }
  if (chain.rt60S > 0) reverb(signal, chain.rt60S, 0.35);
  if (chain.micHz > 0) biquad(signal, 'highpass', chain.micHz, 0.7);
  const rand = rng(seed);
  let low = 0;
  for (let i = 0; i < signal.length; i++) {
    const white =
      Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand()) * chain.noiseRms;
    low += (white - low) * 0.25;
    signal[i] =
      (signal[i] ?? 0) +
      0.6 * white +
      0.8 * low +
      chain.hum * Math.sin((2 * Math.PI * 60 * i) / SAMPLE_RATE);
  }
}
