import {
  ApiError,
  type JobResponse,
  type JobsApi,
  type ResultResponse,
} from '../../adapters/api/jobsApi';
import { JobTracker, type Notifier, type PendingJobsStore, type TrackedJob } from './jobTracker';

function response(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    job_id: 'j1',
    status: 'queued',
    duration_s: 200,
    position: 1,
    estimated_wait_s: 380,
    ...overrides,
  };
}

class FakeApi implements JobsApi {
  jobs = new Map<string, JobResponse>();
  deleted: string[] = [];
  failure: ApiError | null = null;
  deleteFailure: ApiError | null = null;
  createJob = vi.fn((): Promise<JobResponse> => {
    if (this.failure) return Promise.reject(this.failure);
    const job = response();
    this.jobs.set(job.job_id, job);
    return Promise.resolve(job);
  });
  getJob(jobId: string): Promise<JobResponse> {
    if (this.failure) return Promise.reject(this.failure);
    const job = this.jobs.get(jobId);
    return job ? Promise.resolve(job) : Promise.reject(new ApiError('job_not_found', 404));
  }
  getResult(): Promise<ResultResponse> {
    return Promise.resolve({
      meta: { duration_s: 10, tempo_bpm: 120, tempo_confidence: 'high' },
      levels: [],
    });
  }
  deleteJob(jobId: string): Promise<void> {
    if (this.deleteFailure) return Promise.reject(this.deleteFailure);
    this.deleted.push(jobId);
    this.jobs.delete(jobId);
    return Promise.resolve();
  }
}

class MemoryStore implements PendingJobsStore {
  saved: TrackedJob[] = [];
  constructor(initial: TrackedJob[] = []) {
    this.saved = initial;
  }
  load(): TrackedJob[] {
    return this.saved;
  }
  save(jobs: readonly TrackedJob[]): void {
    this.saved = [...jobs];
  }
}

function setup(initial: TrackedJob[] = []) {
  const api = new FakeApi();
  const store = new MemoryStore(initial);
  const notifier: Notifier = { jobDone: vi.fn() };
  return { api, store, notifier, tracker: new JobTracker(api, store, notifier) };
}

describe('JobTracker', () => {
  it('stores a submitted job so it survives closing the tab', async () => {
    const { tracker, store } = setup();
    await tracker.submit('https://youtu.be/x');
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ jobId: 'j1', status: 'queued', position: 1 });
  });

  it('keeps only the video id of the link and hands it over when collecting', async () => {
    const { tracker, api, store } = setup();
    await tracker.submit('https://youtu.be/dQw4w9WgXcQ?t=5');
    api.jobs.set('j1', response({ status: 'done', position: null, estimated_wait_s: null }));
    await tracker.refresh();
    expect(store.saved[0]?.videoId).toBe('dQw4w9WgXcQ');
    expect(JSON.stringify(store.saved)).not.toContain('youtu.be');
    const keep = vi.fn(() => Promise.resolve());
    await tracker.collect('j1', keep);
    expect(keep).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: 'dQw4w9WgXcQ' }),
    );
  });

  it('propagates API errors from submit without storing anything', async () => {
    const { tracker, api, store } = setup();
    api.failure = new ApiError('queue_full', 503, 300);
    await expect(tracker.submit('x')).rejects.toMatchObject({
      code: 'queue_full',
      retryAfterS: 300,
    });
    expect(store.saved).toEqual([]);
  });

  it('follows the queue position and notifies once when the job is done', async () => {
    const { tracker, api, notifier } = setup();
    await tracker.submit('x');
    api.jobs.set('j1', response({ position: 0, status: 'transcribing', estimated_wait_s: 0 }));
    await tracker.refresh();
    expect(tracker.current[0]).toMatchObject({ status: 'transcribing', position: 0 });

    api.jobs.set('j1', response({ status: 'done', position: null, estimated_wait_s: null }));
    await tracker.refresh();
    await tracker.refresh();
    expect(tracker.current[0]?.status).toBe('done');
    expect(notifier.jobDone).toHaveBeenCalledTimes(1);
  });

  it('recovers a job after reopening: resumes polling and still notifies once', async () => {
    const first = setup();
    await first.tracker.submit('x');
    const reopened = setup(first.store.saved);
    reopened.api.jobs.set('j1', response({ status: 'done', position: null }));
    expect(reopened.tracker.hasActiveJobs).toBe(true);
    await reopened.tracker.refresh();
    expect(reopened.tracker.current[0]?.status).toBe('done');
    expect(reopened.notifier.jobDone).toHaveBeenCalledTimes(1);
    expect(reopened.tracker.hasActiveJobs).toBe(false);
  });

  it('does not notify again for a job already notified before a reload', async () => {
    const { tracker, api, notifier } = setup([
      {
        jobId: 'j1',
        status: 'queued',
        durationS: 1,
        position: 1,
        estimatedWaitS: 1,
        errorCode: null,
        notified: true,
      },
    ]);
    api.jobs.set('j1', response({ status: 'done' }));
    await tracker.refresh();
    expect(notifier.jobDone).not.toHaveBeenCalled();
  });

  it('marks a job as lost when the server no longer knows it (restart or expiry)', async () => {
    const { tracker } = setup();
    await tracker.submit('x');
    await tracker.refresh(); // FakeApi still has it
    const lost = setup(tracker.current as TrackedJob[]);
    await lost.tracker.refresh(); // new FakeApi is empty: 404
    expect(lost.tracker.current[0]?.status).toBe('lost');
    expect(lost.tracker.hasActiveJobs).toBe(false);
  });

  it('keeps the last state on network errors', async () => {
    const { tracker, api } = setup();
    await tracker.submit('x');
    api.failure = new ApiError('network', 0);
    await tracker.refresh();
    expect(tracker.current[0]?.status).toBe('queued');
  });

  it('reports a failed job with its error code', async () => {
    const { tracker, api } = setup();
    await tracker.submit('x');
    api.jobs.set(
      'j1',
      response({ status: 'failed', error_code: 'download_failed', position: null }),
    );
    await tracker.refresh();
    expect(tracker.current[0]).toMatchObject({ status: 'failed', errorCode: 'download_failed' });
  });

  it('collect returns the result, deletes it on the server and forgets the job', async () => {
    const { tracker, api, store } = setup();
    await tracker.submit('x');
    const result = await tracker.collect('j1');
    expect(result.meta.duration_s).toBe(10);
    expect(api.deleted).toEqual(['j1']);
    expect(store.saved).toEqual([]);
  });

  it('collect saves the result before deleting it on the server', async () => {
    const { tracker, api } = setup();
    await tracker.submit('x');
    const order: string[] = [];
    await tracker.collect('j1', () => {
      order.push(`saved (deleted so far: ${String(api.deleted.length)})`);
      return Promise.resolve();
    });
    expect(order).toEqual(['saved (deleted so far: 0)']);
    expect(api.deleted).toEqual(['j1']);
  });

  it('collect keeps the job on the server when saving fails', async () => {
    const { tracker, api } = setup();
    await tracker.submit('x');
    await expect(tracker.collect('j1', () => Promise.reject(new Error('quota')))).rejects.toThrow(
      'quota',
    );
    expect(api.deleted).toEqual([]);
    expect(tracker.current).toHaveLength(1);
  });

  it('collect still succeeds if the delete fails', async () => {
    const { tracker, api } = setup();
    await tracker.submit('x');
    api.deleteFailure = new ApiError('network', 0);
    await expect(tracker.collect('j1')).resolves.toBeDefined();
    expect(tracker.current).toEqual([]);
  });

  it('dismiss cancels a waiting job and notifies subscribers', async () => {
    const { tracker, api } = setup();
    const seen: number[] = [];
    tracker.subscribe((jobs) => seen.push(jobs.length));
    await tracker.submit('x');
    await tracker.dismiss('j1');
    expect(api.deleted).toEqual(['j1']);
    expect(seen).toEqual([1, 0]);
  });
});
