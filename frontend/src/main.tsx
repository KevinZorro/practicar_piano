import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpJobsApi } from './adapters/api/jobsApi';
import { BrowserNotifier, createNotificationApi } from './adapters/notifications/browserNotifier';
import { IndexedDbLibrary, openLibraryDb } from './adapters/storage/indexedDbLibrary';
import { createLocalPendingStore } from './adapters/storage/localPendingStore';
import { JobTracker } from './core/jobs/jobTracker';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Composition root: the only place that knows the real adapters.
const notifications = createNotificationApi();
const notifier = new BrowserNotifier(notifications, document);
const tracker = new JobTracker(new HttpJobsApi(), createLocalPendingStore(), notifier);
window.addEventListener('focus', () => {
  notifier.clearBadge();
});

// The library is the only copy of a finished song: if IndexedDB is unavailable the job stays
// on the server (until its safety expiry) instead of being deleted.
const library = openLibraryDb(indexedDB).then((db) => new IndexedDbLibrary(db));

function openJob(jobId: string): void {
  void tracker.collect(jobId, async (result) => {
    await (
      await library
    ).put({
      id: jobId,
      title: `Canción ${new Date().toLocaleDateString()}`,
      savedAt: Date.now(),
      result,
      progress: {},
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App tracker={tracker} notifications={notifications} onOpenJob={openJob} />
  </StrictMode>,
);
