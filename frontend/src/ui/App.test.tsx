import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ApiError,
  type JobResponse,
  type JobsApi,
  type ResultResponse,
} from '../adapters/api/jobsApi';
import type { NotificationApi } from '../adapters/notifications/browserNotifier';
import {
  JobTracker,
  type Notifier,
  type PendingJobsStore,
  type TrackedJob,
} from '../core/jobs/jobTracker';
import { App } from './App';
import { formatDuration } from './messages';

function job(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    job_id: 'j1',
    status: 'queued',
    duration_s: 200,
    position: 2,
    estimated_wait_s: 720,
    ...overrides,
  };
}

class FakeApi implements JobsApi {
  jobs = new Map<string, JobResponse>();
  createError: ApiError | null = null;
  createJob = vi.fn((): Promise<JobResponse> => {
    if (this.createError) return Promise.reject(this.createError);
    const created = job();
    this.jobs.set(created.job_id, created);
    return Promise.resolve(created);
  });
  getJob(jobId: string): Promise<JobResponse> {
    const found = this.jobs.get(jobId);
    return found ? Promise.resolve(found) : Promise.reject(new ApiError('job_not_found', 404));
  }
  getResult(): Promise<ResultResponse> {
    return Promise.resolve({
      meta: { duration_s: 1, tempo_bpm: 120, tempo_confidence: 'high' },
      levels: [],
    });
  }
  deleteJob(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
    return Promise.resolve();
  }
}

class MemoryStore implements PendingJobsStore {
  constructor(public saved: TrackedJob[] = []) {}
  load(): TrackedJob[] {
    return this.saved;
  }
  save(jobs: readonly TrackedJob[]): void {
    this.saved = [...jobs];
  }
}

function fakeNotifications(initial: NotificationPermission, answer: NotificationPermission) {
  const api: NotificationApi & { asked: number } = {
    asked: 0,
    permission: initial,
    requestPermission: () => {
      api.asked++;
      return Promise.resolve(answer);
    },
    create: vi.fn(),
  };
  return api;
}

type FakeNotifications = ReturnType<typeof fakeNotifications>;

function setup(options: { store?: MemoryStore; notifications?: FakeNotifications | null } = {}) {
  const api = new FakeApi();
  const notifier: Notifier = { jobDone: vi.fn() };
  const store = options.store ?? new MemoryStore();
  const tracker = new JobTracker(api, store, notifier);
  const notifications =
    options.notifications === undefined
      ? fakeNotifications('default', 'granted')
      : options.notifications;
  render(<App tracker={tracker} notifications={notifications} />);
  return { api, notifier, store, tracker, notifications };
}

async function submitLink(url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Enlace de YouTube'), url);
  await user.click(screen.getByRole('button', { name: 'Procesar canción' }));
}

describe('App', () => {
  it('shows the product name and an empty state', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Notacaida' })).toBeInTheDocument();
    expect(screen.getByText('Aún no has enviado ninguna canción.')).toBeInTheDocument();
  });

  it('queues a song, shows position and estimated wait, and asks for notification permission', async () => {
    const { notifications } = setup();
    await submitLink();
    expect(await screen.findByText(/posición 2/)).toBeInTheDocument();
    expect(screen.getByText(/espera aproximada 12 min/)).toBeInTheDocument();
    expect(notifications?.asked).toBe(1);
    expect(screen.getByLabelText('Enlace de YouTube')).toHaveValue('');
  });

  it('explains when notifications are blocked', async () => {
    setup({ notifications: fakeNotifications('denied', 'denied') });
    await submitLink();
    expect(await screen.findByRole('status')).toHaveTextContent('notificaciones están bloqueadas');
  });

  it('works without the Notification API', async () => {
    setup({ notifications: null });
    await submitLink();
    expect(await screen.findByText(/posición 2/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['invalid_url', 422, undefined, 'no es un video de YouTube válido'],
    ['duration_limit', 422, undefined, 'máximo es de 10 minutos'],
    ['queue_full', 503, 300, 'cola está llena'],
    ['rate_limited', 429, 600, 'demasiadas canciones'],
    ['video_blocked', 451, undefined, 'reclamación de derechos'],
    ['network', 0, undefined, 'No hay conexión'],
  ])('shows a clear message for %s', async (code, status, retry, text) => {
    const { api } = setup();
    api.createError = new ApiError(code, status, retry);
    await submitLink();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('list', { name: 'Tus canciones' })).not.toBeInTheDocument();
  });

  it('tells the user when to retry on a full queue', async () => {
    const { api } = setup();
    api.createError = new ApiError('queue_full', 503, 300);
    await submitLink();
    expect(await screen.findByRole('alert')).toHaveTextContent('reintenta en 5 min');
  });

  it('shows a very long wait in hours', () => {
    expect(formatDuration(7500)).toBe('2 h 5 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(20)).toBe('menos de 1 min');
  });

  it('recovers a pending job when the app is reopened and offers to practice when done', async () => {
    const saved: TrackedJob[] = [
      {
        jobId: 'j1',
        status: 'queued',
        durationS: 200,
        position: 1,
        estimatedWaitS: 100,
        errorCode: null,
        notified: false,
      },
    ];
    const api = new FakeApi();
    api.jobs.set('j1', job({ status: 'done', position: null, estimated_wait_s: null }));
    const notifier: Notifier = { jobDone: vi.fn() };
    const tracker = new JobTracker(api, new MemoryStore(saved), notifier);
    render(<App tracker={tracker} notifications={null} />);
    expect(await screen.findByText('¡Lista!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practicar' })).toBeInTheDocument();
    expect(notifier.jobDone).toHaveBeenCalledTimes(1);
  });

  it('tells the user a job was lost and lets them remove it', async () => {
    const saved: TrackedJob[] = [
      {
        jobId: 'gone',
        status: 'transcribing',
        durationS: 100,
        position: 0,
        estimatedWaitS: 0,
        errorCode: null,
        notified: false,
      },
    ];
    const tracker = new JobTracker(new FakeApi(), new MemoryStore(saved), { jobDone: vi.fn() });
    render(<App tracker={tracker} notifications={null} />);
    expect(await screen.findByText(/ya no recuerda esta canción/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => {
      expect(screen.getByText('Aún no has enviado ninguna canción.')).toBeInTheDocument();
    });
  });

  it('lets the user cancel a waiting song', async () => {
    setup();
    await submitLink();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByText(/posición/)).not.toBeInTheDocument();
    });
  });
});
