import { fetchAnthropicSubscriptionUsage, parseAnthropicSubscriptionUsage } from "./sub-usages/anthropic.ts";
import { fetchCodexSubscriptionUsage, parseCodexSubscriptionUsage } from "./sub-usages/openai-codex.ts";
import {
  fetchOpencodeGoSubscriptionUsage,
  isOpencodeGoSubscriptionUsageEnabled,
  parseOpencodeGoDashboardUsage,
  parseOpencodeGoSubscriptionUsage,
} from "./sub-usages/opencode-go.ts";
import type { ParsedUsageWindow, RequestConfig } from "./sub-usages/shared.ts";

export const SUPPORTED_SUBSCRIPTION_PROVIDERS = [
  "anthropic",
  "openai-codex",
  "opencode-go",
] as const;

export type SupportedSubscriptionProvider = typeof SUPPORTED_SUBSCRIPTION_PROVIDERS[number];

export interface SubscriptionUsage {
  provider: SupportedSubscriptionProvider;
  sessionPercent: number;
  weeklyPercent: number;
  sessionResetAt?: number;
  weeklyResetAt?: number;
  fetchedAt: number;
}

type SubscriptionUsageFetcher = (
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config?: RequestConfig,
) => Promise<ParsedUsageWindow | null>;

const SUBSCRIPTION_USAGE_FETCHERS: Record<SupportedSubscriptionProvider, SubscriptionUsageFetcher> = {
  anthropic: fetchAnthropicSubscriptionUsage,
  "openai-codex": fetchCodexSubscriptionUsage,
  "opencode-go": fetchOpencodeGoSubscriptionUsage,
};

function isSupportedSubscriptionProvider(value: unknown): value is SupportedSubscriptionProvider {
  return typeof value === "string" && SUPPORTED_SUBSCRIPTION_PROVIDERS.includes(value as SupportedSubscriptionProvider);
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

export function getSupportedSubscriptionProvider(model: { provider?: unknown } | undefined): SupportedSubscriptionProvider | null {
  return isSupportedSubscriptionProvider(model?.provider) ? model.provider : null;
}

export function isSubscriptionUsageEnabled(
  provider: SupportedSubscriptionProvider | null,
  usingOAuth: boolean,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!provider) return false;
  return provider === "opencode-go" ? isOpencodeGoSubscriptionUsageEnabled(env) : usingOAuth;
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
  const parsed = await SUBSCRIPTION_USAGE_FETCHERS[provider](apiKey, headers, config);
  if (!parsed) throw new Error("unrecognized usage response");

  return {
    provider,
    sessionPercent: parsed.sessionPercent,
    weeklyPercent: parsed.weeklyPercent,
    sessionResetAt: parsed.sessionResetAt,
    weeklyResetAt: parsed.weeklyResetAt,
    fetchedAt: config.nowMs ?? Date.now(),
  };
}

export {
  parseAnthropicSubscriptionUsage,
  parseCodexSubscriptionUsage,
  parseOpencodeGoDashboardUsage,
  parseOpencodeGoSubscriptionUsage,
};
