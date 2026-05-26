import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import type { SegmentContext, ThemeLike } from "../types.ts";

function createSegmentContext(model: SegmentContext["model"]): SegmentContext {
  return {
    model,
    thinkingLevel: "off",
    sessionId: undefined,
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    contextPercent: 0,
    contextWindow: 0,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
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
  };
}

test("model segment appends provider in parentheses after the model name", () => {
  const rendered = renderSegment("model", createSegmentContext({
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "openai-codex",
    reasoning: true,
    contextWindow: 400000,
  } as SegmentContext["model"]));

  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /GPT-5\.5 \(openai-codex\)/);
  assert.doesNotMatch(rendered.content, /GPT-5\.5 · openai-codex/);
});

test("model segment does not duplicate provider when already prefixed", () => {
  const rendered = renderSegment("model", createSegmentContext({
    id: "openai-codex/gpt-5.5",
    name: "openai-codex/gpt-5.5",
    provider: "openai-codex",
    reasoning: true,
    contextWindow: 400000,
  } as SegmentContext["model"]));

  const matches = rendered.content.match(/openai-codex/g) ?? [];
  assert.equal(matches.length, 1);
});
