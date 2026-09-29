/** @jsxImportSource @opentui/solid */
import { createEffect, createSignal } from "solid-js";
import type { UsageStatus } from "./status.tsx";

export function registerStatusV2(
  context: any,
  load: () => Promise<UsageStatus>,
) {
  const [settings, updateSettings] = context.storage.store("codex-limits.display", {
    initial: {
      showPanel: context.options?.showPanel !== false,
      showResets: context.options?.showResets === true,
    },
  });
  const [usage, setUsage] = createSignal<UsageStatus>();
  const [error, setError] = createSignal<string>();
  let busy = false;
  let disposed = false;
  const isOpenAIModel = () => context.ui.model.current()?.providerID === "openai";

  const refresh = async () => {
    if (disposed || busy || !settings.showPanel || !isOpenAIModel()) return;
    busy = true;
    try {
      const result = await load();
      if (!disposed) {
        setUsage(result);
        setError(undefined);
      }
    } catch (cause) {
      if (!disposed) {
        setUsage(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      busy = false;
    }
  };

  const color = (remaining?: number) => remaining === undefined
    ? context.theme.text.base
    : remaining < 20 ? "#f44336" : remaining < 50 ? "#ffb300" : "#00c853";

  const removeSlot = context.ui.slot({
    append: "sidebar.content",
    render: () => settings.showPanel && isOpenAIModel() ? (
      <box flexDirection="column" width="100%" paddingTop={1}>
        <text>Usage remaining</text>
        {(usage()?.windows ?? []).map((window) => (
          <box flexDirection="row" width="100%">
            <text width={10}>{window.label}</text>
            <text width={6} fg={color(window.remainingPercent)}>{window.remaining}</text>
            <text fg={context.theme.text.base}>{window.reset}</text>
          </box>
        ))}
        {settings.showResets && usage()?.resets !== undefined && (
          <text>Resets available: {usage()?.resets}</text>
        )}
        {!usage() && <text>{error() ?? "Loading limits..."}</text>}
      </box>
    ) : null,
  });

  createEffect(() => {
    if (settings.showPanel && isOpenAIModel()) void refresh();
  });
  const timer = setInterval(() => void refresh(), 60_000);
  timer.unref?.();
  const stopSession = context.data.on("session.updated", () => void refresh());

  return {
    refresh,
    togglePanel: async () => {
      const next = !settings.showPanel;
      await updateSettings((draft: any) => { draft.showPanel = next; });
      if (next) void refresh();
      return next;
    },
    toggleResets: async () => {
      const next = !settings.showResets;
      await updateSettings((draft: any) => { draft.showResets = next; });
      return next;
    },
    dispose: () => {
      disposed = true;
      clearInterval(timer);
      stopSession();
      if (typeof removeSlot === "function") removeSlot();
    },
  };
}
