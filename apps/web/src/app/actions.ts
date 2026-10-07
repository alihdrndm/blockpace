"use server";

// Server actions: the browser posts forms here, and only this server-side code calls the
// NestJS API with the API key. Every action is a public POST endpoint, so every argument and
// field is treated as untrusted and checked before use. Each returns a state the form renders.

import { tryParseIsoDate } from "@alihdrndm/blockpace-core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, idSegment } from "../lib/api";
import { majorToMinor } from "../lib/format";
import { type ErrorView, errorView } from "../lib/problem";

/** Same limit as the API's CSV import (1 MiB). Not exported: a "use server" file may only export async functions. */
const MAX_CSV_BYTES = 1024 * 1024;

export type FormState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; error: ErrorView };

export type ActionResult =
  | { status: "ok" }
  | { status: "error"; error: ErrorView };

const invalid = (detail: string): FormState => ({
  status: "error",
  error: { title: "Check the form", detail },
});

const intField = (form: FormData, name: string): number | undefined => {
  const raw = String(form.get(name) ?? "").trim();
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
};

/** Validates an id passed to an action; a bad one is reported like an API "not found". */
function checkedId(id: string): ErrorView | undefined {
  try {
    idSegment(id);
    return undefined;
  } catch (error) {
    return errorView(error);
  }
}

/** Record snapshot: one pickup number per night, PUT to the block's snapshot for that date. */
export async function recordSnapshot(
  blockId: string,
  dates: string[],
  withResold: boolean,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const badId = checkedId(blockId);
  if (badId !== undefined) return { status: "error", error: badId };
  const asOfDate = tryParseIsoDate(String(form.get("asOfDate") ?? ""));
  if (asOfDate === undefined) return invalid("As-of date must be a real date.");

  const nights: { date: string; pickedUpRooms: number; resoldRooms: number }[] =
    [];
  for (const date of dates) {
    if (tryParseIsoDate(date) === undefined)
      return invalid("A night in the form is not a real date.");
    const pickedUpRooms = intField(form, `picked-${date}`);
    if (pickedUpRooms === undefined)
      return invalid(`Picked up for ${date} must be a whole number.`);
    const resoldRooms = withResold ? intField(form, `resold-${date}`) : 0;
    if (resoldRooms === undefined)
      return invalid(`Resold for ${date} must be a whole number.`);
    nights.push({ date, pickedUpRooms, resoldRooms });
  }

  try {
    await api.putSnapshot(blockId, asOfDate, { nights });
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
  revalidatePath(`/blocks/${blockId}`);
  return { status: "ok", message: `Snapshot for ${asOfDate} saved.` };
}

/** Import CSV: forwards the uploaded file to the API, which validates it all-or-nothing. */
export async function importCsv(
  blockId: string,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const badId = checkedId(blockId);
  if (badId !== undefined) return { status: "error", error: badId };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return invalid("Choose a CSV file first.");
  if (file.size > MAX_CSV_BYTES)
    return invalid("The file is larger than 1 MB (1,048,576 bytes).");

  const upload = new FormData();
  upload.append("file", file, file.name);
  try {
    const result = await api.importCsv(blockId, upload);
    revalidatePath(`/blocks/${blockId}`);
    return {
      status: "ok",
      message: `Imported ${result.snapshots} snapshot(s).`,
    };
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
}

/** New block: the grid sends contracted rooms and a rate in major units per night. */
export async function createBlock(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const currency = text("currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    return invalid("Currency must be a 3-letter code such as USD.");
  const firstNight = tryParseIsoDate(text("firstNight"));
  const count = intField(form, "nightCount");
  if (firstNight === undefined)
    return invalid("First night must be a real date.");
  if (count === undefined || count < 1 || count > 60)
    return invalid("Number of nights must be 1 to 60.");

  const nights: { date: string; contractedRooms: number; rateMinor: number }[] =
    [];
  for (const date of form.getAll("nightDate").map(String)) {
    if (tryParseIsoDate(date) === undefined)
      return invalid("A night in the grid is not a real date.");
    const contractedRooms = intField(form, `contracted-${date}`);
    if (contractedRooms === undefined)
      return invalid(`Contracted rooms for ${date} must be a whole number.`);
    let rateMinor: number | undefined;
    try {
      rateMinor = majorToMinor(text(`rate-${date}`), currency);
    } catch {
      return invalid(`${currency} is not a currency this browser knows.`);
    }
    if (rateMinor === undefined)
      return invalid(`Rate for ${date} must be an amount like 189.00.`);
    nights.push({ date, contractedRooms, rateMinor });
  }

  const pct = (name: string) => Number(text(name));
  let id: string;
  try {
    const block = await api.createBlock({
      name: text("name"),
      hotelName: text("hotelName"),
      currency,
      cutoffDate: text("cutoffDate"),
      terms: {
        basis: text("basis"),
        allowedAttritionPct: pct("allowedAttritionPct"),
        damagesPct: pct("damagesPct"),
        taxPct: pct("taxPct"),
        resellCredit: form.get("resellCredit") === "on",
        minimumRounding: text("minimumRounding"),
      },
      nights,
    });
    id = block.id;
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
  // redirect() throws to navigate, so it must stay outside the try/catch.
  redirect(`/blocks/${id}`);
}

export type WebhookAddState =
  | { status: "idle" }
  | { status: "created"; url: string; secret: string }
  | { status: "error"; error: ErrorView };

export async function addWebhookEndpoint(
  _previous: WebhookAddState,
  form: FormData,
): Promise<WebhookAddState> {
  const url = String(form.get("url") ?? "").trim();
  if (url === "")
    return {
      status: "error",
      error: { title: "Check the form", detail: "Enter a URL." },
    };
  try {
    const endpoint = await api.createEndpoint(url);
    revalidatePath("/webhooks");
    return { status: "created", url: endpoint.url, secret: endpoint.secret };
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
}

export async function deleteWebhookEndpoint(id: string): Promise<ActionResult> {
  try {
    await api.deleteEndpoint(id);
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
  revalidatePath("/webhooks");
  return { status: "ok" };
}

export async function sendTestWebhook(id: string): Promise<ActionResult> {
  try {
    await api.testEndpoint(id);
  } catch (error) {
    return { status: "error", error: errorView(error) };
  }
  revalidatePath("/webhooks");
  return { status: "ok" };
}
