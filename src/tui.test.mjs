import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import plugin from "./tui.ts";
import server from "./index.ts";
import { registerStatusV2 } from "./status-v2.tsx";
import { registerStatus } from "./status.tsx";
import { createSettingsMenu } from "./settings-menu.tsx";
import { loadStatus } from "./status-loader.ts";
import { availableResetExpiries, compactResetText, displayMode, formatLimitReset, resetDisplay, timeFormat } from "./display.ts";
import { usageStatus } from "./usage-status.ts";

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
  let settings;
  const dispose = plugin.setup({
    options: {},
    storage: {
      store: (_name, { initial }) => {
        settings = { ...initial, showPanel: false };
        return [settings, async (update) => update(settings)];
      },
    },
    data: { on: () => () => {} },
    keymap: { layer: (register) => { layer = register(); } },
    ui: {
      slot: ({ render }) => render(),
      model: { current: () => ({ providerID: "openai", modelID: "codex" }) },
      toast: { show: (toast) => toasts.push(toast) },
      dialog: {
        show: (render, onClose) => { dialogs.push({ render, onClose }); },
        clear: () => {},
        alert: async (input) => { dialogs.push(input); },
        select: async (input) => { dialogs.push(input); return Array.isArray(selection) ? selection.shift() : selection; },
        confirm: async (input) => { dialogs.push(input); return confirmed; },
      },
    },
  });
  return { toasts, dialogs, settings: () => settings, dispose, command: (id) => layer.commands.find((command) => command.id === id) };
}

test("limit reset time formats local dates and localized countdowns, including expired and invalid times", () => {
  const date = new Date(2026, 9, 3, 18, 30).valueOf();
  const now = date - 84 * 60_000;
  for (const locale of ["uk", "en"]) {
    const previous = usageStatus({ rate_limit: { primary_window: { reset_at: date / 1000 } } }, locale).windows[0].reset;
    assert.equal(formatLimitReset(date, "absolute", now, locale), previous);
    assert.match(previous, locale === "uk" ? /жовт/ : /Oct/);
  }
  assert.equal(formatLimitReset(date, "countdown", now, "uk"), "через 1г 24хв");
  assert.equal(formatLimitReset(date, "countdown", now + 60_000, "uk"), "через 1г 23хв");
  assert.equal(formatLimitReset(date, "countdown", now, "en"), "in 1h 24m");
  assert.equal(formatLimitReset(date, "countdown", date - 1, "uk"), "через 1хв");
  assert.equal(formatLimitReset(date, "countdown", date - 2 * 86400_000, "uk"), "через 2д");
  assert.equal(formatLimitReset(date, "countdown", date, "uk"), "очікуємо оновлення");
  assert.equal(formatLimitReset(date, "countdown", date + 1, "en"), "awaiting update");
  for (const invalid of [undefined, NaN, Infinity, 9e20]) {
    assert.equal(formatLimitReset(invalid, "countdown", now, "uk"), "—");
  }
  assert.equal(timeFormat({}), "absolute");
  assert.equal(timeFormat({ timeFormat: "invalid" }), "absolute");
  const status = usageStatus({ rate_limit: { primary_window: { reset_at: date / 1000 } } }, "uk");
  assert.equal(status.windows[0].resetAt, date);
  for (const reset_at of [undefined, null, "invalid", Infinity]) {
    assert.equal(usageStatus({ rate_limit: { primary_window: { reset_at } } }, "uk").windows[0].resetAt, undefined);
  }
});

test("reset visibility settings are independent and expiration uses a strict 72-hour threshold", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const soon = now + 71 * 3600_000;
  const later = now + 5 * 86400_000;
  const render = (showResets, showResetExpiry, expiries = [soon]) =>
    resetDisplay({ showResets, showResetExpiry }, 2, expiries, now, "en");
  assert.deepEqual(render(false, false), { count: undefined, expiry: undefined, urgent: false });
  assert.deepEqual(render(true, false), { count: "Resets: 2", expiry: undefined, urgent: false });
  assert.equal(render(false, true).expiry, "Reset expires in 2d 23h");
  assert.equal(render(true, true).expiry, "expires in 2d 23h");
  assert.equal(render(false, true).urgent, true);
  assert.equal(render(false, true, [now + 72 * 3600_000]).expiry, undefined);
  assert.equal(render(true, true, [now + 72 * 3600_000]).urgent, false);
  assert.equal(render(false, true, [later]).expiry, undefined);
  assert.equal(render(true, true, [later]).expiry, "expires in 5d");
  assert.equal(render(true, true, [later, now - 1, soon]).expiry, "expires in 2d 23h");
  assert.equal(render(true, true, [now, NaN]).expiry, undefined);
  assert.equal(resetDisplay({ showResets: false, showResetExpiry: true }, 2, [soon], now, "uk").expiry, "Reset згорить через 2д 23г");
  assert.equal(resetDisplay({ showResets: true, showResetExpiry: true }, 0, [], now, "en").count, "Resets: 0");
});

test("both versions use the configured time format only until a saved choice exists", async () => {
  for (const version of [1, 2]) {
    const saved = { showPanel: false, showResets: false };
    const defaults = { showPanel: false, showResets: false, timeFormat: "countdown" };
    const setup = () => version === 1
      ? registerStatus({ kv: { get: (key, fallback) => saved[key] ?? fallback,
        set: (key, value) => { saved[key] = value; } } }, async () => ({ windows: [] }), defaults)
      : registerStatusV2({ options: defaults,
        data: { on: () => () => {} },
        storage: { store: () => [saved, async (update) => update(saved)] },
        ui: { slot: () => () => {}, model: { current: () => undefined } },
      }, async () => ({ windows: [] }));
    const status = setup();
    assert.equal(status.getSettings().timeFormat, "countdown");
    await status.toggleTimeFormat();
    assert.equal(status.getSettings().timeFormat, "absolute");
    status.dispose();
    const restarted = setup();
    assert.equal(restarted.getSettings().timeFormat, "absolute");
    restarted.dispose();
  }
});

test("only available Codex credits with valid dates contribute expiration data", () => {
  const date = "2026-10-03T12:00:00Z";
  const credits = [
    { status: "available", reset_type: "codex_rate_limits", expires_at: date },
    { status: "redeemed", reset_type: "codex_rate_limits", expires_at: date },
    { status: "available", reset_type: "other", expires_at: date },
    { status: "available", reset_type: "codex_rate_limits", expires_at: "invalid" },
    { status: "available", reset_type: "codex_rate_limits", expires_at: null },
  ];
  assert.deepEqual(availableResetExpiries(credits), [Date.parse(date)]);
});

test("compact rows shorten optional reset information before removing it", () => {
  const value = { count: "Resets: 2", expiry: "expires in 2d 18h", urgent: true };
  assert.equal(compactResetText(value, 80, "en").expiry, value.expiry);
  assert.deepEqual(compactResetText(value, 20, "en"), { count: undefined, expiry: "expires: 2d18h" });
  assert.deepEqual(compactResetText(value, 12, "en"), { count: undefined, expiry: "reset: 2d18h" });
  assert.deepEqual(compactResetText(value, 2, "en"), { count: undefined, expiry: undefined });
});

test("V2 settings stay in one dialog and retain focus without a separate reset-count command", async () => {
  globalThis.fetch = async (url) => Response.json(String(url).endsWith("/usage")
    ? { rate_limit: { primary_window: { used_percent: 25, limit_window_seconds: 18000 } } }
    : { available_count: 0, credits: [] });
  const ui = setupV2Ui();
  assert.equal(ui.command("codex-panel"), undefined);
  assert.equal(ui.command("codex-resets-panel"), undefined);
  assert.equal(ui.settings().showResetExpiry, true);
  const menu = ui.command("codex-settings").run();
  menu.move(1);
  await menu.activate();
  assert.equal(ui.settings().showResets, true);
  assert.equal(menu.selected(), 1);
  assert.equal(menu.rows()[1].description, "On");
  menu.move(1);
  await menu.activate();
  assert.equal(ui.settings().showResetExpiry, false);
  assert.equal(menu.selected(), 2);
  await menu.activate(-1, 0);
  assert.equal(displayMode(ui.settings()), "compact-footer");
  await menu.activate(1, 0);
  assert.equal(displayMode(ui.settings()), "hidden");
  await menu.activate(1, 1);
  assert.equal(ui.settings().showResets, false);
  assert.equal(ui.settings().showResetExpiry, false);
  assert.equal(menu.rows()[1].description, "Off");
  assert.equal(menu.rows()[3].description, "Date and time");
  await menu.activate(1, 3);
  assert.equal(ui.settings().timeFormat, "countdown");
  assert.equal(menu.selected(), 3);
  assert.equal(menu.rows()[3].description, "Countdown");
  assert.equal(ui.dialogs.length, 1);
  ui.dialogs[0].onClose();
  await menu.activate(1, 1);
  assert.equal(ui.settings().showResets, false);
  ui.dispose();
});

test("V1 offers all supported settings, migrates legacy keys and persists separate switches", async () => {
  const saved = new Map([["codex-limits.showPanel", false], ["codex-limits.showResets", true]]);
  const cleanup = [];
  let slots;
  let unsubscribed = 0;
  let loads = 0;
  const api = {
    kv: { get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback, set: (key, value) => saved.set(key, value) },
    slots: { register: (plugin) => { slots = plugin.slots; } },
    lifecycle: { onDispose: (fn) => cleanup.push(fn) },
    event: { on: () => () => { unsubscribed += 1; } },
  };
  const defaults = { showPanel: true, showResets: false, showResetExpiry: true };
  const status = registerStatus(api, async () => { loads += 1; return { windows: [], resets: 2, resetExpiries: [Date.now() + 3600_000] }; }, defaults);
  assert.equal(status.mode(), "hidden");
  assert.equal(status.getSettings().showResets, true);
  assert.equal(slots.sidebar_content(), null);
  await status.refresh();
  assert.equal(loads, 0);
  assert.deepEqual(status.modes, ["panel", "compact-sidebar", "hidden"]);
  await assert.rejects(status.setMode("compact-footer"), /Unsupported/);
  let closed = 0;
  const menu = createSettingsMenu(status, "en", () => { closed += 1; }, (error) => { throw error; });
  await menu.activate(-1);
  assert.equal(status.mode(), "compact-sidebar");
  await status.refresh();
  assert.equal(status.usage().resets, 2);
  assert.equal(status.usage().resetExpiries.length, 1);
  await menu.activate(1, 2);
  assert.equal(status.getSettings().showResetExpiry, false);
  await status.toggleResets();
  assert.equal(status.getSettings().showResetExpiry, false);
  assert.equal(saved.get("codex-limits.displayMode"), "compact-sidebar");
  await menu.activate(1, 3);
  assert.equal(saved.get("codex-limits.timeFormat"), "countdown");
  assert.equal(menu.selected(), 3);
  menu.dismiss();
  assert.equal(closed, 1);
  cleanup.forEach((fn) => fn());
  await status.refresh();
  const restarted = registerStatus(api, async () => ({ windows: [] }), defaults);
  assert.equal(restarted.mode(), "compact-sidebar");
  assert.equal(restarted.getSettings().showResetExpiry, false);
  assert.equal(restarted.getSettings().showResets, false);
  assert.equal(restarted.getSettings().timeFormat, "countdown");
  restarted.dispose();
  assert.equal(unsubscribed, 2);
});

test("V1 registers the same persistent settings dialog and keeps its panel shortcut", async () => {
  const ui = setupUi();
  let dialog;
  ui.api.ui.dialog.replace = (render) => { dialog = render; };
  await plugin.tui(ui.api, { showPanel: false });
  assert.equal(typeof ui.command("codex-settings").run, "function");
  assert.equal(typeof ui.command("codex-panel").run, "function");
  assert.equal(ui.command("codex-resets-panel"), undefined);
  const menu = ui.command("codex-settings").run();
  const initialDialog = dialog;
  menu.move(1);
  await menu.activate();
  assert.equal(dialog, initialDialog);
  assert.equal(menu.selected(), 1);
  assert.equal(menu.rows()[1].description, "On");
  await menu.activate();
  assert.equal(menu.rows()[1].description, "Off");
  assert.equal(menu.rows()[2].description, "On");
});

test("shared settings serialize writes and leave focus/value intact after a failed save", async () => {
  const saved = { showPanel: false, showResets: false };
  let fail = true;
  const status = registerStatusV2({
    options: {}, storage: { store: () => [saved, async (update) => { if (fail) throw new Error("write failed"); update(saved); }] },
    data: { on: () => () => {} },
    ui: { slot: () => () => {}, model: { current: () => ({ providerID: "openai" }) } },
  }, async () => ({ windows: [] }));
  const errors = [];
  const menu = createSettingsMenu(status, "en", () => {}, (error) => errors.push(error.message));
  await menu.activate(1, 1);
  assert.equal(menu.selected(), 1);
  assert.equal(menu.saving(), false);
  assert.equal(menu.rows()[1].description, "Off");
  assert.deepEqual(errors, ["write failed"]);
  fail = false;
  await Promise.all([status.toggleResets(), status.toggleResets()]);
  assert.equal(saved.showResets, false);
  assert.equal(status.getSettings().timeFormat, "absolute");
  await status.toggleTimeFormat();
  assert.equal(saved.timeFormat, "countdown");
  status.dispose();
});

test("shared loader keeps usage when reset expiration cannot be loaded", async () => {
  const usage = { rate_limit: { primary_window: { used_percent: 25, limit_window_seconds: 18000 } } };
  const status = await loadStatus("en", async () => usage, async () => ({ available_count: 2, credits: [
    { status: "available", reset_type: "codex_rate_limits", expires_at: "2026-10-03T12:00:00Z" },
  ] }));
  assert.equal(status.windows[0].remaining, "75%");
  assert.equal(status.resets, 2);
  assert.equal(status.resetExpiries.length, 1);
  const originalError = console.error;
  try {
    console.error = () => {};
    const fallback = await loadStatus("en", async () => usage, async () => { throw new Error("unavailable"); });
    assert.equal(fallback.windows[0].remaining, "75%");
  } finally { console.error = originalError; }
});

test("V2 migrates legacy settings, persists independent choices and cleans up both slots", async () => {
  const saved = { showPanel: false, showResets: true };
  let loads = 0;
  let removed = 0;
  let unsubscribed = 0;
  const claims = [];
  const context = {
    options: { showResetExpiry: false },
    storage: { store: () => [saved, async (update) => update(saved)] },
    data: { on: () => () => { unsubscribed += 1; } },
    ui: {
      model: { current: () => ({ providerID: "openai" }) },
      slot: (claim) => { claims.push(claim); return () => { removed += 1; }; },
    },
  };
  const status = registerStatusV2(context, async () => { loads += 1; return { windows: [] }; });
  assert.equal(displayMode(status.getSettings()), "hidden");
  assert.equal(status.getSettings().showResets, true);
  assert.equal(status.getSettings().showResetExpiry, false);
  assert.equal(claims[0].render(), null);
  assert.equal(claims[1].render(), null);
  await status.refresh();
  assert.equal(loads, 0);
  await status.setMode("compact-footer");
  assert.equal(saved.displayMode, "compact-footer");
  assert.equal(claims[0].render(), null);
  await status.toggleExpiry();
  assert.equal(saved.showResetExpiry, true);
  await status.toggleResets();
  assert.equal(saved.showResetExpiry, true);
  assert.equal(saved.showResets, false);
  await status.toggleTimeFormat();
  assert.equal(saved.timeFormat, "countdown");
  status.dispose();
  const restarted = registerStatusV2(context, async () => ({ windows: [] }));
  assert.equal(displayMode(restarted.getSettings()), "compact-footer");
  assert.equal(restarted.getSettings().showResetExpiry, true);
  assert.equal(restarted.getSettings().timeFormat, "countdown");
  restarted.dispose();
  assert.equal(removed, 4);
  assert.equal(unsubscribed, 2);
});

test("hides the status panel and skips refreshes for non-OpenAI models", async () => {
  const setupStatus = (providerID) => {
    let sidebar;
    let loads = 0;
    const status = registerStatusV2({
      options: {},
      storage: {
        store: (_name, { initial }) => [initial, async (update) => update(initial)],
      },
      data: { on: () => () => {} },
      theme: { text: { base: "white" } },
      ui: {
        model: { current: () => ({ providerID, modelID: "test" }) },
        slot: (claim) => {
          if (claim.append === "sidebar.content") sidebar = claim.render;
          return () => {};
        },
      },
    }, async () => {
      loads += 1;
      return { windows: [] };
    });
    return { sidebar, status, loads: () => loads };
  };

  const nonOpenAI = setupStatus("anthropic");
  assert.equal(nonOpenAI.sidebar(), null);
  await nonOpenAI.status.refresh();
  assert.equal(nonOpenAI.loads(), 0);
  nonOpenAI.status.dispose();

  const openAI = setupStatus("openai");
  await openAI.status.refresh();
  assert.equal(openAI.loads(), 1);
  openAI.status.dispose();
});

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
      rate_limit: {
        primary_window: { used_percent: 95, limit_window_seconds: 18000, reset_at: 1790000000 },
        secondary_window: { used_percent: 6, limit_window_seconds: 604800, reset_at: 1790600000 },
      },
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
  assert.equal(ui.toasts[0].message, "Fetching Codex usage limits...");
  assert.equal(ui.toasts[0].duration, 30000);
  assert.equal(ui.toasts[1].title, "Codex usage");
  assert.match(ui.toasts[1].message, /^5 hours: 5% remaining\nResets: .+\n\n7 days: 94% remaining\nResets: .+\n\n2 resets available$/);
  assert.equal(ui.dialogs.length, 0);
  await ui.command("codex-resets").run();
  assert.equal(ui.toasts[2].message, "Fetching Codex resets...");
  assert.equal(ui.toasts[2].duration, 30000);
  assert.equal(ui.dialogs[0].title, "List Codex resets");
  assert.match(ui.dialogs[0].message, /^2 resets available\n\nFirst reset\nExpires: .+\n\nSecond reset\nExpires: .+$/);
  await ui.command("codex-reset").run();
  assert.equal(ui.dialogs[1].options[1].value, "credit-2");
  assert.match(ui.dialogs[2].message, /Second reset/);
  assert.equal(JSON.parse(calls.find((call) => call.url.endsWith("/consume")).init.body).credit_id, "credit-2");
  assert.match(ui.toasts.at(-1).message, /usage limits were reset/);
});

test("V2 shows loading feedback before usage and reset requests finish", async () => {
  let resolveUsage;
  let resolveResets;
  globalThis.fetch = (url) => new Promise((resolve) => {
    if (String(url).endsWith("/usage")) resolveUsage = resolve;
    else if (String(url).endsWith("/rate-limit-reset-credits")) resolveResets = resolve;
    else throw new Error(`Unexpected URL: ${url}`);
  });

  const ui = setupV2Ui();
  const usage = ui.command("codex-limits").run();
  assert.equal(ui.toasts.at(-1).message, "Fetching Codex usage limits...");
  assert.equal(ui.dialogs.length, 0);
  await new Promise((resolve) => setImmediate(resolve));
  resolveUsage(Response.json({
    rate_limit: { primary_window: { used_percent: 24, limit_window_seconds: 18000 } },
  }));
  await usage;
  assert.equal(ui.dialogs.length, 0);
  assert.equal(ui.toasts.at(-1).title, "Codex usage");

  const resets = ui.command("codex-resets").run();
  assert.equal(ui.toasts.at(-1).message, "Fetching Codex resets...");
  assert.equal(ui.dialogs.length, 0);
  await new Promise((resolve) => setImmediate(resolve));
  resolveResets(Response.json({ available_count: 0, credits: [] }));
  await resets;
  assert.equal(ui.dialogs.length, 1);
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

test("V2 shows an empty reset list in a dialog and reports missing usage windows", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/usage")) return Response.json({ rate_limit: {} });
    if (String(url).endsWith("/rate-limit-reset-credits")) return Response.json({ available_count: 0, credits: [] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const ui = setupV2Ui();
  await ui.command("codex-resets").run();
  assert.equal(ui.dialogs[0].message, "No banked resets are available.");
  await ui.command("codex-limits").run();
  assert.match(ui.toasts.at(-1).message, /did not contain usage limit windows/);
  assert.equal(ui.dialogs.length, 1);
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
