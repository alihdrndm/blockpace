import { tryParseIsoDate } from "@alihdrndm/blockpace-core";
import { z } from "zod";

// The only place in packages/db that reads process.env: it serves the db:migrate, db:seed
// and db:reset scripts. The API and worker get their own config and never import this file.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FIXED_TODAY: z
    .string()
    .refine(
      (value) => tryParseIsoDate(value) !== undefined,
      "expected a real date as YYYY-MM-DD",
    )
    .optional(),
  // Where the seeded webhook endpoint points; the full compose stack (M6) will set it to the sink container.
  SEED_WEBHOOK_URL: z.string().min(1).default("http://localhost:4999/"),
});

export type DbEnv = z.infer<typeof EnvSchema>;

export function parseDbEnv(env: Record<string, string | undefined>): DbEnv {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ""),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  return result.data;
}

export const loadDbEnv = (): DbEnv => parseDbEnv(process.env);
