# OpenCode Codex Limits

A small OpenCode TUI plugin that displays your current Codex usage limits.

## Features

- Shows Codex usage limits
- Shows reset time
- Shows the number of available banked Codex resets
- Automatically uses Ukrainian when the system locale is Ukrainian; otherwise English
- Commands: `/codex-limits`, `/codex-resets`, `/codex-reset`

## Installation

Install directly from GitHub:

```bash
opencode plugin github:Vladipz/opencode-codex-limits
```

Then restart OpenCode.

## Usage

Run `/codex-limits` for the usage windows and available reset count, shown on separate lines. Run `/codex-resets` to see each available reset and its expiration. Run `/codex-reset` to choose a reset and confirm its use. The reset command only offers redemption when OpenAI reports that a usage window is eligible.

The plugin reads the local OpenCode or Codex authentication session. If both exist for the same account and the OpenCode token has expired, it can use the current Codex token. The plugin automatically selects Ukrainian (`uk-*`) or English based on the system locale.

## Uninstall

To uninstall, remove `github:Vladipz/opencode-codex-limits` from the `plugin` array in `.opencode/tui.json` (project install) or your global `tui.json` (global install).

## Disclaimer

This project is unofficial and is not affiliated with OpenAI or OpenCode. It uses the locally available Codex/OpenAI authentication session and unofficial usage and reset endpoints that may change in the future. A banked reset is consumed only after you select it and confirm the action.

## License

MIT
