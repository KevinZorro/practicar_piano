import { useState } from 'react';
import type { NotificationApi, PermissionState } from '../adapters/notifications/browserNotifier';
import {
  currentPermission,
  requestNotificationPermission,
} from '../adapters/notifications/browserNotifier';
import type { JobTracker } from '../core/jobs/jobTracker';
import { JobList } from './JobList';
import { LinkForm } from './LinkForm';
import { useTrackedJobs } from './useTrackedJobs';

interface Props {
  tracker: JobTracker;
  notifications: NotificationApi | null;
  /** Called when the user wants to practice a finished job (wired up in later increments). */
  onOpenJob?: (jobId: string) => void;
}

export function App({ tracker, notifications, onOpenJob }: Props) {
  const jobs = useTrackedJobs(tracker);
  const [permission, setPermission] = useState<PermissionState>(currentPermission(notifications));

  async function submit(url: string) {
    await tracker.submit(url);
    setPermission(await requestNotificationPermission(notifications));
  }

  return (
    <main>
      <h1>Pianola</h1>
      <p>Practica piano con tu teclado a partir de un cover de YouTube.</p>
      <LinkForm onSubmit={submit} />
      {permission === 'denied' && (
        <p role="status">
          Las notificaciones están bloqueadas: no te avisaremos al terminar. Vuelve a esta página
          para ver el estado.
        </p>
      )}
      <JobList
        jobs={jobs}
        onOpen={(id) => onOpenJob?.(id)}
        onDismiss={(id) => void tracker.dismiss(id)}
      />
    </main>
  );
}
