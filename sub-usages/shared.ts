export interface ParsedUsageWindow {
  sessionPercent?: number;
  weeklyPercent?: number;
  sessionResetAt?: number;
  weeklyResetAt?: number;
  sessionLabel?: string;
  weeklyLabel?: string;
}

export interface RequestConfig {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  nowMs?: number;
  env?: Record<string, string | undefined>;
}

export function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  if (value >= 0 && value <= 1) {
    if (Number.isInteger(value)) return value;
    return Number((value * 100).toFixed(3));
  }

  if (value >= 0 && value <= 100) return value;
  return null;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function parseResetAt(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseResetAfterSeconds(value: unknown, nowMs: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? nowMs + value * 1000
    : undefined;
}

export function getHeaderKey(headers: Record<string, string>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

export function appendCommaSeparatedHeader(headers: Record<string, string>, name: string, value: string): void {
  const existingKey = getHeaderKey(headers, name);
  if (!existingKey) {
    headers[name] = value;
    return;
  }

  const parts = headers[existingKey]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(value)) parts.push(value);
  headers[existingKey] = parts.join(",");
}

export function buildRequestHeaders(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const requestHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  if (apiKey && !getHeaderKey(requestHeaders, "authorization")) {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }

  return requestHeaders;
}

export function requireAuthorizationHeader(headers: Record<string, string>): void {
  if (!getHeaderKey(headers, "authorization")) {
    throw new Error("missing authorization header");
  }
}

export async function requestJson(url: string, headers: Record<string, string>, config: RequestConfig = {}): Promise<any> {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 12000;
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await (config.fetchFn ?? fetch)(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function requestText(url: string, headers: Record<string, string>, config: RequestConfig = {}): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 12000;
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await (config.fetchFn ?? fetch)(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
