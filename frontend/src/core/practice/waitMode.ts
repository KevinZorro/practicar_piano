import type { PlaybackClock } from '../clock/playbackClock';
import { filterByHand, groupIntoChords, type HandFilter, type Note } from '../notes/model';
import {
  DEFAULT_CONFIG,
  initialState,
  step,
  type PracticeConfig,
  type PracticeEvent,
  type PracticeState,
  type StepResult,
} from './machine';

/**
 * Connects the pure wait-mode machine to the shared clock: it feeds clock ticks and keys
 * to the machine and applies the actions (pause, resume, seek) it answers with.
 */
export class WaitMode {
  private state: PracticeState;
  private readonly chords;

  constructor(
    notes: readonly Note[],
    hand: HandFilter,
    private readonly clock: PlaybackClock,
    private readonly onChange: (state: PracticeState) => void,
    private readonly config: PracticeConfig = DEFAULT_CONFIG,
  ) {
    this.chords = groupIntoChords(filterByHand(notes, hand));
    this.state = initialState(this.chords, clock.now());
  }

  get snapshot(): PracticeState {
    return this.state;
  }

  /** Pitches of the chord the player has to play next (empty when finished). */
  expectedPitches(): readonly number[] {
    const chord = this.chords[this.state.pointer];
    return chord && this.state.status !== 'finished' ? chord.notes.map((n) => n.pitch) : [];
  }

  /** Call every frame while the player is practicing. */
  tick(): void {
    this.dispatch({ type: 'tick', timeS: this.clock.now() });
  }

  noteOn(pitch: number): void {
    this.dispatch({ type: 'noteOn', pitch, timeS: this.clock.now() });
  }

  /** Call when the user moves the position by hand (restart, seek). */
  seek(timeS: number): void {
    this.dispatch({ type: 'seek', timeS });
  }

  private dispatch(event: PracticeEvent): void {
    const result: StepResult = step(this.state, event, this.chords, this.config);
    const changed = result.state !== this.state;
    this.state = result.state;
    for (const action of result.actions) {
      if (action.type === 'pause') this.clock.pause();
      else if (action.type === 'resume') this.clock.play();
      else this.clock.seek(action.timeS);
    }
    if (changed) this.onChange(this.state);
  }
}
