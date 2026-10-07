import { EmptyState, ErrorPanel } from "../../components/ui";
import {
  AddWebhookForm,
  EndpointActions,
} from "../../components/webhook-forms";
import { api } from "../../lib/api";
import { type ErrorView, errorView } from "../../lib/problem";

export const dynamic = "force-dynamic";

async function load<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: ErrorView }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: errorView(error) };
  }
}

export default async function WebhooksPage() {
  const [endpoints, deliveries] = await Promise.all([
    load(api.listEndpoints()),
    load(api.deliveries()),
  ]);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Webhooks</h1>

      <section aria-labelledby="endpoints-heading" className="space-y-4">
        <h2 id="endpoints-heading" className="text-lg font-semibold">
          Endpoints
        </h2>
        <AddWebhookForm />
        {!endpoints.ok ? (
          <ErrorPanel error={endpoints.error} />
        ) : endpoints.value.items.length === 0 ? (
          <EmptyState>
            No endpoints yet. Add one to receive signed alert deliveries.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200">
            {endpoints.value.items.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="font-mono text-sm">
                  {endpoint.url}
                  {!endpoint.active && (
                    <span className="ml-2 font-sans text-slate-700">
                      (inactive)
                    </span>
                  )}
                </span>
                <EndpointActions id={endpoint.id} url={endpoint.url} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="deliveries-heading" className="space-y-3">
        <h2 id="deliveries-heading" className="text-lg font-semibold">
          Latest deliveries
        </h2>
        {!deliveries.ok ? (
          <ErrorPanel error={deliveries.error} />
        ) : deliveries.value.items.length === 0 ? (
          <EmptyState>No deliveries yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                The latest 50 webhook deliveries
              </caption>
              <thead className="border-b border-slate-400 text-slate-700">
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    Event
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    Status
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    Attempts
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    Last status code
                  </th>
                  <th scope="col" className="py-1">
                    Next attempt
                  </th>
                </tr>
              </thead>
              <tbody>
                {deliveries.value.items.map((delivery) => (
                  <tr key={delivery.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3">{delivery.eventType}</td>
                    <td className="py-1 pr-3">{delivery.status}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {delivery.attempts}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {delivery.lastStatusCode ?? "—"}
                    </td>
                    <td className="py-1">
                      {delivery.status === "pending"
                        ? delivery.nextAttemptAt
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
