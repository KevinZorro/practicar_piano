import type { InputStatus, NoteInput, NoteMessage } from '../../core/input/noteInput';

export type { NoteMessage };

/** Parses a raw MIDI message. Note-on with velocity 0 is a note-off, as the spec says. */
export function parseMidiMessage(data: ArrayLike<number>): NoteMessage | null {
  const [status, pitch, velocity] = [data[0], data[1], data[2]];
  if (status === undefined || pitch === undefined || data.length < 3) return null;
  const kind = status & 0xf0;
  const vel = velocity ?? 0;
  if (kind === 0x90) return { type: vel > 0 ? 'noteOn' : 'noteOff', pitch, velocity: vel };
  if (kind === 0x80) return { type: 'noteOff', pitch, velocity: vel };
  return null;
}

/** Same states for every input; for MIDI, `no-device` means no keyboard is connected. */
export type MidiStatus = InputStatus;

export interface MidiInput extends NoteInput {
  readonly status: MidiStatus;
  readonly deviceNames: readonly string[];
  start(): Promise<MidiStatus>;
  onStatusChange(listener: (status: MidiStatus) => void): () => void;
}

// --- Minimal Web MIDI typings (lib.dom has them, but a narrow port keeps tests easy) --------

export interface MidiPortLike {
  readonly id: string;
  readonly name: string | null;
  readonly state: 'connected' | 'disconnected';
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
}

export interface MidiAccessLike {
  readonly inputs: ReadonlyMap<string, MidiPortLike>;
  onstatechange: (() => void) | null;
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>;

export class WebMidiInput implements MidiInput {
  status: MidiStatus = 'idle';
  deviceNames: readonly string[] = [];
  private access: MidiAccessLike | null = null;
  private readonly noteListeners = new Set<(m: NoteMessage) => void>();
  private readonly statusListeners = new Set<(s: MidiStatus) => void>();

  constructor(private readonly request: RequestMidiAccess | undefined) {}

  async start(): Promise<MidiStatus> {
    if (!this.request) return this.setStatus('unsupported');
    try {
      this.access = await this.request();
    } catch {
      return this.setStatus('denied');
    }
    this.access.onstatechange = () => {
      this.refresh();
    };
    return this.refresh();
  }

  onNote(listener: (message: NoteMessage) => void): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  onStatusChange(listener: (status: MidiStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  stop(): void {
    if (!this.access) return;
    for (const port of this.access.inputs.values()) port.onmidimessage = null;
    this.access.onstatechange = null;
    this.access = null;
    this.deviceNames = [];
    this.setStatus('idle');
  }

  /** (Re)attaches to every connected input, so plugging a keyboard in later works. */
  private refresh(): MidiStatus {
    if (!this.access) return this.status;
    const connected = [...this.access.inputs.values()].filter((p) => p.state === 'connected');
    for (const port of connected) {
      port.onmidimessage = (event) => {
        const message = event.data ? parseMidiMessage(event.data) : null;
        if (message) for (const listener of this.noteListeners) listener(message);
      };
    }
    this.deviceNames = connected.map((p) => p.name ?? 'MIDI input');
    return this.setStatus(connected.length > 0 ? 'ready' : 'no-device');
  }

  private setStatus(status: MidiStatus): MidiStatus {
    if (status !== this.status) {
      this.status = status;
      for (const listener of this.statusListeners) listener(status);
    }
    return status;
  }
}

export function createWebMidiInput(nav: Navigator = navigator): WebMidiInput {
  const hasMidi = 'requestMIDIAccess' in nav;
  return new WebMidiInput(
    hasMidi
      ? // MIDIAccess is structurally compatible; DOM typings use event types we do not need.
        () => nav.requestMIDIAccess() as unknown as Promise<MidiAccessLike>
      : undefined,
  );
}
