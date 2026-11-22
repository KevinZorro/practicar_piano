import * as Tone from 'tone';
import type { Note } from '../../core/notes/model';
import { PIANO_SAMPLE_BASE_URL, pianoSampleUrls } from './pianoSamples';

/** Seconds a released key keeps ringing, like a damper settling on the strings. */
const RELEASE_S = 1.2;

/**
 * An acoustic grand piano: recorded notes played by Tone.js (see `pianoSamples.ts`), so the
 * rest of the app only sees `preload`, `unlock`, `play` and `stopAll`. While the samples
 * load, or if they cannot be fetched, a small FM voice sounds instead and nothing is silent.
 */
export class TonePiano {
  private sampler: Tone.Sampler | null = null;
  private samplerLoaded = false;
  private fallback: Tone.PolySynth<Tone.FMSynth> | null = null;

  /** Starts downloading the samples; safe to call before any click and more than once. */
  preload(): void {
    if (this.sampler) return;
    this.sampler = new Tone.Sampler({
      urls: pianoSampleUrls(),
      baseUrl: PIANO_SAMPLE_BASE_URL,
      release: RELEASE_S,
      volume: -4,
      onload: () => {
        this.samplerLoaded = true;
      },
      onerror: () => {
        // The fallback voice keeps sounding; the cause is a network or file problem.
        this.samplerLoaded = false;
      },
    }).toDestination();
  }

  /** Browsers only allow audio after a click: call this from a user gesture. */
  async unlock(): Promise<void> {
    await Tone.start();
    this.preload();
  }

  /** Sounds a note now, lasting `durationS` seconds of real time. */
  play(note: Note, durationS: number): void {
    const duration = Math.max(0.05, durationS);
    const velocity = note.velocity / 127;
    if (this.sampler && this.samplerLoaded) {
      const name = Tone.Frequency(note.pitch, 'midi').toNote();
      this.sampler.triggerAttackRelease(name, duration, undefined, velocity);
      return;
    }
    this.fallbackVoice().triggerAttackRelease(
      Tone.Frequency(note.pitch, 'midi').toFrequency(),
      duration,
      undefined,
      velocity,
    );
  }

  stopAll(): void {
    this.sampler?.releaseAll();
    this.fallback?.releaseAll();
  }

  private fallbackVoice(): Tone.PolySynth<Tone.FMSynth> {
    this.fallback ??= new Tone.PolySynth<Tone.FMSynth>(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 1.5,
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.1, release: 0.5 },
      volume: -12,
    }).toDestination();
    this.fallback.maxPolyphony = 32;
    return this.fallback;
  }
}
