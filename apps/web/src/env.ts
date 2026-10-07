// Server-only: import this module from server components, server actions and route
// handlers only. It is the single place in apps/web that reads process.env, which keeps
// the API URL and the API key out of the browser bundle.
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.url().default("http://localhost:4020"),
  API_KEY: z.string().optional(),
  // Same meaning as in the API: freeze "today" for demos and the smoke test.
  FIXED_TODAY: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const blankToUndefined = (value: string | undefined) =>
  value === "" ? undefined : value;

export const env = envSchema.parse({
  API_BASE_URL: blankToUndefined(process.env.API_BASE_URL),
  API_KEY: blankToUndefined(process.env.API_KEY),
  FIXED_TODAY: blankToUndefined(process.env.FIXED_TODAY),
});
