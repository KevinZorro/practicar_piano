import type { PendingJobsStore, TrackedJob } from '../../core/jobs/jobTracker';

const KEY = 'teclario.pendingJobs.v1';

function isTrackedJob(value: unknown): value is TrackedJob {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['jobId'] === 'string' &&
    typeof v['status'] === 'string' &&
    typeof v['durationS'] === 'number' &&
    typeof v['notified'] === 'boolean'
  );
}

/**
 * Keeps the list of pending jobs in localStorage. They are tiny and the library (C8) will
 * move them to IndexedDB. Storage can be missing or full, so every access is guarded.
 */
export class LocalPendingStore implements PendingJobsStore {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {}

  load(): TrackedJob[] {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isTrackedJob) : [];
    } catch {
      return [];
    }
  }

  save(jobs: readonly TrackedJob[]): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(jobs));
    } catch {
      // private mode or quota: the app keeps working, it just will not remember the jobs
    }
  }
}

export function createLocalPendingStore(): LocalPendingStore {
  try {
    return new LocalPendingStore(window.localStorage);
  } catch {
    return new LocalPendingStore(null);
  }
}
