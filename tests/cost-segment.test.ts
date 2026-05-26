import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import type { SegmentContext, ThemeLike } from "../types.ts";

function createSegmentContext(overrides: Partial<SegmentContext> = {}): SegmentContext {
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    contextPercent: 0,
    contextWindow: 0,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    subscriptionUsage: null,
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options: {},
    theme: {
      fg(_color, text) {
        return text;
      },
    } satisfies ThemeLike,
    colors: {},
    ...overrides,
  };
}

test("cost segment shows subscription usage windows when available", () => {
  const now = new Date();
  const weeklyReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 0, 0, 0, 0);
  const weeklyResetLabel = `${String(weeklyReset.getMonth() + 1).padStart(2, "0")}-${String(weeklyReset.getDate()).padStart(2, "0")}`;
  const rendered = renderSegment("cost", createSegmentContext({
    usingSubscription: true,
    subscriptionUsage: {
      provider: "anthropic",
      sessionPercent: 55,
      weeklyPercent: 22,
      sessionResetAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 23, 0, 0).getTime(),
      weeklyResetAt: weeklyReset.getTime(),
      fetchedAt: Date.now(),
    },
  }));

  assert.equal(rendered.visible, true);
  assert.equal(rendered.content, `(sub [5h 45% 15:23] [7d 78% ${weeklyResetLabel}])`);
});

test("cost segment falls back to plain subscription marker before usage loads", () => {
  const rendered = renderSegment("cost", createSegmentContext({
    usingSubscription: true,
  }));

  assert.equal(rendered.visible, true);
  assert.equal(rendered.content, "(sub)");
});

test("cost segment still renders dollar cost for non-subscription models", () => {
  const rendered = renderSegment("cost", createSegmentContext({
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 1.25 },
  }));

  assert.equal(rendered.visible, true);
  assert.equal(rendered.content, "$1.25");
});
