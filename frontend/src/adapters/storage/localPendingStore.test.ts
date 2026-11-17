import type { TrackedJob } from '../../core/jobs/jobTracker';
import { LocalPendingStore } from './localPendingStore';

const sample: TrackedJob = {
  jobId: 'j1',
  status: 'queued',
  durationS: 100,
  position: 1,
  estimatedWaitS: 5,
  errorCode: null,
  notified: false,
};

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe('LocalPendingStore', () => {
  it('round-trips jobs', () => {
    const store = new LocalPendingStore(memoryStorage());
    store.save([sample]);
    expect(store.load()).toEqual([sample]);
  });

  it('ignores corrupt or foreign data', () => {
    expect(new LocalPendingStore(memoryStorage('{not json')).load()).toEqual([]);
    expect(new LocalPendingStore(memoryStorage('{"a":1}')).load()).toEqual([]);
    expect(
      new LocalPendingStore(memoryStorage(JSON.stringify([sample, { jobId: 1 }]))).load(),
    ).toEqual([sample]);
  });

  it('survives missing or failing storage', () => {
    expect(new LocalPendingStore(null).load()).toEqual([]);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => {
      new LocalPendingStore(full).save([sample]);
    }).not.toThrow();
  });
});
