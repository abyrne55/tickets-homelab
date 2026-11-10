/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/** Pay-what-you-want slider. The text box stays the submitted field; the slider
 * (no `name`, rendered hidden) is revealed here and kept in sync with it. The
 * slider works in minor units; its ends are whole units, so we clamp to the
 * real min/max (`data-min`/`data-max`) when writing to the box. */
import { forEachMatch } from "../dom.ts";

const MAJOR = /^\d+(\.\d+)?$/;

const formatMinor = (minor: number, places: number): string =>
  (minor / 10 ** places).toFixed(places);

const connect = (slider: HTMLInputElement): void => {
  const box =
    slider.parentElement?.querySelector<HTMLInputElement>("input[type=text]");
  if (!box) return;
  const min = Number(slider.dataset.min);
  const max = Number(slider.dataset.max);
  const places = Number(slider.dataset.places);
  slider.hidden = false;

  slider.addEventListener("input", () => {
    const minor = Math.min(Math.max(Number(slider.value), min), max);
    box.value = formatMinor(minor, places);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });

  box.addEventListener("input", () => {
    const text = box.value.trim();
    if (!MAJOR.test(text)) return;
    slider.value = String(Math.round(Number(text) * 10 ** places));
  });
};

export const initPriceSlider = (): void =>
  forEachMatch<HTMLInputElement>("[data-price-slider]", connect);
