/**
 * The app router: the read-only guard, the prefix dispatch, and the check
 * for a body-bearing request. The prefixes are declared in `prefixes.ts`.
 */

import { withMessageGroups } from "#i18n";
import { apiErrorResponse } from "#routes/api/cors.ts";
import { notFoundResponse, redirectResponse } from "#routes/response.ts";
import { getPrefix } from "#routes/settings-bundles.ts";
import type { PathMethodRoute } from "#routes/types.ts";
import { isReadOnly } from "#shared/env.ts";
import type { PrefixRoute } from "./prefix-fold.ts";
import { prefixRoutes } from "./prefixes.ts";
import { readOnlyBlock } from "./read-only.ts";
import { isSetupPath } from "./rules.ts";

type CompletePathMethodRoute = (
  ...args: Parameters<PathMethodRoute>
) => Promise<Response>;

type AppRouteRequest = {
  method: string;
  path: string;
  request: Request;
};

/** Give complete app routes one named request value instead of four arguments. */
export const defineAppRoute =
  (
    handle: (route: AppRouteRequest) => Promise<Response>,
  ): CompletePathMethodRoute =>
  (request, path, method) =>
    handle({ method, path, request });

/** Read-only mode message. */
const READ_ONLY_MESSAGE = "This site is in read-only mode";

const readOnlyResponses = {
  api: (): Response => apiErrorResponse(READ_ONLY_MESSAGE, 403),
  page: (): Response => redirectResponse("/read-only"),
} as const;

/** The route a prefix serves, or undefined when no prefix owns it. */
const routeFor = (prefix: string): PrefixRoute | undefined =>
  Object.hasOwn(prefixRoutes, prefix) ? prefixRoutes[prefix] : undefined;

/** Whether a body-bearing request can route here: the setup
 * router, or a prefix route that serves a body-bearing method. Coarse by
 * design — deeper 404s (missing slugs, unknown admin tabs) still need the
 * database. */
export const servesBodyRequests = (path: string): boolean => {
  if (isSetupPath(path)) return true;
  const route = routeFor(getPrefix(path));
  return route !== undefined && !route.getOnly;
};

/** Route main application requests after setup is complete. */
export const routeMainApp = async ({
  request,
  path,
  method,
}: AppRouteRequest): Promise<Response> => {
  if (isReadOnly()) {
    const blocked = readOnlyBlock(path, method);
    if (blocked === "api") return readOnlyResponses.api();
    if (blocked === "page") return readOnlyResponses.page();
  }

  const route = routeFor(getPrefix(path));
  if (!route) return notFoundResponse();
  const earlyResponse = route.beforeMessages(path, method);
  if (earlyResponse) return earlyResponse;
  return await withMessageGroups(
    route.messageGroups,
    async () =>
      (await route.handler(request, path, method)) ?? notFoundResponse(),
  );
};
