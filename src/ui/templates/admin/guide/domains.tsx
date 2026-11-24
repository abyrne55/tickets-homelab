/**
 * Admin guide — Domains sections.
 */

import { formatBytes } from "#shared/format-units.ts";
import { MAX_IMAGE_SIZE } from "#shared/limits.ts";
import {
  custom,
  faq,
  type GuideSection,
} from "#templates/admin/guide/components.tsx";

export const domainsSections = (): GuideSection[] => [
  {
    entries: [
      faq("available_settings"),
      custom(
        "how_does_the_header_image_work",
        <>
          <p>
            Upload a logo or banner from <strong>Settings</strong> and it
            appears at the top of every page.
          </p>
          <p>
            When your booking form is shown inside another website, the image is
            hidden. That website already shows its own branding.
          </p>
          <p>
            You can use JPEG, PNG, or WebP pictures, up to{" "}
            {formatBytes(MAX_IMAGE_SIZE)} in size. Uploading a new image
            replaces the old one, and the <strong>Remove Image</strong> button
            clears it completely. The picture is stored scrambled, and each
            visitor's browser keeps a copy so it only downloads once.
          </p>
          <p>
            If the section is missing, image storage is not turned on. Set
            <code>LOCAL_STORAGE_PATH</code> to a folder under /data.
          </p>
        </>,
      ),
      faq("advanced_settings"),
      faq("what_is_debug_page"),
      faq("what_is_the_debug_footer"),
    ],
    id: "settings",
    titleKey: "settings_overview",
  },
];
