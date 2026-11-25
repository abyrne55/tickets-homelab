/**
 * Admin advanced settings page template
 */

import { t } from "#i18n";
import { SETTINGS_FORMS } from "#shared/settings/forms.ts";
import { AppleWalletForm } from "#templates/admin/settings/apple-wallet.tsx";
import { EmailNotificationsForm } from "#templates/admin/settings/email.tsx";
import { AdminEmailTemplateForm } from "#templates/admin/settings/email-tpl-admin.tsx";
import { ConfirmationEmailTemplateForm } from "#templates/admin/settings/email-tpl-confirmation.tsx";
import { GoogleWalletForm } from "#templates/admin/settings/google-wallet.tsx";
import { settingsPage } from "#templates/admin/settings/page-shell.tsx";
import { settingsForm } from "#templates/admin/settings/schema-form.tsx";
import { SmsGatewayForm } from "#templates/admin/settings/sms-gateway.tsx";
import type { EmailContent } from "#templates/email/shared.ts";
import type { AdminSession, PaymentProviderType, Theme } from "#types";

export type AdvancedSettingsPageState = {
  showPublicApi: boolean;
  externalOrderEnabled: boolean;
  emailProvider: string;
  emailApiKeyConfigured: boolean;
  emailFromAddress: string;
  hostEmailLabel: string;
  businessEmail: string;
  confirmationTemplates: EmailContent;
  adminTemplates: EmailContent;
  customCss: string;
  appleWalletConfigured: boolean;
  appleWalletPassTypeId: string;
  appleWalletTeamId: string;
  hostAppleWalletLabel: string;
  googleWalletConfigured: boolean;
  googleWalletIssuerId: string;
  googleWalletServiceAccountEmail: string;
  hostGoogleWalletLabel: string;
  theme: Theme;
  listingColumnOrder: string;
  attendeeColumnOrder: string;
  existingPaymentProvider: PaymentProviderType | null;
  paymentProviderRecoveryNeeded: boolean;
  smsGatewayUsername: string;
  smsGatewayBaseUrl: string;
  smsGatewayPasswordConfigured: boolean;
  smsGatewayPassphraseConfigured: boolean;
  smsGatewayWebhookConfigured: boolean;
  scheduledTaskKey: string | undefined;
};

export const adminAdvancedSettingsPage = (
  session: AdminSession,
  s: AdvancedSettingsPageState,
): string =>
  settingsPage(t("settings.advanced.title"), "/admin/settings-advanced")(
    session,
    s.theme,
  )(
    <>
      <article>
        <aside>
          <p>{t("settings.advanced.warning")}</p>
        </aside>
      </article>

      {EmailNotificationsForm(s)}
      {ConfirmationEmailTemplateForm(s)}
      {AdminEmailTemplateForm(s)}
      {settingsForm(SETTINGS_FORMS.listingColumnOrder, s)}
      {settingsForm(SETTINGS_FORMS.attendeeColumnOrder, s)}
      {settingsForm(SETTINGS_FORMS.customCss, s)}
      {settingsForm(SETTINGS_FORMS.showPublicApi, s)}
      {settingsForm(SETTINGS_FORMS.externalOrder, s)}
      {GoogleWalletForm(s)}
      {AppleWalletForm(s)}
      {SmsGatewayForm(s)}

      <article class="prose">
        <h2>{t("settings.advanced.scheduled_title")}</h2>
        <p>{t("settings.advanced.scheduled_intro")}</p>
        {s.scheduledTaskKey ? (
          <code>{s.scheduledTaskKey}</code>
        ) : (
          <p>{t("settings.advanced.scheduled_unset")}</p>
        )}
      </article>
    </>,
  );
