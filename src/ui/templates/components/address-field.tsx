/**
 * The address textarea the admin attendee forms share.
 */

import { t } from "#i18n";
import { textareaBody } from "#templates/components/textarea.tsx";
import { CONTACT_TEXTAREA_LIMIT } from "#templates/fields/validators.ts";

export const AddressField = ({ address }: { address: string }): JSX.Element => (
  <label for="address">
    {t("common.address")}
    <textarea
      autocomplete="off"
      id="address"
      maxlength={CONTACT_TEXTAREA_LIMIT}
      name="address"
      rows={3}
    >
      {textareaBody(address)}
    </textarea>
  </label>
);
