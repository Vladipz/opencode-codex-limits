import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

function getAuthFilePath(): string {
  const home = os.homedir();

  const possiblePaths = [
    // OpenCode Linux/macOS
    path.join(home, ".local", "share", "opencode", "auth.json"),

    // Codex
    path.join(home, ".codex", "auth.json"),

    // OpenCode Windows
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "opencode", "auth.json")
      : "",
  ];

  return (
    possiblePaths.find((filePath) => filePath && fs.existsSync(filePath)) ?? ""
  );
}

async function getValidToken(): Promise<string> {
  const authPath = getAuthFilePath();

  if (!authPath) {
    throw new Error("Не знайдено auth.json OpenCode/Codex");
  }

  const authText = fs.readFileSync(authPath, "utf-8");
  const auth = JSON.parse(authText);

  const openai = auth.openai ?? auth;

  let token = openai.access ?? openai.access_token;

  if (!token) {
    throw new Error(`Access token не знайдено в ${authPath}`);
  }

  const expires = openai.expires;

  const isExpiring =
    typeof expires === "number" && expires - Date.now() < 5 * 60 * 1000;

  const refreshToken = openai.refresh ?? openai.refresh_token;

  if (isExpiring && refreshToken) {
    const response = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OPENAI_CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(`Refresh token error: ${response.status} ${body}`);
    }

    const data: any = await response.json();

    token = data.access_token;

    openai.access = data.access_token;

    if (data.refresh_token) {
      openai.refresh = data.refresh_token;
    }

    openai.expires = Date.now() + (data.expires_in ?? 3600) * 1000;

    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), "utf-8");
  }

  return token;
}

async function loadCodexLimits(): Promise<string> {
  const token = await getValidToken();

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "codex-cli",
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`Usage API ${response.status}: ${body}`);
  }

  const data: any = await response.json();

  console.log("[codex-limits] response:", JSON.stringify(data, null, 2));

  const rateLimit = data.rate_limit;

  if (!rateLimit) {
    throw new Error("API не повернув rate_limit");
  }

  const windows = [rateLimit.primary_window, rateLimit.secondary_window].filter(
    Boolean,
  );

  if (windows.length === 0) {
    throw new Error("API не повернув вікна лімітів");
  }

  const formatReset = (resetAt?: number) => {
    if (!resetAt) {
      return "невідомо";
    }

    return new Date(resetAt * 1000).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatWindow = (window: any) => {
    const used =
      window.used_percent !== undefined ? `${window.used_percent}%` : "?";

    const seconds = window.limit_window_seconds;

    let name = "Limit";

    if (seconds === 18000) {
      name = "5h";
    } else if (seconds === 604800) {
      name = "7d";
    } else if (seconds) {
      const hours = seconds / 3600;

      if (hours < 24) {
        name = `${hours}h`;
      } else {
        name = `${Math.round(hours / 24)}d`;
      }
    }

    return `${name}: ${used} використано, reset ${formatReset(
      window.reset_at,
    )}`;
  };

  return windows.map(formatWindow).join(" | ");
}

const plugin = {
  id: "local.codex-limits",

  async tui(api: any) {
    const dispose = api.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",

          name: "codex-limits",

          title: "Check Codex Limits",

          description: "Show current Codex usage limits",

          category: "Codex",

          slashName: "codex-limits",

          run: async () => {
            try {
              api.ui.toast({
                message: "Отримання лімітів Codex...",

                variant: "info",
              });

              const message = await loadCodexLimits();

              api.ui.toast({
                message,

                variant: "success",

                duration: 8000,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);

              console.error("[codex-limits]", error);

              api.ui.toast({
                message: `Codex limits error: ${message}`,

                variant: "error",

                duration: 10000,
              });
            }
          },
        },
      ],

      bindings: [
        {
          key: "alt+l",
          command: "palette.codex-limits",
        },
      ],
    });

    api.lifecycle?.onDispose?.(() => {
      if (typeof dispose === "function") {
        dispose();
      }
    });
  },
};

export default plugin;
