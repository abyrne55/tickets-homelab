import { expect } from "@std/expect";
import { afterEach, beforeEach } from "@std/testing/bdd";
import type { Stub } from "@std/testing/mock";
import { bracket } from "#fp";
import { handleRequest } from "#routes";
import { getSessionCookieName } from "#shared/cookies.ts";
import { signCsrfToken } from "#shared/csrf.ts";
import { runWithStorageConfig } from "#shared/storage.ts";
import { type EnvScope, withEnv } from "#test-utils/env.ts";
import { type FetchResponder, stubFetch } from "#test-utils/fetch-stub.ts";
import { tempDir, withTempDir } from "#test-utils/files.ts";
import {
  appendTestFormValues,
  type TestFormValues,
} from "#test-utils/form-values.ts";
import type { TestRequestOptions } from "#test-utils/internal.ts";

export const restoreStubsAfterEach = (stubs: { restore(): void }[]): void => {
  afterEach(() => {
    for (const active of stubs.splice(0)) active.restore();
  });
};

export const mockRequestWithHost = (
  path: string,
  host: string,
  options: RequestInit = {},
): Request => {
  const headers = new Headers(options.headers);
  headers.set("host", host);
  return new Request(`http://${host}${path}`, { ...options, headers });
};

export const mockRequest = (path: string, options: RequestInit = {}): Request =>
  mockRequestWithHost(path, "localhost", options);

/** A form-encoded request body, the one place test form values become a
 *  urlencoded string. */
const formBody = (data: TestFormValues): string => {
  const params = new URLSearchParams();
  appendTestFormValues(params, data);
  return params.toString();
};

export const mockFormRequest = (
  path: string,
  data: TestFormValues = {},
  cookie?: string,
): Request => {
  const body = formBody(data);
  const headers: HeadersInit = {
    "content-type": "application/x-www-form-urlencoded",
    host: "localhost",
  };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`http://localhost${path}`, {
    body,
    headers,
    method: "POST",
  });
};

/** Build a JSON API `Request` (no auth) for passing to `handleRequest`. */
export const jsonRequest = (
  path: string,
  options: { method?: string; body?: Record<string, unknown> | undefined } = {},
): Request => {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = { host: "localhost" };
  const init: RequestInit = { headers, method };
  if (body) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
};

export const mockAdminLoginRequest = async (
  data: Record<string, string>,
  csrfToken?: string,
): Promise<Request> => {
  const token = csrfToken ?? (await signCsrfToken());
  return mockFormRequest("/admin/login", { ...data, csrf_token: token });
};

export const mockMultipartRequest = (
  path: string,
  data: TestFormValues = {},
  cookie?: string,
  file?: {
    name: string;
    fieldName: string;
    data: Uint8Array;
    contentType: string;
  },
): Request => {
  const formData = new FormData();
  appendTestFormValues(formData, data);
  if (file) {
    const blob = new Blob([file.data as any], { type: file.contentType });
    formData.append(file.fieldName, blob, file.name);
  }
  const headers: HeadersInit = { host: "localhost" };
  if (cookie) headers.cookie = cookie;
  return new Request(`http://localhost${path}`, {
    body: formData,
    headers,
    method: "POST",
  });
};

export const mockWebhookRequest = (
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request =>
  new Request("http://localhost/payment/webhook", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      host: "localhost",
      ...headers,
    },
    method: "POST",
  });

export const mockSetupFormRequest = (
  data: Record<string, string>,
  csrfToken: string,
): Request =>
  mockFormRequest("/setup", {
    accept_agreement: "yes",
    ...data,
    csrf_token: csrfToken,
  });

export const mockTicketFormRequest = (
  slug: string,
  data: Record<string, string>,
  csrfToken: string,
): Request =>
  mockFormRequest(`/ticket/${slug}`, {
    ...data,
    csrf_token: csrfToken,
  });

export const urlFromFetchInput = (input: string | URL | Request): string =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

export const withExpectedError = bracket(
  // Overlay-scoped so the flag stays inside this worker: written to the real
  // process env it would make every parallel test worker swallow its errors.
  () => withEnv({ TEST_EXPECT_ERROR: "1" }),
  (scope) => scope.dispose(),
);

export const withFetchMock = bracket(
  () => globalThis.fetch,
  (original) => {
    globalThis.fetch = original;
  },
);

interface Restorable {
  restore?: (() => void) | undefined;
}

export const withMocks = async <
  T extends Restorable | Record<string, Restorable>,
>(
  setup: () => T,
  body: (mocks: T) => void | Promise<void>,
  cleanup?: () => void | Promise<void>,
): Promise<void> => {
  const mocks = setup();
  try {
    await body(mocks);
  } finally {
    if (typeof (mocks as Restorable).restore === "function") {
      (mocks as Restorable).restore?.();
    } else {
      for (const mock of Object.values(mocks as Record<string, Restorable>)) {
        mock.restore?.();
      }
    }
    await cleanup?.();
  }
};

export const installUrlHandler = (
  fallback: typeof globalThis.fetch,
  handler: (url: string, init?: RequestInit) => Promise<Response> | null,
): void => {
  globalThis.fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = urlFromFetchInput(input);
    return handler(url, init) ?? fallback(input, init);
  };
};

/** One recorded `fetch` call: the request URL and the parsed JSON body
 *  (or `null` when the request had no string body). */
export type RecordedFetchCall = {
  url: string;
  body: Record<string, unknown> | null;
};

/** Install a `fetch` stub that records every call's URL and parsed JSON body
 *  and lets `respond` produce the Response. When `respond` returns `null` the
 *  call falls through to the original `fetch`, so unrelated URLs keep working.
 *  Returns the recorded calls plus an `emailCall` helper that finds the Resend
 *  send-email request (the one assertion every email-sending test makes) and a
 *  `restore` to put the original `fetch` back. */
export const installRecordingFetch = (
  respond: (
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response> | null,
): {
  calls: RecordedFetchCall[];
  emailCall: () => RecordedFetchCall | undefined;
  restore: () => void;
} => {
  const original = globalThis.fetch;
  const calls: RecordedFetchCall[] = [];
  installUrlHandler(original, (url, init) => {
    const raw = init?.body;
    calls.push({ body: typeof raw === "string" ? JSON.parse(raw) : null, url });
    const result = respond(url, init);
    return result === null ? null : Promise.resolve(result);
  });
  return {
    calls,
    emailCall: () => calls.find((c) => c.url.includes("api.resend.com")),
    restore: () => {
      globalThis.fetch = original;
    },
  };
};

/** Stub `globalThis.fetch` to a 200-OK, run `body`, then assert on the
 *  recorded calls (default: zero calls were made). Returns the stub's calls
 *  for custom assertions. Unifies the "stub fetch then assert it wasn't
 *  called" scaffold from the scheduled-tasks and migration-error tests. */
export const expectFetchSilent = async (
  body: () => Promise<void>,
  assert?: (calls: Stub["calls"]) => void,
): Promise<void> => {
  using fetchStub = stubFetch(new Response("ok"));
  await body();
  (
    assert ??
    ((calls) => {
      expect(calls.length).toBe(0);
    })
  )(fetchStub.calls);
};

export const testRequest = (
  path: string,
  token?: string | null,
  options: TestRequestOptions = {},
): Request => {
  const { cookie, method, data } = options;
  const headers: Record<string, string> = { host: "localhost" };

  if (token) {
    headers.cookie = `${getSessionCookieName()}=${token}`;
  } else if (cookie) {
    headers.cookie = cookie;
  }

  if (data) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    return new Request(`http://localhost${path}`, {
      body: formBody(data),
      headers,
      method: method ?? "POST",
    });
  }

  return new Request(`http://localhost${path}`, {
    headers,
    method: method ?? "GET",
  });
};
/** Send a test request for `path` to the app and return the Response. */
export const awaitTestRequest = (
  path: string,
  tokenOrOptions?: string | TestRequestOptions | null,
): Promise<Response> =>
  handleRequest(
    typeof tokenOrOptions === "object" && tokenOrOptions !== null
      ? testRequest(path, null, tokenOrOptions)
      : testRequest(path, tokenOrOptions),
  );

/** GET `path` from the app and return its rendered HTML. */
export const testPageHtml = async (path: string): Promise<string> =>
  (await awaitTestRequest(path)).text();

export const errorResponse =
  (status: number) =>
  (error: string): Response =>
    new Response(error, { status });

/** Run `fn` with image storage on a fresh temp directory, passing its path.
 *  The directory is removed once `fn` settles. */
export const withLocalStorageEnabled = async <T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> =>
  await withTempDir((dir) =>
    runWithStorageConfig({ localPath: dir }, () => fn(dir)),
  );

/** Run `fn` with image storage on a fresh temp directory. `fn` may be sync or
 *  async, and the directory is removed once it settles. */
export const withStorageEnabled = <T>(fn: () => T): T => {
  const dir = tempDir();
  const result = runWithStorageConfig({ localPath: dir.path }, fn);
  if (result instanceof Promise) {
    return result.finally(() => dir.dispose()) as T;
  }
  dir.dispose();
  return result;
};

/** Run `fn` with storage on a fresh temp directory. */
export const withStorageMock = (fn: () => Promise<void>): Promise<void> =>
  withLocalStorageEnabled(() => fn());

/** Run `fn` with a storage path no file can be written under (the path names a
 *  regular file), so every upload fails. */
export const withUnwritableStorage = async (
  fn: () => Promise<void>,
): Promise<void> => {
  const file = await Deno.makeTempFile();
  try {
    await runWithStorageConfig({ localPath: file }, fn);
  } finally {
    await Deno.remove(file);
  }
};

export const withStorageDisabled = <T>(fn: () => T): T =>
  runWithStorageConfig({ localPath: "" }, fn);

export const mockProviderType = (
  type: import("#shared/payments.ts").PaymentProviderType,
): import("#shared/payments.ts").PaymentProviderType | null => type;

export const useFetchStub = () => {
  type FetchStubRef = { current: any };
  const ref: FetchStubRef = { current: null };

  beforeEach(() => {
    ref.current = stubFetch(() => new Response());
  });

  afterEach(() => {
    ref.current.restore();
  });

  const restubFetch = (impl: FetchResponder): void => {
    ref.current.restore();
    ref.current = stubFetch(impl);
  };

  const callCount = (): number => ref.current.calls.length;

  const getFetchArgs = (index = 0): [string, RequestInit] =>
    ref.current.calls[index].args as [string, RequestInit];

  const getFetchJsonBody = (index = 0) =>
    JSON.parse(getFetchArgs(index)[1].body as string);

  const getFetchFormBody = (index = 0): FormData =>
    getFetchArgs(index)[1].body as FormData;

  const getFetchHeaders = (index = 0): Record<string, string> =>
    getFetchArgs(index)[1].headers as Record<string, string>;

  const findCallBodyByRecipient = (recipient: string) => {
    const call = ref.current.calls.find((c: { args: unknown[] }) => {
      const body = JSON.parse(
        (c.args as [string, RequestInit])[1].body as string,
      );
      return body.to?.[0] === recipient;
    });
    return JSON.parse((call.args as [string, RequestInit])[1].body as string);
  };

  const allRecipients = (): string[][] =>
    ref.current.calls.map(
      (c: { args: unknown[] }) =>
        JSON.parse((c.args as [string, RequestInit])[1].body as string).to,
    );

  return {
    allRecipients,
    callCount,
    findCallBodyByRecipient,
    getFetchArgs,
    getFetchFormBody,
    getFetchHeaders,
    getFetchJsonBody,
    restubFetch,
  };
};

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const randomString = (length: number): string => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const NTFY_TEST_TOPIC = "https://ntfy.sh/test-topic";

export const stubNtfyFetch = (
  env: Record<string, string | undefined> = {},
): { fetchStub: Stub; restore: EnvScope } => {
  const restore = withEnv({ NTFY_URL: NTFY_TEST_TOPIC, ...env });
  const fetchStub = stubFetch(() => new Response());
  return { fetchStub, restore };
};

export const expectNtfyNotification = (
  fetchStub: Stub,
  expectedBody?: string,
): ReturnType<typeof fetchStub.calls.find> => {
  const ntfyCall = fetchStub.calls.find((c) => c.args[0] === NTFY_TEST_TOPIC);
  expect(ntfyCall).toBeDefined();
  if (expectedBody !== undefined) {
    expect((ntfyCall!.args[1] as RequestInit).body).toBe(expectedBody);
  }
  return ntfyCall;
};
