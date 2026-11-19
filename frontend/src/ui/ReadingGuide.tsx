import { useEffect, useId, useRef, useState } from 'react';
import { displayName } from '../core/notes/names';
import type { NamingStyle } from '../core/practice/prefs';
import { GUIDE_EXAMPLES, guideScore, type GuideExampleName } from '../core/sheet/guideScores';
import { CloseIcon } from './icons';
import { MiniKeyboard } from './MiniKeyboard';

interface Props {
  naming: NamingStyle;
  onClose: () => void;
}

const MIDDLE_C = 60;
const TREBLE_LINES = [64, 67, 71, 74, 77];
const TREBLE_SPACES = [65, 69, 72, 76];
const BASS_LINES = [43, 47, 50, 53, 57];
const BASS_SPACES = [45, 48, 52, 55];

function names(pitches: readonly number[], naming: NamingStyle): string {
  return pitches.map((p) => displayName(p, naming)).join(', ');
}

/** One example drawn by the same renderer as the practice score, loaded only when shown. */
function Snippet({
  example,
  naming,
  caption,
}: {
  example: GuideExampleName;
  naming: NamingStyle;
  caption: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const state: { cancelled: boolean; clear: (() => void) | null } = {
      cancelled: false,
      clear: null,
    };
    void (async () => {
      try {
        const { drawSnippet } = await import('../adapters/sheet/osmdSnippet');
        const score = GUIDE_EXAMPLES[example];
        const clear = await drawSnippet(element, guideScore(score), {
          naming,
          showTime: score.time !== null,
          zoom: 0.8,
        });
        if (state.cancelled) clear();
        else state.clear = clear;
      } catch {
        if (!state.cancelled) setFailed(true);
      }
    })();
    return () => {
      state.cancelled = true;
      state.clear?.();
      element.replaceChildren();
    };
  }, [example, naming]);

  return (
    <figure className="guide-figure">
      <div ref={host} className="snippet" role="img" aria-label={caption} />
      {failed && <p className="fine-print">No se pudo dibujar este ejemplo.</p>}
      <figcaption className="snippet-caption">{caption}</figcaption>
    </figure>
  );
}

/**
 * What every symbol of the score means, shown with the same colours and names as the practice
 * screen. A side panel: the song stays where it was while the learner reads.
 */
export function ReadingGuide({ naming, onClose }: Props) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const middleC = displayName(MIDDLE_C, naming);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="guide" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="guide-head">
        <h2 id={titleId}>Guía de lectura</h2>
        <button
          ref={closeButton}
          type="button"
          className="key-quiet icon-button"
          aria-label="Cerrar la guía"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="guide-body">
        <section className="guide-section">
          <h3>De las letras al pentagrama</h3>
          <p>
            La partitura dice lo mismo que las notas que caen: qué tecla tocar, cuándo y cuánto
            tiempo. Las notas se escriben sobre cinco líneas, el <strong>pentagrama</strong>: cuanto
            más aguda es una nota, más arriba va, en una línea o en el espacio entre dos.
          </p>
          <p>
            Cada nota conserva su color en todas partes: {displayName(60, naming)} es rojo en la
            tecla, en la barra que cae y en la partitura.
          </p>
          <MiniKeyboard
            low={48}
            high={72}
            naming={naming}
            mark={{ pitch: MIDDLE_C, caption: `${middleC} central` }}
            label={`Teclado de dos octavas: cada tecla blanca con el color y el nombre de su nota, y el ${middleC} central marcado.`}
          />
          <p>
            En piano se leen dos pentagramas a la vez: el de arriba suele ser la mano derecha y el
            de abajo la izquierda.
          </p>
        </section>

        <section className="guide-section">
          <h3>Clave de sol: la mano derecha</h3>
          <Snippet
            example="treble"
            naming={naming}
            caption={`Escala de ${middleC} central hacia arriba en clave de sol.`}
          />
          <p>
            La clave de sol se enrosca en la segunda línea desde abajo: ahí está{' '}
            {displayName(67, naming)}. El {middleC} central se escribe en una rayita bajo el
            pentagrama.
          </p>
          <p>
            Para ubicarte: las líneas, de abajo arriba, son{' '}
            <strong>{names(TREBLE_LINES, naming)}</strong>; los espacios,{' '}
            <strong>{names(TREBLE_SPACES, naming)}</strong>.
          </p>
        </section>

        <section className="guide-section">
          <h3>Clave de fa: la mano izquierda</h3>
          <Snippet
            example="bass"
            naming={naming}
            caption={`Escala que termina en el ${middleC} central, en clave de fa.`}
          />
          <p>
            Los dos puntos de la clave de fa rodean la cuarta línea: ahí está{' '}
            {displayName(53, naming)}. Aquí el {middleC} central queda en una rayita sobre el
            pentagrama: es la misma tecla que en la clave de sol.
          </p>
          <p>
            Las líneas, de abajo arriba, son <strong>{names(BASS_LINES, naming)}</strong>; los
            espacios, <strong>{names(BASS_SPACES, naming)}</strong>.
          </p>
        </section>

        <section className="guide-section">
          <h3>Cuánto dura cada nota</h3>
          <Snippet
            example="values"
            naming={naming}
            caption="Una redonda, dos blancas, cuatro negras y ocho corcheas: cada compás dura lo mismo."
          />
          <p>
            La forma de la nota dice cuánto tiempo mantener la tecla. En las notas que caen se ve
            igual: cuanto más larga la barra, más dura la nota.
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">Figura</th>
                <th scope="col">Cómo es</th>
                <th scope="col">Tiempos en 4/4</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Redonda</td>
                <td>Óvalo hueco, sin plica</td>
                <td>4</td>
              </tr>
              <tr>
                <td>Blanca</td>
                <td>Hueca, con plica</td>
                <td>2</td>
              </tr>
              <tr>
                <td>Negra</td>
                <td>Rellena, con plica</td>
                <td>1</td>
              </tr>
              <tr>
                <td>Corchea</td>
                <td>Con un corchete o una barra</td>
                <td>½</td>
              </tr>
              <tr>
                <td>Semicorchea</td>
                <td>Con dos corchetes o dos barras</td>
                <td>¼</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="guide-section">
          <h3>Silencios</h3>
          <Snippet
            example="rests"
            naming={naming}
            caption="Silencio de redonda; después, de blanca, de negra y dos de corchea."
          />
          <p>
            Un silencio es tiempo sin tocar. Cada figura tiene el suyo y dura lo mismo que ella.
          </p>
        </section>

        <section className="guide-section">
          <h3>Puntillo y ligadura</h3>
          <Snippet
            example="dotsAndTies"
            naming={naming}
            caption="Una blanca con puntillo y, al final, una nota ligada sobre la barra de compás."
          />
          <p>
            El <strong>puntillo</strong> alarga la nota la mitad de lo que dura: una blanca con
            puntillo dura 3 tiempos. La <strong>ligadura</strong> une dos notas iguales: se toca una
            vez y se mantiene. Por eso la segunda no lleva nombre.
          </p>
        </section>

        <section className="guide-section">
          <h3>Sostenido, bemol y becuadro</h3>
          <Snippet
            example="accidentals"
            naming={naming}
            caption="Una nota con sostenido, el becuadro que la devuelve y una nota con bemol."
          />
          <p>
            El <strong>sostenido ♯</strong> sube la nota a la tecla negra de su derecha; el{' '}
            <strong>bemol ♭</strong> la baja a la de su izquierda; el <strong>becuadro ♮</strong> la
            devuelve a la tecla blanca. Una alteración vale hasta el final del compás.
          </p>
          <p>
            Una nota alterada conserva el color de su letra: {displayName(66, naming)} es verde como{' '}
            {displayName(65, naming)}.
          </p>
        </section>

        <section className="guide-section">
          <h3>Compás y armadura</h3>
          <Snippet
            example="meter"
            naming={naming}
            caption="Compás de 3/4 con un sostenido en la armadura."
          />
          <p>
            Las líneas verticales dividen la música en <strong>compases</strong>. La fracción del
            principio dice cuántos tiempos tiene cada uno: 3/4 son tres negras, 4/4 son cuatro. En
            la práctica, el número de compás junto a la línea de tiempo te dice por dónde vas.
          </p>
          <p>
            Los sostenidos o bemoles junto a la clave forman la <strong>armadura</strong> y valen
            para toda la canción. Aquí cada {displayName(65, naming)} se toca como{' '}
            {displayName(66, naming)}, y su nombre ya lo dice.
          </p>
        </section>

        <section className="guide-section">
          <h3>Acordes</h3>
          <Snippet
            example="chords"
            naming={naming}
            caption="Tres acordes: notas escritas una sobre otra."
          />
          <p>
            Las notas escritas una encima de otra suenan a la vez. Sus nombres se leen de la más
            aguda a la más grave, en el mismo orden que en el pentagrama.
          </p>
        </section>

        <section className="guide-section">
          <h3>Cómo practicar la lectura</h3>
          <ul className="guide-list">
            <li>Empieza con la vista Ambas, con colores y nombres.</li>
            <li>Cuando reconozcas las notas, apaga los colores; después, los nombres.</li>
            <li>Usa el modo espera con una sola mano y baja la velocidad: la canción te espera.</li>
            <li>
              Mira la partitura antes que el teclado: la tecla se ilumina con el mismo color para
              confirmarte que acertaste.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
