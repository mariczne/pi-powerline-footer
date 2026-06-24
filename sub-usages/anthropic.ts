import {
  appendCommaSeparatedHeader,
  buildRequestHeaders,
  clampPercent,
  parseResetAt,
  readPercentCandidate,
  requestJson,
  requireAuthorizationHeader,
  type ParsedUsageWindow,
  type RequestConfig,
} from "./shared.ts";

export function parseAnthropicSubscriptionUsage(data: any): ParsedUsageWindow | null {
  const fiveHour = data?.five_hour;
  const sevenDay = data?.seven_day;
  const sessionPercent = readPercentCandidate(fiveHour?.utilization);
  const weeklyPercent = readPercentCandidate(sevenDay?.utilization);
  if (sessionPercent === null || weeklyPercent === null) return null;

  return {
    sessionPercent: clampPercent(sessionPercent),
    weeklyPercent: clampPercent(weeklyPercent),
    sessionResetAt: parseResetAt(fiveHour?.resets_at),
    weeklyResetAt: parseResetAt(sevenDay?.resets_at),
  };
}

export async function fetchAnthropicSubscriptionUsage(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<ParsedUsageWindow | null> {
  const requestHeaders = buildRequestHeaders(apiKey, headers);
  appendCommaSeparatedHeader(requestHeaders, "anthropic-beta", "oauth-2025-04-20");
  requireAuthorizationHeader(requestHeaders);

  return parseAnthropicSubscriptionUsage(
    await requestJson("https://api.anthropic.com/api/oauth/usage", requestHeaders, config),
  );
}
