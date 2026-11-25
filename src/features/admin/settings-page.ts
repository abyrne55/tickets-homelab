/**
 * Admin settings page rendering - GET /admin/settings and
 * GET /admin/settings-advanced, plus the state-gathering they depend on.
 * Owner-only access.
 */

import { getAdminFeatureUsage } from "#db/admin-features.ts";
import { serializeTaxPolicy } from "#db/settings/tax.ts";
import { settings } from "#db/settings.ts";
import type { AuthSession } from "#routes/auth.ts";
import { authPageAt } from "#routes/route-gates.ts";
import type { TypedRouteHandler } from "#routes/router.ts";
import { enabledFeaturesWithUsage } from "#shared/admin-features.ts";
import { EMAIL_PROVIDER_LABELS, hostEmail } from "#shared/email.ts";
import { getEnv } from "#shared/env.ts";
import { existingPaymentProviderState } from "#shared/existing-payment-provider.ts";
import {
  paymentProviderHasCredentials,
  paymentProviderMode,
} from "#shared/payment-provider-status.ts";
import { getPaymentWebhookUrl } from "#shared/payment-webhook-url.ts";
import { SCHEDULED_TASK_KEY_ENV } from "#shared/scheduled-keys.ts";
import { isStorageEnabled } from "#shared/storage.ts";
import {
  adminSettingsPage,
  type ShownPaymentProvider,
} from "#templates/admin/settings.tsx";
import { adminAdvancedSettingsPage } from "#templates/admin/settings-advanced.tsx";
import type { PaymentProviderType } from "#types";

/** The line a wallet configured through host env settings shows: its detail,
 *  or nothing when no host config stands behind the settings. */
const hostWalletLabel = (detail: string | undefined): string =>
  detail === undefined ? "" : `Host env (${detail})`;

/** The provider whose credentials form the settings page shows, and what the
 *  stored credentials for it say. Sales being off does not hide the form: the
 *  provider that owns the payments already taken still needs its keys. */
const shownPaymentProvider = (
  existing: PaymentProviderType | null,
): ShownPaymentProvider | null => {
  const provider = settings.paymentProvider ?? existing;
  return provider === null
    ? null
    : {
        configured: paymentProviderHasCredentials(provider),
        mode: paymentProviderMode(provider),
        provider,
      };
};

/**
 * Gather all state needed to render the settings page.
 */
const getSettingsPageState = async () => {
  const featureUsage = await getAdminFeatureUsage();
  const existingPaymentProvider = existingPaymentProviderState();
  const tax = settings.tax;
  return {
    bookingFee: settings.bookingFee,
    businessEmail: settings.businessEmail,
    calendarFeedsEnabled: settings.calendarFeedsEnabled,
    calendarFeedsGroupBy: settings.calendarFeedsGroupBy,
    currency: settings.currency,
    embedHosts: settings.embedHosts,
    enabledFeatures: enabledFeaturesWithUsage(settings.features, featureUsage),
    expectedTax: serializeTaxPolicy(tax),
    headerImageUrl: settings.headerImageUrl,
    paymentProvider: settings.paymentProvider,
    paymentProviderRecoveryChoices: existingPaymentProvider.recoveryChoices,
    shownPaymentProvider: shownPaymentProvider(
      existingPaymentProvider.provider,
    ),
    siteFooter: settings.siteFooter,
    squareWebhookConfigured: settings.square.webhookSignatureKey !== "",
    storageEnabled: isStorageEnabled(),
    taxMode: tax.mode,
    taxRate: tax.mode === "none" ? "" : (tax.rateBasisPoints / 100).toFixed(2),
    termsAndConditions: settings.terms,
    theme: settings.theme,
    underlineLinks: settings.underlineLinks,
    webhookUrl: getPaymentWebhookUrl(),
  };
};

/** Render the settings page with current state */
const renderSettingsPage = async (session: AuthSession) => {
  const state = await getSettingsPageState();
  return adminSettingsPage(session, state);
};

/** Gather state for the advanced settings page */
const getAdvancedSettingsPageState = () => {
  const confirmationTemplates = settings.email.templateSet("confirmation");
  const adminTemplates = settings.email.templateSet("admin");
  const existingPaymentProvider = existingPaymentProviderState();
  return {
    adminTemplates,
    appleWalletConfigured: settings.appleWallet.hasDbConfig,
    appleWalletPassTypeId: settings.appleWallet.passTypeId,
    appleWalletTeamId: settings.appleWallet.teamId,
    attendeeColumnOrder: settings.attendeeColumnOrder,
    businessEmail: settings.businessEmail,
    confirmationTemplates,
    customCss: settings.customCss,
    emailApiKeyConfigured: settings.email.hasApiKey,
    emailFromAddress: settings.email.fromAddress,
    emailProvider: settings.email.provider,
    existingPaymentProvider: existingPaymentProvider.provider,
    externalOrderEnabled: settings.externalOrderEnabled,
    googleWalletConfigured: settings.googleWallet.hasDbConfig,
    googleWalletIssuerId: settings.googleWallet.issuerId,
    googleWalletServiceAccountEmail: settings.googleWallet.serviceAccountEmail,
    hostAppleWalletLabel: hostWalletLabel(
      settings.appleWallet.hostConfig?.passTypeId,
    ),
    hostEmailLabel: (() => {
      const hostConfig = hostEmail.getHostConfig();
      if (!hostConfig) return "";
      const label = EMAIL_PROVIDER_LABELS[hostConfig.provider];
      return `Host ${label} (${hostConfig.fromAddress})`;
    })(),
    hostGoogleWalletLabel: hostWalletLabel(
      settings.googleWallet.hostConfig?.issuerId,
    ),
    listingColumnOrder: settings.listingColumnOrder,
    paymentProviderRecoveryNeeded:
      existingPaymentProvider.recoveryChoices.length > 0,
    scheduledTaskKey: getEnv(SCHEDULED_TASK_KEY_ENV),
    showPublicApi: settings.showPublicApi,
    smsGatewayBaseUrl: settings.smsGatewayBaseUrl,
    smsGatewayPassphraseConfigured: settings.smsGateway.hasPassphrase,
    smsGatewayPasswordConfigured: settings.smsGateway.hasPassword,
    smsGatewayUsername: settings.smsGatewayUsername,
    smsGatewayWebhookConfigured: settings.smsGateway.hasWebhookSecret,
    theme: settings.theme,
  };
};

/** Render the advanced settings page with current state */
const renderAdvancedSettingsPage = (session: AuthSession) =>
  adminAdvancedSettingsPage(session, getAdvancedSettingsPageState());

/**
 * Handle GET /admin/settings - owner only
 */
export const handleAdminSettingsGet: TypedRouteHandler<"GET /admin/settings"> =
  authPageAt("/admin/settings")((session) => renderSettingsPage(session));

/**
 * Handle GET /admin/settings-advanced - owner only
 */
export const handleAdminSettingsAdvancedGet: TypedRouteHandler<"GET /admin/settings-advanced"> =
  authPageAt("/admin/settings-advanced")((session) =>
    renderAdvancedSettingsPage(session),
  );
