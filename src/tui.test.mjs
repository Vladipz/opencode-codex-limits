import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import plugin from "./tui.ts";
import server from "./index.ts";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalFetch = globalThis.fetch;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-limits-test-"));

before(() => {
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const authPath = path.join(home, ".codex", "auth.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify({ tokens: { access_token: "test-token" } }));
});

after(() => {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
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

function setupV2Ui(selection = "credit-2", confirmed = true) {
  let layer;
  const toasts = [];
  const dialogs = [];
  plugin.setup({
    keymap: { layer: (register) => { layer = register(); } },
    ui: {
      slot: ({ render }) => render(),
      toast: { show: (toast) => toasts.push(toast) },
      dialog: {
        select: async (input) => { dialogs.push(input); return selection; },
        confirm: async (input) => { dialogs.push(input); return confirmed; },
      },
    },
  });
  return { toasts, dialogs, command: (id) => layer.commands.find((command) => command.id === id) };
}

test("exposes the V2 server and TUI entrypoints alongside the V1 TUI hook", () => {
  assert.equal(typeof server.setup, "function");
  assert.equal(typeof server.server, "function");
  assert.equal(typeof plugin.setup, "function");
  assert.equal(typeof plugin.tui, "function");
});

test("V2 registers all commands and confirms a selected reset before consuming it", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(init.headers.Authorization, "Bearer test-token");
    if (String(url).endsWith("/usage")) return Response.json({
      rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } },
      rate_limit_reset_credits: { available_count: 2, applicable_available_count: 2 },
    });
    if (String(url).endsWith("/rate-limit-reset-credits")) return Response.json({
      available_count: 2,
      credits: [
        { id: "credit-1", reset_type: "codex_rate_limits", status: "available", title: "First reset" },
        { id: "credit-2", reset_type: "codex_rate_limits", status: "available", title: "Second reset" },
      ],
    });
    if (String(url).endsWith("/consume")) return Response.json({ code: "reset" });
    throw new Error(`Unexpected URL: ${url}`);
  };

  const ui = setupV2Ui();
  for (const name of ["codex-limits", "codex-resets", "codex-reset"]) {
    assert.equal(ui.command(name).slash.name, name);
    assert.equal(ui.command(name).palette, true);
  }
  await ui.command("codex-limits").run();
  assert.match(ui.toasts.at(-1).message, /2 resets available/);
  await ui.command("codex-resets").run();
  assert.match(ui.toasts.at(-1).message, /Second reset/);
  await ui.command("codex-reset").run();
  assert.equal(ui.dialogs[0].options[1].value, "credit-2");
  assert.match(ui.dialogs[1].message, /Second reset/);
  assert.equal(JSON.parse(calls.find((call) => call.url.endsWith("/consume")).init.body).credit_id, "credit-2");
  assert.match(ui.toasts.at(-1).message, /usage limits were reset/);
});

test("V2 does not consume a reset when confirmation is cancelled", async () => {
  let consumed = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/usage")) return Response.json({ rate_limit_reset_credits: { applicable_available_count: 1 } });
    if (String(url).endsWith("/rate-limit-reset-credits")) return Response.json({
      available_count: 1, credits: [{ id: "credit-1", reset_type: "codex_rate_limits", status: "available" }],
    });
    consumed = true;
    throw new Error("A cancelled reset must not be consumed");
  };
  const ui = setupV2Ui("credit-1", false);
  await ui.command("codex-reset").run();
  assert.equal(ui.dialogs.length, 2);
  assert.equal(consumed, false);
});

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
