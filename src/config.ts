import { z } from "zod";
import type { UserAliasMap, YoutrackConfig } from "./types.js";

const configSchema = z.object({
  YOUTRACK_URL: z.string().url(),
  YOUTRACK_TOKEN: z.string().min(1),
  YOUTRACK_TIMEZONE: z.string().optional(),
  YOUTRACK_HOLIDAYS: z.string().optional(),
  YOUTRACK_PRE_HOLIDAYS: z.string().optional(),
  YOUTRACK_USER_ALIASES: z.string().optional(),
  YOUTRACK_DEFAULT_PROJECT: z.string().optional(),
  YOUTRACK_USE_STRUCTURED_CONTENT: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val !== "false"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): YoutrackConfig {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    const missingFields = Object.entries(fieldErrors)
      .filter(([, issues]) => Array.isArray(issues) && issues.length > 0)
      .map(([field]) => field);
    const errorMessage = missingFields.length
      ? `missing environment variables: ${missingFields.join(", ")}`
      : "invalid configuration";

    throw new Error(`YouTrack configuration error: ${errorMessage}`);
  }

  return {
    baseUrl: parsed.data.YOUTRACK_URL,
    token: parsed.data.YOUTRACK_TOKEN,
    timezone: parsed.data.YOUTRACK_TIMEZONE ?? "Europe/Moscow",
    holidays: parsed.data.YOUTRACK_HOLIDAYS
      ? parseCsvList(parsed.data.YOUTRACK_HOLIDAYS)
      : undefined,
    preHolidays: parsed.data.YOUTRACK_PRE_HOLIDAYS
      ? parseCsvList(parsed.data.YOUTRACK_PRE_HOLIDAYS)
      : undefined,
    userAliases: parsed.data.YOUTRACK_USER_ALIASES
      ? parseAliasMap(parsed.data.YOUTRACK_USER_ALIASES)
      : undefined,
    defaultProject: parsed.data.YOUTRACK_DEFAULT_PROJECT,
    useStructuredContent: parsed.data.YOUTRACK_USE_STRUCTURED_CONTENT,
  };
}

export function enrichConfigWithRedaction(config: YoutrackConfig) {
  return {
    baseUrl: config.baseUrl,
    hasToken: config.token.length > 0,
    timezone: config.timezone,
    holidays: config.holidays,
    preHolidays: config.preHolidays,
    useStructuredContent: config.useStructuredContent,
  };
}

function parseCsvList(value: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length);

  return items;
}

function parseAliasMap(value: string): UserAliasMap {
  const aliasMap = value
    .split(",")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length)
    .reduce<UserAliasMap>((acc, pair) => {
      const [alias, login] = pair.split(":").map((part) => part.trim());

      if (!(alias && login)) {
        throw new Error(
          "Invalid YOUTRACK_USER_ALIASES format. Expected comma-separated list of alias:login pairs.",
        );
      }

      acc[alias] = login;

      return acc;
    }, {});

  return aliasMap;
}
