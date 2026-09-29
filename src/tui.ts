import { registerStatusV2 } from "./status-v2.tsx";
import { usageStatus } from "./usage-status.ts";
import legacy, {
  consumeResetCredit,
  formatExpiry,
  getLocale,
  getValidToken,
  loadResetCredits,
  loadUsage,
  messages,
  type Locale,
  type ResetCredit,
} from "./tui-v1.ts";

type UsageWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
};

function usageReport(data: any, locale: Locale): string {
  const text = messages[locale];
  if (!data.rate_limit) throw new Error(text.missingRateLimit);
  const windows: UsageWindow[] = [data.rate_limit.primary_window, data.rate_limit.secondary_window].filter(
    (window): window is UsageWindow => Boolean(window) && (!window.limit_window_seconds || window.limit_window_seconds < 28 * 86400),
  );
  if (!windows.length) throw new Error(text.missingWindows);

  const label = (seconds?: number) => {
    if (seconds === 18000) return text.fiveHourWindow;
    if (seconds === 604800) return text.weeklyWindow;
    if (!seconds) return "Limit";
    const hours = seconds / 3600;
    return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  };
  const resetTime = (timestamp?: number) => timestamp
    ? new Date(timestamp * 1000).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : text.unknownReset;

  const lines = windows.map((window) => [
    `${label(window.limit_window_seconds)}: ${typeof window.used_percent === "number"
      ? `${Math.max(0, Math.min(100, Math.round(100 - window.used_percent)))}%`
      : "?"} ${text.remaining}`,
    `${locale === "uk" ? "Оновиться" : "Resets"}: ${resetTime(window.reset_at)}`,
  ].join("\n"));
  const count = data.rate_limit_reset_credits?.available_count;
  if (typeof count === "number") lines.push(text.availableResets(count));
  return lines.join("\n\n");
}

const v2 = {
  id: "local.codex-limits.cli",
  setup(context) {
    const locale = getLocale();
    const text = messages[locale];
    const toast = context.ui.toast.show;
    const status = registerStatusV2(context, async () => usageStatus(await loadUsage(locale), locale));
    const showError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[codex-limits]", error);
      toast({ message: text.error(message), variant: "error", duration: 10000 });
    };

    const availableCredits = (credits: ResetCredit[]) =>
      credits.filter((credit) => credit.status === "available" && credit.reset_type === "codex_rate_limits");

    context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "codex-panel",
          title: text.panelCommandTitle,
          group: "Codex",
          palette: true,
          slash: { name: "codex-panel" },
          run: async () => {
            const enabled = await status.togglePanel();
            toast({ message: enabled ? text.panelEnabled : text.panelDisabled, variant: "info" });
          },
        },
        {
          id: "codex-resets-panel",
          title: text.resetsPanelCommandTitle,
          group: "Codex",
          palette: true,
          slash: { name: "codex-resets-panel" },
          run: async () => {
            const enabled = await status.toggleResets();
            toast({ message: enabled ? text.resetsPanelEnabled : text.resetsPanelDisabled, variant: "info" });
          },
        },
        {
          id: "codex-limits",
          title: text.commandTitle,
          description: text.commandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-limits" },
          run: async () => {
            try {
              toast({ message: text.loading, variant: "info", duration: 30000 });
              const data = await loadUsage(locale);
              void status.refresh();
              toast({ title: text.usageTitle, message: usageReport(data, locale), variant: "success", duration: 12000 });
            } catch (error) { showError(error); }
          },
        },
        {
          id: "codex-resets",
          title: text.resetsCommandTitle,
          description: text.resetsCommandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-resets" },
          run: async () => {
            try {
              toast({ message: text.loadingResets, variant: "info", duration: 30000 });
              const data = await loadResetCredits(locale);
              const credits = availableCredits(data.credits);
              await context.ui.dialog.alert({
                title: text.resetsCommandTitle,
                message: credits.length
                  ? [text.availableResets(data.available_count), ...credits.map((credit) =>
                      `${credit.title || "Full reset"}\n${locale === "uk" ? "Діє до" : "Expires"}: ${formatExpiry(credit.expires_at, locale)}`)].join("\n\n")
                  : text.noResets,
              });
            } catch (error) { showError(error); }
          },
        },
        {
          id: "codex-reset",
          title: text.resetCommandTitle,
          description: text.resetCommandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-reset" },
          run: async () => {
            try {
              toast({ message: text.loadingResets, variant: "info" });
              const token = await getValidToken(locale);
              const [usage, data] = await Promise.all([loadUsage(locale, token), loadResetCredits(locale, token)]);
              const credits = availableCredits(data.credits);
              if (!credits.length) {
                toast({ message: text.noResets, variant: "info" });
                return;
              }
              if (usage.rate_limit_reset_credits?.applicable_available_count === 0) {
                toast({ message: text.notApplicable, variant: "info" });
                return;
              }

              const creditID = await context.ui.dialog.select({
                title: text.resetListTitle,
                options: credits.map((credit) => ({
                  title: credit.title || "Full reset",
                  description: formatExpiry(credit.expires_at, locale),
                  value: credit.id,
                })),
              });
              const credit = credits.find((item) => item.id === creditID);
              if (!credit) return;
              const confirmed = await context.ui.dialog.confirm({
                title: text.resetConfirmTitle,
                message: text.resetConfirm(credit.title || "Full reset", formatExpiry(credit.expires_at, locale)),
                label: { confirm: text.resetCommandTitle, cancel: "Cancel" },
              });
              if (!confirmed) return;
              toast({ message: text.applyingReset, variant: "info" });
              const result = await consumeResetCredit(locale, credit.id, token);
              toast({ ...result, duration: 10000 });
              void status.refresh();
            } catch (error) { showError(error); }
          },
        },
      ],
        }));
        return null;
      },
    });
    return () => status.dispose();
  },
};

// V1 invokes tui(api); V2 invokes setup(context). Neither API is translated into the other.
export default { ...v2, tui: legacy.tui };
