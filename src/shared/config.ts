/**
 * Configuration module for the ticket reservation system.
 * Reads configuration from the database. Values are set during the setup
 * phase. Payment providers and keys are configured via admin settings, and
 * the sensitive ones are stored encrypted in the database.
 */

import { settings } from "#db/settings.ts";
import { getEnv, requireEnv } from "#shared/env.ts";
import { paymentProviderHasCredentials } from "#shared/payment-provider-status.ts";
import {
  currentRequestStore,
  getRequestEffectiveDomain,
  setRequestEffectiveDomain,
} from "#shared/request-context.ts";
import type { PaymentProviderType } from "#types";

/** One getter for an env var: required, or empty when it is not set. */
const envGetter = (name: string, required: boolean) => (): string =>
  required ? requireEnv(name) : (getEnv(name) ?? "");

/**
 * Pick the value for the active payment provider from a per-provider set, or
 * `null` when no provider is active. The set is keyed by the provider union,
 * so a caller cannot forget a provider: leaving one out is a compile error at
 * the call site rather than a silent `null` on a live site.
 */
export const providerValue = <T>(
  provider: PaymentProviderType | null,
  values: Readonly<Record<PaymentProviderType, T>>,
): T | null => (provider === null ? null : values[provider]);

/** Whether an active provider has the credentials a sale needs. */
export const isPaymentsEnabled = (): boolean => {
  const provider = settings.paymentProvider;
  return provider !== null && paymentProviderHasCredentials(provider);
};

/**
 * Get booking fee percentage from database.
 * Returns 0 if not set.
 */
export const getBookingFee = (): number =>
  Number.parseFloat(settings.bookingFee) || 0;

/**
 * The domain used before any request has resolved a real one — and the single
 * place the "localhost" fallback lives. The effective domain is seeded to this
 * at module load and reset to it between tests, so it is always a real string.
 */
const DEFAULT_DOMAIN = "localhost";

/**
 * The domain work outside a request reads: an error report sent from a failed
 * migration or a background job must still name the site. Requests never read
 * this. Each request carries its own domain on the request store. Two
 * concurrent requests with different hostnames therefore cannot seed each
 * other's domain into rendered links, QR codes, or cookies.
 */
const fallbackDomain = { domain: DEFAULT_DOMAIN };

const isIpv4Loopback = (domain: string): boolean => {
  const parts = domain.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => {
      const value = Number(part);
      return /^\d+$/.test(part) && value >= 0 && value <= 255;
    })
  );
};

const isLocalDevelopmentHost = (domain: string): boolean =>
  domain === DEFAULT_DOMAIN ||
  domain.endsWith(".localhost") ||
  domain === "[::1]" ||
  domain === "::1" ||
  isIpv4Loopback(domain);

/** Set the effective domain to the host the request named. Every
 * absolute-URL reader shares it, so the readers cannot disagree. */
export const loadEffectiveDomain = (requestUrl: URL): string => {
  const domain = requestUrl.hostname;
  setRequestEffectiveDomain(domain);
  fallbackDomain.domain = domain;
  return domain;
};

/**
 * Seed the effective domain from the request's own hostname.
 *
 * loadEffectiveDomain() runs late in the request (after settings are loaded),
 * so anything that fails before it — most notably database migrations on the
 * first request after a cold boot — would otherwise read the bare "localhost"
 * fallback in error notifications. Seeding the request host early makes those
 * notifications (e.g. ntfy titles) identify the real site.
 */
export const seedEffectiveDomainHost = (requestUrl: URL): void => {
  setRequestEffectiveDomain(requestUrl.hostname);
  fallbackDomain.domain = requestUrl.hostname;
};

/** Get the effective domain synchronously: the live request's own domain, or
 * DEFAULT_DOMAIN otherwise. A live request that has not seeded its domain yet
 * reads DEFAULT_DOMAIN, never the fallback — the fallback names the site for
 * out-of-request reporting, and one request's host must not answer another's
 * security-header decision. */
export const getEffectiveDomain = (): string =>
  getRequestEffectiveDomain() ??
  (currentRequestStore() ? DEFAULT_DOMAIN : fallbackDomain.domain);

/**
 * Whether we are serving a real, resolved host rather than the default. Gates
 * HTTPS-only behaviour — Secure/`__Host-` cookies and the HSTS header — which
 * must stay off for local development on DEFAULT_DOMAIN.
 */
export const isSecureMode = (): boolean =>
  !isLocalDevelopmentHost(getEffectiveDomain());

/** Reset effective domain cache back to the default (for testing). */
export const resetEffectiveDomain = (): void => {
  setRequestEffectiveDomain(DEFAULT_DOMAIN);
  fallbackDomain.domain = DEFAULT_DOMAIN;
};

/** Set effective domain directly (for testing): the live request's store when
 * one is being served, the out-of-request fallback otherwise. */
export const setEffectiveDomainForTest = (domain: string): void => {
  setRequestEffectiveDomain(domain);
  fallbackDomain.domain = domain;
};

/**
 * Get allowed embed hosts from database (encrypted, parsed to array)
 * Returns empty array if not configured (embedding allowed from anywhere)
 */
export const getEmbedHosts = async (): Promise<string[]> => {
  const raw = settings.embedHosts;
  if (!raw) return [];
  const { parseEmbedHosts } = await import("#shared/embed-hosts.ts");
  return parseEmbedHosts(raw);
};

/** True only when every named environment variable carries a value. Each
 * "is this integration set up" answer below is one of these, so a new one
 * names its variables rather than writing the check again. */
const allEnvSet =
  (...names: string[]): (() => boolean) =>
  (): boolean =>
    names.every((name) => !!getEnv(name));

/**
 * Diagnostic key gating the verbose `/health` response. Empty when unset, in
 * which case `/health` only ever returns the plain liveness reply. Holding the
 * key reveals non-private build/runtime diagnostics (commit, build time) that
 * are useful for operators but needlessly helpful to an attacker.
 */
export const getDebugKey = envGetter("DEBUG_KEY", false);

/**
 * Get the Botpoison public key from environment (safe to expose to browsers).
 * Returns empty string when unset.
 */
export const getBotpoisonPublicKey = envGetter("BOTPOISON_PUBLIC_KEY", false);

/**
 * Get the Botpoison secret key from environment (server-side verification only).
 * Returns empty string when unset.
 */
export const getBotpoisonSecretKey = envGetter("BOTPOISON_SECRET_KEY", false);

/**
 * Check if Botpoison spam protection is configured.
 * Requires both BOTPOISON_PUBLIC_KEY and BOTPOISON_SECRET_KEY to be set.
 * This gates the public contact form feature.
 */
export const isBotpoisonEnabled = allEnvSet(
  "BOTPOISON_PUBLIC_KEY",
  "BOTPOISON_SECRET_KEY",
);
