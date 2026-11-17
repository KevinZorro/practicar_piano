import * as Tone from 'tone';
import type { Note } from '../../core/notes/model';

/**
 * A light piano-like voice made with Tone.js. It needs no sample files (no licensing or
 * download); a sampled piano can replace it behind the same two methods.
 */
export class TonePiano {
  private synth: Tone.PolySynth<Tone.FMSynth> | null = null;

  /** Browsers only allow audio after a click: call this from a user gesture. */
  async unlock(): Promise<void> {
    await Tone.start();
    this.synth ??= new Tone.PolySynth<Tone.FMSynth>(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 1.5,
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.1, release: 0.5 },
      volume: -12,
    }).toDestination();
    this.synth.maxPolyphony = 32;
  }

  get ready(): boolean {
    return this.synth !== null;
  }

  /** Sounds a note now, lasting `durationS` seconds of real time. */
  play(note: Note, durationS: number): void {
    if (!this.synth) return;
    const frequency = Tone.Frequency(note.pitch, 'midi').toFrequency();
    this.synth.triggerAttackRelease(
      frequency,
      Math.max(0.05, durationS),
      undefined,
      note.velocity / 127,
    );
  }

  stopAll(): void {
    this.synth?.releaseAll();
  }
}
