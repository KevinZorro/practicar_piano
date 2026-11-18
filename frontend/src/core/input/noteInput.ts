/** A key press (or release) as the practice logic sees it, whatever produced it. */
export interface NoteMessage {
  readonly type: 'noteOn' | 'noteOff';
  readonly pitch: number;
  readonly velocity: number;
  /**
   * Seconds between the key really going down and this message. MIDI delivers at once (0);
   * the microphone needs a moment to be sure, and says how long so the judge can go back.
   */
  readonly ageS?: number;
}

export type InputStatus =
  | 'idle'
  | 'unsupported' // the browser lacks the API (Web MIDI or getUserMedia)
  | 'denied' // the user refused the permission prompt
  | 'no-device' // permission granted but no keyboard / microphone available
  | 'ready';

/**
 * The port shared by every way of playing: a MIDI keyboard or the microphone. The practice
 * screen only listens to `onNote`; it never knows which adapter is behind it.
 */
export interface NoteInput {
  readonly status: InputStatus;
  /** Asks for permission and starts listening. Never rejects: failures set `status`. */
  start(): Promise<InputStatus>;
  onNote(listener: (message: NoteMessage) => void): () => void;
  onStatusChange(listener: (status: InputStatus) => void): () => void;
  stop(): void;
}
