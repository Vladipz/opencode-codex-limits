# OpenCode Codex Limits

A small OpenCode TUI plugin that displays your current Codex usage limits.

## Features

- Shows Codex usage limits
- Shows reset time
- Shows the number of available banked Codex resets
- Automatically uses Ukrainian when the system locale is Ukrainian; otherwise English
- Commands: `/codex-limits`, `/codex-resets`, `/codex-reset`

## Installation

### Install for the current project

Run from your project directory:

```powershell
opencode plugin github:Vladipz/opencode-codex-limits
```

### Install globally

Install for all projects:

```powershell
opencode plugin github:Vladipz/opencode-codex-limits --global
```

Restart OpenCode after installation.

### Add the plugin manually

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

## Usage

Run `/codex-limits` for the usage windows and available reset count, shown on separate lines. Run `/codex-resets` to see each available reset and its expiration. Run `/codex-reset` to choose a reset and confirm its use. The reset command only offers redemption when OpenAI reports that a usage window is eligible.

The plugin reads the local OpenCode or Codex authentication session. If both exist for the same account and the OpenCode token has expired, it can use the current Codex token. The plugin automatically selects Ukrainian (`uk-*`) or English based on the system locale.

## Uninstall

To uninstall, remove the plugin spec from the `plugin` array in the TUI config where you installed it: the project's `.opencode/tui.json` or your global `~/.config/opencode/tui.json`.

## Disclaimer

This project is unofficial and is not affiliated with OpenAI or OpenCode. It uses the locally available Codex/OpenAI authentication session and unofficial usage and reset endpoints that may change in the future. A banked reset is consumed only after you select it and confirm the action.

## License

MIT
