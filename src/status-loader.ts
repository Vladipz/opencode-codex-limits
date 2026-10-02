import { availableResetExpiries } from "./display.ts";
import { usageStatus } from "./usage-status.ts";
import type { UsageStatus } from "./status.tsx";

export async function loadStatus(locale: "en" | "uk", loadUsage: () => Promise<any>, loadCredits: () => Promise<{
  available_count: number;
  credits: Array<{ status: string; reset_type: string; expires_at?: string | null }>;
}>): Promise<UsageStatus> {
  const result = usageStatus(await loadUsage(), locale);
  try {
    const credits = await loadCredits();
    result.resets = credits.available_count;
    result.resetExpiries = availableResetExpiries(credits.credits);
  } catch (error) {
    // A separate reset endpoint failure must not hide the usage windows.
    console.error("[codex-limits] Could not load reset expiration", error);
  }
  return result;
}
