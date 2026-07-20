# pi-powerline-footer (fork)

This is a fork of [nicobailon/pi-powerline-footer][upstream], a powerline-style
status bar and welcome overlay extension for the [pi](https://github.com/badlogic/pi-mono)
coding agent.

> **Shared feature, installation, and configuration docs live in the
> [upstream README][upstream-readme].** This document lists fork-specific
> behavior; upstream Working Vibes documentation does not apply here.

[upstream]: https://github.com/nicobailon/pi-powerline-footer
[upstream-readme]: https://github.com/nicobailon/pi-powerline-footer#readme

## Points of divergence

### Added

- **Shortcut palette.** `/powerline shortcuts` or `ctrl+shift+k` opens a
  searchable command palette listing the active Powerline bindings (prefixed
  `Powerline: `) alongside standard pi keybindings. Type to fuzzy-search, press
  enter to run the highlighted action. Editor keybindings are included as
  searchable reference entries since they apply to the editor the palette
  returns to; bindings scoped to pi's modal selectors (tree view, session
  picker, model selector) are omitted because those UIs show their own hints.
  Configure or disable the key through `powerlineShortcuts.showShortcuts`. The fixed-editor
  scroll-away navigation card is off by default; opt in with
  `/powerline scroll-away-card on` or `powerline.scrollAwayNavigationCard: true`.

- **Subscription quota windows in the footer.** When the active model has a
  supported subscription usage source, the `cost` segment shows live usage
  windows instead of a bare `(sub)`. Supported providers: `anthropic`,
  `openai-codex`, and `opencode-go`. Anthropic/OpenAI usage is fetched through
  model-registry auth. Opencode Go scrapes the dashboard and requires
  `OPENCODE_GO_WORKSPACE_ID` plus `OPENCODE_GO_AUTH_COOKIE`; monthly usage is
  intentionally ignored for now. Usage is cached for 2 minutes (30s on error)
  and refreshed only while streaming with an active subscription. Implemented in
  `subscription-usage.ts`; the parsed usage is exposed to segments via
  `ctx.subscriptionUsage`. Set `powerline.cost.subscriptionDisplay` to
  `"reported-cost"` for the reported dollar cost or `"both"` for cost plus the
  subscription/quota display.

- **Provider shown next to the model.** By default the `model` segment appends
  the active provider in parentheses (e.g. `Sonnet 4 (anthropic)`). Set
  `powerline.model.display` to `"name"` to suppress it or `"qualified"` to show
  the canonical provider-qualified ID (e.g. `anthropic/claude-sonnet-4`).

### Fixed

- **Fixed-editor Shift+Enter restored on pi 0.77+.** The Kitty keyboard
  protocol negotiation is asynchronous on pi 0.77+, so the alternate screen's
  keyboard-protocol stack could be left unset when `install()` ran, degrading
  Shift+Enter to a bare `\r` that submits. `TerminalSplitCompositor` now
  re-checks the extended keyboard mode on each scrollable-root render and pushes
  it once the mode resolves (`ensureAlternateScreenKeyboardMode`).


### Changed

- **Welcome is opt-in.** The startup welcome overlay/header is off by default.
  Set `powerline.welcome: true` to turn it back on. (Upstream defaults it on.)

- **Thinking-level styling.** `high` uses the normal `thinkingHigh` theme
  color; only `xhigh` and `max` use rainbow styling. `max` also has an explicit
  footer label/icon. Upstream applies rainbow styling to `high` too.

### Removed

- **Working Vibes.** The `/vibe` command, the `working-vibes.ts` module, its
  tests, and all related README/index wiring have been removed. The "Working…"
  status text is no longer themed.
