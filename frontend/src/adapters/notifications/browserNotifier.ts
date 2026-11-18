import type { Notifier } from '../../core/jobs/jobTracker';

export type PermissionState = NotificationPermission | 'unsupported';

export interface NotificationApi {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  create(title: string, body: string): void;
}

export function currentPermission(api: NotificationApi | null): PermissionState {
  return api ? api.permission : 'unsupported';
}

/** Asks once, when the user submits a link: that is when the reason is clear. */
export async function requestNotificationPermission(
  api: NotificationApi | null,
): Promise<PermissionState> {
  if (!api) return 'unsupported';
  if (api.permission !== 'default') return api.permission;
  try {
    return await api.requestPermission();
  } catch {
    return 'denied';
  }
}

const TITLE = 'Notacaida';
const READY_TITLE = '✓ Lista · Notacaida';

/** Browser notification plus a title change, so the tab shows it even without permission. */
export class BrowserNotifier implements Notifier {
  constructor(
    private readonly api: NotificationApi | null,
    private readonly doc: Pick<Document, 'title'>,
  ) {}

  readonly jobDone = (): void => {
    this.doc.title = READY_TITLE;
    if (this.api?.permission === 'granted')
      this.api.create(TITLE, 'Tu canción está lista para practicar.');
  };

  /** Restores the normal title once the user is back. */
  clearBadge(): void {
    this.doc.title = TITLE;
  }
}

export function createNotificationApi(): NotificationApi | null {
  if (typeof Notification === 'undefined') return null;
  return {
    get permission() {
      return Notification.permission;
    },
    requestPermission: () => Notification.requestPermission(),
    create: (title, body) => {
      new Notification(title, { body });
    },
  };
}
