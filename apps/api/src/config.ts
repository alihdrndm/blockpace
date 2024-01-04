import { tryParseIsoDate } from "@alihdrndm/blockpace-core";
import { z } from "zod";

const IsoDateString = z
  .string()
  .refine(
    (value) => tryParseIsoDate(value) !== undefined,
    "expected a real date as YYYY-MM-DD",
  );
const BoolString = z.enum(["true", "false"]).transform((v) => v === "true");

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4020),
  DATABASE_URL: z.string().min(1),
  API_KEY: z.string().default(""),
  RUN_MIGRATIONS: BoolString.default(false),
  FIXED_TODAY: IsoDateString.optional(),
  ALLOW_PRIVATE_WEBHOOK_TARGETS: BoolString.default(false),
  WEBHOOK_POLL_MS: z.coerce.number().int().min(100).default(10000),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
});

export type Config = z.infer<typeof ConfigSchema>;

// Empty strings in .env files mean "unset", so drop them before validating.
function withoutEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const result = ConfigSchema.safeParse(withoutEmpty(env));
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.error(`config error: ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

// The only place in the API that reads process.env.
export const loadConfig = (): Config => parseConfig(process.env);
