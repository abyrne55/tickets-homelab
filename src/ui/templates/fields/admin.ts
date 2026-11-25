/**
 * Admin/operator form fields — login, setup, password change, payment-provider
 * keys, invite user, and holidays. Each is a per-request
 * builder because every label/hint flows through the i18n layer.
 */

import { t } from "#i18n";
import { defineFieldsForm, type FormValues } from "#shared/forms/definition.ts";
import type { Field, InputField } from "#shared/forms/field.ts";
import { MAX_INPUT_LENGTH, PASSWORD_MIN_LENGTH } from "#shared/limits.ts";
import { PAYMENT_PROVIDERS } from "#shared/payment-providers.ts";
import { picklistOptions } from "#templates/fields/picklist-options.ts";
import {
  getUsernameFieldBase,
  validateDate,
  validateUsername,
} from "#templates/fields/validators.ts";
import { AdminLevelSchema } from "#types";

/**
 * Login form field definitions (per-request builder)
 */
const getLoginFields = () =>
  [
    { ...getUsernameFieldBase(), autocomplete: "username" },
    {
      autocomplete: "current-password",
      label: t("fields.login.password"),
      name: "password",
      required: true,
      type: "password",
    },
  ] as const satisfies readonly Field[];

export const getLoginForm = defineFieldsForm(getLoginFields);

/**
 * Holiday form field definitions (per-request builder)
 */
const getHolidayFields = () =>
  [
    {
      label: t("fields.holiday.name"),
      name: "name",
      placeholder: t("fields.holiday.name_placeholder"),
      required: true,
      type: "text",
    },
    {
      label: t("fields.holiday.start_date"),
      name: "start_date",
      required: true,
      type: "date",
      validate: validateDate,
    },
    {
      hint: t("fields.holiday.end_date_hint"),
      label: t("fields.holiday.end_date"),
      name: "end_date",
      required: true,
      type: "date",
      validate: validateDate,
    },
  ] as const satisfies readonly Field[];

export const getHolidayForm = defineFieldsForm(getHolidayFields);

/** Password field telling the browser to offer a new password, not a saved one.
 *  The length cap applies to the credential being CHOSEN here, never to a
 *  login/current-password field, which must accept an existing credential of
 *  any length an older site allowed. */
const newPasswordField = <TName extends string>(
  name: TName,
  label: string,
  { confirm }: { confirm?: boolean } = {},
): InputField<TName> & { required: true } => ({
  autocomplete: "new-password",
  label,
  maxlength: MAX_INPUT_LENGTH,
  name,
  required: true,
  type: "password",
  ...(!confirm && {
    hint: t("fields.setup.password_hint"),
    minlength: PASSWORD_MIN_LENGTH,
  }),
});

const newPasswordFields = <TName extends string, TConfirmName extends string>(
  name: TName,
  label: string,
  confirmName: TConfirmName,
  confirmLabel: string,
) =>
  [
    newPasswordField(name, label),
    newPasswordField(confirmName, confirmLabel, { confirm: true }),
  ] as const;

/**
 * Setup form field definitions (per-request builder)
 * Note: Stripe keys are now configured via environment variables
 */
const getSetupFields = () =>
  [
    {
      autocomplete: "username",
      hint: t("fields.setup.username_hint"),
      label: t("fields.setup.username"),
      maxlength: MAX_INPUT_LENGTH,
      minlength: 1,
      name: "admin_username",
      pattern: "[a-zA-Z0-9][a-zA-Z0-9_\\-]*",
      required: true,
      title: t("fields.setup.username_title"),
      type: "text",
      validate: validateUsername,
    },
    ...newPasswordFields(
      "admin_password",
      t("fields.setup.password"),
      "admin_password_confirm",
      t("fields.setup.confirm_password"),
    ),
  ] as const satisfies readonly Field[];

export const getSetupForm = defineFieldsForm(getSetupFields);

/**
 * Change password form field definitions (per-request builder)
 */
const getChangePasswordFields = () =>
  [
    {
      autocomplete: "current-password",
      label: t("fields.change_password.current"),
      name: "current_password",
      required: true,
      type: "password",
    },
    ...newPasswordFields(
      "new_password",
      t("fields.change_password.new"),
      "new_password_confirm",
      t("fields.change_password.confirm"),
    ),
  ] as const satisfies readonly Field[];

export const getChangePasswordForm = defineFieldsForm(getChangePasswordFields);

/** A required payment-provider credential field: never autofilled, always
 * carries a hint, and (when given) a placeholder. `type` is "password" for
 * secret keys/tokens and "text" for public ids like a location or merchant
 * code. Password-type fields declare their own cap because the free-text
 * default no longer covers password inputs. */
const secretField = ({
  hint,
  label,
  name,
  placeholder,
  type = "password",
}: {
  hint: string;
  label: string;
  name: string;
  placeholder?: string;
  type?: "password" | "text";
}): Field => ({
  autocomplete: "off",
  hint,
  label,
  maxlength: MAX_INPUT_LENGTH,
  name,
  ...(placeholder !== undefined && { placeholder }),
  required: true,
  type,
});

/** One credential, named by the locale key its wording lives under: `<key>` is
 * the label, `<key>_hint` the hint, and `<key>_placeholder` the placeholder
 * when the catalog carries one. A credential with no example to show says so
 * with `noPlaceholder`. */
const credentialField = (
  key: string,
  name: string,
  extra: { noPlaceholder?: true; type?: "text" } = {},
): Field =>
  secretField({
    hint: t(`${key}_hint`),
    label: t(key),
    name,
    ...(extra.noPlaceholder ? {} : { placeholder: t(`${key}_placeholder`) }),
    ...(extra.type && { type: extra.type }),
  });

/** The key + id pair a credentials form asks for: the provider's secret or
 * key field first, then one plain-text id field. */
const providerCredentialFields = (
  provider: keyof typeof PAYMENT_PROVIDERS,
  secretKeyLabel: string,
  idField: { keyLabel: string; name: string },
): Field[] => [
  credentialField(
    `fields.${provider}.${secretKeyLabel}`,
    PAYMENT_PROVIDERS[provider].secretField,
  ),
  credentialField(`fields.${provider}.${idField.keyLabel}`, idField.name, {
    type: "text",
  }),
];

/**
 * Stripe key settings form field definitions (per-request builder)
 */
export const getStripeKeyFields = (): Field[] => [
  credentialField(
    "fields.stripe.secret_key",
    PAYMENT_PROVIDERS.stripe.secretField,
  ),
];

/**
 * Square access token and location form field definitions (per-request builder)
 */
export const getSquareAccessTokenFields = (): Field[] =>
  providerCredentialFields("square", "access_token", {
    keyLabel: "location_id",
    name: "square_location_id",
  });

/**
 * Square webhook settings form field definitions (per-request builder)
 */
export const getSquareWebhookFields = (): Field[] => [
  credentialField("fields.square.webhook_key", "square_webhook_signature_key", {
    noPlaceholder: true,
  }),
];

/**
 * SumUp API key and merchant code form field definitions (per-request builder)
 */
export const getSumupFields = (): Field[] =>
  providerCredentialFields("sumup", "api_key", {
    keyLabel: "merchant_code",
    name: "sumup_merchant_code",
  });

/**
 * Invite user form field definitions (per-request builder)
 */
const getInviteUserFields = () =>
  [
    {
      ...getUsernameFieldBase(),
      hint: t("fields.user.username_hint"),
      validate: validateUsername,
    },
    {
      // A blank option leads so nothing is pre-selected: the role is required, so
      // an unchanged form is rejected ("Role is required") rather than silently
      // granting whatever option happens to sit first (AdminLevelSchema lists
      // owner first). The operator must pick a role deliberately.
      invalidMessage: t("error.invalid_role"),
      label: t("fields.user.role"),
      name: "admin_level",
      options: [
        { label: t("fields.user.role_placeholder"), value: "" },
        ...picklistOptions(AdminLevelSchema, "fields.user"),
      ],
      required: true,
      type: "select",
    },
  ] as const satisfies readonly Field[];

export const getInviteUserForm = defineFieldsForm(getInviteUserFields);

export type InviteUserFormValues = FormValues<
  ReturnType<typeof getInviteUserForm>
>;
