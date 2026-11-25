/**
 * A link that opens in a new browser tab. Always sent with `rel="noopener"`
 * so the opened page cannot reach back into ours.
 */

import type { Child } from "#jsx/jsx-runtime.ts";

export const NewTabLink = ({
  href,
  children,
}: {
  href: string;
  children: Child;
}): JSX.Element => (
  <a href={href} rel="noopener" target="_blank">
    {children}
  </a>
);

/** A new-tab link whose visible text is the URL itself — the link text
 *  is the address itself. */
export const NewTabUrl = ({ url }: { url: string }): JSX.Element => (
  <NewTabLink href={url}>{url}</NewTabLink>
);
