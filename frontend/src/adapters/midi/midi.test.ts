import { detectBrowser } from './browserSupport';
import {
  WebMidiInput,
  parseMidiMessage,
  type MidiAccessLike,
  type MidiPortLike,
  type NoteMessage,
} from './midiInput';

describe('parseMidiMessage', () => {
  it('reads note-on and note-off on any channel', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'noteOn', pitch: 60, velocity: 100 });
    expect(parseMidiMessage([0x9f, 72, 1])).toEqual({ type: 'noteOn', pitch: 72, velocity: 1 });
    expect(parseMidiMessage([0x80, 60, 64])).toEqual({ type: 'noteOff', pitch: 60, velocity: 64 });
  });

  it('treats note-on with velocity 0 as note-off', () => {
    expect(parseMidiMessage([0x90, 60, 0])?.type).toBe('noteOff');
  });

  it('ignores everything else and malformed data', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // sustain pedal (control change)
    expect(parseMidiMessage([0xfe])).toBeNull(); // active sensing
    expect(parseMidiMessage([0x90, 60])).toBeNull();
    expect(parseMidiMessage([])).toBeNull();
  });
});

function fakePort(name: string, state: 'connected' | 'disconnected' = 'connected'): MidiPortLike {
  return { id: name, name, state, onmidimessage: null };
}

function fakeAccess(ports: MidiPortLike[]): MidiAccessLike {
  return { inputs: new Map(ports.map((p) => [p.id, p])), onstatechange: null };
}

describe('WebMidiInput', () => {
  it('is unsupported without requestMIDIAccess', async () => {
    const input = new WebMidiInput(undefined);
    expect(await input.start()).toBe('unsupported');
  });

  it('reports denied when the permission is refused', async () => {
    const input = new WebMidiInput(() => Promise.reject(new Error('SecurityError')));
    expect(await input.start()).toBe('denied');
  });

  it('reports no-device with permission but no keyboard', async () => {
    const input = new WebMidiInput(() => Promise.resolve(fakeAccess([])));
    expect(await input.start()).toBe('no-device');
    expect(input.deviceNames).toEqual([]);
  });

  it('delivers notes from every connected keyboard and ignores disconnected ones', async () => {
    const piano = fakePort('Digital Piano');
    const old = fakePort('Old', 'disconnected');
    const input = new WebMidiInput(() => Promise.resolve(fakeAccess([piano, old])));
    const heard: NoteMessage[] = [];
    input.onNote((m) => heard.push(m));
    expect(await input.start()).toBe('ready');
    expect(input.deviceNames).toEqual(['Digital Piano']);
    piano.onmidimessage?.({ data: new Uint8Array([0x90, 64, 90]) });
    piano.onmidimessage?.({ data: new Uint8Array([0xb0, 64, 127]) });
    piano.onmidimessage?.({ data: null });
    expect(heard).toEqual([{ type: 'noteOn', pitch: 64, velocity: 90 }]);
    expect(old.onmidimessage).toBeNull();
  });

  it('picks up a keyboard plugged in later and notifies status listeners once per change', async () => {
    const ports: MidiPortLike[] = [];
    const access = fakeAccess(ports);
    const input = new WebMidiInput(() => Promise.resolve(access));
    const statuses: string[] = [];
    input.onStatusChange((s) => statuses.push(s));
    await input.start();
    const piano = fakePort('Piano');
    (access.inputs as Map<string, MidiPortLike>).set(piano.id, piano);
    access.onstatechange?.();
    access.onstatechange?.(); // same state again: no duplicate notification
    expect(statuses).toEqual(['no-device', 'ready']);
    expect(piano.onmidimessage).not.toBeNull();
  });

  it('stops listening and can unsubscribe', async () => {
    const piano = fakePort('Piano');
    const access = fakeAccess([piano]);
    const input = new WebMidiInput(() => Promise.resolve(access));
    const heard: NoteMessage[] = [];
    const off = input.onNote((m) => heard.push(m));
    await input.start();
    off();
    piano.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) });
    expect(heard).toEqual([]);
    input.stop();
    expect(piano.onmidimessage).toBeNull();
    expect(input.status).toBe('idle');
  });
});

describe('detectBrowser', () => {
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
  it.each([
    [chrome, true, 'chrome'],
    [`${chrome} Edg/131.0`, true, 'edge'],
    ['Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/133.0', false, 'firefox'],
    ['Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17 Safari/605.1.15', false, 'safari'],
    [`${chrome} OPR/110`, false, 'other'],
    ['curl/8.0', false, 'other'],
  ])('%s', (ua, supported, browser) => {
    expect(detectBrowser(ua)).toEqual({ supported, browser });
  });
});
