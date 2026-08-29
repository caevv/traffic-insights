/**
 * The only place that knows how to talk to the API.
 *
 * The server answers every failure with `{ error: { code, message } }`. We
 * unwrap that here so no component has to deal with the shape of an error.
 * They all just get an ApiError with a message worth showing.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string }
}

async function readErrorMessage(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorEnvelope
    return new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? response.statusText,
    )
  } catch {
    // A non-JSON body, like a proxy's HTML error page or an empty 502,
    // shouldn't turn into "Unexpected token < in JSON" for the user.
    return new ApiError(
      response.status,
      'UNKNOWN',
      `Request failed with status ${response.status}.`,
    )
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) throw await readErrorMessage(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
