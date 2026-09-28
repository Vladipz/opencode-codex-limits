import { Plugin } from "@opencode/plugin/tui";
import legacy, {
  consumeResetCredit,
  formatExpiry,
  getLocale,
  getValidToken,
  loadCodexLimits,
  loadResetCredits,
  loadUsage,
  messages,
  type ResetCredit,
} from "./tui-v1.ts";

const v2 = Plugin.define({
  id: "local.codex-limits.cli",
  setup(context) {
    const locale = getLocale();
    const text = messages[locale];
    const toast = context.ui.toast.show;
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
          id: "codex-limits",
          title: text.commandTitle,
          description: text.commandDescription,
          group: "Codex",
          palette: true,
          slash: { name: "codex-limits" },
          run: async () => {
            try {
              toast({ message: text.loading, variant: "info" });
              toast({ title: text.usageTitle, message: await loadCodexLimits(locale), variant: "success", duration: 8000 });
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
              toast({ message: text.loadingResets, variant: "info" });
              const data = await loadResetCredits(locale);
              const credits = availableCredits(data.credits);
              toast({
                message: credits.length
                  ? `${text.availableResets(data.available_count)} | ${credits.map((credit) =>
                      `${credit.title || "Full reset"} · ${formatExpiry(credit.expires_at, locale)}`).join(" | ")}`
                  : text.noResets,
                variant: "info",
                duration: 12000,
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
            } catch (error) { showError(error); }
          },
        },
      ],
        }));
        return null;
      },
    });
  },
});

// V1 invokes tui(api); V2 invokes setup(context). Neither API is translated into the other.
export default { ...v2, tui: legacy.tui };
