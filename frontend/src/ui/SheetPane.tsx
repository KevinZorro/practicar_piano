import { useEffect, useRef, useState } from 'react';
import type { LevelView } from '../core/practice/level';

interface Props {
  score: LevelView['score'];
  /** Song time in seconds; read on every frame by the parent through `registerSeek`. */
  registerSeek: (seek: ((timeS: number) => void) | null) => void;
}

/** The sheet music with a cursor that follows the song. Layout needs a real browser. */
export function SheetPane({ score, registerSeek }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!score || !container) return;
    const state: { cancelled: boolean; sheet: { clear(): void } | null } = {
      cancelled: false,
      sheet: null,
    };
    setFailed(false);
    void (async () => {
      try {
        // Loaded on demand: the renderer is large and only the practice screen needs it.
        const { OsmdSheet } = await import('../adapters/sheet/osmdSheet');
        const sheet = new OsmdSheet(container, scroller.current);
        state.sheet = sheet;
        const first = score.measures[0]?.start_s ?? 0;
        await sheet.load(score.musicxml, score.tempo_bpm, first);
        if (state.cancelled) {
          sheet.clear();
          return;
        }
        registerSeek((timeS) => {
          sheet.seek(timeS);
        });
      } catch {
        if (!state.cancelled) setFailed(true);
      }
    })();
    return () => {
      state.cancelled = true;
      registerSeek(null);
      state.sheet?.clear();
      container.replaceChildren();
    };
  }, [score, registerSeek]);

  if (!score) return <p>Este nivel no tiene partitura.</p>;
  return (
    <>
      {failed && <p role="alert">No se pudo dibujar la partitura.</p>}
      <div ref={scroller} className="sheet-scroll">
        <div ref={host} className="sheet" aria-label="Partitura" />
      </div>
    </>
  );
}
