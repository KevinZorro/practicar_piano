import { useEffect, useRef, useState } from 'react';
import type { SheetAids } from '../adapters/sheet/osmdSheet';
import type { LevelView } from '../core/practice/level';

interface Props {
  score: LevelView['score'];
  aids: SheetAids;
  /** Song time in seconds; read on every frame by the parent through `registerSeek`. */
  registerSeek: (seek: ((timeS: number) => void) | null) => void;
}

interface Drawn {
  setAids(aids: SheetAids): Promise<void>;
  clear(): void;
}

/** The sheet music with a cursor that follows the song. Layout needs a real browser. */
export function SheetPane({ score, aids, registerSeek }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<Drawn | null>(null);
  const aidsRef = useRef(aids);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!score || !container) return;
    const state: { cancelled: boolean; sheet: Drawn | null } = { cancelled: false, sheet: null };
    setFailed(false);
    setReady(false);
    void (async () => {
      try {
        // Loaded on demand: the renderer is large and only the practice screen needs it.
        const { OsmdSheet } = await import('../adapters/sheet/osmdSheet');
        const sheet = new OsmdSheet(container, scroller.current);
        state.sheet = sheet;
        const first = score.measures[0]?.start_s ?? 0;
        await sheet.load(score.musicxml, score.tempo_bpm, first, aidsRef.current);
        if (state.cancelled) {
          sheet.clear();
          return;
        }
        sheetRef.current = sheet;
        setReady(true);
        registerSeek((timeS) => {
          sheet.seek(timeS);
        });
      } catch {
        if (!state.cancelled) setFailed(true);
      }
    })();
    return () => {
      state.cancelled = true;
      sheetRef.current = null;
      registerSeek(null);
      state.sheet?.clear();
      container.replaceChildren();
    };
  }, [score, registerSeek]);

  useEffect(() => {
    aidsRef.current = aids;
    if (!ready) return;
    void sheetRef.current?.setAids(aids).catch(() => {
      setFailed(true);
    });
  }, [aids, ready]);

  if (!score) return <p className="sheet-empty">Este nivel no tiene partitura.</p>;
  return (
    <>
      {failed && <p role="alert">No se pudo dibujar la partitura.</p>}
      <div ref={scroller} className="sheet-scroll">
        <div ref={host} className="sheet" aria-label="Partitura" />
      </div>
    </>
  );
}
