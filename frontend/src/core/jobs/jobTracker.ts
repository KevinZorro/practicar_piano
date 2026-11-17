import { extractVideoId } from '../youtube/videoId';
import {
  ApiError,
  type JobResponse,
  type JobsApi,
  type ResultResponse,
} from '../../adapters/api/jobsApi';

export type TrackedStatus = JobResponse['status'] | 'lost';

export interface TrackedJob {
  readonly jobId: string;
  readonly status: TrackedStatus;
  readonly durationS: number;
  readonly position: number | null;
  readonly estimatedWaitS: number | null;
  readonly errorCode: string | null;
  /** True once the user has been told it finished, so a reload does not notify twice. */
  readonly notified: boolean;
  /** Id of the video the user pasted, kept only in this browser to show it while practicing. */
  readonly videoId?: string | null;
}

export interface PendingJobsStore {
  load(): TrackedJob[];
  save(jobs: readonly TrackedJob[]): void;
}

export interface Notifier {
  readonly jobDone: () => void;
}

const TERMINAL = new Set<TrackedStatus>(['done', 'failed', 'expired', 'lost']);

export function isTerminal(status: TrackedStatus): boolean {
  return TERMINAL.has(status);
}

type Listener = (jobs: readonly TrackedJob[]) => void;

/**
 * Follows the user's jobs on the server. Jobs survive closing the tab because the list is
 * kept in a `PendingJobsStore`; `resume` re-checks them when the app opens again.
 */
export class JobTracker {
  private jobs: TrackedJob[];
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly api: JobsApi,
    private readonly store: PendingJobsStore,
    private readonly notifier: Notifier,
  ) {
    this.jobs = store.load();
  }

  get current(): readonly TrackedJob[] {
    return this.jobs;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Throws `ApiError` (invalid link, queue full, rate limited, ...). */
  async submit(url: string): Promise<TrackedJob> {
    const created = await this.api.createJob(url);
    const job = { ...fromResponse(created, false), videoId: extractVideoId(url) };
    this.replace(job);
    return job;
  }

  /** Checks every job that is not finished. Network errors keep the last known state. */
  async refresh(): Promise<void> {
    const active = this.jobs.filter((j) => !isTerminal(j.status));
    await Promise.all(active.map((job) => this.refreshOne(job)));
  }

  /** Whether any job still needs polling. */
  get hasActiveJobs(): boolean {
    return this.jobs.some((j) => !isTerminal(j.status));
  }

  /**
   * Downloads the result, hands it to `keep` and only then tells the server to forget it:
   * the server keeps no copy, so a failed save must leave the result retrievable.
   */
  async collect(
    jobId: string,
    keep?: (result: ResultResponse, job: TrackedJob | undefined) => Promise<void>,
  ): Promise<ResultResponse> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    const result = await this.api.getResult(jobId);
    if (keep) await keep(result, job);
    await this.api.deleteJob(jobId).catch((error: unknown) => {
      // The result is in hand; a failed delete only means the server expires it later.
      if (!(error instanceof ApiError)) throw error;
    });
    this.remove(jobId);
    return result;
  }

  /** Forget a job (also cancels it on the server when it is still waiting). */
  async dismiss(jobId: string): Promise<void> {
    await this.api.deleteJob(jobId).catch((error: unknown) => {
      if (!(error instanceof ApiError)) throw error;
    });
    this.remove(jobId);
  }

  private async refreshOne(job: TrackedJob): Promise<void> {
    try {
      const response = await this.api.getJob(job.jobId);
      const next = { ...fromResponse(response, job.notified), videoId: job.videoId ?? null };
      if (next.status === 'done' && !job.notified) {
        this.notifier.jobDone();
        this.replace({ ...next, notified: true });
      } else {
        this.replace(next);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'job_not_found') {
        this.replace({ ...job, status: 'lost', position: null, estimatedWaitS: null });
      }
      // other errors (network, 5xx): keep the last state and try again on the next refresh
    }
  }

  private replace(job: TrackedJob): void {
    const index = this.jobs.findIndex((j) => j.jobId === job.jobId);
    this.jobs =
      index === -1 ? [...this.jobs, job] : this.jobs.map((j, i) => (i === index ? job : j));
    this.commit();
  }

  private remove(jobId: string): void {
    this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
    this.commit();
  }

  private commit(): void {
    this.store.save(this.jobs);
    for (const listener of this.listeners) listener(this.jobs);
  }
}

function fromResponse(response: JobResponse, notified: boolean): TrackedJob {
  return {
    jobId: response.job_id,
    status: response.status,
    durationS: response.duration_s,
    position: response.position ?? null,
    estimatedWaitS: response.estimated_wait_s ?? null,
    errorCode: response.error_code ?? null,
    notified,
  };
}
