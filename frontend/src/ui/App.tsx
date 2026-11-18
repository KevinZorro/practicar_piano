import { useEffect, useState } from 'react';
import type { TonePiano } from '../adapters/audio/tonePiano';
import type { NotificationApi, PermissionState } from '../adapters/notifications/browserNotifier';
import {
  currentPermission,
  requestNotificationPermission,
} from '../adapters/notifications/browserNotifier';
import type { JobTracker } from '../core/jobs/jobTracker';
import type { LibrarySong, SongLibrary } from '../core/library/library';
import { JobList } from './JobList';
import { LinkForm } from './LinkForm';
import type { MicInput } from '../adapters/audio/micInput';
import type { MidiInput } from '../adapters/midi/midiInput';
import { PracticeScreen, type VideoFactory } from './PracticeScreen';
import { recordAttempt, type Attempt } from '../core/library/library';
import { progressLines } from './messages';
import { useTrackedJobs } from './useTrackedJobs';

interface Props {
  tracker: JobTracker;
  notifications: NotificationApi | null;
  /** Saved songs; null when the browser has no IndexedDB. */
  library?: SongLibrary | null;
  /** Downloads a finished job into the library and returns the saved song. */
  openJob?: (jobId: string) => Promise<LibrarySong | null>;
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
  createPiano,
  createMidi,
  createMic,
  createVideo,
}: Props) {
  const jobs = useTrackedJobs(tracker);
  const [song, setSong] = useState<LibrarySong | null>(null);
  const [saved, setSaved] = useState<LibrarySong[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>(currentPermission(notifications));

  useEffect(() => {
    let active = true;
    void library?.list().then((songs) => {
      if (active) setSaved(songs);
    });
    return () => {
      active = false;
    };
  }, [library, song]);

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

  async function submit(url: string) {
    await tracker.submit(url);
    setPermission(await requestNotificationPermission(notifications));
  }

  if (song) {
    return (
      <main>
        <PracticeScreen
          song={song}
          createPiano={createPiano}
          createMidi={createMidi}
          createMic={createMic}
          createVideo={createVideo}
          onAttempt={(attempt) => void keepAttempt(attempt)}
          onBack={() => {
            setSong(null);
          }}
        />
      </main>
    );
  }

  return (
    <main>
      <h1>Pianola</h1>
      <p>Practica piano con tu teclado a partir de un cover de YouTube.</p>
      <LinkForm onSubmit={submit} />
      <p className="fine-print">
        Usa solo enlaces de audio que tengas derecho a usar. La partitura es una transcripción
        automática aproximada.
      </p>
      {permission === 'denied' && (
        <p role="status">
          Las notificaciones están bloqueadas: no te avisaremos al terminar. Vuelve a esta página
          para ver el estado.
        </p>
      )}
      <JobList
        jobs={jobs}
        onOpen={(id) => void open(id)}
        onDismiss={(id) => void tracker.dismiss(id)}
      />
      {message && <p role="alert">{message}</p>}
      {saved.length > 0 && (
        <section aria-label="Mi biblioteca">
          <h2>Mi biblioteca</h2>
          <ul>
            {saved.map((s) => (
              <li key={s.id}>
                <span>
                  {s.title}
                  {progressLines(s.progress).map((line) => (
                    <small key={line} className="progress-line">
                      {line}
                    </small>
                  ))}
                </span>{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSong(s);
                  }}
                >
                  Practicar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="fine-print">
        <a href="/terminos.html">Términos de uso y reclamaciones</a>
      </footer>
    </main>
  );
}
