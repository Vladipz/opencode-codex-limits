# OpenCode Codex Limits

A small OpenCode 1 (1.18.29+) and OpenCode 2 TUI plugin that displays your current Codex usage limits.

## Features

- Shows Codex usage limits
- Keeps the usage windows visible in the TUI and refreshes every minute
- Shows reset time as a date and time or a countdown
- Shows the number of available banked Codex resets
- Automatically uses Ukrainian when the system locale is Ukrainian; otherwise English
- Display settings in both versions: full sidebar panel, compact sidebar row, or hidden; OpenCode 2 also supports a compact input-footer row
- Optional reset expiration information, highlighted in red when less than 72 hours remain
- Commands: `/codex-limits`, `/codex-resets`, `/codex-reset`, `/codex-settings`; OpenCode 1 also retains `/codex-panel`

## Installation

### OpenCode 2

Run from your project directory:

```powershell
opencode plugin add github:Vladipz/opencode-codex-limits
```

OpenCode 2 installs package plugins in the global configuration. The server entrypoint
loads the TUI plugin automatically; do not add the same package to `cli.json`.

To configure an already installed package manually, use `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["github:Vladipz/opencode-codex-limits"]
}
```

The `./tui` export is loaded automatically by OpenCode 2. Restart OpenCode after updating an installed Git package.

### OpenCode 1 (1.18.29+)

Install for all projects:

```powershell
opencode plugin github:Vladipz/opencode-codex-limits --global
```

Restart OpenCode after installation.

### Add the OpenCode 1 plugin manually

Add the plugin spec to the `plugin` array in your TUI config. For a global install, edit:

- Windows: `%USERPROFILE%\.config\opencode\tui.json`
- macOS/Linux: `~/.config/opencode/tui.json`

To load the published GitHub package, add:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "github:Vladipz/opencode-codex-limits"
  ]
}
```

To load a local clone instead, use its absolute path as a `file://` URL. For example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file:///Users/yourname/Downloads/opencode-codex-limits"
  ]
}
```

On Windows, a local path uses URL form, for example `file:///C:/Users/yourname/Downloads/opencode-codex-limits`.
After editing the config, restart OpenCode.

The usage panel is rendered in the terminal sidebar. It shows remaining
percentage for the 5-hour and weekly windows with their reset times, plus
optionally available banked resets. It loads at startup, refreshes every 60 seconds and
after session updates, and updates after a reset is consumed. A failed refresh
displays an error instead of leaving an old value on screen.
Both limit rows show reset times in the selected format, using the local timezone for dates.
Remaining percentages use the active theme's green at 50% or more, yellow
from 20% to 49%, and red below 20%.

## Display options

The sidebar panel is on by default; the reset count is hidden by default.
In either version, run `/codex-settings` to choose the status placement and independently
toggle **Reset count** and **Reset expiration**. Choices apply immediately and persist
across restarts. Reset-count visibility is managed in `/codex-settings` only;
changing it does not affect expiration visibility. `/codex-settings` replaces
`/codex-panel` on OpenCode 2.

The menu stays open while changing settings and keeps the selected row. Use ↑/↓ to
select a setting, Enter or ←/→ to change its value, and Done or Esc to close.

The display modes are:

- `panel`: the full sidebar panel (default).
- `compact-sidebar`: percentages in one sidebar row.
- `compact-footer`: percentages in one row below the input (OpenCode 2 only).
- `hidden`: no persistent status or background refresh; usage and reset commands remain available.

A compact row looks like `Codex · 5h: 42% · 7d: 18%`. On narrow terminals,
optional reset text and the prefix are shortened or omitted to leave room for percentages.
In the full panel, **Time format** in `/codex-settings` selects **Date and time**
(a localized date with the month name, e.g. `3 жовт. 18:30`, the default) or
**Countdown** (`in 1h 24m`; Ukrainian: `через 1г 24хв`).
The choice applies immediately and persists in both OpenCode versions. Countdown text
updates locally every minute using the existing refresh timer; switching formats makes
no API request. When the reset time passes before fresh data arrives, it shows
`awaiting update` instead of assuming the limit has been restored. Compact rows remain
percentage-only, apart from optional banked reset information.

OpenCode 1 does not expose an equivalent input-footer slot, so its menu offers only
`panel`, `compact-sidebar`, and `hidden`. An unsupported footer value in V1 config
falls back to the full sidebar panel.

Reset expiration is enabled by default in both versions. Its behavior is independent
of whether the reset count is shown:

| Reset count | Reset expiration | Status content |
| --- | --- | --- |
| On | On | `Resets: 2 · expires in 5d`; expiration turns red below 72 hours. |
| Off | On | Only below 72 hours: red `Reset expires in 2d 18h`. |
| On | Off | `Resets: 2` only. |
| Off | Off | No reset information. |

Expiration uses the earliest valid future expiration among available Codex reset
credits. If no expiration is known, only the count is shown when enabled. The countdown
and threshold update locally every minute. Expiration information appears inside the
visible status only, without expiration toasts or dialogs. Reset-credit requests that
fail do not prevent the usage limits from being displayed.

On OpenCode 2, configure them in the package options in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    {
      "package": "github:Vladipz/opencode-codex-limits",
      "options": {
        "displayMode": "panel",
        "showResets": false,
        "showResetExpiry": true,
        "timeFormat": "absolute"
      }
    }
  ]
}
```

On OpenCode 1, configure them independently in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["github:Vladipz/opencode-codex-limits", {
      "displayMode": "panel",
      "showResets": false,
      "showResetExpiry": true,
      "timeFormat": "absolute"
    }]
  ]
}
```

On OpenCode 1, set `showPanel` to `false` to hide the panel and stop its background refresh.
The slash commands remain available. Set `showResets` to `true` if you want
the reset count in the panel; `/codex-resets` remains available either way.
Restart OpenCode after changing these options.

On OpenCode 1, the legacy `/codex-panel` shortcut remains available alongside
`/codex-settings` to show or hide the usage panel.

The commands save your choices for future OpenCode sessions. Once a choice is
saved, it takes precedence over the initial config values. The reset
list and redemption commands remain available when either display is hidden.

Both versions preserve existing saved `showPanel` and `showResets` choices. When no
display mode is selected, the legacy `showPanel` value determines whether the panel
is shown. The new `showResetExpiry` option defaults to `true`; saved choices override
initial package options. Each version saves settings using its own native storage;
the plugin does not copy settings between separate OpenCode installations.

## Usage

Run `/codex-limits` for the usage windows and available reset count. In OpenCode 2, this report appears in a notification with separate lines for usage and reset times. Run `/codex-resets` to see each available reset and its expiration in a dialog (OpenCode 1 continues to use toasts). Run `/codex-reset` to choose a reset and confirm its use. The reset command only offers redemption when OpenAI reports that a usage window is eligible.

The plugin reads the local OpenCode or Codex authentication session. If both exist for the same account and the OpenCode token has expired, it can use the current Codex token. The plugin automatically selects Ukrainian (`uk-*`) or English based on the system locale.
It does not refresh or rewrite OAuth credentials; reconnect OpenAI in OpenCode if the session has expired.

## Uninstall

To uninstall from OpenCode 2, remove the package with `opencode plugin remove github:Vladipz/opencode-codex-limits` or remove its entry from the `plugins` array in `opencode.json`. On OpenCode 1, remove its entry from the `plugin` array in the project's `.opencode/tui.json` or the global `~/.config/opencode/tui.json`.

## Development checks

Run `npm test` and `npm run typecheck` for the shared logic and V1/V2 adapters.
With Bun installed, run `npm run test:ui` to test reactive OpenTUI rendering,
keyboard navigation, stable menu focus, and full/compact status layouts.

## Disclaimer

This project is unofficial and is not affiliated with OpenAI or OpenCode. It uses the locally available Codex/OpenAI authentication session and unofficial usage and reset endpoints that may change in the future. A banked reset is consumed only after you select it and confirm the action.

## License

MIT
