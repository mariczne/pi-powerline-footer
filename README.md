# pi-power-user

Powerline status bar, fixed editor cluster, and power-user toolkit for the
[pi](https://github.com/badlogic/pi-mono) coding agent.

Independent fork of [pi-powerline-footer][upstream], expanded with a shortcut
palette, subscription quota windows, and a fixed-editor cluster that keeps chat
scrolling above the editor. Working Vibes have been removed.

[upstream]: https://github.com/nicobailon/pi-powerline-footer

## Installation

```bash
pi install npm:@mariczne/pi-power-user
```

Restart pi to activate.

## Features

**Powerline status bar** — Configurable segments (model, thinking, path, git,
context, tokens, cost) with preset layouts and separators. Nerd Font
auto-detection for iTerm, WezTerm, Kitty, Ghostty, and Alacritty with ASCII
fallbacks. Custom items via `powerline.customItems`.

**Fixed editor cluster** — In interactive TUI sessions, chat/feed content
scrolls above the fixed Pi working/status line, powerline rows, editor, ghost
suggestions, bash transcript, and last-prompt/status rows. Scroll chat with the
mouse wheel, PageUp/PageDown, Command+PageUp/PageDown, Ctrl+Shift+Up/Down, or
message-jump shortcuts; the editor stays put. When scrolled away from the
bottom, an optional shortcut hint card appears (off by default; opt in with
`/powerline scroll-away-card on`). Drag text to copy it, drag selection to the
viewport edge to scroll, double-click a line to select it, and right-click to
open the terminal menu. Mouse capture blocks native modifier-click link
handling; hold Shift while using your terminal's modifier-click to open OSC 8
links. Use `/powerline mouse-scroll off` or `/powerline fixed-editor off` for
native link handling and selection.

**Shortcut palette** — `/powerline shortcuts` or `ctrl+shift+k` opens a
searchable command palette listing the active Powerline bindings (prefixed
`Powerline: `) alongside standard pi keybindings. Type to fuzzy-search, press
enter to run the highlighted action. Editor keybindings are included as
searchable reference entries; bindings scoped to pi's modal selectors (tree
view, session picker, model selector) are omitted since those UIs show their
own hints. Configure or disable the key through `powerlineShortcuts.showShortcuts`.

**Editor stash** — Press `Alt+S` to save your editor content and clear the
editor, type a quick prompt, and your stashed text auto-restores when the agent
finishes. Stash history persists to disk and is browsable via
`/stash-history` or `ctrl+alt+h`.

**Sticky bash mode** — Toggle bash mode with `ctrl+shift+b` or `/bash-mode`. It
keeps a managed shell session alive for the current pi session, shows a
dedicated `shell_mode` segment, streams command output into an embedded
transcript below the editor, and lets `cd` or exported state persist across
commands. Ghost suggestions resolve from per-project shell history first, then
guarded global history, then a tiny curated default set. One-off `!command` and
`!!command` prompts reuse the same prediction pipeline.

**Live thinking level indicator** — Shows current thinking level
(`think:off`, `think:med`, etc.) with per-level colors. `xhigh` and `max` use a
rainbow effect; `high` uses the normal `thinkingHigh` theme color.

**Subscription quota windows** — When the active model has a supported
subscription usage source, the `cost` segment shows live usage windows instead
of a bare `(sub)`. Supported providers: `anthropic`, `openai-codex`, and
`opencode-go`. Anthropic/OpenAI usage is fetched through model-registry auth.
Opencode Go scrapes the dashboard and requires `OPENCODE_GO_WORKSPACE_ID` plus
`OPENCODE_GO_AUTH_COOKIE`; monthly usage is intentionally ignored for now. Usage
is cached for 2 minutes (30s on error) and refreshed only while streaming with
an active subscription. Set `powerline.cost.subscriptionDisplay` to
`"reported-cost"` for the reported dollar cost or `"both"` for cost plus the
subscription/quota display.

**Provider shown next to the model** — By default the `model` segment appends
the active provider in parentheses (e.g. `Sonnet 4 (anthropic)`). Set
`powerline.model.display` to `"name"` to suppress it or `"qualified"` to show
the canonical provider-qualified ID (e.g. `anthropic/claude-sonnet-4`).

**Context awareness** — Color-coded warnings above 70% (yellow) and above 90%
(red) context usage. The context segment shows used tokens, maximum tokens, and
percentage together, and refreshes from live assistant usage during streaming
instead of waiting for the next turn. Auto-compact indicator when enabled. If
`pi-custom-compaction` is installed and enabled, the powerline automatically
hides native context segments so the footer does not show stale post-summary
usage.

**Git integration** — Async status fetching with 1s cache TTL. Automatically
invalidates on file writes/edits. Shows branch, staged (+), unstaged (*), and
untracked (?) counts.

**Welcome overlay** — Branded splash screen shown as centered overlay on
startup. Shows gradient logo, model info, keyboard tips, loaded
AGENTS.md/extensions/skills/templates counts, an approximate initial
system-prompt token count, and recent sessions. Auto-dismisses after 30 seconds
or on any key press. **Off by default**; set `powerline.welcome: true` to
enable it.

## Usage

Activates automatically. Toggle with `/powerline`, switch presets with
`/powerline <name>`, fixed-editor mode with `/powerline fixed-editor
on|off|toggle`, primary-row placement with `/powerline placement
above|below|toggle`, the scroll-away card with `/powerline scroll-away-card
on|off|toggle`, the shortcut palette with `/powerline shortcuts`, and wheel
mode with `/powerline mouse-scroll on|off|toggle`.

| Preset | Description |
|--------|-------------|
| `default` | Model, thinking, path (basename), git, context, tokens, cost |
| `minimal` | Just path (basename), git, context |
| `compact` | Model, git, cost, context |
| `full` | Everything including hostname, time, abbreviated path |
| `nerd` | Maximum detail for Nerd Font users |
| `ascii` | Safe for any terminal |

**Environment:** `POWERLINE_NERD_FONTS=1` to force Nerd Fonts, `=0` for ASCII.

## Configuration

Set it in the agent settings file (`~/.pi/agent/settings.json` by default, or
under `PI_CODING_AGENT_DIR`) or project-local `.pi/settings.json`:

```json
{
  "powerline": {
    "preset": "default",
    "fixedEditor": true,
    "placement": "above",
    "welcome": false,
    "mouseScroll": true,
    "scrollAwayNavigationCard": false,
    "copyOnSelect": true,
    "customItems": [
      {
        "id": "ci",
        "statusKey": "ci-status",
        "position": "right",
        "prefix": "CI",
        "color": "warning"
      }
    ],
    "layout": {
      "left": ["model", "thinking", "path", "git"],
      "right": ["context_pct", "cost"],
      "secondary": ["custom:ci"]
    },
    "disabledSegments": [],
    "path": { "mode": "basename" },
    "model": { "display": "name" },
    "cost": { "subscriptionDisplay": "subscription" },
    "git": { "polling": "full" }
  }
}
```

`"placement"` accepts `"above"` (default) or `"below"` in both fixed and
regular editor modes. It moves only the primary powerline row; notifications and
Pi working status stay above, while responsive overflow, bash transcript, and
the last-prompt reminder stay below.

Set `"copyOnSelect": false` to keep mouse selections highlighted instead of
automatically copying on release. Copy the active selection explicitly with
`ctrl+c` or right-click.

`"layout"` overrides segment order and grouping per preset row. A present
`left`, `right`, or `secondary` array replaces that preset group exactly; an
empty array clears it. Omitted groups keep the preset entries and automatically
append custom items by their configured `position`. `disabledSegments` is
applied after layout.

Segment display formats are opt-in; defaults preserve the existing rendering:

| Segment option | Values | Default | Effect |
|---|---|---|---|
| `"context": { "format" }` | `"full"` / `"percent"` | `"full"` | Shows full token usage or a bare rounded percentage |
| `"cache_read": { "format" }` | `"tokens"` / `"percent"` | `"tokens"` | Shows raw tokens or cache hit rate |

### Shortcut configuration

```json
{
  "powerlineShortcuts": {
    "showShortcuts": "ctrl+shift+k",
    "stashHistory": "ctrl+alt+h",
    "copyEditor": "ctrl+alt+c",
    "cutEditor": "ctrl+alt+x",
    "jumpPreviousUserMessage": "ctrl+shift+u",
    "jumpNextUserMessage": "ctrl+shift+i",
    "jumpPreviousLlmMessage": "ctrl+alt+,",
    "jumpNextLlmMessage": "ctrl+alt+.",
    "jumpChatBottom": "ctrl+alt+g",
    "scrollChatUp": "cmd+up",
    "scrollChatDown": "cmd+down",
    "editorStart": "cmd+shift+up",
    "editorEnd": "cmd+shift+down"
  }
}
```

Set a binding to `null` or `""` to disable that action. After changing bindings,
run `/reload`. Invalid bindings, reserved key conflicts (like `Alt+S`), or
duplicate conflicts automatically fall back to safe defaults.

### Bash mode configuration

```json
{
  "bashMode": {
    "toggleShortcut": "ctrl+shift+b",
    "transcriptMaxLines": 2000,
    "transcriptMaxBytes": 524288
  }
}
```

### Subscription cost display

| Mode | Subscription + reported cost | Subscription + no reported cost |
|------|------------------------------|----------------------------------|
| `subscription` | `(sub)` | `(sub)` |
| `reported-cost` | `$0.12` | `(sub)` |
| `both` | `$0.12 (sub)` | `(sub)` |

## Divergence from upstream

This package is an independent fork of [pi-powerline-footer][upstream]. Key
divergences:

- **Shortcut palette** — `/powerline shortcuts` or `ctrl+shift+k` opens a
  searchable command palette blending Powerline bindings with standard pi
  keybindings.
- **Subscription quota windows** — The `cost` segment shows live usage windows
  for `anthropic`, `openai-codex`, and `opencode-go` subscriptions.
- **Provider shown next to the model** — The `model` segment appends the active
  provider in parentheses by default.
- **Welcome is opt-in** — The startup welcome overlay/header is off by default.
  Set `powerline.welcome: true` to turn it back on. (Upstream defaults it on.)
- **Thinking-level styling** — `high` uses the normal `thinkingHigh` theme
  color; only `xhigh` and `max` use rainbow styling. `max` also has an explicit
  footer label/icon. Upstream applies rainbow styling to `high` too.
- **Fixed-editor Shift+Enter restored on pi 0.77+** — The Kitty keyboard
  protocol negotiation is asynchronous on pi 0.77+, so the alternate screen's
  keyboard-protocol stack could be left unset when `install()` ran, degrading
  Shift+Enter to a bare `\r` that submits. `TerminalSplitCompositor` now
  re-checks the extended keyboard mode on each scrollable-root render and pushes
  it once the mode resolves (`ensureAlternateScreenKeyboardMode`).
- **Working Vibes removed** — The `/vibe` command, the `working-vibes.ts`
  module, its tests, and all related README/index wiring have been removed. The
  "Working…" status text is no longer themed.

## License

MIT

## Author

Original author: Nico Bailon. Independently maintained by [@mariczne](https://github.com/mariczne).