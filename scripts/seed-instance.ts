/**
 * Seed a FRESH, throwaway instance with representative test data.
 *
 *   deno run --allow-net --allow-env scripts/seed-instance.ts [--url http://localhost:3000]
 *
 * Env: TICKETS_URL (default http://localhost:3000), ADMIN_USERNAME (default
 * "admin"), ADMIN_PASSWORD (default: a random one, printed at the end).
 *
 * No setting skips /setup, so the script drives the HTML forms (setup, login,
 * feature switches, API key), then seeds through the typed admin JSON API.
 * It fails on an instance that is already set up.
 */

import {
  type AdminApiTransport,
  adminApiChildCreate,
  adminApiWrite,
} from "#shared/admin-api-client.ts";
import { ADMIN_API_RESOURCES } from "#shared/admin-api-resources.ts";

const argUrl = (): string | undefined => {
  const at = Deno.args.indexOf("--url");
  return at === -1 ? undefined : Deno.args[at + 1];
};

const BASE = (
  argUrl() ??
  Deno.env.get("TICKETS_URL") ??
  "http://localhost:3000"
).replace(/\/$/, "");
const USERNAME = Deno.env.get("ADMIN_USERNAME") ?? "admin";
const GENERATED_PASSWORD = !Deno.env.get("ADMIN_PASSWORD");

const randomPassword = (): string => {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};
const PASSWORD = Deno.env.get("ADMIN_PASSWORD") ?? randomPassword();

const fail = (message: string): never => {
  throw new Error(message);
};

/* ---------------------------------------------------------------- HTTP --- */

/** Cookies the server set, forwarded on every later request. */
const jar = new Map<string, string>();

const storeCookies = (response: Response): void => {
  for (const line of response.headers.getSetCookie()) {
    const [pair = "", ...attrs] = line.split(";").map((part) => part.trim());
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expired = attrs.some((attr) => /^max-age=0$/i.test(attr));
    if (expired || value === "") jar.delete(name);
    else jar.set(name, value);
  }
};

const cookieHeader = (): string =>
  Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");

/** One request with manual redirects, so every 302 stays visible. An empty
 *  Cookie header makes the server answer 503, so it is sent only when set. */
const send = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const cookie = cookieHeader();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  storeCookies(response);
  return response;
};

const postForm = (
  path: string,
  fields: [string, string][],
): Promise<Response> =>
  send(path, {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

/** The hidden token input; attribute order varies. */
const CSRF_PATTERN = /name="csrf_token"[^>]*value="([^"]+)"/;

const scrape = (html: string, pattern: RegExp, what: string): string =>
  html.match(pattern)?.[1] ?? fail(`could not find ${what} in the page`);

const csrfFrom = async (path: string): Promise<string> => {
  const response = await send(path);
  return scrape(
    await response.text(),
    CSRF_PATTERN,
    `csrf_token on ${path} (status ${response.status} ${response.headers.get("location") ?? ""})`,
  );
};

const expectRedirect = (
  response: Response,
  to: string,
  step: string,
): Response =>
  response.status === 302 && response.headers.get("location") === to
    ? response
    : fail(
        `${step}: expected 302 to ${to}, got ${response.status} ${response.headers.get("location") ?? ""}`,
      );

/* ------------------------------------------------------- Session steps --- */

const setup = async (): Promise<void> => {
  const page = await send("/setup");
  if (page.status === 302 && page.headers.get("location") === "/") {
    fail(`already set up: ${BASE} is not a fresh instance`);
  }
  const csrf = scrape(await page.text(), CSRF_PATTERN, "csrf_token on /setup");
  const response = await postForm("/setup", [
    ["csrf_token", csrf],
    ["admin_username", USERNAME],
    ["admin_password", PASSWORD],
    ["admin_password_confirm", PASSWORD],
    ["accept_agreement", "yes"],
    ["country", "US"],
  ]);
  expectRedirect(response, "/setup/complete", "setup");
};

const login = async (): Promise<void> => {
  const csrf = await csrfFrom("/admin/login");
  const response = await postForm("/admin/login", [
    ["csrf_token", csrf],
    ["username", USERNAME],
    ["password", PASSWORD],
  ]);
  if (response.status !== 302) fail(`login failed (status ${response.status})`);
  if (!Array.from(jar.keys()).some((name) => name.endsWith("session"))) {
    fail("login set no session cookie");
  }
};

const enableFeature = async (slug: string): Promise<void> => {
  const path = `/admin/features/${slug}`;
  const response = await postForm(path, [
    ["csrf_token", await csrfFrom(path)],
    ["enabled", "true"],
  ]);
  if (response.status !== 302) {
    fail(`enabling ${slug} failed (status ${response.status})`);
  }
};

const createApiKey = async (): Promise<string> => {
  const created = await postForm("/admin/api-keys", [
    ["csrf_token", await csrfFrom("/admin/api-keys")],
    ["name", "seed-script"],
  ]);
  if (created.status !== 302) fail(`API key create failed (${created.status})`);
  const page = await send(created.headers.get("location") ?? "/admin/api-keys");
  return scrape(
    await page.text(),
    /<pre><code>([^<]+)<\/code><\/pre>/,
    "the new API key",
  );
};

/* -------------------------------------------------------------- Seeding --- */

const apiTransport =
  (key: string): AdminApiTransport =>
  async ({ body, method, path }) => {
    const response = await fetch(`${BASE}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      method,
    });
    const text = await response.text();
    return {
      data: text ? JSON.parse(text) : undefined,
      status: response.status,
    };
  };

const DAY_MS = 86_400_000;

/** 18:00 UTC, `days` from now, so seeded events are always upcoming. */
const inDays = (days: number): string => {
  const day = new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
  return `${day}T18:00:00.000Z`;
};

type Seed = Record<string, unknown>;

const GROUPS: { slug: string; body: Seed }[] = [
  {
    body: {
      description:
        "Kick off the season with a cozy evening of cookie decorating. We provide the baked cookies, piping bags, icing in every color, sprinkles, and plenty of aprons. Bring your imagination, and stay for the friendly contest at the end, where the most inventive plate wins a prize. Please note that each order is limited to one ticket, and this is a sober event, so no alcohol, please.",
      name: "Holiday Cookie Decorating",
      single_ticket_per_order: true,
      terms_and_conditions:
        "Refunds are available until 48 hours before the event; after that, tickets are non-refundable. Our cookies and decorations may contain wheat, eggs, milk, nuts, and soy, and are prepared in a kitchen that handles other allergens, so please tell us about any allergies when you book. Guests are expected to treat each other and the venue with respect, and we may ask anyone who does not to leave. By attending you accept responsibility for your own safety and that of any belongings you bring.",
    },
    slug: "cookie-decorating",
  },
  {
    body: {
      description:
        "An evening of live music from local players, with a pay-what-you-can door so everyone can come. Pick the amount that works for you, and know that anything above the minimum helps us keep this series going. Doors open half an hour before the first set, and there will be tea and snacks by donation.",
      name: "Pay What You Can Concert",
      terms_and_conditions:
        "All sales are final and non-refundable. This event is open to all ages.",
    },
    slug: "pwyc-concert",
  },
  {
    body: {
      description:
        "Drop in for a relaxed night of board games, completely free of charge. We have a big shelf of favorites for beginners and veterans alike, and volunteers happy to teach any of them. Bring a friend, or come alone and find a table to join. The extra supporter ticket is optional and helps with snacks and new games.",
      name: "Free Board Game Night",
    },
    slug: "board-game-night",
  },
];

type ListingSeed = {
  group: string | null;
  slug?: string | undefined;
  body: Seed;
};

const listing = (
  group: string | null,
  daysAhead: number,
  location: string,
  body: Seed,
  slug?: string,
): ListingSeed => ({
  body: {
    date: inDays(daysAhead),
    fields: "email",
    location,
    show_remaining: true,
    ...body,
  },
  group,
  slug,
});

const LISTINGS: ListingSeed[] = [
  listing(
    null,
    14,
    "Maple Street Community Hall",
    { max_attendees: 30, name: "Community Workshop", unit_price: 1500 },
    "community-workshop",
  ),
  listing("cookie-decorating", 21, "The Gingerbread Kitchen, 12 Oak Lane", {
    max_attendees: 20,
    name: "Regular Ticket",
    unit_price: 2500,
  }),
  listing("cookie-decorating", 21, "The Gingerbread Kitchen, 12 Oak Lane", {
    description:
      "Limited availability: a small number of reduced-price tickets for anyone who needs them.",
    max_attendees: 5,
    name: "Scholarship Ticket",
    unit_price: 500,
  }),
  listing("cookie-decorating", 21, "The Gingerbread Kitchen, 12 Oak Lane", {
    can_pay_more: true,
    description:
      "Pay a little extra: the additional funds pay for scholarship tickets.",
    max_attendees: 10,
    max_price: 10000,
    name: "Supporter Ticket",
    unit_price: 2500,
  }),
  listing("pwyc-concert", 28, "Riverside Bandstand", {
    can_pay_more: true,
    max_attendees: 50,
    max_price: 10000,
    name: "General Admission",
    unit_price: 1000,
  }),
  listing("board-game-night", 28, "The Dice & Dragon Cafe", {
    max_attendees: 40,
    name: "RSVP",
    show_remaining: false,
    unit_price: 0,
  }),
  listing("board-game-night", 28, "The Dice & Dragon Cafe", {
    can_pay_more: true,
    description: "Helps cover snacks and new games for the shelf.",
    max_attendees: 10,
    max_price: 5000,
    // Listing names are unique across the instance, so this one differs.
    name: "Snack Supporter Ticket",
    unit_price: 500,
  }),
];

type QuestionSeed = {
  group: string;
  text: string;
  display_type: "free_text" | "radio" | "select";
  answers: string[];
};

const QUESTIONS: QuestionSeed[] = [
  {
    answers: [],
    display_type: "free_text",
    group: "cookie-decorating",
    text: "Allergies?",
  },
  {
    answers: ["Regular", "Vegan"],
    display_type: "radio",
    group: "cookie-decorating",
    text: "Cookie preference",
  },
  {
    answers: ["Friend", "Social media", "Flyer", "Other"],
    display_type: "select",
    group: "pwyc-concert",
    text: "How did you hear about us?",
  },
  {
    answers: ["Beginner", "Intermediate", "Expert"],
    display_type: "radio",
    group: "board-game-night",
    text: "Experience level",
  },
];

type Api = AdminApiTransport;
type Created = { group: string | null; id: number };

const idsFor = (rows: Created[], group: string): number[] =>
  rows.filter((row) => row.group === group).map((row) => row.id);

// Create writes a random slug, so each row gets its fixed slug right after.
const createGroups = async (api: Api): Promise<Map<string, number>> => {
  const { groups } = ADMIN_API_RESOURCES;
  const ids = new Map<string, number>();
  for (const { body, slug } of GROUPS) {
    const { group } = await adminApiWrite(
      api,
      groups,
      "create",
      undefined,
      body,
    );
    await adminApiWrite(api, groups, "update", group.id, { slug });
    ids.set(slug, group.id);
  }
  return ids;
};

const createListings = async (
  api: Api,
  groupIds: Map<string, number>,
): Promise<Created[]> => {
  const { listings } = ADMIN_API_RESOURCES;
  const created: Created[] = [];
  for (const { body, group, slug } of LISTINGS) {
    const groupId = group === null ? undefined : groupIds.get(group);
    const { listing: row } = await adminApiWrite(
      api,
      listings,
      "create",
      undefined,
      { ...body, ...(groupId === undefined ? {} : { group_ids: [groupId] }) },
    );
    if (slug) await adminApiWrite(api, listings, "update", row.id, { slug });
    created.push({ group, id: row.id });
  }
  return created;
};

const createQuestions = async (api: Api): Promise<Created[]> => {
  const { questions } = ADMIN_API_RESOURCES;
  const created: Created[] = [];
  for (const { answers, display_type, group, text } of QUESTIONS) {
    const { question } = await adminApiWrite(
      api,
      questions,
      "create",
      undefined,
      {
        assign_all: false,
        display_type,
        text,
      },
    );
    for (const answer of answers) {
      await adminApiChildCreate(api, questions, "answers", question.id, {
        text: answer,
      });
    }
    created.push({ group, id: question.id });
  }
  return created;
};

/** No API assigns a question to a listing, so this uses the session form. */
const assignQuestions = async (
  listingId: number,
  questionIds: number[],
): Promise<void> => {
  const path = `/admin/listing/${listingId}/questions`;
  const response = await postForm(path, [
    ["csrf_token", await csrfFrom(path)],
    ...questionIds.map((id): [string, string] => ["question_ids", String(id)]),
  ]);
  if (response.status !== 302) {
    fail(
      `assigning questions to listing ${listingId} failed (${response.status})`,
    );
  }
};

const seedData = async (key: string): Promise<void> => {
  const api = apiTransport(key);
  const listings = await createListings(api, await createGroups(api));
  const questions = await createQuestions(api);
  for (const { group, id } of listings) {
    if (group !== null) await assignQuestions(id, idsFor(questions, group));
  }
};

/* ----------------------------------------------------------------- Main --- */

const main = async (): Promise<void> => {
  await setup();
  await login();
  await enableFeature("api-keys");
  await enableFeature("questions");
  const key = await createApiKey();
  await seedData(key);
  console.log(`Seeded ${BASE}`);
  console.log(`  username: ${USERNAME}`);
  if (GENERATED_PASSWORD) console.log(`  password: ${PASSWORD}`);
  console.log(`  API key:  ${key}`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  Deno.exit(1);
}
