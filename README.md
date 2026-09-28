# OpenCode Codex Limits

A small OpenCode TUI plugin that displays your current Codex usage limits.

## Features

- Shows Codex usage limits
- Shows reset time
- Automatically uses Ukrainian when the system locale is Ukrainian; otherwise English
- Hotkey: `Alt+L`
- Command: `/codex-limits`

## Installation

Install directly from GitHub:

```bash
opencode plugin github:Vladipz/opencode-codex-limits
```

Then restart OpenCode.

## Usage

Press `Alt+L` or run `/codex-limits`. The plugin automatically selects Ukrainian (`uk-*`) or English based on the system locale.

## Uninstall

To uninstall, remove `github:Vladipz/opencode-codex-limits` from the `plugin` array in `.opencode/tui.json` (project install) or your global `tui.json` (global install).

## Disclaimer

This project is unofficial and is not affiliated with OpenAI or OpenCode. It uses the locally available Codex/OpenAI authentication session and an unofficial usage endpoint that may change in the future.

## License

MIT
