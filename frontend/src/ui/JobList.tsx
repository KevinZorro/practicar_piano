import type { TrackedJob } from '../core/jobs/jobTracker';
import { errorMessage, formatDuration } from './messages';

interface Props {
  jobs: readonly TrackedJob[];
  onOpen: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

export function JobList({ jobs, onOpen, onDismiss }: Props) {
  if (jobs.length === 0) return <p>Aún no has enviado ninguna canción.</p>;
  return (
    <ul aria-label="Tus canciones">
      {jobs.map((job) => (
        <li key={job.jobId}>
          <JobStatusText job={job} />{' '}
          {job.status === 'done' && (
            <button
              type="button"
              onClick={() => {
                onOpen(job.jobId);
              }}
            >
              Practicar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onDismiss(job.jobId);
            }}
          >
            {job.status === 'queued' ? 'Cancelar' : 'Quitar'}
          </button>
        </li>
      ))}
    </ul>
  );
}

function JobStatusText({ job }: { job: TrackedJob }) {
  switch (job.status) {
    case 'queued':
      return (
        <span>
          En la cola, posición {job.position ?? '?'}
          {job.estimatedWaitS !== null &&
            ` · espera aproximada ${formatDuration(job.estimatedWaitS)}`}
        </span>
      );
    case 'downloading':
      return <span>Descargando el audio…</span>;
    case 'transcribing':
      return <span>Transcribiendo (puede tardar unos minutos)…</span>;
    case 'scoring':
      return <span>Preparando la partitura…</span>;
    case 'done':
      return <span>¡Lista!</span>;
    case 'failed':
      return <span>{errorMessage(job.errorCode ?? 'internal_error')}</span>;
    case 'expired':
      return <span>El resultado caducó antes de recogerlo. Envía el enlace otra vez.</span>;
    case 'lost':
      return (
        <span>
          El servidor ya no recuerda esta canción (se reinició). Envía el enlace otra vez.
        </span>
      );
  }
}
