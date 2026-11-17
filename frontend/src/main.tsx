import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonePiano } from './adapters/audio/tonePiano';
import { HttpJobsApi } from './adapters/api/jobsApi';
import { BrowserNotifier, createNotificationApi } from './adapters/notifications/browserNotifier';
import { IndexedDbLibrary, openLibraryDb } from './adapters/storage/indexedDbLibrary';
import { createLocalPendingStore } from './adapters/storage/localPendingStore';
import { JobTracker } from './core/jobs/jobTracker';
import type { LibrarySong, SongLibrary } from './core/library/library';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

async function openLibrary(): Promise<SongLibrary | null> {
  try {
    return new IndexedDbLibrary(await openLibraryDb(indexedDB));
  } catch {
    return null; // private mode or no IndexedDB: jobs then stay on the server instead of being deleted
  }
}

// Composition root: the only place that knows the real adapters.
async function main(container: HTMLElement): Promise<void> {
  const notifications = createNotificationApi();
  const notifier = new BrowserNotifier(notifications, document);
  const tracker = new JobTracker(new HttpJobsApi(), createLocalPendingStore(), notifier);
  window.addEventListener('focus', () => {
    notifier.clearBadge();
  });
  const library = await openLibrary();

  // The library is the only copy of a finished song, so it is saved before the server forgets it.
  async function openJob(jobId: string): Promise<LibrarySong | null> {
    if (!library) return null;
    let saved: LibrarySong | null = null;
    await tracker.collect(jobId, async (result) => {
      const song: LibrarySong = {
        id: jobId,
        title: `Canción ${new Date().toLocaleDateString()}`,
        savedAt: Date.now(),
        result,
        progress: {},
      };
      await library.put(song);
      saved = song;
    });
    return saved;
  }

  createRoot(container).render(
    <StrictMode>
      <App
        tracker={tracker}
        notifications={notifications}
        library={library}
        openJob={openJob}
        createPiano={() => new TonePiano()}
      />
    </StrictMode>,
  );
}

void main(root);
