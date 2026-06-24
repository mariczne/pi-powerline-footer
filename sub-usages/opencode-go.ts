import {
  buildRequestHeaders,
  clampPercent,
  parseResetAfterSeconds,
  readPercentCandidate,
  requestJson,
  requestText,
  requireAuthorizationHeader,
  type ParsedUsageWindow,
  type RequestConfig,
} from "./shared.ts";

interface OpencodeGoDashboardConfig {
  workspaceId: string;
  authCookie: string;
}

interface OpencodeGoDashboardWindow {
  usagePercent: number;
  resetInSec: number;
}

export function getOpencodeGoDashboardConfig(
  env: Record<string, string | undefined> = process.env,
): OpencodeGoDashboardConfig | null {
  const workspaceId = env.OPENCODE_GO_WORKSPACE_ID?.trim();
  const authCookie = env.OPENCODE_GO_AUTH_COOKIE?.trim();
  return workspaceId && authCookie ? { workspaceId, authCookie } : null;
}

export function isOpencodeGoSubscriptionUsageEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return getOpencodeGoDashboardConfig(env) !== null;
}

export function parseOpencodeGoSubscriptionUsage(data: any, nowMs = Date.now()): ParsedUsageWindow | null {
  const rolling = data?.rolling5h ?? data?.windows?.rolling;
  const weekly = data?.weekly ?? data?.windows?.weekly;
  const sessionPercent = readPercentCandidate(rolling?.usagePercent ?? rolling?.usage_percent);
  const weeklyPercent = readPercentCandidate(weekly?.usagePercent ?? weekly?.usage_percent);
  if (sessionPercent === null || weeklyPercent === null) return null;

  return {
    sessionPercent: clampPercent(sessionPercent),
    weeklyPercent: clampPercent(weeklyPercent),
    sessionResetAt: parseResetAfterSeconds(rolling?.resetInSec ?? rolling?.resets_in_seconds, nowMs),
    weeklyResetAt: parseResetAfterSeconds(weekly?.resetInSec ?? weekly?.resets_in_seconds, nowMs),
    // Opencode Go also reports monthly usage, but the footer only renders the existing 5h/7d windows for now.
  };
}

function parseOpencodeGoDashboardWindow(
  html: string,
  field: "rollingUsage" | "weeklyUsage",
): OpencodeGoDashboardWindow | null {
  const numberPattern = String.raw`(-?\d+(?:\.\d+)?)`;
  const usageFirst = new RegExp(String.raw`${field}:\$R\[\d+\]=\{[^}]*usagePercent:${numberPattern}[^}]*resetInSec:${numberPattern}[^}]*\}`);
  const resetFirst = new RegExp(String.raw`${field}:\$R\[\d+\]=\{[^}]*resetInSec:${numberPattern}[^}]*usagePercent:${numberPattern}[^}]*\}`);

  const usageFirstMatch = usageFirst.exec(html);
  if (usageFirstMatch) {
    const usagePercent = Number(usageFirstMatch[1]);
    const resetInSec = Number(usageFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) return { usagePercent, resetInSec };
  }

  const resetFirstMatch = resetFirst.exec(html);
  if (resetFirstMatch) {
    const resetInSec = Number(resetFirstMatch[1]);
    const usagePercent = Number(resetFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) return { usagePercent, resetInSec };
  }

  return null;
}

function parseHumanResetSeconds(value: string): number | null {
  const normalized = value.toLowerCase().trim().replace(/\s+/g, " ");
  if (["reset-now", "reset now", "now", "resets now"].includes(normalized)) return 0;

  let total = 0;
  const dayMatch = normalized.match(/(\d+(?:\.\d+)?)\s*days?/);
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*hours?/);
  const minuteMatch = normalized.match(/(\d+(?:\.\d+)?)\s*minutes?/);
  const secondMatch = normalized.match(/(\d+(?:\.\d+)?)\s*seconds?/);
  const hasDuration = Boolean(dayMatch || hourMatch || minuteMatch || secondMatch);

  if (dayMatch) total += Number(dayMatch[1]) * 86400;
  if (hourMatch) total += Number(hourMatch[1]) * 3600;
  if (minuteMatch) total += Number(minuteMatch[1]) * 60;
  if (secondMatch) total += Number(secondMatch[1]);

  return hasDuration ? total : null;
}

function parseOpencodeGoDataSlotWindow(
  html: string,
  windowName: "rolling" | "weekly",
): OpencodeGoDashboardWindow | null {
  const items = html.split(/data-slot="usage-item"/);
  for (let i = 1; i < items.length; i++) {
    const content = items[i];
    const label = content.match(/data-slot="usage-label">([^<]+)</)?.[1]?.trim().toLowerCase();
    if (!label?.includes(windowName)) continue;

    const usagePercent = Number(content.match(/data-slot="usage-value">[^0-9]*(\d+(?:\.\d+)?)/)?.[1]);
    const resetMatch = content.match(/data-slot="(reset-time|reset-now)">([\s\S]*?)<\/span>/);
    if (!Number.isFinite(usagePercent) || !resetMatch) continue;

    const resetContent = resetMatch[2]
      .replace(/<!--\$-->/g, "")
      .replace(/<!--\/-->/g, "")
      .replace(/Resets?\s*in\s*/i, "")
      .trim();
    const resetInSec = resetMatch[1] === "reset-now" ? 0 : parseHumanResetSeconds(resetContent);
    if (resetInSec !== null && Number.isFinite(resetInSec)) return { usagePercent, resetInSec };
  }

  return null;
}

export function parseOpencodeGoDashboardUsage(html: string, nowMs = Date.now()): ParsedUsageWindow | null {
  const rolling = parseOpencodeGoDashboardWindow(html, "rollingUsage") ?? parseOpencodeGoDataSlotWindow(html, "rolling");
  const weekly = parseOpencodeGoDashboardWindow(html, "weeklyUsage") ?? parseOpencodeGoDataSlotWindow(html, "weekly");
  if (!rolling || !weekly) return null;

  return {
    sessionPercent: clampPercent(rolling.usagePercent),
    weeklyPercent: clampPercent(weekly.usagePercent),
    sessionResetAt: parseResetAfterSeconds(rolling.resetInSec, nowMs),
    weeklyResetAt: parseResetAfterSeconds(weekly.resetInSec, nowMs),
    // Opencode Go also reports monthly usage, but the footer only renders the existing 5h/7d windows for now.
  };
}

export async function fetchOpencodeGoSubscriptionUsage(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<ParsedUsageWindow | null> {
  const dashboardConfig = getOpencodeGoDashboardConfig(config.env);
  const nowMs = config.nowMs ?? Date.now();
  if (dashboardConfig) {
    return parseOpencodeGoDashboardUsage(
      await requestText(
        `https://opencode.ai/workspace/${encodeURIComponent(dashboardConfig.workspaceId)}/go`,
        {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0",
          Accept: "text/html",
          Cookie: `auth=${dashboardConfig.authCookie}`,
        },
        config,
      ),
      nowMs,
    );
  }

  const requestHeaders = buildRequestHeaders(apiKey, headers);
  requireAuthorizationHeader(requestHeaders);
  return parseOpencodeGoSubscriptionUsage(
    await requestJson("https://opencode.ai/zen/go/v1/usage", requestHeaders, config),
    nowMs,
  );
}
