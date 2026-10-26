import { logRequestError } from "./src/lib/observability/log";

export async function onRequestError(
  error: unknown,
  request: { method: string },
  context: { routePath: string; routeType: string },
) {
  // Do not log error messages, stacks, URLs, headers, or request bodies. They may contain user data.
  logRequestError({
    errorType: error instanceof Error ? error.name : "UnknownError",
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
}
