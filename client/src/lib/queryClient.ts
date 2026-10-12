import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Extract the specific error message from a failed request.
 * apiRequest throws `"<status>: <body>"` where body is often JSON like
 * {"error":"..."}. This unwraps it so users see the actual reason
 * (e.g. "You cannot add Alex Chen — they have blocked you") instead of
 * a raw status blob or a generic fallback.
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  if (!raw) return fallback;

  // Strip a leading "<3-digit status>: " prefix produced by throwIfResNotOk.
  let body = raw;
  const colonIndex = raw.indexOf(": ");
  if (colonIndex !== -1 && /^\d{3}$/.test(raw.slice(0, colonIndex))) {
    body = raw.slice(colonIndex + 2);
  }

  // Unwrap JSON error bodies.
  if (body.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === "string" && parsed.error) return parsed.error;
      if (parsed && typeof parsed.message === "string" && parsed.message) return parsed.message;
    } catch {
      // not JSON — fall through
    }
  }

  body = body.split("\n")[0].trim();
  return body || fallback;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
