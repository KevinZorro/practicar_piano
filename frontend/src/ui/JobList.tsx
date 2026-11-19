import type { TrackedJob } from '../core/jobs/jobTracker';
import { formatClock } from '../core/practice/timeline';
import { errorMessage, formatDuration } from './messages';

interface Props {
  jobs: readonly TrackedJob[];
  onOpen: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

const STEPS = ['Cola', 'Audio', 'Notas', 'Partitura'] as const;
const STEP_OF: Partial<Record<TrackedJob['status'], number>> = {
  queued: 0,
  downloading: 1,
  transcribing: 2,
  scoring: 3,
  done: STEPS.length,
};

/** Songs being processed on the server, each with the stage it has reached. */
export function JobList({ jobs, onOpen, onDismiss }: Props) {
  return (
    <ul className="jobs" aria-label="Tus canciones">
      {jobs.map((job) => {
        const step = STEP_OF[job.status];
        const state = step === undefined ? 'failed' : step === STEPS.length ? 'done' : 'working';
        return (
          <li key={job.jobId} className="job" data-state={state}>
            {step !== undefined && <JobSteps current={step} />}
            <p className="job-status">
              <JobStatusText job={job} />
            </p>
            {job.durationS > 0 && (
              <p className="fine-print num">Audio de {formatClock(job.durationS)}</p>
            )}
            <div className="job-actions">
              {job.status === 'done' && (
                <button
                  type="button"
                  className="key-primary"
                  onClick={() => {
                    onOpen(job.jobId);
                  }}
                >
                  Practicar
                </button>
              )}
              <button
                type="button"
                className={job.status === 'done' ? 'key-quiet' : undefined}
                onClick={() => {
                  onDismiss(job.jobId);
                }}
              >
                {job.status === 'queued' ? 'Cancelar' : 'Quitar'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The four stages as a row of keys that light up; the status text says the same in words. */
function JobSteps({ current }: { current: number }) {
  return (
    <div className="job-steps" aria-hidden="true">
      {STEPS.map((label, index) => (
        <span
          key={label}
          className="job-step"
          data-step={index < current ? 'done' : index === current ? 'now' : 'next'}
        >
          {label}
        </span>
      ))}
    </div>
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
