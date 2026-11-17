import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpJobsApi } from './adapters/api/jobsApi';
import { BrowserNotifier, createNotificationApi } from './adapters/notifications/browserNotifier';
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

createRoot(root).render(
  <StrictMode>
    <App tracker={tracker} notifications={notifications} />
  </StrictMode>,
);
