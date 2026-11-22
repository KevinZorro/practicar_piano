import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import type { MicInput } from '../adapters/audio/micInput';
import type { MidiInput, MidiStatus } from '../adapters/midi/midiInput';
import type { SheetAids } from '../adapters/sheet/osmdSheet';
import type { InputStatus } from '../core/input/noteInput';
import { NoteTrigger } from '../core/audio/noteTrigger';
import { SynthPlayer } from '../core/audio/synthPlayer';
import { InterpolatedClock } from '../core/clock/interpolatedClock';
import type { PlayerPort } from '../core/clock/playbackClock';
import { SwitchablePlayer } from '../core/clock/switchablePlayer';
import type { Attempt, LibrarySong } from '../core/library/library';
import type { Hand, HandFilter, Note } from '../core/notes/model';
import { availableLevels, viewLevel, type LevelName } from '../core/practice/level';
import { accuracy, DEFAULT_CONFIG, type PracticeState } from '../core/practice/machine';
import {
  isKeyboardOnly,
  type AudioSource,
  type PracticePrefs,
  type PracticeView,
} from '../core/practice/prefs';
import { SpeedControl } from '../core/practice/speed';
import { expectedNow } from '../core/practice/expected';
import {
  DEFAULT_FOLLOW_CONFIG,
  FollowMode,
  followAccuracy,
  type FollowStats,
} from '../core/practice/followMode';
import { Judge } from '../core/practice/judge';
import { formatClock, measureAt } from '../core/practice/timeline';
import { WaitMode } from '../core/practice/waitMode';
import { drawFrame } from '../render/drawFrame';
import { fitKeyRange, whiteKeyCount } from '../render/keyboardLayout';
import { stageLayout } from '../render/stageLayout';
import { KeyRow, Switch } from './controls';
import {
  BackIcon,
  BookIcon,
  ExpandIcon,
  KeysIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  ShrinkIcon,
} from './icons';
import { MicPanel } from './MicPanel';
import { FollowHud, PracticePanel, ReadingPanel, WaitHud } from './PracticePanels';
import { ReadingGuide } from './ReadingGuide';
import { SheetPane } from './SheetPane';

/** Embeds the video in `host` and resolves when it can be controlled. */
export type VideoFactory = (host: HTMLElement, videoId: string) => Promise<PlayerPort>;

interface Props {
  song: LibrarySong;
  prefs: PracticePrefs;
  onPrefs: (patch: Partial<PracticePrefs>) => void;
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

const VIEW_OPTIONS: readonly (readonly [PracticeView, string])[] = [
  ['falling', 'Notas'],
  ['sheet', 'Partitura'],
  ['both', 'Ambas'],
];
// The video view is offered only while the song's video can be embedded.
const VIEW_OPTIONS_WITH_VIDEO: readonly (readonly [PracticeView, string])[] = [
  ...VIEW_OPTIONS,
  ['video', 'Video'],
];
const MIDI_MESSAGE: Record<InputStatus, string> = {
  idle: 'Teclado sin conectar.',
  unsupported: 'Este navegador no admite teclados MIDI. Usa Chrome o Edge.',
  denied: 'Permiso denegado. Permite el acceso a MIDI en el candado de la barra de direcciones.',
  'no-device': 'No se detecta ningún teclado. Conéctalo por USB y enciéndelo.',
  ready: 'Teclado conectado.',
};
const SYNC_EVERY_MS = 250;

const wallMs = (): number => performance.now();

/** Until the video is ready (or when it cannot play), a synth counts the time. */
function createTiming() {
  const player = new SwitchablePlayer(new SynthPlayer(wallMs));
  const clock = new InterpolatedClock(player, { wallMs });
  return { clock, player, speedControl: new SpeedControl(clock) };
}

/** In wait mode with one hand, the other hand's notes are drawn faint. */
function dimmedHand(waitOn: boolean, hand: HandFilter): Hand | null {
  if (!waitOn || hand === 'both') return null;
  return hand === 'right' ? 'left' : 'right';
}

/** The keyboard shortcut must not fire while the player types or works a control. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, button, a, [contenteditable], .guide') !== null
  );
}

export function PracticeScreen({
  song,
  prefs,
  onPrefs,
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
  const canShowVideo = videoId !== null && createVideo !== undefined;
  const [video, setVideo] = useState<PlayerPort | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoAvailable = canShowVideo && !videoFailed;
  // Without the video, its view falls back to the falling notes; the saved choice stays.
  const shownView: PracticeView =
    prefs.view === 'video' && !videoAvailable ? 'falling' : prefs.view;
  // The video view always shows the video; the other views follow "Mostrar el video".
  const videoShown = prefs.showVideo || shownView === 'video';
  // The embed is created the first time the video is shown, and then kept.
  const [videoWanted, setVideoWanted] = useState(videoShown);
  // Songs without a (working) video only choose between the app's piano and silence.
  const [sound, setSound] = useState(true);
  // A hidden video never plays, so the app's piano carries the song until it is shown again.
  const audio: AudioSource = videoShown ? prefs.audio : 'piano';
  const videoPlays = audio !== 'piano';
  const appSound = videoAvailable ? audio !== 'video' : sound;
  const [fullscreen, setFullscreen] = useState(false);
  const [waitOn, setWaitOn] = useState(false);
  // Follow mode: the video keeps going and a wrong key sends it back; it excludes wait mode.
  const [followOn, setFollowOn] = useState(false);
  const [hand, setHand] = useState<HandFilter>('both');
  const [guideOpen, setGuideOpen] = useState(false);
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
  const measures = useMemo(() => view.score?.measures ?? [], [view]);
  const lastMeasure = measures[measures.length - 1]?.measure ?? null;
  const range = useMemo(() => fitKeyRange(view.notes.map((n) => n.pitch)), [view]);
  const aids = useMemo<SheetAids>(
    () => ({
      colors: prefs.sheetColors,
      letters: prefs.sheetLetters,
      naming: prefs.naming,
      zoom: prefs.sheetZoom,
    }),
    [prefs.sheetColors, prefs.sheetLetters, prefs.naming, prefs.sheetZoom],
  );

  const canvas = useRef<HTMLCanvasElement>(null);
  const fallBox = useRef<HTMLDivElement>(null);
  const stageSize = useRef({ width: 0, height: 0 });
  const timeline = useRef<HTMLInputElement>(null);
  const timeNow = useRef<HTMLSpanElement>(null);
  const measureNow = useRef<HTMLSpanElement>(null);
  const scrubbing = useRef(false);
  const guideOpener = useRef<HTMLButtonElement | null>(null);
  const pressedKeys = useRef(new Set<number>());
  const seekSheet = useRef<((timeS: number) => void) | null>(null);
  const registerSeek = useCallback((seek: ((timeS: number) => void) | null) => {
    seekSheet.current = seek;
  }, []);
  // What the frame loop reads every frame without re-subscribing.
  const drawing = useRef({ view: shownView, naming: prefs.naming, dim: null as Hand | null });
  useEffect(() => {
    drawing.current = {
      view: shownView,
      naming: prefs.naming,
      dim: dimmedHand(waitOn || followOn, hand),
    };
  }, [shownView, prefs.naming, waitOn, followOn, hand]);

  // On narrow screens the stage takes what the header and the sticky transport leave, so the
  // transport never covers the keyboard, even when wait mode makes it taller.
  const shell = useRef<HTMLElement>(null);
  const topBar = useRef<HTMLElement>(null);
  const transportBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = shell.current;
    const header = topBar.current;
    const transport = transportBox.current;
    if (!root || !header || !transport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--bar-h', `${String(header.offsetHeight)}px`);
      root.style.setProperty('--transport-h', `${String(transport.offsetHeight)}px`);
    });
    observer.observe(header);
    observer.observe(transport);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The practice screen opens at its top, wherever the library was scrolled; leaving returns there.
  useEffect(() => {
    const from = window.scrollY;
    window.scrollTo(0, 0);
    return () => {
      window.scrollTo(0, from);
    };
  }, []);

  const [{ clock, player, speedControl }] = useState(createTiming);
  const videoHost = useRef<HTMLDivElement>(null);
  const piano = useRef<TonePiano | null>(null);
  const soundRef = useRef(appSound);
  useEffect(() => {
    soundRef.current = appSound && !micSilence;
    player.setMuted(micSilence);
  }, [appSound, micSilence, player]);
  const inputReadyRef = useRef(false);
  const micRef = useRef<MicInput | null>(null);
  useEffect(() => {
    micRef.current = mic;
  }, [mic]);
  useEffect(() => {
    inputReadyRef.current = source !== null && inputStatus === 'ready';
  }, [source, inputStatus]);
  const judge = useMemo(() => new Judge(view.notes), [view]);
  const judgeRef = useRef(judge);
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
      { ...DEFAULT_CONFIG, rewindOnWrong, rewindS: prefs.rewindS },
    );
    return holder.current;
  }, [waitOn, hand, view, clock, rewindOnWrong, prefs.rewindS]);
  useEffect(() => {
    waitRef.current = wait;
    attemptInfo.current.reported = false;
    return () => {
      waitRef.current = null;
    };
  }, [wait]);

  // Follow mode, with its own tally; reports carry the instance so stale ones are ignored.
  const [followTally, setFollowTally] = useState<{
    source: FollowMode | null;
    stats: FollowStats;
  } | null>(null);
  const follow = useMemo(() => {
    if (!followOn) return null;
    const holder: { current: FollowMode | null } = { current: null };
    holder.current = new FollowMode(
      view.notes,
      hand,
      clock,
      (stats) => {
        setFollowTally({ source: holder.current, stats });
      },
      { ...DEFAULT_FOLLOW_CONFIG, rewindS: prefs.rewindS, rewindOnMiss: prefs.rewindOnSilence },
    );
    return holder.current;
  }, [followOn, hand, view, clock, prefs.rewindS, prefs.rewindOnSilence]);
  const followRef = useRef<FollowMode | null>(null);
  useEffect(() => {
    followRef.current = follow;
    attemptInfo.current.reported = false;
    return () => {
      followRef.current = null;
    };
  }, [follow]);
  const followStats = follow
    ? followTally?.source === follow
      ? followTally.stats
      : follow.snapshot
    : null;

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
        if (followRef.current) followRef.current.noteOn(message.pitch, clock.now() - back);
        else judgeRef.current.noteOn(message.pitch, clock.now() - back);
      }
    });
    return () => {
      offStatus();
      offNote();
      pressed.clear();
      input.stop();
    };
  }, [source, clock, speedControl]);

  // The canvas follows the size of its box; the bitmap is scaled for crisp text.
  useEffect(() => {
    const box = fallBox.current;
    const element = canvas.current;
    if (!box || !element) return;
    const apply = (width: number, height: number) => {
      stageSize.current = { width, height };
      const scale = canvasScale();
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
    };
    apply(box.clientWidth, box.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) apply(Math.round(rect.width), Math.round(rect.height));
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const trigger = new NoteTrigger(view.notes);
    const whiteKeys = whiteKeyCount(range);
    let frame = 0;
    let shownSecond = -1;
    let shownTenth = -1;
    const tick = () => {
      const now = clock.now();
      const ctx = canvas.current?.getContext('2d');
      const element = canvas.current;
      const { width, height } = stageSize.current;
      if (ctx && element && width > 0 && height > 0) {
        const { view: layoutView, naming, dim } = drawing.current;
        const layout = stageLayout(width, height, whiteKeys, layoutView);
        const ratio = element.width / width;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawFrame(
          ctx,
          view.notes,
          now,
          { width, height: layout.fallHeight, aheadS: layout.aheadS },
          {
            pressed: pressedKeys.current,
            range,
            keyboardHeight: layout.keyboardHeight,
            naming,
            dimHand: dim,
          },
        );
      }
      const tenth = Math.floor(now * 10);
      if (tenth !== shownTenth && !scrubbing.current && timeline.current) {
        shownTenth = tenth;
        timeline.current.value = String(Math.min(now, duration));
      }
      const second = Math.floor(now);
      if (second !== shownSecond) {
        shownSecond = second;
        const text = formatClock(Math.min(now, duration));
        if (timeNow.current) timeNow.current.textContent = text;
        timeline.current?.setAttribute('aria-valuetext', `${text} de ${formatClock(duration)}`);
        const bar = measureAt(measures, now);
        if (measureNow.current) measureNow.current.textContent = String(bar ?? 1);
      }
      seekSheet.current?.(now);
      if (sessionRef.current) {
        waitRef.current?.tick();
        followRef.current?.tick(inputReadyRef.current);
      }
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
          const tally = followRef.current?.snapshot;
          if (tally && tally.hits + tally.mistakes > 0) {
            // A run that needed rewinds was helped: it is reported like wait mode, never as mastered.
            report({ accuracy: followAccuracy(tally), waitMode: tally.rewinds > 0 });
          } else if (!waitRef.current && !tally && judgeRef.current.pressCount > 0) {
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
  }, [view, range, measures, clock, duration, speedControl, report]);

  useEffect(() => {
    const host = videoHost.current;
    if (!videoId || !createVideo || !host || !videoWanted) return;
    const state = { cancelled: false, timer: 0 };
    createVideo(host, videoId).then(
      (ready) => {
        if (state.cancelled) return;
        setVideo(ready);
        state.timer = window.setInterval(() => {
          clock.sync();
        }, SYNC_EVERY_MS);
      },
      () => {
        // The video cannot be embedded or loaded: practice goes on with the synth.
        if (state.cancelled) return;
        setVideoFailed(true);
      },
    );
    return () => {
      state.cancelled = true;
      window.clearInterval(state.timer);
    };
  }, [videoId, createVideo, videoWanted, clock]);

  // A video that is not playing stays paused: the clock moves to a synth counter.
  useEffect(() => {
    if (!video) return;
    player.attach(videoPlays ? video : new SynthPlayer(wallMs));
  }, [video, videoPlays, player]);

  // Full screen keeps the video, the keyboard strip and the transport; Escape leaves it.
  useEffect(() => {
    const onChange = () => {
      const root = shell.current;
      setFullscreen(root !== null && document.fullscreenElement === root);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  // Full screen belongs to the video view: if the video goes away, the window comes back.
  useEffect(() => {
    const root = shell.current;
    if (shownView !== 'video' && root !== null && document.fullscreenElement === root) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [shownView]);

  useEffect(
    () => () => {
      clock.pause();
      piano.current?.stopAll();
    },
    [clock],
  );

  const pianoUnlocked = useRef(false);

  // The piano samples (about 2 MB) download while the player reads the screen, not on Play.
  useEffect(() => {
    if (!createPiano || piano.current) return;
    piano.current = createPiano();
    piano.current.preload();
  }, [createPiano]);

  /** Audio can only start from a click, which is why it is unlocked here. */
  async function ensurePiano() {
    if (!createPiano || pianoUnlocked.current) return;
    pianoUnlocked.current = true;
    piano.current ??= createPiano();
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

  function stop() {
    clock.pause();
    piano.current?.stopAll();
    setPlaying(false);
  }

  function start() {
    if (clock.now() >= duration) seekTo(0);
    // While the song waits for a key, resuming must not run past the chord.
    if (waitRef.current?.snapshot.status !== 'waiting') clock.play();
    else player.pause();
    setPlaying(true);
  }

  async function togglePlay() {
    if (playing) {
      stop();
      return;
    }
    await ensurePiano();
    start();
  }

  /** Moves the song by hand (timeline, restart); a run started over counts as a new attempt. */
  function seekTo(timeS: number) {
    const target = Math.min(Math.max(timeS, 0), duration);
    clock.seek(target);
    waitRef.current?.seek(target);
    followRef.current?.seek(target);
    judge.reset(target);
    attemptInfo.current.reported = false;
    piano.current?.stopAll();
  }

  // A click on the video moves the keyboard focus into YouTube's frame, where Space does nothing:
  // the focus comes straight back, so Space keeps playing and pausing the practice.
  useEffect(() => {
    let timer = 0;
    const onBlur = () => {
      timer = window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && videoHost.current?.contains(active)) {
          active.blur();
        }
      }, 0);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.clearTimeout(timer);
    };
  }, []);

  // A click on the video itself starts or stops it: the practice follows it.
  const controls = useRef({ start, stop, togglePlay });
  useEffect(() => {
    controls.current = { start, stop, togglePlay };
  });
  useEffect(
    () =>
      player.onExternalChange((videoPlaying) => {
        if (videoPlaying === sessionRef.current) return;
        if (videoPlaying) controls.current.start();
        else controls.current.stop();
      }),
    [player],
  );

  // Space plays and pauses from anywhere on the screen, except while typing or on a control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      void controls.current.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function restart() {
    seekTo(0);
    if (sessionRef.current) clock.play();
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

  function chooseWait(on: boolean) {
    setWaitOn(on);
    if (on) setFollowOn(false);
  }

  function chooseFollow(on: boolean) {
    setFollowOn(on);
    if (on) setWaitOn(false);
  }

  function chooseSpeed(next: number) {
    setSpeed(speedControl.set(next));
  }

  /** The embed is created the first time the video is shown. */
  function revealVideo(shown: boolean) {
    if (shown) setVideoWanted(true);
  }

  /** Playing the video's sound needs the video on screen, so choosing it shows the video. */
  function chooseAudio(next: AudioSource) {
    const show = next === 'piano' ? prefs.showVideo : true;
    onPrefs({ audio: next, showVideo: show });
    revealVideo(show || shownView === 'video');
  }

  function showVideo(show: boolean) {
    onPrefs({ showVideo: show });
    revealVideo(show || shownView === 'video');
  }

  function chooseView(next: PracticeView) {
    onPrefs({ view: next });
    revealVideo(prefs.showVideo || next === 'video');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    // Refused (the browser or its settings): the practice simply stays in the window.
    void shell.current?.requestFullscreen().catch(() => undefined);
  }

  function openGuide(opener: HTMLButtonElement) {
    guideOpener.current = opener;
    setGuideOpen(true);
  }

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideOpener.current?.focus();
  }, []);

  const videoReady = video !== null && videoShown;

  return (
    <section ref={shell} aria-label="Práctica" className="practice" data-view={shownView}>
      <header ref={topBar} className="practice-bar">
        <button
          type="button"
          className="key-quiet"
          aria-label="Volver a la biblioteca"
          onClick={onBack}
        >
          <BackIcon />
          <span className="back-label">Biblioteca</span>
        </button>
        <div className="practice-title">
          <h2>{song.title}</h2>
          <p className="fine-print">Transcripción automática: puede contener errores.</p>
        </div>
        <KeyRow
          legend="Vista"
          name="view"
          value={shownView}
          options={videoAvailable ? VIEW_OPTIONS_WITH_VIDEO : VIEW_OPTIONS}
          onChange={chooseView}
          className="view-switch"
        />
        <button
          type="button"
          className="key-quiet"
          aria-expanded={guideOpen}
          onClick={(e) => {
            openGuide(e.currentTarget);
          }}
        >
          <BookIcon />
          <span className="guide-label">Guía</span>
        </button>
      </header>

      <div className="stage">
        <div className="stage-sheet">
          <SheetPane score={view.score} aids={aids} registerSeek={registerSeek} />
        </div>
        <div className="stage-fall" ref={fallBox}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={isKeyboardOnly(shownView) ? 'Teclado' : 'Notas que caen'}
          />
        </div>
      </div>

      <div ref={transportBox} className="transport">
        <button
          type="button"
          className="key-primary transport-play"
          onClick={() => void togglePlay()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? 'Pausar' : 'Reproducir'}
        </button>
        <button type="button" onClick={restart}>
          <RestartIcon />
          Reiniciar
        </button>
        <div className="timeline">
          <span ref={timeNow} className="timeline-now">
            0:00
          </span>
          <input
            ref={timeline}
            type="range"
            min={0}
            max={duration}
            step={0.1}
            defaultValue={0}
            aria-label="Posición en la canción"
            onPointerDown={() => {
              scrubbing.current = true;
            }}
            onPointerUp={() => {
              scrubbing.current = false;
            }}
            onBlur={() => {
              scrubbing.current = false;
            }}
            onChange={(e) => {
              seekTo(Number(e.target.value));
            }}
          />
          <span>{formatClock(duration)}</span>
        </div>
        {lastMeasure !== null && (
          <span className="transport-measure">
            Compás <span ref={measureNow}>1</span> de {lastMeasure}
          </span>
        )}
        <span className="transport-hint">
          <kbd>Espacio</kbd> reproduce o pausa
        </span>
        {followStats && <FollowHud stats={followStats} />}
        {waitOn && practiceState && (
          <WaitHud
            state={practiceState}
            expected={wait?.expectedPitches() ?? []}
            naming={prefs.naming}
          />
        )}
      </div>

      {/* One element for every view: moving an embedded video reloads it, so CSS places it. */}
      {canShowVideo && (
        <div className="video-frame" hidden={!videoReady && shownView !== 'video'}>
          <div
            className="video"
            role="region"
            aria-label="Video"
            hidden={!videoReady}
            data-paused={!videoPlays}
          >
            <div ref={videoHost} className="video-player" />
            {/* Where video players keep it, on the picture, so it also brings the window back. */}
            {shownView === 'video' && document.fullscreenEnabled && (
              <button
                type="button"
                className="video-screen"
                aria-label="Pantalla completa"
                aria-pressed={fullscreen}
                title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                // A mouse click leaves the focus where it was, so Space still plays and pauses.
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={toggleFullscreen}
              >
                {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
            )}
          </div>
          {!videoReady && <p className="video-wait">Cargando el video…</p>}
        </div>
      )}

      <aside className="inspector" aria-label="Ajustes de la práctica">
        {canShowVideo && shownView !== 'video' && (
          <section className="panel panel-video">
            <h3 className="sr-only">Video</h3>
            {!videoFailed && (
              <Switch label="Mostrar el video" checked={prefs.showVideo} onChange={showVideo} />
            )}
            {videoFailed && (
              <p className="fine-print video-note">
                El video no se puede mostrar aquí: suena el piano de la app.
              </p>
            )}
          </section>
        )}
        <PracticePanel
          levels={levels}
          level={level}
          onLevel={setLevel}
          droppedRatio={view.droppedRatio}
          speed={speed}
          onSpeed={chooseSpeed}
          waitOn={waitOn}
          onWait={chooseWait}
          followOn={followOn}
          onFollow={chooseFollow}
          rewindS={prefs.rewindS}
          onRewindS={(rewindS) => {
            onPrefs({ rewindS });
          }}
          rewindOnMiss={prefs.rewindOnSilence}
          onRewindOnMiss={(rewindOnMiss) => {
            onPrefs({ rewindOnSilence: rewindOnMiss });
          }}
          hand={hand}
          onHand={setHand}
          rewindOnWrong={rewindOnWrong}
          onRewind={setRewindOnWrong}
          audio={videoAvailable ? audio : null}
          onAudio={chooseAudio}
          sound={sound}
          soundLocked={micSilence}
          onSound={setSound}
        />
        <section className="panel">
          <h3>Tu teclado</h3>
          <button type="button" className="connect" onClick={() => void connectMidi()}>
            <KeysIcon />
            Conectar teclado
          </button>
          <p
            role="status"
            className="status-line"
            data-ok={midi !== null && inputStatus === 'ready'}
          >
            {MIDI_MESSAGE[midi ? inputStatus : 'idle']}
            {midi && midi.deviceNames.length > 0 && ` ${midi.deviceNames.join(', ')}`}
          </p>
          {createMic && (
            <MicPanel
              mic={mic}
              status={inputStatus}
              headphones={headphones}
              onHeadphones={setHeadphones}
              onConnect={() => void connectMic()}
              onBeforeCalibrate={stop}
            />
          )}
        </section>
        <ReadingPanel
          prefs={prefs}
          onPrefs={onPrefs}
          onGuide={() => {
            setGuideOpen(true);
          }}
        />
      </aside>

      {guideOpen && <ReadingGuide naming={prefs.naming} onClose={closeGuide} />}
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
