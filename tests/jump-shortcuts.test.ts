import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEYBINDINGS } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import {
  isSupportedSuperShortcut,
  matchesConfiguredShortcut,
  shortcutConflictKey,
} from "../shortcuts.ts";
import { KeybindingsManager } from "@earendil-works/pi-tui";
import {
  buildShortcutPaletteEntries,
  collectPiKeybindingDefinitions,
  getPowerlineShortcutHelpEntries,
  isShortcutPaletteQueryInput,
  parseBashModeSettings,
  piShortcutGroupPrefix,
  resolveShortcutConfig,
  shortcutPaletteItemDescription,
} from "../index.ts";

const source = readFileSync(new URL("../index.ts", import.meta.url), "utf-8");

const powerlineShortcutKeys = new Set([
  "showShortcuts",
  "stashHistory",
  "copyEditor",
  "cutEditor",
  "jumpPreviousUserMessage",
  "jumpNextUserMessage",
  "jumpPreviousLlmMessage",
  "jumpNextLlmMessage",
  "jumpChatBottom",
  "scrollChatUp",
  "scrollChatDown",
  "editorStart",
  "editorEnd",
]);

function normalizeShortcut(shortcut: string): string {
  const parts = shortcut.trim().toLowerCase().split("+");
  if (parts.length <= 1) return parts[0] ?? "";

  const modifierRank = new Map(["ctrl", "alt", "super", "shift"].map((modifier, index) => [modifier, index]));
  return [
    ...parts.slice(0, -1).sort((a, b) => (modifierRank.get(a) ?? 99) - (modifierRank.get(b) ?? 99)),
    parts[parts.length - 1],
  ].join("+");
}

function powerlineDefaults(): Map<string, string> {
  const defaults = new Map<string, string>();
  for (const match of source.matchAll(/^  ([a-zA-Z0-9]+): "([^"]+)",?$/gm)) {
    const key = match[1];
    const value = match[2];
    if (key && value && powerlineShortcutKeys.has(key)) {
      defaults.set(key, value);
    }
  }
  return defaults;
}

test("chat jump shortcuts are configurable and route through fixed editor scrolling", () => {
  const defaults = powerlineDefaults();
  assert.equal(defaults.get("showShortcuts"), "ctrl+shift+k");
  assert.equal(defaults.get("jumpPreviousUserMessage"), "ctrl+shift+u");
  assert.equal(defaults.get("jumpNextUserMessage"), "ctrl+shift+i");
  assert.equal(defaults.get("jumpPreviousLlmMessage"), "ctrl+alt+,");
  assert.equal(defaults.get("jumpNextLlmMessage"), "ctrl+alt+.");
  assert.equal(defaults.get("jumpChatBottom"), "ctrl+alt+g");
  assert.equal(defaults.get("scrollChatUp"), "super+up");
  assert.equal(defaults.get("scrollChatDown"), "super+down");
  assert.equal(defaults.get("editorStart"), "super+shift+up");
  assert.equal(defaults.get("editorEnd"), "super+shift+down");
  assert.match(source, /const CHAT_JUMP_SHORTCUTS:/);
  assert.match(source, /shortcutKey: "jumpPreviousUserMessage"/);
  assert.match(source, /shortcutKey: "jumpNextUserMessage"/);
  assert.match(source, /shortcutKey: "jumpPreviousLlmMessage"/);
  assert.match(source, /shortcutKey: "jumpNextLlmMessage"/);
  assert.match(source, /shortcutKey: "jumpChatBottom"/);
  assert.match(source, /return chatJumpAction \? \{ kind: "chat", action: chatJumpAction \} : null/);
  assert.doesNotMatch(source, /pi\.registerShortcut\(resolvedShortcuts\[shortcutKey\]/);
  assert.match(source, /function collectChatMessageStartLines\(role: ChatJumpRole\): number\[\]/);
  assert.match(source, /componentName === "UserMessageComponent"/);
  assert.match(source, /componentName === "SkillInvocationMessageComponent"/);
  assert.match(source, /componentName === "AssistantMessageComponent"/);
  assert.match(source, /fixedEditorCompositor\.jumpToPreviousRootTarget\(targets\)/);
  assert.match(source, /fixedEditorCompositor\.jumpToNextRootTarget\(targets\)/);
  assert.match(source, /fixedEditorCompositor\.jumpToRootBottom\(\)/);
  assert.match(source, /function getChatJumpShortcutAction\(data: string\): ChatJumpShortcutAction \| null/);
  assert.match(source, /let resolvedShortcuts = resolveShortcutConfig\(startupSettings\)/);
  assert.match(source, /resolvedShortcuts = resolveShortcutConfig\(settings\)/);
  assert.match(source, /keyboardScrollShortcuts: \{\n\s+up: resolvedShortcuts\.scrollChatUp,\n\s+down: resolvedShortcuts\.scrollChatDown,/);
  assert.match(source, /const scrollAwayNavigationCard = config\.scrollAwayNavigationCard/);
  assert.match(source, /scrollAwayCardMatch = \/\^scroll-away-card/);
  assert.match(source, /scrollAwayNavigationCard,/);
  assert.match(source, /shortcuts: \[/);
  assert.match(source, /scrollAwayShortcutEntry\("bottom", resolvedShortcuts\.jumpChatBottom\)/);
  assert.match(source, /onClickBottom: resolvedShortcuts\.jumpChatBottom \? \(\) => jumpChatToBottom\(ctx\) : undefined/);
  assert.match(source, /function formatShortcutLabel\(shortcut: ShortcutBinding\): string \| null/);
  assert.match(source, /part\.toLowerCase\(\) === "super" \? "cmd" : part/);
  assert.match(source, /editorBoundaryShortcuts: \{\n\s+start: resolvedShortcuts\.editorStart,\n\s+end: resolvedShortcuts\.editorEnd,/);
  assert.match(source, /modifier === "cmd" \|\| modifier === "command" \? "super" : modifier/);
  assert.match(source, /shortcutUsesSuper\(normalizedShortcut\) && !isSupportedSuperShortcut\(normalizedShortcut\)/);
  assert.match(source, /jumpToChatMessage\(ctx, action\.action\.role, action\.action\.direction\)/);
});

test("powerline shortcut help lists active bindings and omits disabled bindings", () => {
  const entries = getPowerlineShortcutHelpEntries({
    showShortcuts: null,
    stashHistory: null,
    copyEditor: "ctrl+alt+c",
    cutEditor: null,
    jumpPreviousUserMessage: null,
    jumpNextUserMessage: null,
    jumpPreviousLlmMessage: null,
    jumpNextLlmMessage: null,
    jumpChatBottom: null,
    scrollChatUp: "super+up",
    scrollChatDown: null,
    editorStart: null,
    editorEnd: null,
  }, "ctrl+shift+b");

  assert.deepEqual(entries, [
    { key: "stash", label: "Stash or restore editor", shortcut: "alt+s" },
    { key: "bashToggle", label: "Toggle bash mode", shortcut: "ctrl+shift+b" },
    { key: "copyEditor", label: "Copy editor text", shortcut: "ctrl+alt+c" },
    { key: "scrollChatUp", label: "Scroll chat up", shortcut: "cmd+up" },
  ]);
  assert.match(source, /runShortcutPaletteEntry\(ctx, selected\)/);
  assert.match(source, /if \(normalizedArgs === "shortcuts"\)/);
  assert.match(source, /theme\.bold\("Shortcuts"\)/);
});

test("shortcut palette merges powerline and pi bindings with search-friendly metadata", () => {
  const powerlineEntries = getPowerlineShortcutHelpEntries(resolveShortcutConfig({}), "ctrl+shift+b");
  const runnableIds = new Set(["app.model.select", "app.session.resume", "app.clipboard.pasteImage"]);

  const manager = new KeybindingsManager(KEYBINDINGS, { "app.model.select": "ctrl+alt+m" });
  const piKeybindings = collectPiKeybindingDefinitions(manager);
  assert.deepEqual(collectPiKeybindingDefinitions(undefined), {});

  const entries = buildShortcutPaletteEntries({
    powerlineEntries,
    piKeybindings,
    isPiActionRunnable: (id) => runnableIds.has(id),
  });

  // Every powerline entry is present, prefixed, and runnable.
  for (const entry of powerlineEntries) {
    const paletteEntry = entries.find((candidate) => candidate.id === `powerline:${entry.key}`);
    assert.ok(paletteEntry, `missing palette entry for powerline:${entry.key}`);
    assert.equal(paletteEntry.label, `Powerline: ${entry.label}`);
    assert.equal(paletteEntry.runnable, true);
  }

  // Every pi keybinding is present exactly once.
  for (const id of Object.keys(KEYBINDINGS)) {
    assert.equal(entries.filter((candidate) => candidate.id === `pi:${id}`).length, 1);
  }

  // Configured keys override defaults; unconfigured fall back to defaults.
  const modelSelect = entries.find((entry) => entry.id === "pi:app.model.select");
  assert.equal(modelSelect?.shortcut, "ctrl+alt+m");
  assert.equal(modelSelect?.runnable, true);
  const undo = entries.find((entry) => entry.id === "pi:tui.editor.undo");
  assert.equal(undo?.shortcut, "ctrl+-");
  assert.equal(undo?.runnable, false);

  // Unbound-but-runnable app actions still appear as commands.
  const resume = entries.find((entry) => entry.id === "pi:app.session.resume");
  assert.equal(resume?.shortcut, "");
  assert.equal(resume?.runnable, true);

  // Runnable entries are listed before reference-only entries.
  const lastRunnable = entries.reduce((last, entry, index) => (entry.runnable ? index : last), -1);
  const firstReference = entries.findIndex((entry) => !entry.runnable);
  assert.ok(lastRunnable < firstReference || firstReference === -1);

  // Context-scoped bindings get group prefixes.
  assert.equal(piShortcutGroupPrefix("tui.editor.undo"), "Editor: ");
  assert.equal(piShortcutGroupPrefix("tui.select.confirm"), "Lists: ");
  assert.equal(piShortcutGroupPrefix("app.tree.filter.all"), "Tree view: ");
  assert.equal(piShortcutGroupPrefix("app.models.save"), "Model selector: ");
  assert.equal(piShortcutGroupPrefix("app.session.delete"), "Session picker: ");
  assert.equal(piShortcutGroupPrefix("app.model.select"), "");

  // Reference-only entries are marked in the description column.
  assert.equal(
    shortcutPaletteItemDescription({ id: "pi:tui.editor.undo", label: "Editor: Undo", shortcut: "ctrl+-", runnable: false }),
    "ctrl+- · reference",
  );
  assert.equal(
    shortcutPaletteItemDescription({ id: "pi:app.session.resume", label: "Resume a session", shortcut: "", runnable: true }),
    undefined,
  );

  // Dangerous or palette-redundant actions never run from the palette.
  assert.match(source, /PI_PALETTE_RUN_EXCLUDED = new Set\(\["app\.interrupt", "app\.exit", "app\.clear"\]\)/);
  // App actions execute through the handlers pi copies onto the custom editor.
  assert.match(source, /const handlers = currentEditor\?\.actionHandlers/);
  assert.match(source, /handlers instanceof Map \? handlers\.get\(actionId\) : undefined/);
});

test("shortcut palette query input accepts printable text and rejects control sequences", () => {
  assert.equal(isShortcutPaletteQueryInput("a"), true);
  assert.equal(isShortcutPaletteQueryInput("model select"), true);
  assert.equal(isShortcutPaletteQueryInput("ß"), true);
  assert.equal(isShortcutPaletteQueryInput(""), false);
  assert.equal(isShortcutPaletteQueryInput("\x1b[A"), false);
  assert.equal(isShortcutPaletteQueryInput("\x0b"), false);
  assert.equal(isShortcutPaletteQueryInput("\x7f"), false);
  assert.equal(isShortcutPaletteQueryInput("\x1bs"), false);
});

test("super shortcut matching rejects plain keys and unsupported command aliases", () => {
  assert.equal(matchesConfiguredShortcut("c", "super+c"), false);
  assert.equal(matchesConfiguredShortcut("X", "super+shift+x"), false);
  assert.equal(matchesConfiguredShortcut("\x1b[A", "super+up"), false);
  assert.equal(matchesConfiguredShortcut("\x1b[1;9A", "super+up"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[1;10A", "super+shift+up"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[122;9u", "super+z"), false);
  assert.equal(matchesConfiguredShortcut("\x1b\x07", "ctrl+alt+g"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[103;7u", "ctrl+alt+g"), true);
  assert.equal(isSupportedSuperShortcut("super+c"), false);
  assert.equal(isSupportedSuperShortcut("super+shift+x"), false);
  assert.equal(isSupportedSuperShortcut("super+z"), false);
  assert.equal(isSupportedSuperShortcut("super+up"), true);
  assert.equal(shortcutConflictKey("super+home"), "super+up");
  assert.equal(shortcutConflictKey("super+end"), "super+down");
  assert.equal(shortcutConflictKey("super+shift+home"), "super+shift+up");
  assert.equal(shortcutConflictKey("super+shift+end"), "super+shift+down");
});

test("editor submits follow the fixed chat viewport to bottom", () => {
  assert.match(source, /function followSubmittedEditorToBottom\(\): void/);
  assert.match(source, /onEditorSubmit: \(\) => followSubmittedEditorToBottom\(\)/);
  assert.match(source, /Object\.defineProperty\(editor, "onSubmit"/);
  assert.match(source, /followSubmittedEditorToBottom\(\);\n\s+handler\(text\);/);
  assert.match(source, /keybindings\.matches\(data, "app\.message\.followUp"\)/);
});

test("thinking level changes invalidate powerline status rendering", () => {
  assert.match(source, /let currentThinkingLevel: string \| null = null/);
  assert.match(source, /pi\.on\("thinking_level_select", async \(event, ctx\) => \{\n\s+currentCtx = ctx;\n\s+currentThinkingLevel = getThinkingLevelFn\?\.\(\) \?\? \(typeof event\.level === "string" \? event\.level : null\);\n\s+requestImmediateStatusRender\(\{ deferDuringTyping: false \}\);\n\s+\}\);/);
  assert.match(source, /if \(e\.type === "thinking_level_change" && typeof e\.thinkingLevel === "string"\) \{\n\s+thinkingLevelFromSession = e\.thinkingLevel;/);
  assert.match(source, /const thinkingLevel = currentThinkingLevel \?\? thinkingLevelFromSession \?\? getThinkingLevelFn\?\.\(\) \?\? "off"/);
});

test("context usage changes repaint from live streaming message usage", () => {
  assert.match(source, /const CONTEXT_STATUS_RENDER_MS = 250/);
  assert.match(source, /function getUsageTokenTotal\(usage: SessionAssistantUsage\): number/);
  assert.match(source, /const totalTokens = "totalTokens" in usage && typeof usage\.totalTokens === "number"/);
  assert.match(source, /return totalTokens \|\| usage\.input \+ usage\.output \+ usage\.cacheRead \+ usage\.cacheWrite/);
  assert.match(source, /let liveAssistantUsage: SessionAssistantUsage \| null = null/);
  assert.doesNotMatch(source, /const requestContextStatusRender/);
  assert.match(source, /lastUserPrompt = "";\n\s+isStreaming = false;\n\s+liveAssistantUsage = null;\n\s+stashedEditorText = null;/);
  assert.match(source, /pi\.on\("agent_start", async \(_event, ctx\) => \{\n\s+isStreaming = true;\n\s+liveAssistantUsage = null;\n\s+dismissWelcome\(ctx\);\n\s+currentCtx = ctx;\n\s+\}\);/);
  assert.match(source, /pi\.on\("message_update", async \(event, ctx\) => \{\n\s+if \(isSessionAssistantMessage\(event\.message\)\n\s+&& event\.message\.stopReason !== "error"\n\s+&& event\.message\.stopReason !== "aborted"\n\s+&& getUsageTokenTotal\(event\.message\.usage\) > 0\) \{\n\s+liveAssistantUsage = event\.message\.usage;\n\s+currentCtx = ctx;\n\s+layoutDirty = true;\n\s+statusRenderScheduler\.schedule\(CONTEXT_STATUS_RENDER_MS\);\n\s+\}\n\s+\}\);/);
  assert.match(source, /pi\.on\("message_end", async \(event, ctx\) => \{\n\s+currentCtx = ctx;\n\s+if \(isSessionAssistantMessage\(event\.message\)\) \{\n\s+if \(event\.message\.stopReason === "error" \|\| event\.message\.stopReason === "aborted"\) \{\n\s+liveAssistantUsage = null;\n\s+\} else if \(getUsageTokenTotal\(event\.message\.usage\) > 0\) \{\n\s+liveAssistantUsage = event\.message\.usage;\n\s+\}\n\s+\}\n\s+requestImmediateStatusRender\(\{ deferDuringTyping: false \}\);\n\s+\}\);/);
  assert.match(source, /pi\.on\("agent_end", async \(_event, ctx\) => \{\n\s+isStreaming = false;\n\s+liveAssistantUsage = null;\n\n\s+let hasUI = false;/);
  assert.match(source, /currentCtx = ctx;\n\s+try \{\n\s+if \(hasUI\)/);
  assert.match(source, /pi\.on\("session_tree", async \(_event, ctx\) => \{\n\s+currentCtx = ctx;\n\s+currentThinkingLevel = null;\n\s+liveAssistantUsage = null;\n\s+requestImmediateStatusRender\(\{ deferDuringTyping: false \}\);\n\s+\}\);/);
  assert.match(source, /if \(getUsageTokenTotal\(m\.usage\) > 0\) \{\n\s+lastAssistant = m;\n\s+\}/);
  assert.match(source, /const coreContextUsage = isStreaming && liveAssistantUsage \? null : readCoreContextUsage\(ctx\)/);
  assert.match(source, /const contextTokens = coreContextUsage\?\.contextTokens \?\? \(latestUsage \? getUsageTokenTotal\(latestUsage\) : 0\)/);
});

test("extension status changes invalidate powerline status rendering", () => {
  assert.match(source, /let forceNextLayoutRecompute = false/);
  assert.match(source, /let restoreFooterStatusRepaintHook: \(\(\) => void\) \| null = null/);
  assert.match(source, /const requestImmediateStatusRender = \(options: \{ deferDuringTyping\?: boolean \} = \{\}\) => \{/);
  assert.match(source, /if \(options\.deferDuringTyping !== false && Date\.now\(\) - lastEditorInputAt < EDITOR_STATUS_DEFER_MS\) \{\n\s+statusRenderScheduler\.schedule\(\);\n\s+return;\n\s+\}/);
  assert.match(source, /forceNextLayoutRecompute = true;\n\s+statusRenderScheduler\.cancel\(\);\n\s+statusRenderScheduler\.schedule\(0\);/);
  assert.match(source, /const installFooterStatusRepaintHook = \(footerData: ReadonlyFooterDataProvider\) => \{/);
  assert.match(source, /setExtensionStatus\?: \(key: string, text: string \| undefined\) => void/);
  assert.match(source, /const setExtensionStatusAndRepaint = function setExtensionStatusAndRepaint/);
  assert.match(source, /originalSetExtensionStatus\.call\(this, key, text\);\n\s+requestImmediateStatusRender\(\);/);
  assert.match(source, /installFooterStatusRepaintHook\(footerData\);/);
  assert.match(source, /if \(writableFooterData\.setExtensionStatus === setExtensionStatusAndRepaint\) \{\n\s+writableFooterData\.setExtensionStatus = originalSetExtensionStatus;/);
  assert.match(source, /if \(clearExtensionStatusesAndRepaint && writableFooterData\.clearExtensionStatuses === clearExtensionStatusesAndRepaint\)/);
  assert.match(source, /restoreFooterStatusRepaintHook\?\.\(\);\n\s+restoreFooterStatusRepaintHook = null;/);
});

test("fixed editor captures Pi status messages with the editor cluster", () => {
  assert.match(source, /let fixedStatusContainer: any = null/);
  assert.match(source, /const statusContainerCandidate = tuiChildren\[editorContainerMatch\.index - 2\] \?\? null/);
  assert.match(source, /fixedStatusContainer = statusContainerCandidate && typeof statusContainerCandidate\.render === "function"/);
  assert.match(source, /compositor\.renderHidden\(fixedStatusContainer, width\)\.filter\(\(line\) => visibleWidth\(line\) > 0\)/);
  assert.match(source, /statusLines: \[\.\.\.aboveWidgetLines, \.\.\.renderPowerlineStatusLines\(width\), \.\.\.statusContainerLines\]/);
  assert.match(source, /if \(fixedStatusContainer\?\.render\) compositor\.hideRenderable\(fixedStatusContainer\)/);
  assert.match(source, /fixedStatusContainer = null/);
});

test("shutdown cleanup resets terminal modes even before compositor install", () => {
  assert.match(source, /import \{ DEFAULT_SCROLL_REPAINT_THROTTLE_MS, emergencyTerminalModeReset, TerminalSplitCompositor \}/);
  assert.match(source, /const hadCompositor = fixedEditorCompositor !== null/);
  assert.match(source, /if \(!hadCompositor && options\?\.resetExtendedKeyboardModes\)/);
  assert.match(source, /process\.stdout\.write\(emergencyTerminalModeReset\(\)\)/);
});

test("powerline shortcut defaults do not claim reserved Pi shortcuts", () => {
  const reservedKeys = new Map<string, string>();
  for (const [id, definition] of Object.entries(KEYBINDINGS)) {
    const keys = definition.defaultKeys === undefined
      ? []
      : Array.isArray(definition.defaultKeys)
        ? definition.defaultKeys
        : [definition.defaultKeys];
    for (const key of keys) {
      reservedKeys.set(normalizeShortcut(key), id);
    }
  }

  for (const [name, shortcut] of powerlineDefaults()) {
    const conflict = reservedKeys.get(normalizeShortcut(shortcut));
    assert.equal(conflict, undefined, `${name} default ${shortcut} conflicts with ${conflict}`);
  }
});

test("powerline fallback routing rejects reserved Pi shortcut defaults", () => {
  assert.doesNotMatch(source, /KeybindingsManager/);
  assert.match(source, /TUI_KEYBINDINGS/);
  assert.match(source, /const APP_RESERVED_SHORTCUTS = \[/);
  assert.match(source, /"alt\+enter"/);
  assert.match(source, /"alt\+up"/);
  assert.match(source, /"alt\+down"/);
  assert.match(source, /"ctrl\+s"/);
  assert.match(source, /"shift\+l"/);
  assert.match(source, /for \(const definition of Object\.values\(TUI_KEYBINDINGS\)\)/);
  assert.doesNotMatch(source, /RESERVED_TUI_KEYBINDING_IDS/);
  assert.match(source, /const EXTRA_RESERVED_SHORTCUTS = \["alt\+s"\] as const/);
  assert.match(source, /const SHORTCUT_MODIFIER_ORDER = \["ctrl", "alt", "super", "shift"\] as const/);
  assert.match(source, /const SHORTCUT_MODIFIERS = new Set\(SHORTCUT_MODIFIER_ORDER\)/);
  assert.match(source, /modifierRank\.get\(a\)/);
  assert.match(source, /const used = new Set\(Array\.from\(reservedShortcuts\(\), shortcutUsageKey\)\)/);
  assert.match(source, /parseBashModeSettings\(settings, resolvedShortcuts\)/);
});

test("powerline shortcuts support explicit disabled bindings", () => {
  const resolved = resolveShortcutConfig({
    powerlineShortcuts: {
      showShortcuts: "",
      stashHistory: "",
      copyEditor: null,
      cutEditor: "ctrl+alt+x",
      jumpPreviousUserMessage: undefined,
      jumpChatBottom: null,
      scrollChatUp: "",
    },
  });
  const bashMode = parseBashModeSettings({ bashMode: { toggleShortcut: undefined } });

  assert.equal(resolved.showShortcuts, null);
  assert.equal(resolved.stashHistory, null);
  assert.equal(resolved.copyEditor, null);
  assert.equal(resolved.cutEditor, "ctrl+alt+x");
  assert.equal(resolved.jumpPreviousUserMessage, null);
  assert.equal(resolved.jumpChatBottom, null);
  assert.equal(resolved.scrollChatUp, null);
  assert.equal(resolved.scrollChatDown, "super+down");
  assert.equal(bashMode.toggleShortcut, null);
  assert.equal(matchesConfiguredShortcut("\x1b\x07", resolved.jumpChatBottom), false);
  assert.equal(matchesConfiguredShortcut("\x1b[1;9A", resolved.scrollChatUp), false);
  assert.equal(matchesConfiguredShortcut("\x1b\x0b", resolved.showShortcuts), false);
});

test("powerline shortcut resolver reserves the active bash-mode toggle", () => {
  const settings = { powerlineShortcuts: { copyEditor: "ctrl+shift+b" } };
  const resolved = resolveShortcutConfig(settings);
  const bashMode = parseBashModeSettings(settings, resolved);

  assert.notEqual(resolved.copyEditor, "ctrl+shift+b");
  assert.equal(bashMode.toggleShortcut, "ctrl+shift+b");

  const disabledBash = { bashMode: { toggleShortcut: null }, powerlineShortcuts: { copyEditor: "ctrl+shift+b" } };
  const resolvedWhenDisabled = resolveShortcutConfig(disabledBash);
  const bashModeWhenDisabled = parseBashModeSettings(disabledBash, resolvedWhenDisabled);

  assert.equal(resolvedWhenDisabled.copyEditor, "ctrl+shift+b");
  assert.equal(bashModeWhenDisabled.toggleShortcut, null);
});

test("powerline shortcut resolver rejects active fixed-editor scroll aliases", () => {
  const resolved = resolveShortcutConfig({
    powerlineShortcuts: {
      jumpChatBottom: "super+pageup",
      copyEditor: "ctrl+shift+up",
    },
  });

  assert.notEqual(resolved.jumpChatBottom, "super+pageup");
  assert.notEqual(resolved.copyEditor, "ctrl+shift+up");

  const allowedWhenScrollDisabled = resolveShortcutConfig({
    powerlineShortcuts: {
      scrollChatUp: null,
      jumpChatBottom: "super+pageup",
    },
  });

  assert.equal(allowedWhenScrollDisabled.scrollChatUp, null);
  assert.equal(allowedWhenScrollDisabled.jumpChatBottom, "super+pageup");
});

test("powerline shortcuts have terminal-input fallback routing", () => {
  assert.match(source, /function getPowerlineShortcutAction\(data: string\): PowerlineShortcutAction \| null/);
  assert.match(source, /matchesConfiguredShortcut\(data, resolvedShortcuts\.showShortcuts\)/);
  assert.match(source, /matchesConfiguredShortcut\(data, resolvedShortcuts\.stashHistory\)/);
  assert.match(source, /matchesConfiguredShortcut\(data, resolvedShortcuts\.copyEditor\)/);
  assert.match(source, /matchesConfiguredShortcut\(data, resolvedShortcuts\.cutEditor\)/);
  assert.match(source, /matchesConfiguredShortcut\(data, bashModeSettings\.toggleShortcut\)/);
  assert.match(source, /const powerlineShortcutAction = getPowerlineShortcutAction\(data\)/);
  assert.match(source, /runPowerlineShortcut\(ctx, powerlineShortcutAction\)/);
  assert.doesNotMatch(source, /function registerPowerlineShortcut\(/);
  assert.doesNotMatch(source, /pi\.registerShortcut\(resolvedShortcuts\./);
  assert.doesNotMatch(source, /pi\.registerShortcut\(bashModeSettings\.toggleShortcut/);
  assert.equal(matchesConfiguredShortcut("\x1b\x0b", "ctrl+alt+k"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[107;7u", "ctrl+alt+k"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[27;7;107~", "ctrl+alt+k"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[107;6u", "ctrl+shift+k"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[107:75;6u", "ctrl+shift+k"), true);
  assert.equal(matchesConfiguredShortcut("\x1b[27;6;107~", "ctrl+shift+k"), true);
  assert.equal(matchesConfiguredShortcut("\x0b", "ctrl+shift+k"), false);
});

test("powerline editor preserves a previous editor autocomplete provider", () => {
  assert.match(source, /const previousEditorFactory = typeof ctx\.ui\.getEditorComponent === "function" \? ctx\.ui\.getEditorComponent\(\) : undefined/);
  assert.match(source, /const previousEditor = previousEditorFactory\?\.\(tui, editorTheme, keybindings\)/);
  assert.match(source, /passAutocompleteProviderThroughPreviousEditor\(provider, previousEditor\)/);
  assert.match(source, /new ModeAwareAutocompleteProvider\(defaultProvider, bashProvider, oneOffBashProvider/);
});
