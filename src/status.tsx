import { createSignal } from "solid-js";

export type UsageWindow = {
  label: string;
  remaining: string;
  remainingPercent?: number;
  reset: string;
};

export type UsageStatus = {
  windows: UsageWindow[];
  resets?: number;
};

export type StatusControls = {
  refresh: () => Promise<void>;
  togglePanel: () => boolean;
  toggleResets: () => boolean;
};

export function registerStatus(
  api: any,
  load: () => Promise<UsageStatus>,
  defaults: { showPanel: boolean; showResets: boolean },
): StatusControls {
  const [usage, setUsage] = createSignal<UsageStatus>();
  const [error, setError] = createSignal<string>();
  const savedPanel = api.kv.get("codex-limits.showPanel", defaults.showPanel);
  const savedResets = api.kv.get("codex-limits.showResets", defaults.showResets);
  const [showPanel, setShowPanel] = createSignal(savedPanel === true);
  const [showResets, setShowResets] = createSignal(savedResets === true);
  let disposed = false;
  let busy = false;
  const limitColor = (remaining?: number) => {
    if (remaining === undefined) return api.theme.current.textMuted;
    if (remaining < 20) return api.theme.current.error;
    if (remaining < 50) return api.theme.current.warning;
    return api.theme.current.success;
  };

  const refresh = async () => {
    if (disposed || busy || !showPanel()) return;
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

  api.slots.register({
    slots: {
      sidebar_content: () => showPanel() ? (
        <box flexDirection="column" width="100%" paddingTop={1}>
          <text>Usage remaining</text>
          {(usage()?.windows ?? []).map((window) => (
            <box flexDirection="row" width="100%">
              <text width={10}>{window.label}</text>
              <text width={6} fg={limitColor(window.remainingPercent)}>{window.remaining}</text>
              <text fg={api.theme.current.textMuted}>{window.reset}</text>
            </box>
          ))}
          {showResets() && usage()?.resets !== undefined && (
            <text fg={api.theme.current.textMuted}>Resets available: {usage()?.resets}</text>
          )}
          {!usage() && <text>{error() ?? "Loading limits..."}</text>}
        </box>
      ) : null,
    },
  });

  if (showPanel()) void refresh();
  const timer = setInterval(() => void refresh(), 60_000);
  const onSession = api.event?.on?.("session.updated", () => void refresh());

  api.lifecycle?.onDispose?.(() => {
    disposed = true;
    clearInterval(timer);
    if (typeof onSession === "function") onSession();
  });
  return {
    refresh,
    togglePanel: () => {
      const next = !showPanel();
      setShowPanel(next);
      api.kv.set("codex-limits.showPanel", next);
      if (next) void refresh();
      return next;
    },
    toggleResets: () => {
      const next = !showResets();
      setShowResets(next);
      api.kv.set("codex-limits.showResets", next);
      return next;
    },
  };
}
