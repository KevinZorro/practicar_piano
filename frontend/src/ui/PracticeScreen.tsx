import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import type { MicInput } from '../adapters/audio/micInput';
import type { MidiInput, MidiStatus } from '../adapters/midi/midiInput';
import type { InputStatus } from '../core/input/noteInput';
import { NoteTrigger } from '../core/audio/noteTrigger';
import { SynthPlayer } from '../core/audio/synthPlayer';
import { InterpolatedClock } from '../core/clock/interpolatedClock';
import type { PlayerPort } from '../core/clock/playbackClock';
import { SwitchablePlayer } from '../core/clock/switchablePlayer';
import type { Attempt, LibrarySong } from '../core/library/library';
import type { HandFilter, Note } from '../core/notes/model';
import { availableLevels, viewLevel, type LevelName } from '../core/practice/level';
import { accuracy, DEFAULT_CONFIG, type PracticeState } from '../core/practice/machine';
import { SPEED_PRESETS, SpeedControl } from '../core/practice/speed';
import { expectedNow } from '../core/practice/expected';
import { Judge } from '../core/practice/judge';
import { WaitMode } from '../core/practice/waitMode';
import { drawFrame, KEYBOARD_HEIGHT } from '../render/drawFrame';
import { LEVEL_LABEL } from './messages';
import { MicPanel } from './MicPanel';
import { SheetPane } from './SheetPane';

/** Embeds the video in `host` and resolves when it can be controlled. */
export type VideoFactory = (host: HTMLElement, videoId: string) => Promise<PlayerPort>;

interface Props {
  song: LibrarySong;
  onBack: () => void;
  /** Creates the audio voice; injected so tests do not need a sound card. */
  createPiano?: (() => TonePiano) | undefined;
  /** Creates the Web MIDI input; injected so tests can fake the keyboard. */
  createMidi?: (() => MidiInput) | undefined;
  /** Creates the microphone input (plays by ear, no keyboard cable needed). */
  createMic?: (() => MicInput) | undefined;
  /** Creates the YouTube video; without it (or on failure) a synth counts the time. */
  createVideo?: VideoFactory | undefined;
  /** Called once per finished run that was played on a keyboard, to keep the progress. */
  onAttempt?: ((attempt: Attempt) => void) | undefined;
}

const AHEAD_S = 4;
// Logical canvas size: 20 px per white key; the bitmap is scaled by the pixel ratio for crisp text.
const CANVAS_WIDTH = 1040;
const FALL_HEIGHT = 340;
const CANVAS_HEIGHT = FALL_HEIGHT + KEYBOARD_HEIGHT + 2;

const wallMs = (): number => performance.now();

/** Until the video is ready (or when it cannot play), a synth counts the time. */
function createTiming() {
  const player = new SwitchablePlayer(new SynthPlayer(wallMs));
  const clock = new InterpolatedClock(player, { wallMs });
  return { clock, player, speedControl: new SpeedControl(clock) };
}
const SYNC_EVERY_MS = 250;
// The embedded player fills its box, so the box needs a size (styles come with C9).
const VIDEO_STYLE = { aspectRatio: '16 / 9', maxWidth: '480px' } as const;
const HAND_LABEL: Record<HandFilter, string> = {
  both: 'Ambas manos',
  right: 'Mano derecha',
  left: 'Mano izquierda',
};
const MIDI_MESSAGE: Record<InputStatus, string> = {
  idle: 'Teclado sin conectar.',
  unsupported: 'Este navegador no admite teclados MIDI. Usa Chrome o Edge.',
  denied: 'Permiso denegado. Permite el acceso a MIDI en el candado de la barra de direcciones.',
  'no-device': 'No se detecta ningún teclado. Conéctalo por USB y enciéndelo.',
  ready: 'Teclado conectado.',
};

export function PracticeScreen({
  song,
  onBack,
  createPiano,
  createMidi,
  createMic,
  createVideo,
  onAttempt,
}: Props) {
  const levels = availableLevels(song.result);
  const [level, setLevel] = useState<LevelName>(levels[0] ?? 'playable');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const videoId = song.videoId ?? null;
  const [hasVideo, setHasVideo] = useState(false);
  // The video carries the song's own sound; the synth is for songs without one.
  const [sound, setSound] = useState(videoId === null || !createVideo);
  const [waitOn, setWaitOn] = useState(false);
  const [hand, setHand] = useState<HandFilter>('both');
  const [practice, setPractice] = useState<{
    source: WaitMode | null;
    state: PracticeState;
  } | null>(null);
  const [source, setSource] = useState<
    { kind: 'midi'; input: MidiInput } | { kind: 'mic'; input: MicInput } | null
  >(null);
  const [inputStatus, setInputStatus] = useState<MidiStatus>('idle');
  const [headphones, setHeadphones] = useState(false);
  const [rewindOnWrong, setRewindOnWrong] = useState(DEFAULT_CONFIG.rewindOnWrong);
  const midi = source?.kind === 'midi' ? source.input : null;
  const mic = source?.kind === 'mic' ? source.input : null;
  // The microphone would hear the app's own sound and take it for the player.
  const micSilence = mic !== null && inputStatus === 'ready' && !headphones;
  const view = useMemo(() => viewLevel(song.result, level), [song.result, level]);
  const duration = song.result.meta.duration_s;

  const canvas = useRef<HTMLCanvasElement>(null);
  const pressedKeys = useRef(new Set<number>());
  const seekSheet = useRef<((timeS: number) => void) | null>(null);
  const registerSeek = useCallback((seek: ((timeS: number) => void) | null) => {
    seekSheet.current = seek;
  }, []);

  const [{ clock, player, speedControl }] = useState(createTiming);
  const videoHost = useRef<HTMLDivElement>(null);
  const piano = useRef<TonePiano | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound && !micSilence;
    player.setMuted(micSilence);
  }, [sound, micSilence, player]);
  const micRef = useRef<MicInput | null>(null);
  useEffect(() => {
    micRef.current = mic;
  }, [mic]);
  const judge = useMemo(() => new Judge(view.notes), [view]);
  const judgeRef = useRef(judge);
  // What the frame loop and the keyboard handler need without re-subscribing.
  const attemptInfo = useRef({ level, onAttempt, reported: false });
  useEffect(() => {
    judgeRef.current = judge;
    attemptInfo.current.level = level;
    attemptInfo.current.onAttempt = onAttempt;
    attemptInfo.current.reported = false;
  }, [judge, level, onAttempt]);
  const report = useCallback(
    (result: { accuracy: number; waitMode: boolean }) => {
      const info = attemptInfo.current;
      if (info.reported) return;
      info.reported = true;
      info.onAttempt?.({ level: info.level, speed: speedControl.speed, ...result });
    },
    [speedControl],
  );
  const sessionRef = useRef(false);
  const waitRef = useRef<WaitMode | null>(null);
  useEffect(() => {
    sessionRef.current = playing;
  }, [playing]);

  // A new WaitMode per setting; its reports carry the instance so stale ones are ignored.
  const wait = useMemo(() => {
    if (!waitOn) return null;
    const holder: { current: WaitMode | null } = { current: null };
    holder.current = new WaitMode(
      view.notes,
      hand,
      clock,
      (state) => {
        setPractice({ source: holder.current, state });
      },
      { ...DEFAULT_CONFIG, rewindOnWrong },
    );
    return holder.current;
  }, [waitOn, hand, view, clock, rewindOnWrong]);
  useEffect(() => {
    waitRef.current = wait;
    attemptInfo.current.reported = false;
    return () => {
      waitRef.current = null;
    };
  }, [wait]);
  const practiceState = wait ? (practice?.source === wait ? practice.state : wait.snapshot) : null;

  useEffect(() => {
    if (!source) return;
    const { kind, input } = source;
    const pressed = pressedKeys.current;
    const offStatus = input.onStatusChange(setInputStatus);
    const offNote = input.onNote((message) => {
      if (message.type === 'noteOff') pressedKeys.current.delete(message.pitch);
      if (message.type !== 'noteOn') return;
      pressedKeys.current.add(message.pitch);
      // The microphone never says when a key goes up: let the key light fade by itself.
      if (kind === 'mic') setTimeout(() => pressedKeys.current.delete(message.pitch), 300);
      if (kind === 'midi' && soundRef.current) {
        piano.current?.play(keyNote(message.pitch, message.velocity), 0.8);
      }
      if (!sessionRef.current) return;
      if (waitRef.current) waitRef.current.noteOn(message.pitch);
      else {
        // The microphone confirms a note a little after the key went down: judge it back then.
        const back = (message.ageS ?? 0) * speedControl.speed;
        judgeRef.current.noteOn(message.pitch, clock.now() - back);
      }
    });
    return () => {
      offStatus();
      offNote();
      pressed.clear();
      input.stop();
    };
  }, [source, clock, speedControl]);

  useEffect(() => {
    const trigger = new NoteTrigger(view.notes);
    let frame = 0;
    const tick = () => {
      const now = clock.now();
      const ctx = canvas.current?.getContext('2d');
      const el = canvas.current;
      if (ctx && el) {
        const ratio = el.width / CANVAS_WIDTH;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawFrame(
          ctx,
          view.notes,
          now,
          { width: CANVAS_WIDTH, height: FALL_HEIGHT, aheadS: AHEAD_S },
          { pressed: pressedKeys.current },
        );
      }
      seekSheet.current?.(now);
      if (sessionRef.current) waitRef.current?.tick();
      const listening = micRef.current;
      if (listening) {
        listening.setExpected(
          !sessionRef.current
            ? []
            : (waitRef.current?.expectedPitches() ?? expectedNow(view.notes, now)),
        );
      }
      if (clock.isPlaying) {
        for (const note of trigger.advance(now)) {
          if (soundRef.current)
            piano.current?.play(note, (note.endS - note.startS) / speedControl.speed);
        }
        if (now >= duration) {
          clock.pause();
          setPlaying(false);
          if (!waitRef.current && judgeRef.current.pressCount > 0) {
            report({
              accuracy: judgeRef.current.result(duration).accuracy,
              waitMode: false,
            });
          }
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
  }, [view, clock, duration, speedControl, report]);

  useEffect(() => {
    const host = videoHost.current;
    if (!videoId || !createVideo || !host) return;
    const state = { cancelled: false, timer: 0 };
    createVideo(host, videoId).then(
      (video) => {
        if (state.cancelled) return;
        player.attach(video);
        setHasVideo(true);
        state.timer = window.setInterval(() => {
          clock.sync();
        }, SYNC_EVERY_MS);
      },
      () => {
        // The video cannot be embedded or loaded: practice goes on with the synth.
        if (!state.cancelled) setSound(true);
      },
    );
    return () => {
      state.cancelled = true;
      window.clearInterval(state.timer);
    };
  }, [videoId, createVideo, player, clock]);

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

  const finished = practiceState?.status === 'finished';
  useEffect(() => {
    if (finished) {
      report({ accuracy: accuracy(practiceState.stats), waitMode: true });
    }
  }, [finished, practiceState, report]);

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
      judge.reset(0);
      attemptInfo.current.reported = false;
    }
    // While the song waits for a key, resuming must not run past the chord.
    if (waitRef.current?.snapshot.status !== 'waiting') clock.play();
    setPlaying(true);
  }

  function restart() {
    clock.seek(0);
    waitRef.current?.seek(0);
    judge.reset(0);
    attemptInfo.current.reported = false;
    if (sessionRef.current) clock.play();
    piano.current?.stopAll();
  }

  async function connectMidi() {
    await ensurePiano();
    if (!createMidi) return;
    const input = createMidi();
    setSource({ kind: 'midi', input });
    setInputStatus(await input.start());
  }

  async function connectMic() {
    await ensurePiano();
    if (!createMic) return;
    const input = createMic();
    setSource({ kind: 'mic', input });
    setInputStatus(await input.start());
  }

  function pauseForCalibration() {
    clock.pause();
    piano.current?.stopAll();
    setPlaying(false);
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
        <small className="fine-print">Transcripción automática: puede contener errores.</small>
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
            checked={sound && !micSilence}
            disabled={micSilence}
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
        <label>
          <input
            type="checkbox"
            checked={rewindOnWrong}
            onChange={(e) => {
              setRewindOnWrong(e.target.checked);
            }}
          />{' '}
          Retroceder al fallar
        </label>
        <button type="button" onClick={() => void connectMidi()}>
          Conectar teclado
        </button>
        <span role="status">{MIDI_MESSAGE[midi ? inputStatus : 'idle']}</span>
        {midi && midi.deviceNames.length > 0 && <span> {midi.deviceNames.join(', ')}</span>}
      </div>

      {createMic && (
        <MicPanel
          mic={mic}
          status={inputStatus}
          headphones={headphones}
          onHeadphones={setHeadphones}
          onConnect={() => void connectMic()}
          onBeforeCalibrate={pauseForCalibration}
        />
      )}

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

      {videoId && createVideo && (
        <div
          ref={videoHost}
          className="video"
          role="region"
          aria-label="Vídeo"
          hidden={!hasVideo}
          style={VIDEO_STYLE}
        />
      )}
      <canvas
        ref={canvas}
        width={CANVAS_WIDTH * canvasScale()}
        height={CANVAS_HEIGHT * canvasScale()}
        aria-label="Notas que caen"
      />
      <SheetPane score={view.score} registerSeek={registerSeek} />
    </section>
  );
}

/** Bitmap scale: the device pixel ratio, at least 1 and at most 2 to keep frames cheap. */
function canvasScale(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
}

/** A synthetic note for a key the player pressed (not part of the song). */
function keyNote(pitch: number, velocity: number): Note {
  return { id: -1, pitch, startS: 0, endS: 0.8, velocity, hand: pitch >= 60 ? 'right' : 'left' };
}
