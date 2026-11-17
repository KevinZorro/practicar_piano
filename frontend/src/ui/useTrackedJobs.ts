import { useEffect, useSyncExternalStore } from 'react';
import type { JobTracker, TrackedJob } from '../core/jobs/jobTracker';

const POLL_MS = 3000;

/** Subscribes to the tracker and polls while any job is unfinished (also right on mount). */
export function useTrackedJobs(tracker: JobTracker, pollMs = POLL_MS): readonly TrackedJob[] {
  const jobs = useSyncExternalStore(
    (listener) => tracker.subscribe(listener),
    () => tracker.current,
  );
  useEffect(() => {
    void tracker.refresh();
    const id = window.setInterval(() => {
      if (tracker.hasActiveJobs) void tracker.refresh();
    }, pollMs);
    return () => {
      window.clearInterval(id);
    };
  }, [tracker, pollMs]);
  return jobs;
}
