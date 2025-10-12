import { z } from "zod";
import type { YoutrackConfig } from "./types.js";

const configSchema = z.object({
  YOUTRACK_URL: z.string().url(),
  YOUTRACK_TOKEN: z.string().min(1),
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
  };
}

export function enrichConfigWithRedaction(config: YoutrackConfig) {
  return {
    baseUrl: config.baseUrl,
    hasToken: config.token.length > 0,
  };
}
