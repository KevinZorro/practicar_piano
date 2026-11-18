import {
  BrowserNotifier,
  currentPermission,
  requestNotificationPermission,
  type NotificationApi,
} from './browserNotifier';

function api(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const created: string[] = [];
  const fake: NotificationApi = {
    permission,
    requestPermission: () => Promise.resolve(answer),
    create: (title, body) => created.push(`${title}|${body}`),
  };
  return { fake, created };
}

describe('notification permission', () => {
  it('asks only when undecided', async () => {
    expect(await requestNotificationPermission(api('default', 'granted').fake)).toBe('granted');
    expect(await requestNotificationPermission(api('denied', 'granted').fake)).toBe('denied');
    expect(await requestNotificationPermission(null)).toBe('unsupported');
    expect(currentPermission(null)).toBe('unsupported');
  });

  it('treats a rejected prompt as denied', async () => {
    const broken: NotificationApi = {
      permission: 'default',
      requestPermission: () => Promise.reject(new Error('blocked')),
      create: () => undefined,
    };
    expect(await requestNotificationPermission(broken)).toBe('denied');
  });
});

describe('BrowserNotifier', () => {
  it('notifies and marks the tab title when permission is granted', () => {
    const { fake, created } = api('granted');
    const doc = { title: 'Notacaida' };
    const notifier = new BrowserNotifier(fake, doc);
    notifier.jobDone();
    expect(created).toHaveLength(1);
    expect(doc.title).toContain('Lista');
    notifier.clearBadge();
    expect(doc.title).toBe('Notacaida');
  });

  it('still changes the title when notifications are denied or missing', () => {
    for (const source of [api('denied').fake, null]) {
      const doc = { title: 'Notacaida' };
      new BrowserNotifier(source, doc).jobDone();
      expect(doc.title).toContain('Lista');
    }
  });
});
