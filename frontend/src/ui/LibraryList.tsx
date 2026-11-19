import { useMemo, useState, type SyntheticEvent } from 'react';
import type { LibrarySong } from '../core/library/library';
import { viewLevel } from '../core/practice/level';
import { formatClock } from '../core/practice/timeline';
import { fingerprint } from '../render/fingerprint';
import { STAGE_COLORS } from '../render/notePalette';
import { PencilIcon, TrashIcon } from './icons';
import { progressLines } from './messages';

interface Props {
  songs: readonly LibrarySong[];
  onPractice: (song: LibrarySong) => void;
  onRename: (song: LibrarySong, title: string) => void;
  onRemove: (song: LibrarySong) => void;
}

const PRINT_W = 320;
const PRINT_H = 84;
const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

/** The songs kept in this browser, newest first, each with a miniature of its opening. */
export function LibraryList({ songs, onPractice, onRename, onRemove }: Props) {
  const sorted = useMemo(() => [...songs].sort((a, b) => b.savedAt - a.savedAt), [songs]);
  return (
    <section className="section" aria-label="Mi biblioteca">
      <div className="section-head">
        <h2>Mi biblioteca</h2>
        <p className="fine-print">Se guarda solo en este navegador.</p>
      </div>
      <ul className="library-grid">
        {sorted.map((song) => (
          <SongCard
            key={song.id}
            song={song}
            onPractice={onPractice}
            onRename={onRename}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}

function SongCard({
  song,
  onPractice,
  onRename,
  onRemove,
}: { song: LibrarySong } & Omit<Props, 'songs'>) {
  const [mode, setMode] = useState<'view' | 'rename' | 'remove'>('view');
  const [draft, setDraft] = useState(song.title);
  const bars = useMemo(
    () =>
      fingerprint(viewLevel(song.result, 'playable').notes, { width: PRINT_W, height: PRINT_H }),
    [song.result],
  );
  const lines = progressLines(song.progress);

  function saveTitle(event: SyntheticEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (title && title !== song.title) onRename(song, title);
    setMode('view');
  }

  return (
    <li className="song">
      <svg
        className="song-print"
        viewBox={`-6 -6 ${String(PRINT_W + 12)} ${String(PRINT_H + 12)}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={1.5}
            fill={STAGE_COLORS[bar.letter]}
          />
        ))}
      </svg>
      <div className="song-body">
        {mode === 'rename' ? (
          <form className="song-rename" onSubmit={saveTitle}>
            <label className="sr-only" htmlFor={`title-${song.id}`}>
              Nombre de la canción
            </label>
            <input
              id={`title-${song.id}`}
              type="text"
              value={draft}
              maxLength={80}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMode('view');
              }}
            />
            <div className="song-rename-actions">
              <button type="submit" className="key-primary">
                Guardar nombre
              </button>
              <button
                type="button"
                className="key-quiet"
                onClick={() => {
                  setMode('view');
                }}
              >
                Descartar
              </button>
            </div>
          </form>
        ) : (
          <h3 className="song-title">{song.title}</h3>
        )}
        <p className="song-meta num">
          {formatClock(song.result.meta.duration_s)} · guardada el {DATE.format(song.savedAt)}
        </p>
        {lines.map((line) => (
          <small key={line} className="progress-line" data-mastered={line.endsWith('dominada')}>
            {line}
          </small>
        ))}
        {lines.length === 0 && <small className="progress-line">Aún sin practicar</small>}
      </div>
      {mode === 'remove' && (
        <div className="song-confirm" role="group" aria-label="Confirmar el borrado">
          <p>¿Borrar «{song.title}» de este navegador? Se pierde también tu progreso.</p>
          <div className="song-confirm-actions">
            <button
              type="button"
              className="key-danger"
              onClick={() => {
                onRemove(song);
              }}
            >
              Sí, borrar
            </button>
            <button
              type="button"
              className="key-quiet"
              onClick={() => {
                setMode('view');
              }}
            >
              No
            </button>
          </div>
        </div>
      )}
      <div className="song-actions">
        <button
          type="button"
          className="key-primary"
          onClick={() => {
            onPractice(song);
          }}
        >
          Practicar
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Renombrar «${song.title}»`}
          onClick={() => {
            setDraft(song.title);
            setMode('rename');
          }}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Borrar «${song.title}»`}
          onClick={() => {
            setMode('remove');
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}
