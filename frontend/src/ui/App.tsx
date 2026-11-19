import { useCallback, useEffect, useRef, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import type { MicInput } from '../adapters/audio/micInput';
import type { MidiInput } from '../adapters/midi/midiInput';
import type { NotificationApi, PermissionState } from '../adapters/notifications/browserNotifier';
import {
  currentPermission,
  requestNotificationPermission,
} from '../adapters/notifications/browserNotifier';
import { createMemoryPrefsStore, type PrefsStore } from '../adapters/storage/localPrefs';
import type { JobTracker } from '../core/jobs/jobTracker';
import type { LibrarySong, SongLibrary } from '../core/library/library';
import { recordAttempt, type Attempt } from '../core/library/library';
import type { PracticePrefs } from '../core/practice/prefs';
import { AlertIcon, BookIcon, InfoIcon } from './icons';
import { JobList } from './JobList';
import { LibraryList } from './LibraryList';
import { LinkForm } from './LinkForm';
import { LogoMark } from './Logo';
import { MiniKeyboard } from './MiniKeyboard';
import { PracticeScreen, type VideoFactory } from './PracticeScreen';
import { ReadingGuide } from './ReadingGuide';
import { useTrackedJobs } from './useTrackedJobs';

interface Props {
  tracker: JobTracker;
  notifications: NotificationApi | null;
  /** Saved songs; null when the browser has no IndexedDB. */
  library?: SongLibrary | null;
  /** Downloads a finished job into the library and returns the saved song. */
  openJob?: (jobId: string) => Promise<LibrarySong | null>;
  /** Where the reading choices are kept between visits. */
  prefsStore?: PrefsStore;
  createPiano?: () => TonePiano;
  createMidi?: () => MidiInput;
  createMic?: () => MicInput;
  createVideo?: VideoFactory;
}

export function App({
  tracker,
  notifications,
  library = null,
  openJob,
  prefsStore,
  createPiano,
  createMidi,
  createMic,
  createVideo,
}: Props) {
  const jobs = useTrackedJobs(tracker);
  const [store] = useState(() => prefsStore ?? createMemoryPrefsStore());
  const [prefs, setPrefs] = useState(() => store.load());
  const [song, setSong] = useState<LibrarySong | null>(null);
  const [saved, setSaved] = useState<LibrarySong[]>([]);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>(currentPermission(notifications));
  const [guideOpen, setGuideOpen] = useState(false);
  const guideOpener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void library?.list().then((songs) => {
      if (active) setSaved(songs);
    });
    return () => {
      active = false;
    };
  }, [library, song, revision]);

  // The practice screen is the instrument: always the dark case, whatever the system theme.
  useEffect(() => {
    if (!song) return;
    document.documentElement.dataset['screen'] = 'practice';
    return () => {
      delete document.documentElement.dataset['screen'];
    };
  }, [song]);

  const updatePrefs = useCallback(
    (patch: Partial<PracticePrefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...patch };
        store.save(next);
        return next;
      });
    },
    [store],
  );

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideOpener.current?.focus();
  }, []);

  async function open(jobId: string) {
    setMessage(null);
    try {
      const opened = await openJob?.(jobId);
      if (opened) setSong(opened);
      else setMessage('No se pudo guardar la canción en este navegador. Inténtalo de nuevo.');
    } catch {
      setMessage('No se pudo descargar la canción. Inténtalo de nuevo.');
    }
  }

  async function keepAttempt(attempt: Attempt) {
    if (!song) return;
    const updated = recordAttempt(song, attempt);
    setSong(updated);
    try {
      await library?.put(updated);
    } catch {
      setMessage('No se pudo guardar tu progreso en este navegador.');
    }
  }

  async function rename(target: LibrarySong, title: string) {
    try {
      await library?.put({ ...target, title });
    } catch {
      setMessage('No se pudo cambiar el nombre en este navegador.');
    }
    setRevision((r) => r + 1);
  }

  async function remove(target: LibrarySong) {
    try {
      await library?.remove(target.id);
    } catch {
      setMessage('No se pudo borrar la canción de este navegador.');
    }
    setRevision((r) => r + 1);
  }

  async function submit(url: string) {
    await tracker.submit(url);
    setPermission(await requestNotificationPermission(notifications));
  }

  if (song) {
    return (
      <PracticeScreen
        song={song}
        prefs={prefs}
        onPrefs={updatePrefs}
        createPiano={createPiano}
        createMidi={createMidi}
        createMic={createMic}
        createVideo={createVideo}
        onAttempt={(attempt) => void keepAttempt(attempt)}
        onBack={() => {
          setSong(null);
        }}
      />
    );
  }

  const nothingYet = jobs.length === 0 && saved.length === 0;
  return (
    <div className="home">
      <header className="topbar">
        <h1 className="wordmark">
          <LogoMark />
          Notacaida
        </h1>
        <button
          ref={guideOpener}
          type="button"
          className="key-quiet"
          aria-expanded={guideOpen}
          onClick={() => {
            setGuideOpen(true);
          }}
        >
          <BookIcon />
          Guía de lectura
        </button>
      </header>

      <main className="home-main">
        <div className="home-flow">
          <section className="intake" aria-labelledby="intake-title">
            <h2 id="intake-title">
              Practica piano con tu teclado a partir de un cover de YouTube.
            </h2>
            <p className="intake-lead">
              Pega el enlace de un cover de piano. Notacaida escucha el audio y te prepara las notas
              que caen y la partitura para tocarla a tu ritmo.
            </p>
            <LinkForm onSubmit={submit} />
            <p className="fine-print">
              Usa solo enlaces de audio que tengas derecho a usar. La partitura es una transcripción
              automática aproximada.
            </p>
            {permission === 'denied' && (
              <p role="status" className="notice">
                <InfoIcon />
                <span>
                  Las notificaciones están bloqueadas: no te avisaremos al terminar. Vuelve a esta
                  página para ver el estado.
                </span>
              </p>
            )}
            {message && (
              <p role="alert" className="notice">
                <AlertIcon />
                <span>{message}</span>
              </p>
            )}
          </section>

          {(jobs.length > 0 || nothingYet) && (
            <section className="section" aria-labelledby="queue-title">
              <div className="section-head">
                <h2 id="queue-title">En proceso</h2>
              </div>
              {jobs.length === 0 ? (
                <p className="empty">Aún no has enviado ninguna canción.</p>
              ) : (
                <JobList
                  jobs={jobs}
                  onOpen={(id) => void open(id)}
                  onDismiss={(id) => void tracker.dismiss(id)}
                />
              )}
            </section>
          )}

          {saved.length > 0 && (
            <LibraryList
              songs={saved}
              onPractice={setSong}
              onRename={(target, title) => void rename(target, title)}
              onRemove={(target) => void remove(target)}
            />
          )}
        </div>

        <section className="primer" aria-label="Cómo funciona">
          <h2>Cómo funciona</h2>
          <ol className="steps">
            <li>
              <span>
                <strong>Pega el enlace</strong>
                De un cover de piano de YouTube, de hasta 10 minutos.
              </span>
            </li>
            <li>
              <span>
                <strong>Espera unos minutos</strong>
                Se transcribe en el servidor. Puedes seguir en otra pestaña: te avisamos al
                terminar.
              </span>
            </li>
            <li>
              <span>
                <strong>Practica</strong>
                Con notas que caen, partitura sincronizada y modo espera, con teclado USB o con el
                micrófono.
              </span>
            </li>
          </ol>
          <div className="legend">
            <h3>Cada nota tiene su color</h3>
            <MiniKeyboard
              low={60}
              high={71}
              naming={prefs.naming}
              dual
              label="Una octava del teclado: Do rojo, Re naranja, Mi amarillo, Fa verde, Sol turquesa, La azul y Si violeta."
            />
            <p className="fine-print">
              Como las barras de un metalófono: el mismo color en la tecla, en la nota que cae y en
              la partitura.
            </p>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <a href="/terminos.html">Términos de uso y reclamaciones</a>
        <span>Gratis y sin cuenta. Tus canciones se quedan en este navegador.</span>
      </footer>

      {guideOpen && <ReadingGuide naming={prefs.naming} onClose={closeGuide} />}
    </div>
  );
}
