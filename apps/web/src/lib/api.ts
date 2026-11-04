import type { ApiError, AuthResponse } from '@tasknest/shared';

/** Thrown for any non-2xx API response. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

// The access token lives only in memory (never localStorage), per the TRD.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

let refreshing: Promise<AuthResponse | null> | null = null;

/** Exchange the HttpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => {
      if (!r.ok) return null;
      const data = (await r.json()) as AuthResponse;
      setAccessToken(data.accessToken);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  // Access token expired: refresh once, then retry the original request
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return api<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (body as ApiError).error ?? { code: 'NETWORK', message: 'Something went wrong, try again' };
    throw new ApiRequestError(res.status, e.code, e.message, e.fields);
  }
  return body as T;
}
