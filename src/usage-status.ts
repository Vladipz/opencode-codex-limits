import type { UsageStatus } from "./status.tsx";

export function usageStatus(data: any, locale: "en" | "uk"): UsageStatus {
  const rateLimit = data.rate_limit;
  if (!rateLimit) throw new Error("The API response did not contain rate_limit.");
  const windows = [rateLimit.primary_window, rateLimit.secondary_window].filter(
    (window: any) => window && (!window.limit_window_seconds || window.limit_window_seconds < 28 * 86400),
  );
  if (!windows.length) throw new Error("The API response did not contain usage limit windows.");

  return {
    windows: windows.map((window: any) => {
      const seconds = window.limit_window_seconds;
      const label = seconds === 18000
        ? "5h"
        : seconds === 604800
          ? "Weekly"
          : seconds ? `${Math.round(seconds / 3600)}h` : "Limit";
      const used = window.used_percent;
      const remainingPercent = typeof used === "number" && Number.isFinite(used)
        ? Math.max(0, Math.min(100, Math.round(100 - used)))
        : undefined;
      const timestamp = Number(window.reset_at);
      const resetDate = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : undefined;
      const reset = resetDate && !Number.isNaN(resetDate.valueOf())
        ? resetDate.toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "—";
      return {
        label,
        remaining: remainingPercent === undefined ? "?" : `${remainingPercent}%`,
        remainingPercent,
        reset,
        resetAt: resetDate && Number.isFinite(resetDate.valueOf()) ? resetDate.valueOf() : undefined,
      };
    }),
    resets: typeof data.rate_limit_reset_credits?.available_count === "number"
      ? data.rate_limit_reset_credits.available_count
      : undefined,
  };
}
