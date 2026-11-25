/**
 * The alphabetical first half of the app prefix registry: the home page
 * through `join`. See `prefixes.ts` for what a declaration means, and join a
 * new prefix to the half its name sorts into.
 */

import { CONFIG_KEYS } from "#db/settings.ts";
import {
  ADMIN_SHELL_MESSAGE_GROUPS,
  JOIN_MESSAGE_GROUPS,
  publicMessageGroups,
} from "#locales/groups.ts";
import type { PrefixSpec } from "./prefix-fold.ts";
import {
  apiPrefixHandler,
  contactPrefixHandler,
  customCssPrefixHandler,
  feedRoutes,
  legacyEventsRedirectHandler,
  publicPageRoute,
  requirePublicSiteGet,
  routeFromModule,
  routerFromModule,
  ticketRoutes,
} from "./prefix-handlers.ts";
import {
  ADMIN_SETTINGS,
  ALL_SNAPSHOT_SETTINGS,
  EMAIL_SETTINGS,
  EMBEDDABLE_BOOKING_SETTINGS,
  GOOGLE_WALLET_SETTINGS,
  OWNER_AUTH_SETTINGS,
  PUBLIC_NAV_SETTINGS,
} from "./prefix-setting-keys.ts";

export const PREFIXES_A_L = {
  "": {
    ...publicPageRoute("", (pages) => pages.handleHome),
    messageGroups: publicMessageGroups("public-site"),
    settings: [
      ...PUBLIC_NAV_SETTINGS,
      CONFIG_KEYS.HOMEPAGE_TEXT,
      CONFIG_KEYS.COUNTRY,
    ],
  },
  // Everything (can touch any setting).
  admin: {
    handler: routeFromModule(
      () => import("#routes/admin/index.ts"),
      "routeAdmin",
    ),
    settings: ADMIN_SETTINGS,
  },
  api: {
    handler: apiPrefixHandler,
    settings: ALL_SNAPSHOT_SETTINGS,
  },
  attachment: {
    getOnly: true,
    handler: routerFromModule(
      () => import("#routes/attachments.ts"),
      ({ attachmentRoutes }) => attachmentRoutes,
    ),
    settings: [],
  },
  // Booking running total: reprices the cart with the same code path as
  // /ticket, so it needs the same booking-flow settings (not the full
  // snapshot).
  calculate: {
    handler: ticketRoutes,
    messageGroups: publicMessageGroups("payment", "tickets", "validation"),
    settings: EMBEDDABLE_BOOKING_SETTINGS,
  },
  caldav: {
    getOnly: true,
    handler: feedRoutes,
    settings: ALL_SNAPSHOT_SETTINGS,
  },
  // Check-in (owner-authenticated admin view).
  checkin: {
    handler: routeFromModule(
      () => import("#routes/checkin.ts"),
      "routeCheckin",
    ),
    messageGroups: [
      ...ADMIN_SHELL_MESSAGE_GROUPS,
      "attendees",
      "check-in",
      "listing-qr",
      "validation",
    ],
    settings: [
      CONFIG_KEYS.COUNTRY,
      CONFIG_KEYS.ATTENDEE_COLUMN_ORDER,
      ...OWNER_AUTH_SETTINGS,
    ],
  },
  // Contact form submission sends an email to the business address.
  contact: {
    gate: requirePublicSiteGet("/contact"),
    handler: contactPrefixHandler,
    messageGroups: publicMessageGroups("contact", "public-site", "validation"),
    settings: [...PUBLIC_NAV_SETTINGS, CONFIG_KEYS.COUNTRY, ...EMAIL_SETTINGS],
  },
  // The custom stylesheet route reads only the custom_css setting. The CSP
  // rebuild reads the derived flag, which is infra.
  "custom.css": {
    getOnly: true,
    handler: customCssPrefixHandler,
    settings: [CONFIG_KEYS.CUSTOM_CSS],
  },
  events: {
    getOnly: true,
    handler: legacyEventsRedirectHandler,
    settings: [],
  },
  // Feeds (ICS/RSS): website title + country (timezone).
  feeds: {
    getOnly: true,
    handler: feedRoutes,
    settings: [CONFIG_KEYS.WEBSITE_TITLE, CONFIG_KEYS.COUNTRY],
  },
  gwallet: {
    getOnly: true,
    handler: routeFromModule(
      () => import("#routes/wallet/google.ts"),
      "routeGoogleWallet",
    ),
    messageGroups: publicMessageGroups("tickets"),
    settings: [...GOOGLE_WALLET_SETTINGS, CONFIG_KEYS.COUNTRY],
  },
  // Binary and JSON responses, or pure redirects.
  image: {
    getOnly: true,
    handler: routeFromModule(() => import("#routes/images.ts"), "routeImage"),
    settings: [],
  },
  // The non-expiring invoice share link. It renders the frozen body and the
  // shared pay button, and reads the site currency for the amount it charges.
  invoice: {
    handler: routeFromModule(
      () => import("#routes/public/invoice.ts"),
      "routeInvoice",
    ),
    messageGroups: publicMessageGroups("invoices", "payment"),
    settings: [CONFIG_KEYS.COUNTRY],
  },
  join: {
    handler: routeFromModule(() => import("#routes/join.ts"), "routeJoin"),
    messageGroups: JOIN_MESSAGE_GROUPS,
    settings: [],
  },
} satisfies Record<string, PrefixSpec>;
