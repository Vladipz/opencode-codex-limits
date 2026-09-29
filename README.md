# OpenCode Codex Limits

A small OpenCode TUI plugin that displays your current Codex usage limits.

## Features

- Shows Codex usage limits
- Keeps the usage windows visible in the TUI and refreshes every minute
- Shows reset time
- Shows the number of available banked Codex resets
- Automatically uses Ukrainian when the system locale is Ukrainian; otherwise English
- Commands: `/codex-limits`, `/codex-resets`, `/codex-reset`, `/codex-panel`, `/codex-resets-panel`

## Installation

Install directly from GitHub:

```bash
opencode plugin github:Vladipz/opencode-codex-limits
```

Then restart OpenCode.

The usage panel is rendered in the terminal sidebar. It shows remaining
percentage for the 5-hour and weekly windows with their reset times, plus
optionally available banked resets. It loads at startup, refreshes every 60 seconds and
after session updates, and updates after a reset is consumed. A failed refresh
displays an error instead of leaving an old value on screen.
Both limit rows show the reset date and time in the system locale.
Remaining percentages use the active theme's green at 50% or more, yellow
from 20% to 49%, and red below 20%.

## Display options

The sidebar panel is on by default; the reset count is hidden by default.
Configure them independently in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["github:Vladipz/opencode-codex-limits", {
      "showPanel": true,
      "showResets": false
    }]
  ]
}
```

Set `showPanel` to `false` to hide the panel and stop its background refresh.
The slash commands remain available. Set `showResets` to `true` if you want
the reset count in the panel; `/codex-resets` remains available either way.
Restart OpenCode after changing these options.

You can also toggle both display choices without editing config:

- `/codex-panel` shows or hides the usage panel.
- `/codex-resets-panel` shows or hides the reset count inside that panel.

The commands save your choices for future OpenCode sessions. Once a choice is
saved, it takes precedence over the initial values in `tui.json`. The reset
list and redemption commands remain available when either display is hidden.

## Usage

Run `/codex-limits` for the usage windows and available reset count, shown on separate lines. Run `/codex-resets` to see each available reset and its expiration. Run `/codex-reset` to choose a reset and confirm its use. The reset command only offers redemption when OpenAI reports that a usage window is eligible.

The plugin reads the local OpenCode or Codex authentication session. If both exist for the same account and the OpenCode token has expired, it can use the current Codex token. The plugin automatically selects Ukrainian (`uk-*`) or English based on the system locale.
It does not refresh or rewrite OAuth credentials; reconnect OpenAI in OpenCode if the session has expired.

## Uninstall

To uninstall, remove `github:Vladipz/opencode-codex-limits` from the `plugin` array in `.opencode/tui.json` (project install) or your global `tui.json` (global install).

## Disclaimer

This project is unofficial and is not affiliated with OpenAI or OpenCode. It uses the locally available Codex/OpenAI authentication session and unofficial usage and reset endpoints that may change in the future. A banked reset is consumed only after you select it and confirm the action.

## License

MIT
