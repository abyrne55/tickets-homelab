/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/** One-ticket-per-order radio cards: show the pay-what-you-like price only on
 * the chosen card.
 *
 * An unchosen card's price box is hidden AND disabled. Hiding alone would
 * leave its `required`/`pattern` constraints live, so a bad value left behind
 * on a card the buyer moved away from would block submit with no visible
 * message (the browser cannot focus a hidden control). A disabled control is
 * skipped by constraint validation and is not submitted; the server reads the
 * price only for the chosen listing anyway.
 *
 * Without JS nothing is hidden, so the browser can always point at a bad
 * value. */
import { forEachMatch } from "../dom.ts";

const syncCard = (card: HTMLElement): void => {
  const chosen =
    card.querySelector<HTMLInputElement>(".ticket-choice-input")?.checked ===
    true;
  for (const payMore of card.querySelectorAll<HTMLElement>(".pay-more")) {
    payMore.hidden = !chosen;
    for (const control of payMore.querySelectorAll<HTMLInputElement>("input")) {
      control.disabled = !chosen;
    }
  }
};

const connectForm = (form: HTMLFormElement): void => {
  const cards = [
    ...form.querySelectorAll<HTMLElement>(".ticket-choice"),
  ].filter((card) => card.querySelector(".pay-more") !== null);
  if (cards.length === 0) return;
  const syncAll = () => {
    for (const card of cards) syncCard(card);
  };
  form.addEventListener("change", (event) => {
    if ((event.target as Element).matches(".ticket-choice-input")) syncAll();
  });
  syncAll();
};

export const initSingleTicketPayMore = (): void => {
  forEachMatch<HTMLFormElement>("form", connectForm);
};
