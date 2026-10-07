import { api } from "../../../lib/api";
import { ApiError } from "../../../lib/problem";

// The calculator page posts here; this server-side handler forwards the request to the API
// with the API key, so neither the key nor the API's address reaches the browser.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Bad request", "The request body is not valid JSON.");
  }
  try {
    return Response.json(await api.calculate(body));
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json(
        {
          title: error.title,
          detail: error.detail,
          code: error.code,
          errors: error.fieldErrors,
        },
        {
          status: error.status,
          headers: { "content-type": "application/problem+json" },
        },
      );
    }
    return problem(
      502,
      "API unreachable",
      "The dashboard could not reach the blockpace API.",
    );
  }
}

function problem(status: number, title: string, detail: string): Response {
  return Response.json(
    { title, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}
