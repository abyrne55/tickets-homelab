import { expect } from "@std/expect";
import { afterEach, describe, it as test } from "@std/testing/bdd";
import { initPriceSlider } from "#src/ui/client/admin/price-slider.ts";
import { createDomInstaller, requireElement } from "#test-utils/happy-dom.ts";

const PAGE = `<div id="root"><label>Price
  <input type="range" data-price-slider min="200" max="4000" step="100" value="250" data-min="250" data-max="4000" data-places="2" hidden>
  <input type="text" name="custom_price" value="2.50"></label></div>`;

describe("price slider", () => {
  const dom = createDomInstaller(["Event"]);
  afterEach(() => dom.cleanup());

  const setup = () => {
    dom.installDom(PAGE);
    initPriceSlider();
    const slider = requireElement<HTMLInputElement>(document, "[type=range]");
    const box = requireElement<HTMLInputElement>(document, "[type=text]");
    return { box, slider };
  };

  const drag = (slider: HTMLInputElement, value: string) => {
    slider.value = value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  };

  test("reveals the slider", () => {
    expect(setup().slider.hidden).toBe(false);
  });

  test("dragging updates the box in major units", () => {
    const { box, slider } = setup();
    drag(slider, "1200");
    expect(box.value).toBe("12.00");
  });

  test("clamps to the real minimum and maximum", () => {
    const { box, slider } = setup();
    drag(slider, "200");
    expect(box.value).toBe("2.50");
    drag(slider, "4000");
    expect(box.value).toBe("40.00");
  });

  test("dispatches a bubbling input event on the box", () => {
    const { box, slider } = setup();
    let seen = 0;
    document.getElementById("root")!.addEventListener("input", (e) => {
      if (e.target === box) seen++;
    });
    drag(slider, "1000");
    expect(seen).toBe(1);
  });

  test("typing moves the slider without rewriting the box", () => {
    const { box, slider } = setup();
    box.value = "7.5";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    expect(slider.value).toBe("750");
    expect(box.value).toBe("7.5");
  });

  test("ignores text that is not a number", () => {
    const { box, slider } = setup();
    box.value = "abc";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    expect(slider.value).toBe("250");
  });

  test("does nothing without a slider on the page", () => {
    dom.installDom("<p>none</p>");
    expect(() => initPriceSlider()).not.toThrow();
  });
});
