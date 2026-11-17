import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import { NoteTrigger } from '../core/audio/noteTrigger';
import { SynthPlayer } from '../core/audio/synthPlayer';
import { InterpolatedClock } from '../core/clock/interpolatedClock';
import type { LibrarySong } from '../core/library/library';
import { availableLevels, viewLevel, type LevelName } from '../core/practice/level';
import { SPEED_PRESETS, SpeedControl } from '../core/practice/speed';
import { drawFrame } from '../render/drawFrame';
import { SheetPane } from './SheetPane';

interface Props {
  song: LibrarySong;
  onBack: () => void;
  /** Creates the audio voice; injected so tests do not need a sound card. */
  createPiano?: (() => TonePiano) | undefined;
}

const AHEAD_S = 4;

const wallMs = (): number => performance.now();

/** Without the video, a synth counts the time; the clock smooths it the same way. */
function createTiming() {
  const clock = new InterpolatedClock(new SynthPlayer(wallMs), { wallMs });
  return { clock, speedControl: new SpeedControl(clock) };
}
const LEVEL_LABEL: Record<LevelName, string> = {
  original: 'Original',
  playable: 'Jugable',
  easy: 'Fácil',
};

export function PracticeScreen({ song, onBack, createPiano }: Props) {
  const levels = availableLevels(song.result);
  const [level, setLevel] = useState<LevelName>(levels[0] ?? 'playable');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
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

  async function togglePlay() {
    if (clock.isPlaying) {
      clock.pause();
      piano.current?.stopAll();
      setPlaying(false);
      return;
    }
    if (!piano.current && createPiano) {
      // Audio can only start from a click, which is why it is created here.
      piano.current = createPiano();
      await piano.current.unlock().catch(() => {
        setSound(false);
      });
    }
    if (clock.now() >= duration) clock.seek(0);
    clock.play();
    setPlaying(true);
  }

  function restart() {
    clock.seek(0);
    piano.current?.stopAll();
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
