import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./styles.css";
import type { Evaluation } from "@alihdrndm/blockpace-core";
import {
  type CalculatorInput,
  calculate,
  EXAMPLE,
  formatMoney,
  type NightInput,
} from "./compute.js";

// The page's only job: read the form, run the core library, and show the block as a hotel at
// night plus the two bills. It recalculates on every keystroke. Everything is built with DOM
// methods (never innerHTML), so typed text can never become markup.

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const form = $<HTMLFormElement>("inputs");
const currency = $<HTMLInputElement>("currency");
const attrition = $<HTMLInputElement>("attrition");
const damages = $<HTMLInputElement>("damages");
const tax = $<HTMLInputElement>("tax");
const rounding = $<HTMLSelectElement>("rounding");
const resell = $<HTMLInputElement>("resell");
const firstNight = $<HTMLInputElement>("first-night");
const nightCount = $<HTMLInputElement>("night-count");
const tbody = $<HTMLTableElement>("nights")
  .tBodies[0] as HTMLTableSectionElement;
const skyline = $<HTMLElement>("skyline");
const scaleNote = $<HTMLElement>("scale-note");
const result = $<HTMLElement>("result");

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
}

/** Calendar date arithmetic in UTC, so a time zone can never shift a night. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const dateLabel = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
const label = (iso: string) =>
  dateLabel(iso, { weekday: "short", month: "short", day: "numeric" });

function numberInput(
  name: string,
  value: number,
  labelText: string,
  step = "1",
): HTMLInputElement {
  return h("input", {
    type: "number",
    min: "0",
    step,
    inputmode: step === "1" ? "numeric" : "decimal",
    value: String(value),
    "data-field": name,
    "aria-label": labelText,
  });
}

/**
 * Rebuilds the grid for the chosen dates, keeping numbers already typed in each row. Without
 * `values` it does nothing when the dates are unchanged: a `change` event also fires when the
 * night count merely loses focus, and rebuilding then would replace the input being clicked.
 */
function renderNights(values?: NightInput[]): void {
  const count = Math.min(60, Math.max(1, Number(nightCount.value) || 1));
  const start = firstNight.value || EXAMPLE.nights[0]?.date || "2026-11-10";
  const dates = Array.from({ length: count }, (_, i) => addDays(start, i));
  const current = [...tbody.rows].map((row) => row.dataset.date ?? "");
  if (values === undefined && dates.join() === current.join()) return;
  const previous = values ?? readNights();
  tbody.replaceChildren();
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const old = previous[i];
    const name = label(date);
    tbody.append(
      h(
        "tr",
        { "data-date": date },
        h("th", { scope: "row" }, name),
        h(
          "td",
          {},
          numberInput(
            "contractedRooms",
            old?.contractedRooms ?? 50,
            `Contracted rooms, ${name}`,
          ),
        ),
        h(
          "td",
          {},
          numberInput(
            "rate",
            old?.rate ?? 200,
            `Rate per night, ${name}`,
            "0.01",
          ),
        ),
        h(
          "td",
          {},
          numberInput(
            "pickedUpRooms",
            old?.pickedUpRooms ?? 40,
            `Rooms booked, ${name}`,
          ),
        ),
        h(
          "td",
          { class: "resold-col" },
          numberInput(
            "resoldRooms",
            old?.resoldRooms ?? 0,
            `Rooms resold, ${name}`,
          ),
        ),
      ),
    );
  }
  syncResold();
}

function readNights(): NightInput[] {
  return [...tbody.rows].map((row) => {
    const value = (field: string) =>
      Number(
        (
          row.querySelector(
            `[data-field="${field}"]`,
          ) as HTMLInputElement | null
        )?.value ?? 0,
      );
    return {
      date: row.dataset.date ?? "",
      contractedRooms: value("contractedRooms"),
      rate: value("rate"),
      pickedUpRooms: value("pickedUpRooms"),
      resoldRooms: value("resoldRooms"),
    };
  });
}

function readInput(): CalculatorInput {
  return {
    currency: currency.value,
    allowedAttritionPct: Number(attrition.value),
    damagesPct: Number(damages.value),
    taxPct: Number(tax.value),
    resellCredit: resell.checked,
    minimumRounding: rounding.value as CalculatorInput["minimumRounding"],
    nights: readNights(),
  };
}

function syncResold(): void {
  document.body.classList.toggle("show-resold", resell.checked);
}

function loadExample(): void {
  currency.value = EXAMPLE.currency;
  attrition.value = String(EXAMPLE.allowedAttritionPct);
  damages.value = String(EXAMPLE.damagesPct);
  tax.value = String(EXAMPLE.taxPct);
  rounding.value = EXAMPLE.minimumRounding;
  resell.checked = EXAMPLE.resellCredit;
  firstNight.value = EXAMPLE.nights[0]?.date ?? "";
  nightCount.value = String(EXAMPLE.nights.length);
  renderNights(EXAMPLE.nights);
}

// ---------------------------------------------------------------------------------------------
// The hotel at night: one tower per night, one window per room (or per k rooms on big blocks).

const COLUMNS = 3;
const MAX_WINDOWS = 60;

type WindowState = "lit" | "resold" | "short" | "empty";

function renderSkyline(e: Evaluation, animate: boolean): void {
  const biggest = Math.max(1, ...e.nights.map((n) => n.contractedRooms));
  const roomsPerWindow = Math.ceil(biggest / MAX_WINDOWS);
  const tallestRows = Math.ceil(biggest / roomsPerWindow / COLUMNS);
  scaleNote.hidden = roomsPerWindow === 1;
  scaleNote.textContent = `Each window is ${roomsPerWindow} rooms, rounded`;
  skyline.classList.toggle("lighting", animate && !reducedMotion);
  skyline.style.setProperty("--rows", String(tallestRows));

  const towers = e.nights.map((n, tower) => {
    const toWindows = (rooms: number) => Math.round(rooms / roomsPerWindow);
    const total = Math.ceil(n.contractedRooms / roomsPerWindow);
    const minimum = n.minimumRooms ?? 0;
    const short = n.shortfallRooms ?? 0;
    const gap = Math.max(0, minimum - n.pickedUpRooms);
    const states: WindowState[] = [];
    const push = (state: WindowState, count: number) => {
      for (let i = 0; i < count && states.length < total; i++)
        states.push(state);
    };
    push("lit", toWindows(n.pickedUpRooms));
    push("resold", toWindows(gap - short));
    push("short", toWindows(short));
    push("empty", total);

    const rows = Math.ceil(total / COLUMNS);
    const windows = states.map((state, i) =>
      h("i", {
        class: `win win-${state}`,
        style: `--d:${tower * 90 + Math.floor(i / COLUMNS) * 28}ms`,
      }),
    );
    const minLine = h("span", {
      class: "min-line",
      style: `bottom:calc(${(minimum / roomsPerWindow / COLUMNS / Math.max(rows, 1)) * 100}% - 1px)`,
    });
    return h(
      "div",
      { class: "tower-col" },
      h(
        "div",
        { class: "tower", style: `--tower-rows:${rows}` },
        h("div", { class: "windows" }, ...windows),
        minLine,
      ),
      h(
        "p",
        { class: "tower-label" },
        h("span", {}, dateLabel(n.date, { weekday: "short" })),
        h("span", {}, dateLabel(n.date, { month: "short", day: "numeric" })),
      ),
      h(
        "p",
        { class: short > 0 ? "tower-short" : "tower-short ok" },
        short > 0 ? `${short} short` : "Met",
      ),
    );
  });
  skyline.replaceChildren(...towers);

  const shortNights = e.nights.filter((n) => (n.shortfallRooms ?? 0) > 0);
  skyline.setAttribute(
    "aria-label",
    `${e.nights.length} nights, ${e.pickedUpRoomNights} of ${e.contractedRoomNights} room nights booked. ` +
      (shortNights.length === 0
        ? "Every night reaches its own minimum."
        : `Short of the nightly minimum on ${shortNights.map((n) => `${label(n.date)} by ${n.shortfallRooms}`).join(", ")}.`),
  );
  document
    .querySelector(".legend-resold")
    ?.toggleAttribute(
      "hidden",
      !e.nights.some(
        (n) =>
          Math.max(0, (n.minimumRooms ?? 0) - n.pickedUpRooms) >
          (n.shortfallRooms ?? 0),
      ),
    );
}

// ---------------------------------------------------------------------------------------------
// The two bills, set as hotel folios.

function folio(
  title: string,
  basis: string,
  e: Evaluation,
  items: [string, string][],
  higher: boolean,
): HTMLElement {
  const money = (minor: number) => formatMoney(minor, e.currency);
  const lines: [string, string][] = [
    ["Contracted room nights", String(e.contractedRoomNights)],
    ["Minimum to reach", String(e.minimumRoomNights)],
    ["Booked", String(e.pickedUpRoomNights)],
  ];
  if (e.resellCredited > 0)
    lines.push(["Resell credit", `${e.resellCredited} room nights`]);
  lines.push(["Shortfall", `${e.shortfallRoomNights} room nights`]);
  if (e.taxMinor > 0)
    lines.push(["Damages", money(e.damagesMinor)], ["Tax", money(e.taxMinor)]);

  const row = ([k, v]: [string, string]) =>
    h("div", { class: "line" }, h("dt", {}, k), h("dd", {}, v));
  return h(
    "article",
    { class: higher ? "folio folio-higher" : "folio" },
    h(
      "header",
      { class: "folio-head" },
      h("h3", {}, title),
      h("p", { class: "folio-basis" }, basis),
      ...(higher ? [h("p", { class: "stamp" }, "Higher bill")] : []),
    ),
    h("dl", { class: "lines" }, ...lines.map(row)),
    ...(items.length > 0
      ? [h("dl", { class: "lines items" }, ...items.map(row))]
      : []),
    h(
      "p",
      { class: "due" },
      h("span", {}, "Total due"),
      h("strong", { class: "due-amount" }, money(e.totalMinor)),
    ),
  );
}

function breakdown(e: Evaluation): HTMLElement {
  return h(
    "details",
    { class: "breakdown" },
    h("summary", {}, "Night-by-night numbers"),
    h(
      "div",
      { class: "table-scroll" },
      h(
        "table",
        { class: "grid" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            ...["Night", "Contracted", "Minimum", "Booked", "Short"].map((c) =>
              h("th", { scope: "col" }, c),
            ),
          ),
        ),
        h(
          "tbody",
          {},
          ...e.nights.map((n) =>
            h(
              "tr",
              {},
              h("th", { scope: "row" }, label(n.date)),
              h("td", {}, String(n.contractedRooms)),
              h("td", {}, String(n.minimumRooms ?? "")),
              h("td", {}, String(n.pickedUpRooms)),
              h(
                "td",
                { class: (n.shortfallRooms ?? 0) > 0 ? "short" : "" },
                String(n.shortfallRooms ?? 0),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

let firstRender = true;

function render(): void {
  const outcome = calculate(readInput());
  skyline.classList.toggle("stale", !outcome.ok);
  if (!outcome.ok) {
    result.replaceChildren(
      h(
        "div",
        { class: "problems", role: "alert" },
        h("h3", {}, "Fix these to see the bills"),
        h("ul", {}, ...outcome.problems.map((p) => h("li", {}, p))),
      ),
    );
    return;
  }

  const { cumulative, perNight } = outcome;
  renderSkyline(perNight, firstRender);
  firstRender = false;

  const gap = perNight.totalMinor - cumulative.totalMinor;
  const summary =
    gap === 0
      ? "Both ways of measuring give the same bill for these bookings."
      : `Measured night by night, the same bookings cost ${formatMoney(Math.abs(gap), perNight.currency)} ${gap > 0 ? "more" : "less"}. Check which one your contract uses.`;

  const perNightItems: [string, string][] = perNight.nights
    .filter((n) => (n.shortfallRooms ?? 0) > 0)
    .map((n) => [
      label(n.date),
      `${n.shortfallRooms} short at ${formatMoney(n.rateMinor, perNight.currency)}`,
    ]);

  result.replaceChildren(
    h(
      "div",
      { class: "folios" },
      folio(
        "Measured on the total",
        "Cumulative basis",
        cumulative,
        [],
        gap < 0,
      ),
      folio(
        "Measured night by night",
        "Per-night basis",
        perNight,
        perNightItems,
        gap > 0,
      ),
    ),
    h("p", { class: "summary" }, summary),
    breakdown(perNight),
  );
}

$("load-example").addEventListener("click", () => {
  loadExample();
  firstRender = true;
  render();
});
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", (event) => {
  const target = event.target;
  if (target === firstNight || target === nightCount) return;
  if (target === resell) syncResold();
  render();
});
for (const control of [firstNight, nightCount]) {
  control.addEventListener("change", () => {
    renderNights();
    render();
  });
}

// Open on the worked example so the first thing a visitor sees is a real, lit-up block.
loadExample();
render();
