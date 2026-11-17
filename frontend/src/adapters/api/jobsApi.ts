import type { components } from './schema';

export type JobResponse = components['schemas']['JobResponse'];
export type ResultResponse = components['schemas']['ResultResponse'];
export type JobStatus = JobResponse['status'];

/** A failure reported by the API (`code` is stable) or by the network (`code: 'network'`). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly retryAfterS?: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface JobsApi {
  createJob(url: string): Promise<JobResponse>;
  getJob(jobId: string): Promise<JobResponse>;
  getResult(jobId: string): Promise<ResultResponse>;
  deleteJob(jobId: string): Promise<void>;
}

export class HttpJobsApi implements JobsApi {
  constructor(
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    private readonly baseUrl = '/api/v1',
  ) {}

  createJob(url: string): Promise<JobResponse> {
    return this.request<JobResponse>('POST', '/jobs', { url });
  }

  getJob(jobId: string): Promise<JobResponse> {
    return this.request<JobResponse>('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  getResult(jobId: string): Promise<ResultResponse> {
    return this.request<ResultResponse>('GET', `/jobs/${encodeURIComponent(jobId)}/result`);
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/jobs/${encodeURIComponent(jobId)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError('network', 0);
    }
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'internal_error';
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    code = body.error?.code ?? code;
  } catch {
    // not JSON (for example a proxy error page): keep the generic code
  }
  const retry = Number(response.headers.get('retry-after'));
  return new ApiError(
    code,
    response.status,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}
