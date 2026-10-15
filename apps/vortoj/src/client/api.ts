export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  }).catch(() => {
    throw new RequestError("Cannot reach Vortoj. Check your connection and try again.", 0);
  });
  const data: unknown = await response.json().catch(() => {
    throw new RequestError("Could not read the response. Refresh and try again.", response.status);
  });
  if (!response.ok)
    throw new RequestError(
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Could not complete the request",
      response.status,
    );
  return data;
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not complete this request";
export const api = (path: string, body?: unknown, method?: string, signal?: AbortSignal) =>
  request(`/api/vortoj${path}`, body, method, signal);
