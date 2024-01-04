// Server-only: import this module from server components and route handlers
// only. It is the single place in apps/web that reads process.env.
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.url().default("http://localhost:4020"),
  API_KEY: z.string().optional(),
});

export const env = envSchema.parse({
  API_BASE_URL: process.env.API_BASE_URL,
  API_KEY: process.env.API_KEY,
});
