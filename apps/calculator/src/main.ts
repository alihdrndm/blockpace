import "./styles.css";
import type { Evaluation } from "@alihdrndm/blockpace-core";
import {
  type CalculatorInput,
  calculate,
  EXAMPLE,
  formatMoney,
  type NightInput,
} from "./compute.js";

// The page's only job: read the form, run the core library, show both bases side by side.
// Everything is built with DOM methods (never innerHTML), so typed text can never become markup.

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

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
const result = $<HTMLElement>("result");

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

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

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
    value: String(value),
    "data-field": name,
    "aria-label": labelText,
  });
}

/** Rebuilds the grid for the chosen dates, keeping numbers already typed in each row. */
function renderNights(previous: NightInput[] = readNights()): void {
  const count = Math.min(60, Math.max(1, Number(nightCount.value) || 1));
  const start = firstNight.value || EXAMPLE.nights[0]?.date || "2026-11-10";
  tbody.replaceChildren();
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const old = previous[i];
    const row = h(
      "tr",
      { "data-date": date },
      h("th", { scope: "row" }, label(date)),
      h(
        "td",
        {},
        numberInput(
          "contractedRooms",
          old?.contractedRooms ?? 50,
          `Contracted rooms, ${label(date)}`,
        ),
      ),
      h(
        "td",
        {},
        numberInput(
          "rate",
          old?.rate ?? 200,
          `Rate per night, ${label(date)}`,
          "0.01",
        ),
      ),
      h(
        "td",
        {},
        numberInput(
          "pickedUpRooms",
          old?.pickedUpRooms ?? 40,
          `Rooms picked up, ${label(date)}`,
        ),
      ),
      h(
        "td",
        { class: "resold-col" },
        numberInput(
          "resoldRooms",
          old?.resoldRooms ?? 0,
          `Rooms resold, ${label(date)}`,
        ),
      ),
    );
    tbody.append(row);
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

function basisCard(
  title: string,
  explain: string,
  e: Evaluation,
  highlight: boolean,
): HTMLElement {
  const money = (minor: number) => formatMoney(minor, e.currency);
  const rows: [string, string][] = [
    ["Minimum room nights", String(e.minimumRoomNights)],
    ["Picked up", `${e.pickedUpRoomNights} of ${e.contractedRoomNights}`],
    ["Shortfall", `${e.shortfallRoomNights} room nights`],
  ];
  if (e.resellCredited > 0)
    rows.push(["Resell credit", `${e.resellCredited} room nights`]);
  if (e.taxMinor > 0)
    rows.push(
      ["Damages before tax", money(e.damagesMinor)],
      ["Tax", money(e.taxMinor)],
    );
  return h(
    "article",
    { class: highlight ? "basis basis-worse" : "basis" },
    h("h3", {}, title),
    h("p", { class: "basis-explain" }, explain),
    h("p", { class: "amount" }, money(e.totalMinor)),
    h("dl", {}, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
  );
}

function renderResult(): void {
  const outcome = calculate(readInput());
  result.hidden = false;
  if (!outcome.ok) {
    result.replaceChildren(
      h(
        "div",
        { class: "problems", role: "alert" },
        h("h2", {}, "Check these first"),
        h("ul", {}, ...outcome.problems.map((p) => h("li", {}, p))),
      ),
    );
    return;
  }

  const { cumulative, perNight } = outcome;
  const gap = perNight.totalMinor - cumulative.totalMinor;
  const summary =
    gap === 0
      ? "Both ways of measuring give the same bill for these bookings."
      : `Measured night by night, the same bookings cost ${formatMoney(Math.abs(gap), perNight.currency)} ${gap > 0 ? "more" : "less"}. Check which basis your contract uses.`;

  const breakdown = h(
    "table",
    { class: "grid breakdown" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", { scope: "col" }, "Night"),
        h("th", { scope: "col" }, "Contracted"),
        h("th", { scope: "col" }, "Minimum"),
        h("th", { scope: "col" }, "Picked up"),
        h("th", { scope: "col" }, "Short that night"),
      ),
    ),
    h(
      "tbody",
      {},
      ...perNight.nights.map((n) =>
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
  );

  result.replaceChildren(
    h("h2", {}, "What the clause would charge"),
    h(
      "div",
      { class: "bases" },
      basisCard(
        "Cumulative basis",
        "Measured on the total of all nights.",
        cumulative,
        gap < 0,
      ),
      basisCard(
        "Per-night basis",
        "Each night must reach its own minimum.",
        perNight,
        gap > 0,
      ),
    ),
    h("p", { class: "summary" }, summary),
    h("h3", {}, "Night by night"),
    h("div", { class: "table-scroll" }, breakdown),
  );
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  result.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}

$("load-example").addEventListener("click", () => {
  loadExample();
  renderResult();
});
$("calculate").addEventListener("click", renderResult);
resell.addEventListener("change", syncResold);
firstNight.addEventListener("change", () => renderNights());
nightCount.addEventListener("change", () => renderNights());

// Start a month from now with three empty-ish nights; "Load an example" fills in a real case.
firstNight.value = addDays(new Date().toISOString().slice(0, 10), 30);
renderNights([]);
