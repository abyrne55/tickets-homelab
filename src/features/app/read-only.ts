import { isOneOf } from "#fp";
import {
  readOnlyGetRoutePatterns,
  readOnlyWriteRoutePatterns,
} from "#shared/admin-pages.ts";
import { constant } from "#shared/fp-bind.ts";
import { routePathPatternToRegex } from "#shared/route-pattern.ts";
import { READ_ONLY_SAFE_ROUTES } from "./read-only-safe-routes.ts";

/** The admin writes read-only mode keeps open, from the route declarations. */
const READ_ONLY_WRITE_PATTERNS = readOnlyWriteRoutePatterns().map(
  routePathPatternToRegex,
);

const READ_ONLY_GET_PATTERNS = readOnlyGetRoutePatterns().map(
  routePathPatternToRegex,
);

const READ_ONLY_SAFE_PATTERNS = READ_ONLY_SAFE_ROUTES.map(({ pattern }) =>
  routePathPatternToRegex(pattern),
);

const isMutatingMethod = isOneOf(["DELETE", "PATCH", "POST", "PUT"]);

const isAdminMutation = (path: string, method: string): boolean =>
  isMutatingMethod(method) && path.startsWith("/admin/");

type ReadOnlyRequest = {
  method: string;
  mutating: boolean;
  path: string;
};

type ReadOnlyDecision = "api" | "page" | null;

type ReadOnlyRule = {
  decide: (request: ReadOnlyRequest) => ReadOnlyDecision;
  matches: (request: ReadOnlyRequest) => boolean;
};

/** Whether a path is one of a list. */
const pathIn =
  (patterns: readonly RegExp[]): ((path: string) => boolean) =>
  (path) =>
    patterns.some((pattern) => pattern.test(path));

/** Whether a request asks for one of a list of paths, by one method. */
const sentTo = (
  method: string,
  patterns: readonly RegExp[],
): ((request: ReadOnlyRequest) => boolean) => {
  const listed = pathIn(patterns);
  return (request) => request.method === method && listed(request.path);
};

const isReadOnlyWrite = sentTo("POST", READ_ONLY_WRITE_PATTERNS);

const isSafePath = pathIn(READ_ONLY_SAFE_PATTERNS);

/** Ordered from the most specific request to the default public-write rule. */
const READ_ONLY_RULES: readonly ReadOnlyRule[] = [
  {
    decide: constant("api"),
    matches: ({ mutating, path }) => mutating && path.startsWith("/api/"),
  },
  {
    decide: constant("page"),
    matches: sentTo("GET", READ_ONLY_GET_PATTERNS),
  },
  {
    // Read-only mode keeps the admin writes their routes declare.
    decide: (request) => (isReadOnlyWrite(request) ? null : "page"),
    matches: ({ path, method }) => isAdminMutation(path, method),
  },
  {
    decide: constant(null),
    matches: ({ mutating }) => !mutating,
  },
  {
    decide: ({ path }) => (isSafePath(path) ? null : "page"),
    matches: () => true,
  },
];

/**
 * Decide whether read-only mode blocks one request. The caller turns the
 * decision into a response. Environment and request-context reads stay out of
 * this module.
 */
export const readOnlyBlock = (
  path: string,
  method: string,
): ReadOnlyDecision => {
  const request = {
    method,
    mutating: isMutatingMethod(method),
    path,
  };
  // The final rule always matches, so every request has a decision.
  const rule = READ_ONLY_RULES.find((candidate) => candidate.matches(request))!;
  return rule.decide(request);
};
