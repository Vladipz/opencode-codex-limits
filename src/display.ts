export type DisplayMode = "panel" | "compact-sidebar" | "compact-footer" | "hidden";
export type TimeFormat = "absolute" | "countdown";
export type DisplaySettings = {
  displayMode?: DisplayMode;
  showPanel: boolean;
  showResets: boolean;
  showResetExpiry?: boolean;
  timeFormat?: TimeFormat;
};

export function validTimeFormat(value: unknown): TimeFormat | undefined {
  return value === "absolute" || value === "countdown" ? value : undefined;
}

export function timeFormat(settings: Pick<DisplaySettings, "timeFormat">): TimeFormat {
  return validTimeFormat(settings.timeFormat) ?? "absolute";
}

export function displayMode(settings: DisplaySettings): DisplayMode {
  return settings.displayMode ?? (settings.showPanel ? "panel" : "hidden");
}

export function validDisplayMode(value: unknown): DisplayMode | undefined {
  return ["panel", "compact-sidebar", "compact-footer", "hidden"].includes(value as string)
    ? value as DisplayMode : undefined;
}

export function availableResetExpiries(credits: Array<{
  status: string; reset_type: string; expires_at?: string | null;
}>): number[] {
  return credits.filter((credit) => credit.status === "available" && credit.reset_type === "codex_rate_limits")
    .map((credit) => Date.parse(credit.expires_at ?? ""))
    .filter(Number.isFinite);
}

export const displayText = {
  en: {
    settings: "Codex display settings", placement: "Status placement",
    panel: "Full sidebar panel", "compact-sidebar": "Compact sidebar row",
    "compact-footer": "Compact row below input", hidden: "Hidden",
    count: "Reset count", expiry: "Reset expiration", enabled: "On", disabled: "Off",
    done: "Done", usage: "Usage remaining", loading: "Loading limits...",
    timeFormat: "Time format", absolute: "Date and time", countdown: "Countdown",
    resetsIn: "in", awaitingReset: "awaiting update",
    resets: "Resets", expires: "Reset expires in", next: "expires in",
    day: "d", hour: "h", minute: "m",
  },
  uk: {
    settings: "Налаштування статусу Codex", placement: "Розташування статусу",
    panel: "Повна панель у sidebar", "compact-sidebar": "Компактний рядок у sidebar",
    "compact-footer": "Компактний рядок біля поля вводу", hidden: "Приховано",
    count: "Кількість resets", expiry: "Строк згорання resets", enabled: "Увімкнено", disabled: "Вимкнено",
    done: "Готово", usage: "Залишок лімітів", loading: "Отримання лімітів...",
    timeFormat: "Формат часу", absolute: "Дата й час", countdown: "Зворотний відлік",
    resetsIn: "через", awaitingReset: "очікуємо оновлення",
    resets: "Resets", expires: "Reset згорить через", next: "згорить через",
    day: "д", hour: "г", minute: "хв",
  },
};

export function formatLimitReset(resetAt: number | undefined, format: TimeFormat, now: number, locale: "en" | "uk"): string {
  if (resetAt === undefined || !Number.isFinite(resetAt)) return "—";
  const date = new Date(resetAt);
  if (!Number.isFinite(date.valueOf())) return "—";
  if (format === "absolute") {
    return date.toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }
  const text = displayText[locale];
  if (resetAt <= now) return text.awaitingReset;
  const minutes = Math.ceil((resetAt - now) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const parts = [days ? `${days}${text.day}` : "", hours ? `${hours}${text.hour}` : "",
    minutes % 60 ? `${minutes % 60}${text.minute}` : ""].filter(Boolean);
  return `${text.resetsIn} ${parts.join(" ")}`;
}

export function resetDisplay(
  settings: Pick<DisplaySettings, "showResets" | "showResetExpiry">,
  count: number | undefined,
  expiries: number[],
  now: number,
  locale: "en" | "uk",
) {
  const text = displayText[locale];
  const next = Math.min(...expiries.filter((expiry) => expiry > now));
  const remaining = next - now;
  const urgent = remaining > 0 && remaining < 72 * 3600_000;
  const showExpiry = settings.showResetExpiry !== false && Number.isFinite(next)
    && (settings.showResets || urgent);
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const duration = days ? `${days}${text.day}${hours ? ` ${hours}${text.hour}` : ""}`
    : hours ? `${hours}${text.hour}${minutes % 60 ? ` ${minutes % 60}${text.minute}` : ""}`
    : `${minutes}${text.minute}`;
  return {
    count: settings.showResets && count !== undefined ? `${text.resets}: ${count}` : undefined,
    expiry: showExpiry ? `${settings.showResets && count !== undefined ? text.next : text.expires} ${duration}` : undefined,
    urgent: showExpiry && urgent,
  };
}

export function compactResetText(value: ReturnType<typeof resetDisplay>, availableWidth: number, locale: "en" | "uk") {
  const full = [value.count, value.expiry].filter(Boolean).join(" · ");
  if (full.length <= availableWidth) return { count: value.count, expiry: value.expiry };
  const duration = value.expiry?.replace(/^.*? (\d)/, "$1").replaceAll(" ", "");
  const expiry = duration ? `${locale === "uk" ? "згорить" : "expires"}: ${duration}` : undefined;
  if (value.count && expiry && `${value.count} · ${expiry}`.length <= availableWidth) return { count: value.count, expiry };
  if (expiry && expiry.length <= availableWidth) return { count: undefined, expiry };
  if (duration && `reset: ${duration}`.length <= availableWidth) return { count: undefined, expiry: `reset: ${duration}` };
  return { count: value.count && value.count.length <= availableWidth ? value.count : undefined, expiry: undefined };
}
