export type SupportedSubscriptionProvider = "anthropic" | "openai-codex";

export interface SubscriptionUsage {
  provider: SupportedSubscriptionProvider;
  sessionPercent: number;
  weeklyPercent: number;
  sessionResetAt?: number;
  weeklyResetAt?: number;
  fetchedAt: number;
}

interface ParsedUsageWindow {
  sessionPercent: number;
  weeklyPercent: number;
  sessionResetAt?: number;
  weeklyResetAt?: number;
}

interface RequestConfig {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  nowMs?: number;
}

function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  if (value >= 0 && value <= 1) {
    if (Number.isInteger(value)) return value;
    return Number((value * 100).toFixed(3));
  }

  if (value >= 0 && value <= 100) return value;
  return null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  const rounded = Math.round(clampPercent(value) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function invertPercent(value: number): number {
  return Math.max(0, 100 - clampPercent(value));
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseResetAt(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatResetLabel(resetAt: number | undefined, nowMs = Date.now()): string {
  if (typeof resetAt !== "number" || !Number.isFinite(resetAt)) return "";

  const reset = new Date(resetAt);
  const now = new Date(nowMs);
  const sameDay = reset.getFullYear() === now.getFullYear()
    && reset.getMonth() === now.getMonth()
    && reset.getDate() === now.getDate();

  return sameDay
    ? `${pad2(reset.getHours())}:${pad2(reset.getMinutes())}`
    : `${pad2(reset.getMonth() + 1)}-${pad2(reset.getDate())}`;
}

function formatUsageWindow(label: string, remainingPercent: number, resetAt: number | undefined, nowMs = Date.now()): string {
  const resetLabel = formatResetLabel(resetAt, nowMs);
  return resetLabel
    ? `[${label} ${formatPercent(remainingPercent)} ${resetLabel}]`
    : `[${label} ${formatPercent(remainingPercent)}]`;
}

function getHeaderKey(headers: Record<string, string>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return key;
    }
  }
  return null;
}

function appendCommaSeparatedHeader(headers: Record<string, string>, name: string, value: string): void {
  const existingKey = getHeaderKey(headers, name);
  if (!existingKey) {
    headers[name] = value;
    return;
  }

  const parts = headers[existingKey]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(value)) {
    parts.push(value);
  }
  headers[existingKey] = parts.join(",");
}

function buildRequestHeaders(
  provider: SupportedSubscriptionProvider,
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const requestHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  if (apiKey && !getHeaderKey(requestHeaders, "authorization")) {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }

  if (provider === "anthropic") {
    appendCommaSeparatedHeader(requestHeaders, "anthropic-beta", "oauth-2025-04-20");
  }

  return requestHeaders;
}

async function requestJson(url: string, headers: Record<string, string>, config: RequestConfig = {}): Promise<any> {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 12000;
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await (config.fetchFn ?? fetch)(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function getSupportedSubscriptionProvider(model: { provider?: unknown } | undefined): SupportedSubscriptionProvider | null {
  return model?.provider === "anthropic" || model?.provider === "openai-codex"
    ? model.provider
    : null;
}

export function parseCodexSubscriptionUsage(data: any, nowMs = Date.now()): ParsedUsageWindow | null {
  const primary = data?.rate_limit?.primary_window;
  const secondary = data?.rate_limit?.secondary_window;
  const sessionPercent = readPercentCandidate(primary?.used_percent);
  const weeklyPercent = readPercentCandidate(secondary?.used_percent);
  if (sessionPercent === null || weeklyPercent === null) {
    return null;
  }

  return {
    sessionPercent: clampPercent(sessionPercent),
    weeklyPercent: clampPercent(weeklyPercent),
    sessionResetAt: typeof primary?.reset_after_seconds === "number" ? nowMs + (primary.reset_after_seconds * 1000) : undefined,
    weeklyResetAt: typeof secondary?.reset_after_seconds === "number" ? nowMs + (secondary.reset_after_seconds * 1000) : undefined,
  };
}

export function parseAnthropicSubscriptionUsage(data: any): ParsedUsageWindow | null {
  const fiveHour = data?.five_hour;
  const sevenDay = data?.seven_day;
  const sessionPercent = readPercentCandidate(fiveHour?.utilization);
  const weeklyPercent = readPercentCandidate(sevenDay?.utilization);
  if (sessionPercent === null || weeklyPercent === null) {
    return null;
  }

  return {
    sessionPercent: clampPercent(sessionPercent),
    weeklyPercent: clampPercent(weeklyPercent),
    sessionResetAt: parseResetAt(fiveHour?.resets_at),
    weeklyResetAt: parseResetAt(sevenDay?.resets_at),
  };
}

export function formatSubscriptionUsageSummary(usage: SubscriptionUsage, nowMs = Date.now()): string {
  return [
    formatUsageWindow("5h", invertPercent(usage.sessionPercent), usage.sessionResetAt, nowMs),
    formatUsageWindow("7d", invertPercent(usage.weeklyPercent), usage.weeklyResetAt, nowMs),
  ].join(" ");
}

export async function fetchProviderSubscriptionUsage(
  provider: SupportedSubscriptionProvider,
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<SubscriptionUsage> {
  const requestHeaders = buildRequestHeaders(provider, apiKey, headers);
  if (!getHeaderKey(requestHeaders, "authorization")) {
    throw new Error("missing authorization header");
  }

  const data = await requestJson(
    provider === "anthropic"
      ? "https://api.anthropic.com/api/oauth/usage"
      : "https://chatgpt.com/backend-api/wham/usage",
    requestHeaders,
    config,
  );

  const nowMs = config.nowMs ?? Date.now();
  const parsed = provider === "anthropic"
    ? parseAnthropicSubscriptionUsage(data)
    : parseCodexSubscriptionUsage(data, nowMs);
  if (!parsed) {
    throw new Error("unrecognized usage response");
  }

  return {
    provider,
    sessionPercent: parsed.sessionPercent,
    weeklyPercent: parsed.weeklyPercent,
    sessionResetAt: parsed.sessionResetAt,
    weeklyResetAt: parsed.weeklyResetAt,
    fetchedAt: nowMs,
  };
}
