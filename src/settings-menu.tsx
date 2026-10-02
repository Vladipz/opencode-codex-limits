/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { displayText, timeFormat } from "./display.ts";
import type { StatusControls } from "./status-controller.ts";
import type { StatusColors } from "./status-view.tsx";

// The dialog is mounted once. Changing a value never replaces it or resets focus.
export function createSettingsMenu(status: StatusControls, locale: "en" | "uk", close: () => void, showError: (error: unknown) => void) {
  const text = displayText[locale];
  const [selected, setSelected] = createSignal(0);
  const [saving, setSaving] = createSignal(false);
  const rows = () => [
    { title: text.placement, description: text[status.mode()] },
    { title: text.count, description: status.getSettings().showResets ? text.enabled : text.disabled },
    { title: text.expiry, description: status.getSettings().showResetExpiry !== false ? text.enabled : text.disabled },
    { title: text.timeFormat, description: text[timeFormat(status.getSettings())] },
    { title: text.done, description: "" },
  ];
  let closed = false;
  const dismiss = () => { if (closed) return; closed = true; close(); };
  const activate = async (direction = 1, index = selected()) => {
    if (closed || saving()) return;
    setSelected(index);
    if (index === rows().length - 1) { dismiss(); return; }
    setSaving(true);
    try {
      if (index === 0) {
        const current = status.modes.indexOf(status.mode());
        await status.setMode(status.modes[(current + direction + status.modes.length) % status.modes.length]);
      } else if (index === 1) await status.toggleResets();
      else if (index === 2) await status.toggleExpiry();
      else if (index === 3) await status.toggleTimeFormat();
    } catch (error) { if (!closed) showError(error); }
    finally { setSaving(false); }
  };
  return {
    rows, selected, saving, activate, dismiss,
    onClose: () => { closed = true; },
    move: (direction: number) => { if (!closed) setSelected((value) => (value + direction + rows().length) % rows().length); },
  };
}

export type SettingsMenu = ReturnType<typeof createSettingsMenu>;

export function SettingsDialog(props: { menu: SettingsMenu; locale: "en" | "uk"; colors: () => StatusColors }) {
  const text = displayText[props.locale];
  useKeyboard((key) => {
    if (!["up", "down", "left", "right", "return", "escape"].includes(key.name)) return;
    key.preventDefault();
    key.stopPropagation();
    if (key.name === "escape") props.menu.dismiss();
    else if (key.name === "up" || key.name === "down") props.menu.move(key.name === "up" ? -1 : 1);
    else if (props.menu.selected() === props.menu.rows().length - 1 && key.name !== "return") return;
    else void props.menu.activate(key.name === "left" ? -1 : 1);
  });
  return <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingBottom={1} gap={1}>
    <box flexDirection="row" justifyContent="space-between">
      <text fg={props.colors().text}>{text.settings}</text>
      <text fg={props.colors().muted} onMouseUp={props.menu.dismiss}>esc</text>
    </box>
    <box flexDirection="column">
      {props.menu.rows().map((row, index) => <box flexDirection="row" onMouseUp={() => void props.menu.activate(1, index)}>
        <text fg={props.menu.selected() === index ? props.colors().success : props.colors().text}>
          {props.menu.selected() === index ? "› " : "  "}{row.title}
          <span style={{ fg: props.colors().muted }}> {row.description}</span>
        </text>
      </box>)}
    </box>
    <text fg={props.colors().muted}>{props.locale === "uk" ? "↑/↓ обрати · ←/→ змінити · Enter перемкнути" : "↑/↓ select · ←/→ change · Enter toggle"}</text>
  </box>;
}

export function openSettings(status: StatusControls, locale: "en" | "uk", dialog: {
  show: (render: () => any, onClose: () => void) => void;
  clear: () => void;
}, colors: () => StatusColors, showError: (error: unknown) => void) {
  const menu = createSettingsMenu(status, locale, () => dialog.clear(), showError);
  dialog.show(() => <SettingsDialog menu={menu} locale={locale} colors={colors} />, menu.onClose);
  return menu;
}
