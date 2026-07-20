import {
  buildRequestHeaders,
  clampPercent,
  parseResetAfterSeconds,
  readPercentCandidate,
  requestJson,
  requireAuthorizationHeader,
  type ParsedUsageWindow,
  type RequestConfig,
} from "./shared.ts";

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

export function parseCodexSubscriptionUsage(data: any, nowMs = Date.now()): ParsedUsageWindow | null {
  const primary = data?.rate_limit?.primary_window;
  const secondary = data?.rate_limit?.secondary_window;
  const primaryPercent = readPercentCandidate(primary?.used_percent);
  const secondaryPercent = readPercentCandidate(secondary?.used_percent);
  if (primaryPercent === null && secondaryPercent === null) return null;

  if (secondaryPercent === null && primaryPercent !== null && primary?.limit_window_seconds === SEVEN_DAYS_IN_SECONDS) {
    return {
      weeklyPercent: clampPercent(primaryPercent),
      weeklyResetAt: parseResetAfterSeconds(primary?.reset_after_seconds, nowMs),
    };
  }

  return {
    ...(primaryPercent === null ? {} : {
      sessionPercent: clampPercent(primaryPercent),
      sessionResetAt: parseResetAfterSeconds(primary?.reset_after_seconds, nowMs),
    }),
    ...(secondaryPercent === null ? {} : {
      weeklyPercent: clampPercent(secondaryPercent),
      weeklyResetAt: parseResetAfterSeconds(secondary?.reset_after_seconds, nowMs),
    }),
  };
}

export async function fetchCodexSubscriptionUsage(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<ParsedUsageWindow | null> {
  const requestHeaders = buildRequestHeaders(apiKey, headers);
  requireAuthorizationHeader(requestHeaders);

  return parseCodexSubscriptionUsage(
    await requestJson("https://chatgpt.com/backend-api/wham/usage", requestHeaders, config),
    config.nowMs ?? Date.now(),
  );
}
