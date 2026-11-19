import type { CSSProperties } from 'react';
import type { HandFilter } from '../core/notes/model';
import { displayName } from '../core/notes/names';
import type { LevelName } from '../core/practice/level';
import { followAccuracy, type FollowStats } from '../core/practice/followMode';
import { accuracy, type PracticeState } from '../core/practice/machine';
import {
  REWIND_MAX_S,
  REWIND_MIN_S,
  SHEET_ZOOM_STEPS,
  stepZoom,
  type PracticePrefs,
} from '../core/practice/prefs';
import { SPEED_PRESETS } from '../core/practice/speed';
import { stageColor } from '../render/notePalette';
import { KeyRow, Switch } from './controls';
import { BookIcon, MinusIcon, PlusIcon } from './icons';
import { LEVEL_LABEL } from './messages';

const HAND_LABEL: Record<HandFilter, string> = {
  both: 'Las dos',
  right: 'Derecha',
  left: 'Izquierda',
};

const percent = (value: number) => `${String(Math.round(value * 100))} %`;

interface PracticePanelProps {
  levels: readonly LevelName[];
  level: LevelName;
  onLevel: (level: LevelName) => void;
  droppedRatio: number;
  speed: number;
  onSpeed: (speed: number) => void;
  waitOn: boolean;
  onWait: (on: boolean) => void;
  followOn: boolean;
  onFollow: (on: boolean) => void;
  rewindS: number;
  onRewindS: (seconds: number) => void;
  rewindOnMiss: boolean;
  onRewindOnMiss: (on: boolean) => void;
  hand: HandFilter;
  onHand: (hand: HandFilter) => void;
  rewindOnWrong: boolean;
  onRewind: (on: boolean) => void;
  sound: boolean;
  /** The microphone is listening without headphones: the app must stay silent. */
  soundLocked: boolean;
  onSound: (on: boolean) => void;
  videoSound: boolean;
}

/** How the song is played: level, speed, wait mode and the app's own piano. */
export function PracticePanel(props: PracticePanelProps) {
  const soundHint = props.soundLocked
    ? 'Apagado mientras el micrófono escucha sin audífonos.'
    : props.videoSound
      ? 'El piano de la app. El video ya trae el sonido de la canción.'
      : 'El piano de la app toca las notas de la canción.';
  return (
    <section className="panel">
      <h3>Cómo tocarla</h3>
      <KeyRow
        legend="Nivel"
        name="level"
        value={props.level}
        options={props.levels.map((name) => [name, LEVEL_LABEL[name]] as const)}
        onChange={props.onLevel}
      />
      {props.droppedRatio > 0 && (
        <p role="note" className="fine-print">
          Se simplificó el {String(Math.round(props.droppedRatio * 100))} % de las notas para poder
          tocarla.
        </p>
      )}
      <div className="field">
        <KeyRow
          legend="Velocidad"
          name="speed"
          value={props.speed}
          options={SPEED_PRESETS.map((value) => [value, percent(value)] as const)}
          onChange={props.onSpeed}
        />
        <div className="speed-free">
          <input
            type="range"
            min={25}
            max={150}
            step={5}
            value={Math.round(props.speed * 100)}
            aria-label="Velocidad libre"
            onChange={(e) => {
              props.onSpeed(Number(e.target.value) / 100);
            }}
          />
          <output>{percent(props.speed)}</output>
        </div>
      </div>
      <Switch
        label="Modo espera"
        checked={props.waitOn}
        onChange={props.onWait}
        hint="La canción se detiene en cada acorde hasta que tocas sus notas."
      />
      <Switch
        label="Retroceso automático"
        checked={props.followOn}
        onChange={props.onFollow}
        hint="El video sigue a su ritmo, sin esperarte. Si tocas una nota que no es, vuelve unos segundos atrás."
      />
      {(props.waitOn || props.followOn) && (
        <div className="wait-options">
          <KeyRow
            legend="Manos que tocas"
            name="hand"
            value={props.hand}
            options={(Object.keys(HAND_LABEL) as HandFilter[]).map(
              (h) => [h, HAND_LABEL[h]] as const,
            )}
            onChange={props.onHand}
            className="hands"
          />
          {props.waitOn && (
            <Switch
              label="Retroceder al fallar"
              checked={props.rewindOnWrong}
              onChange={props.onRewind}
              hint="Vuelve unos segundos atrás si tocas una nota que no toca."
            />
          )}
          {props.followOn && (
            <Switch
              label="También si me salto un acorde"
              checked={props.rewindOnMiss}
              onChange={props.onRewindOnMiss}
              hint="La transcripción no es perfecta: si el video toca algo que ella no tiene, déjalo apagado."
            />
          )}
          {(props.followOn || props.rewindOnWrong) && (
            <div className="field">
              <label className="field-label" htmlFor="rewind-seconds">
                Segundos que retrocede
              </label>
              <div className="speed-free">
                <input
                  id="rewind-seconds"
                  type="range"
                  min={REWIND_MIN_S}
                  max={REWIND_MAX_S}
                  step={1}
                  value={props.rewindS}
                  onChange={(e) => {
                    props.onRewindS(Number(e.target.value));
                  }}
                />
                <output htmlFor="rewind-seconds">{String(props.rewindS)} s</output>
              </div>
            </div>
          )}
        </div>
      )}
      <Switch
        label="Sonido"
        checked={props.sound && !props.soundLocked}
        disabled={props.soundLocked}
        onChange={props.onSound}
        hint={soundHint}
      />
    </section>
  );
}

interface ReadingPanelProps {
  prefs: PracticePrefs;
  onPrefs: (patch: Partial<PracticePrefs>) => void;
  onGuide: () => void;
}

/** Reading aids for the score, meant to be switched off one by one as reading improves. */
export function ReadingPanel({ prefs, onPrefs, onGuide }: ReadingPanelProps) {
  const smallest = Math.min(...SHEET_ZOOM_STEPS);
  const largest = Math.max(...SHEET_ZOOM_STEPS);
  return (
    <section className="panel">
      <h3>Lectura</h3>
      <Switch
        label="Colores en la partitura"
        checked={prefs.sheetColors}
        onChange={(on) => {
          onPrefs({ sheetColors: on });
        }}
        hint="Cada nota con el color de su tecla."
      />
      <Switch
        label="Nombre de cada nota"
        checked={prefs.sheetLetters}
        onChange={(on) => {
          onPrefs({ sheetLetters: on });
        }}
        hint="Escrito bajo el pentagrama, como lo haría tu profesor."
      />
      <KeyRow
        legend="Nombres de las notas"
        name="naming"
        value={prefs.naming}
        options={[
          ['letters', 'C D E'],
          ['solfege', 'Do Re Mi'],
        ]}
        onChange={(naming) => {
          onPrefs({ naming });
        }}
      />
      <div className="field">
        <span className="field-label">Tamaño de la partitura</span>
        <div className="zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Partitura más pequeña"
            disabled={prefs.sheetZoom <= smallest}
            onClick={() => {
              onPrefs({ sheetZoom: stepZoom(prefs.sheetZoom, -1) });
            }}
          >
            <MinusIcon />
          </button>
          <output>{percent(prefs.sheetZoom)}</output>
          <button
            type="button"
            className="icon-button"
            aria-label="Partitura más grande"
            disabled={prefs.sheetZoom >= largest}
            onClick={() => {
              onPrefs({ sheetZoom: stepZoom(prefs.sheetZoom, 1) });
            }}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
      <button type="button" className="key-quiet guide-link" onClick={onGuide}>
        <BookIcon />
        Qué significa cada símbolo
      </button>
    </section>
  );
}

interface WaitHudProps {
  state: PracticeState;
  expected: readonly number[];
  naming: PracticePrefs['naming'];
}

/** Wait mode at a glance: what to play now, in the colours of the keys, and the count so far. */
export function WaitHud({ state, expected, naming }: WaitHudProps) {
  const waiting = state.status === 'waiting';
  const sorted = [...expected].sort((a, b) => a - b);
  return (
    <p role="status" aria-label="Progreso del modo espera" className="hud">
      <span className="hud-message">
        {waiting && 'Toca las notas indicadas para continuar. '}
        {state.status === 'finished' && '¡Terminaste! '}
      </span>
      {waiting && (
        <span className="hud-chips">
          {sorted.map((pitch) => (
            <span
              key={pitch}
              className="chip"
              data-done={state.pressed.has(pitch)}
              style={{ '--chip': stageColor(pitch) } as CSSProperties}
            >
              {displayName(pitch, naming)}{' '}
            </span>
          ))}
        </span>
      )}
      <span className="hud-stats">
        {' '}
        Acordes acertados: {state.stats.chordsHit} · Fallos: {state.stats.mistakes} · Precisión:{' '}
        {Math.round(accuracy(state.stats) * 100)} %
      </span>
    </p>
  );
}

interface FollowHudProps {
  stats: FollowStats;
}

/** Follow mode at a glance: the song never waits, so only the tally is shown. */
export function FollowHud({ stats }: FollowHudProps) {
  return (
    <p role="status" aria-label="Progreso del retroceso automático" className="hud">
      <span className="hud-stats">
        Notas acertadas: {stats.hits} · Fallos: {stats.mistakes} · Retrocesos: {stats.rewinds} ·
        Precisión: {Math.round(followAccuracy(stats) * 100)} %
      </span>
    </p>
  );
}
