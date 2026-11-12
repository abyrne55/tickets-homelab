import { expect } from "@std/expect";
import { afterEach, describe, it as test } from "@std/testing/bdd";
import { initSingleTicketPayMore } from "#src/ui/client/admin/single-ticket-pay-more.ts";
import { createDomInstaller, requireElement } from "#test-utils/happy-dom.ts";

const card = (id: number, checked: boolean, payMore: boolean) => `
  <div class="ticket-row ticket-choice">
    <input type="radio" name="single_ticket" value="${id}" class="ticket-choice-input"${
      checked ? " checked" : ""
    }>
    ${
      payMore
        ? `<label class="pay-more"><input type="text" name="custom_price_${id}" required pattern="\\d+(\\.\\d{1,2})?" value="5"></label>`
        : ""
    }
  </div>`;

describe("single ticket pay more", () => {
  const dom = createDomInstaller(["Event"]);
  afterEach(() => dom.cleanup());

  const setup = (html: string) => {
    const window = dom.installDom(`<form>${html}</form>`);
    initSingleTicketPayMore();
    const form = window.document.querySelector("form")!;
    const radio = (id: number) =>
      requireElement<HTMLInputElement>(form, `[value="${id}"]`);
    const price = (id: number) =>
      requireElement<HTMLInputElement>(form, `[name="custom_price_${id}"]`);
    const choose = (id: number) => {
      radio(id).checked = true;
      radio(id).dispatchEvent(new Event("change", { bubbles: true }));
    };
    return { choose, form, price };
  };

  test("hides and disables the price on an unchosen card at load", () => {
    const { price } = setup(card(1, false, true) + card(2, true, false));

    expect(price(1).disabled).toBe(true);
    expect(price(1).closest<HTMLElement>(".pay-more")!.hidden).toBe(true);
  });

  test("shows and enables the price on the chosen card", () => {
    const { price } = setup(card(1, true, true));

    expect(price(1).disabled).toBe(false);
    expect(price(1).closest<HTMLElement>(".pay-more")!.hidden).toBe(false);
  });

  test("an invalid price left on a card the buyer moved away from does not block submit", () => {
    const { choose, form, price } = setup(
      card(1, true, true) + card(2, false, false),
    );
    price(1).value = "-1";
    expect(form.checkValidity()).toBe(false);

    choose(2);

    expect(price(1).disabled).toBe(true);
    expect(form.checkValidity()).toBe(true);
  });

  test("re-enables the price when the buyer comes back to its card", () => {
    const { choose, price } = setup(card(1, false, true) + card(2, true, true));

    choose(1);

    expect(price(1).disabled).toBe(false);
    expect(price(2).disabled).toBe(true);
  });

  test("leaves pages without radio cards alone", () => {
    const { price } = setup(
      '<label class="pay-more"><input type="text" name="custom_price_1" required></label>',
    );

    expect(price(1).disabled).toBe(false);
  });
});
