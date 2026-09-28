import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import plugin from "./tui.ts";

const originalHome = process.env.HOME;
const originalFetch = globalThis.fetch;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-limits-test-"));

before(() => {
  process.env.HOME = home;
  const authPath = path.join(home, ".codex", "auth.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify({ tokens: { access_token: "test-token" } }));
});

after(() => {
  process.env.HOME = originalHome;
  globalThis.fetch = originalFetch;
  fs.rmSync(home, { recursive: true, force: true });
});

function setupUi() {
  let commands = [];
  let dialog;
  const toasts = [];
  const api = {
    keymap: { registerLayer: (layer) => { commands = layer.commands; return () => {}; } },
    lifecycle: { onDispose: () => {} },
    ui: {
      toast: (toast) => toasts.push(toast),
      DialogSelect: (props) => props,
      DialogConfirm: (props) => props,
      dialog: {
        replace: (render) => { dialog = render(); },
        clear: () => { dialog = undefined; },
      },
    },
  };
  return { api, toasts, command: (name) => commands.find((item) => item.name === name), getDialog: () => dialog };
}

test("shows the reset count and consumes only the selected credit after confirmation", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(init.headers.Authorization, "Bearer test-token");
    if (String(url).endsWith("/usage")) {
      return Response.json({
        rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000, reset_at: 1790000000 } },
        rate_limit_reset_credits: { available_count: 2, applicable_available_count: 2 },
      });
    }
    if (String(url).endsWith("/rate-limit-reset-credits")) {
      return Response.json({ available_count: 2, credits: [
        { id: "credit-1", reset_type: "codex_rate_limits", status: "available", title: "First reset", expires_at: "2026-10-04T00:00:00Z" },
        { id: "credit-2", reset_type: "codex_rate_limits", status: "available", title: "Second reset", expires_at: "2026-10-22T00:00:00Z" },
      ] });
    }
    if (String(url).endsWith("/consume")) return Response.json({ code: "reset", windows_reset: 2 });
    throw new Error(`Unexpected URL: ${url}`);
  };

  const ui = setupUi();
  await plugin.tui(ui.api);
  await ui.command("codex-limits").run();
  assert.match(ui.toasts.at(-1).message, /2 resets available/);
  assert.match(ui.toasts.at(-1).message, /^5 hours:.*\n2 resets available$/m);

  await ui.command("codex-resets").run();
  assert.match(ui.toasts.at(-1).message, /First reset/);
  assert.match(ui.toasts.at(-1).message, /Second reset/);

  await ui.command("codex-reset").run();
  assert.equal(ui.getDialog().options.length, 2);
  assert.equal(calls.filter((call) => call.url.endsWith("/consume")).length, 0);
  ui.getDialog().onSelect(ui.getDialog().options[1]);
  assert.match(ui.getDialog().message, /Second reset/);
  assert.equal(calls.filter((call) => call.url.endsWith("/consume")).length, 0);
  ui.getDialog().onConfirm();
  await new Promise((resolve) => setImmediate(resolve));

  const post = calls.find((call) => call.url.endsWith("/consume"));
  assert.equal(post.init.method, "POST");
  assert.equal(JSON.parse(post.init.body).credit_id, "credit-2");
  assert.match(JSON.parse(post.init.body).redeem_request_id, /^[0-9a-f-]{36}$/);
  assert.match(ui.toasts.at(-1).message, /usage limits were reset/);
});

test("does not offer redemption when the backend says no window is eligible", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).endsWith("/usage")) {
      return Response.json({ rate_limit_reset_credits: { available_count: 1, applicable_available_count: 0 } });
    }
    if (String(url).endsWith("/rate-limit-reset-credits")) {
      return Response.json({ available_count: 1, credits: [
        { id: "credit-1", reset_type: "codex_rate_limits", status: "available" },
      ] });
    }
    throw new Error(`Unexpected request: ${url} ${init.method}`);
  };
  const ui = setupUi();
  await plugin.tui(ui.api);
  await ui.command("codex-reset").run();
  assert.equal(ui.getDialog(), undefined);
  assert.match(ui.toasts.at(-1).message, /No usage window is eligible/);
  assert.equal(calls.some((url) => url.endsWith("/consume")), false);
});
