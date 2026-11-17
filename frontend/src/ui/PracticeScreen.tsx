import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import type { MidiInput, MidiStatus } from '../adapters/midi/midiInput';
import { NoteTrigger } from '../core/audio/noteTrigger';
import { SynthPlayer } from '../core/audio/synthPlayer';
import { InterpolatedClock } from '../core/clock/interpolatedClock';
import type { LibrarySong } from '../core/library/library';
import type { HandFilter, Note } from '../core/notes/model';
import { availableLevels, viewLevel, type LevelName } from '../core/practice/level';
import { accuracy, type PracticeState } from '../core/practice/machine';
import { SPEED_PRESETS, SpeedControl } from '../core/practice/speed';
import { WaitMode } from '../core/practice/waitMode';
import { drawFrame } from '../render/drawFrame';
import { SheetPane } from './SheetPane';

interface Props {
  song: LibrarySong;
  onBack: () => void;
  /** Creates the audio voice; injected so tests do not need a sound card. */
  createPiano?: (() => TonePiano) | undefined;
  /** Creates the Web MIDI input; injected so tests can fake the keyboard. */
  createMidi?: (() => MidiInput) | undefined;
}

const AHEAD_S = 4;

const wallMs = (): number => performance.now();

/** Without the video, a synth counts the time; the clock smooths it the same way. */
function createTiming() {
  const clock = new InterpolatedClock(new SynthPlayer(wallMs), { wallMs });
  return { clock, speedControl: new SpeedControl(clock) };
}
const HAND_LABEL: Record<HandFilter, string> = {
  both: 'Ambas manos',
  right: 'Mano derecha',
  left: 'Mano izquierda',
};
const MIDI_MESSAGE: Record<MidiStatus, string> = {
  idle: 'Teclado sin conectar.',
  unsupported: 'Este navegador no admite teclados MIDI. Usa Chrome o Edge.',
  denied: 'Permiso denegado. Permite el acceso a MIDI en el candado de la barra de direcciones.',
  'no-device': 'No se detecta ningún teclado. Conéctalo por USB y enciéndelo.',
  ready: 'Teclado conectado.',
};
const LEVEL_LABEL: Record<LevelName, string> = {
  original: 'Original',
  playable: 'Jugable',
  easy: 'Fácil',
};

export function PracticeScreen({ song, onBack, createPiano, createMidi }: Props) {
  const levels = availableLevels(song.result);
  const [level, setLevel] = useState<LevelName>(levels[0] ?? 'playable');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [waitOn, setWaitOn] = useState(false);
  const [hand, setHand] = useState<HandFilter>('both');
  const [practice, setPractice] = useState<{
    source: WaitMode | null;
    state: PracticeState;
  } | null>(null);
  const [midi, setMidi] = useState<MidiInput | null>(null);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>('idle');
  const view = useMemo(() => viewLevel(song.result, level), [song.result, level]);
  const duration = song.result.meta.duration_s;

  const canvas = useRef<HTMLCanvasElement>(null);
  const seekSheet = useRef<((timeS: number) => void) | null>(null);
  const registerSeek = useCallback((seek: ((timeS: number) => void) | null) => {
    seekSheet.current = seek;
  }, []);

  const [{ clock, speedControl }] = useState(createTiming);
  const piano = useRef<TonePiano | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const sessionRef = useRef(false);
  const waitRef = useRef<WaitMode | null>(null);
  useEffect(() => {
    sessionRef.current = playing;
  }, [playing]);

  // A new WaitMode per setting; its reports carry the instance so stale ones are ignored.
  const wait = useMemo(() => {
    if (!waitOn) return null;
    const holder: { current: WaitMode | null } = { current: null };
    holder.current = new WaitMode(view.notes, hand, clock, (state) => {
      setPractice({ source: holder.current, state });
    });
    return holder.current;
  }, [waitOn, hand, view, clock]);
  useEffect(() => {
    waitRef.current = wait;
    return () => {
      waitRef.current = null;
    };
  }, [wait]);
  const practiceState = wait ? (practice?.source === wait ? practice.state : wait.snapshot) : null;

  useEffect(() => {
    if (!midi) return;
    const offStatus = midi.onStatusChange(setMidiStatus);
    const offNote = midi.onNote((message) => {
      if (message.type !== 'noteOn') return;
      if (soundRef.current) piano.current?.play(keyNote(message.pitch, message.velocity), 0.8);
      if (sessionRef.current) waitRef.current?.noteOn(message.pitch);
    });
    return () => {
      offStatus();
      offNote();
      midi.stop();
    };
  }, [midi]);

  useEffect(() => {
    const trigger = new NoteTrigger(view.notes);
    let frame = 0;
    const tick = () => {
      const now = clock.now();
      const ctx = canvas.current?.getContext('2d');
      const el = canvas.current;
      if (ctx && el) {
        drawFrame(ctx, view.notes, now, {
          width: el.width,
          height: el.height - 2,
          aheadS: AHEAD_S,
        });
      }
      seekSheet.current?.(now);
      if (sessionRef.current) waitRef.current?.tick();
      if (clock.isPlaying) {
        for (const note of trigger.advance(now)) {
          if (soundRef.current)
            piano.current?.play(note, (note.endS - note.startS) / speedControl.speed);
        }
        if (now >= duration) {
          clock.pause();
          setPlaying(false);
        }
      } else {
        trigger.reset();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [view, clock, duration, speedControl]);

  useEffect(
    () => () => {
      clock.pause();
      piano.current?.stopAll();
    },
    [clock],
  );

  /** Audio can only start from a click, which is why it is created here. */
  async function ensurePiano() {
    if (piano.current || !createPiano) return;
    piano.current = createPiano();
    await piano.current.unlock().catch(() => {
      setSound(false);
    });
  }

  async function togglePlay() {
    if (playing) {
      clock.pause();
      piano.current?.stopAll();
      setPlaying(false);
      return;
    }
    await ensurePiano();
    if (clock.now() >= duration) {
      clock.seek(0);
      waitRef.current?.seek(0);
    }
    // While the song waits for a key, resuming must not run past the chord.
    if (waitRef.current?.snapshot.status !== 'waiting') clock.play();
    setPlaying(true);
  }

  function restart() {
    clock.seek(0);
    waitRef.current?.seek(0);
    if (sessionRef.current) clock.play();
    piano.current?.stopAll();
  }

  async function connectMidi() {
    await ensurePiano();
    if (!createMidi) return;
    const input = createMidi();
    setMidi(input);
    setMidiStatus(await input.start());
  }

  function chooseSpeed(next: number) {
    setSpeed(speedControl.set(next));
  }

  return (
    <section aria-label="Práctica" className="practice">
      <header>
        <button type="button" onClick={onBack}>
          Volver
        </button>
        <h2>{song.title}</h2>
      </header>

      <div className="controls">
        <button type="button" onClick={() => void togglePlay()}>
          {playing ? 'Pausar' : 'Reproducir'}
        </button>
        <button type="button" onClick={restart}>
          Reiniciar
        </button>
        <label>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
            }}
          />{' '}
          Sonido
        </label>
        <fieldset>
          <legend>Nivel</legend>
          {levels.map((name) => (
            <label key={name}>
              <input
                type="radio"
                name="level"
                checked={level === name}
                onChange={() => {
                  setLevel(name);
                }}
              />{' '}
              {LEVEL_LABEL[name]}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Velocidad</legend>
          {SPEED_PRESETS.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="speed"
                checked={speed === value}
                onChange={() => {
                  chooseSpeed(value);
                }}
              />{' '}
              {String(Math.round(value * 100))} %
            </label>
          ))}
          <label>
            Libre{' '}
            <input
              type="range"
              min={25}
              max={150}
              step={5}
              value={Math.round(speed * 100)}
              aria-label="Velocidad libre"
              onChange={(e) => {
                chooseSpeed(Number(e.target.value) / 100);
              }}
            />
          </label>
        </fieldset>
      </div>

      <div className="wait-mode">
        <label>
          <input
            type="checkbox"
            checked={waitOn}
            onChange={(e) => {
              setWaitOn(e.target.checked);
            }}
          />{' '}
          Modo espera
        </label>
        <fieldset disabled={!waitOn}>
          <legend>Manos</legend>
          {(Object.keys(HAND_LABEL) as HandFilter[]).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="hand"
                checked={hand === value}
                onChange={() => {
                  setHand(value);
                }}
              />{' '}
              {HAND_LABEL[value]}
            </label>
          ))}
        </fieldset>
        <button type="button" onClick={() => void connectMidi()}>
          Conectar teclado
        </button>
        <span role="status">{MIDI_MESSAGE[midiStatus]}</span>
        {midi && midi.deviceNames.length > 0 && <span> {midi.deviceNames.join(', ')}</span>}
      </div>

      {waitOn && practiceState && (
        <p role="status" aria-label="Progreso del modo espera">
          {practiceState.status === 'waiting' && 'Toca las notas indicadas para continuar. '}
          {practiceState.status === 'finished' && '¡Terminaste! '}
          Acordes acertados: {practiceState.stats.chordsHit} · Fallos:{' '}
          {practiceState.stats.mistakes} · Precisión:{' '}
          {Math.round(accuracy(practiceState.stats) * 100)} %
        </p>
      )}

      {view.droppedRatio > 0 && (
        <p role="note">
          Se simplificó el {String(Math.round(view.droppedRatio * 100))} % de las notas para poder
          tocarla.
        </p>
      )}

      <canvas ref={canvas} width={960} height={320} aria-label="Notas que caen" />
      <SheetPane score={view.score} registerSeek={registerSeek} />
    </section>
  );
}

/** A synthetic note for a key the player pressed (not part of the song). */
function keyNote(pitch: number, velocity: number): Note {
  return { id: -1, pitch, startS: 0, endS: 0.8, velocity, hand: pitch >= 60 ? 'right' : 'left' };
}
