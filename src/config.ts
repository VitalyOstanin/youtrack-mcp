import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { ServiceStatusPayload, UserAliasMap, YoutrackConfig } from "./types.js";

const configSchema = z.object({
  YOUTRACK_URL: z.string().url(),
  YOUTRACK_TOKEN: z.string().min(1),
  YOUTRACK_TIMEZONE: z.string().optional(),
  YOUTRACK_HOLIDAYS: z.string().optional(),
  YOUTRACK_PRE_HOLIDAYS: z.string().optional(),
  YOUTRACK_USER_ALIASES: z.string().optional(),
  YOUTRACK_DEFAULT_PROJECT: z.string().optional(),
  YOUTRACK_OUTPUT_DIR: z.string().optional(),
  YOUTRACK_UPLOAD_DIR: z.string().optional(),
});
const SETUP_DOC_URL = "https://github.com/VitalyOstanin/youtrack-mcp#requirements";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): YoutrackConfig {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    const fieldDetails = Object.entries(fieldErrors)
      .filter(([, issues]) => Array.isArray(issues) && issues.length > 0)
      .map(([field, issues]) => `${field}: ${(issues).join("; ")}`);
    const errorBody = fieldDetails.length ? fieldDetails.join("\n  ") : "invalid configuration";

    throw new Error(
      [
        "YouTrack configuration error:",
        `  ${errorBody}`,
        "",
        "Required:",
        "  YOUTRACK_URL    -- e.g., https://youtrack.example.com",
        "  YOUTRACK_TOKEN  -- a permanent token (perm:...)",
        "",
        `Setup guide: ${SETUP_DOC_URL}`,
      ].join("\n"),
    );
  }

  const outputDir = resolve(parsed.data.YOUTRACK_OUTPUT_DIR ?? process.cwd());
  const uploadDir = resolve(parsed.data.YOUTRACK_UPLOAD_DIR ?? outputDir);

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });

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
    outputDir,
    uploadDir,
  };
}

export function enrichConfigWithRedaction(
  config: YoutrackConfig,
): ServiceStatusPayload["configuration"] {
  return {
    baseUrl: config.baseUrl,
    hasToken: config.token.length > 0,
    timezone: config.timezone,
    outputDir: config.outputDir,
    holidays: config.holidays,
    preHolidays: config.preHolidays,
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
