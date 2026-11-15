import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request(path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    signal,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(data);
    throw new ApiError(
      parsed.success ? parsed.data.error : "Anfrage fehlgeschlagen. Bitte erneut versuchen.",
      response.status,
    );
  }

  return data;
}

export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Anfrage fehlgeschlagen.";
