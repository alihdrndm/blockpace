"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addWebhookEndpoint,
  deleteWebhookEndpoint,
  sendTestWebhook,
  type WebhookAddState,
} from "../app/actions";
import {
  buttonClass,
  ErrorPanel,
  inputClass,
  secondaryButtonClass,
} from "./ui";

const IDLE: WebhookAddState = { status: "idle" };

/** Add an endpoint. The signing secret comes back once, so it is shown once, with a warning. */
export function AddWebhookForm() {
  const [state, formAction, pending] = useActionState(addWebhookEndpoint, IDLE);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="webhook-url" className="block text-sm font-medium">
            Endpoint URL
          </label>
          <input
            id="webhook-url"
            name="url"
            type="url"
            required
            placeholder="https://example.com/hooks/blockpace"
            className={`${inputClass} w-96 max-w-full`}
          />
        </div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {state.status === "error" && <ErrorPanel error={state.error} />}
      {state.status === "created" && (
        <div
          role="status"
          className="space-y-2 rounded-md border border-amber-700 bg-amber-50 p-4 text-amber-950"
        >
          <p className="font-semibold">Endpoint added: {state.url}</p>
          <p>
            <strong>
              Copy this signing secret now. It will not be shown again.
            </strong>{" "}
            Use it to verify the x-blockpace-signature header.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="webhook-secret" className="sr-only">
              Signing secret
            </label>
            <input
              id="webhook-secret"
              readOnly
              value={state.secret}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputClass} w-[34rem] max-w-full font-mono text-xs`}
            />
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={async () => {
                await navigator.clipboard.writeText(state.secret);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Delete and "Send test" buttons for one endpoint row. */
export function EndpointActions({ id, url }: { id: string; url: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const run = (action: (id: string) => Promise<void>, failure: string) =>
    startTransition(async () => {
      try {
        setError(undefined);
        await action(id);
      } catch {
        setError(failure);
      }
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={secondaryButtonClass}
        aria-label={`Send a test delivery to ${url}`}
        onClick={() =>
          run(sendTestWebhook, "The test delivery could not be queued.")
        }
      >
        Send test
      </button>
      <button
        type="button"
        disabled={pending}
        className={secondaryButtonClass}
        aria-label={`Delete endpoint ${url}`}
        onClick={() =>
          run(deleteWebhookEndpoint, "The endpoint could not be deleted.")
        }
      >
        Delete
      </button>
      {error !== undefined && (
        <span role="alert" className="text-sm text-red-900">
          {error}
        </span>
      )}
    </div>
  );
}
