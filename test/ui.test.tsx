/** @jsxImportSource @opentui/solid */
import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "@opentui/solid";
import { createTestRenderer } from "@opentui/core/testing";
import { createSignal } from "solid-js";
import { createSettingsMenu, SettingsDialog } from "../src/settings-menu.tsx";
import { createStatusController } from "../src/status-controller.ts";
import { StatusView } from "../src/status-view.tsx";
import { formatLimitReset, type DisplaySettings } from "../src/display.ts";

const colors = () => ({ text: "white", muted: "gray", error: "red", warning: "yellow", success: "green" });

for (const version of [1, 2]) test(`V${version} rendered menu retains its mounted rows and keyboard focus after toggles`, async () => {
  const ui = await createTestRenderer({ width: 90, height: 20 });
  let status;
  let menu;
  let closed = 0;
  render(() => {
    const [settings, save] = createSignal<DisplaySettings>({ showPanel: false, showResets: false, showResetExpiry: true });
    status = createStatusController({ settings, save: (next) => { save(next); },
      modes: version === 1 ? ["panel", "compact-sidebar", "hidden"] : ["panel", "compact-sidebar", "compact-footer", "hidden"],
      active: () => false, subscribe: () => undefined,
    }, async () => ({ windows: [] }));
    menu = createSettingsMenu(status, "en", () => { closed += 1; }, (error) => { throw error; });
    return <SettingsDialog menu={menu} locale="en" colors={colors} />;
  }, ui.renderer);
  try {
    await ui.flush();
    assert.match(ui.captureCharFrame(), /Status placement Hidden/);
    const mounted = ui.renderer.root.getChildren()[0];
    ui.mockInput.pressArrow("down");
    ui.mockInput.pressEnter();
    await ui.waitFor(() => status.getSettings().showResets);
    await ui.flush();
    assert.equal(menu.selected(), 1);
    assert.match(ui.captureCharFrame(), /› Reset count On/);
    ui.mockInput.pressArrow("down");
    ui.mockInput.pressArrow("right");
    await ui.waitFor(() => status.getSettings().showResetExpiry === false);
    await ui.flush();
    assert.equal(menu.selected(), 2);
    assert.match(ui.captureCharFrame(), /› Reset expiration Off/);
    ui.mockInput.pressArrow("down");
    ui.mockInput.pressEnter();
    await ui.waitFor(() => status.getSettings().timeFormat === "countdown");
    await ui.flush();
    assert.equal(menu.selected(), 3);
    assert.match(ui.captureCharFrame(), /› Time format Countdown/);
    assert.equal(ui.renderer.root.getChildren()[0], mounted);
    ui.mockInput.pressArrow("up");
    ui.mockInput.pressArrow("up");
    ui.mockInput.pressArrow("up");
    ui.mockInput.pressArrow("left");
    await ui.waitFor(() => status.mode() !== "hidden");
    assert.equal(status.mode(), version === 1 ? "compact-sidebar" : "compact-footer");
    assert.equal(closed, 0);
    ui.mockInput.pressEscape();
    await ui.waitFor(() => closed === 1);
  } finally { status.dispose(); ui.renderer.destroy(); }
});

test("rendered status switches full/compact layouts reactively and displays expiration once", async () => {
  const ui = await createTestRenderer({ width: 90, height: 20 });
  let status;
  let compact;
  render(() => {
    const [settings, save] = createSignal<DisplaySettings>({ showPanel: true, showResets: true, showResetExpiry: true });
    const [isCompact, setCompact] = createSignal(false);
    compact = setCompact;
    status = createStatusController({ settings, save: (next) => { save(next); },
      modes: ["panel", "compact-sidebar", "hidden"], active: () => true, subscribe: () => undefined,
    }, async () => ({ windows: [
      { label: "5h", remaining: "42%", remainingPercent: 42, reset: "03.10 18:30" },
      { label: "Weekly", remaining: "18%", remainingPercent: 18, reset: "07.10 12:00" },
    ], resets: 2, resetExpiries: [Date.now() + 3600_000] }));
    return <StatusView status={status} locale="en" colors={colors} compact={isCompact()} />;
  }, ui.renderer);
  try {
    await ui.waitFor(() => Boolean(status.usage()));
    await ui.flush();
    let frame = ui.captureCharFrame();
    assert.match(frame, /Usage remaining/);
    assert.equal(frame.match(/expires in/g)?.length, 1);
    compact(true);
    await ui.flush();
    frame = ui.captureCharFrame();
    assert.doesNotMatch(frame, /Usage remaining/);
    assert.match(frame, /Codex · 5h: 42% · 7d: 18%/);
    assert.equal(frame.match(/expires in/g)?.length, 1);
    ui.resize(40, 20);
    await ui.flush();
    frame = ui.captureCharFrame();
    assert.match(frame, /42%/);
    assert.match(frame, /18%/);
    await status.toggleResets();
    await status.toggleExpiry();
    await ui.flush();
    assert.doesNotMatch(ui.captureCharFrame(), /expires|Resets/);
    compact(false);
    await ui.flush();
    assert.match(ui.captureCharFrame(), /Usage remaining/);
  } finally { status.dispose(); ui.renderer.destroy(); }
});

test("rendered panel changes reset time immediately without reloading usage", async () => {
  const ui = await createTestRenderer({ width: 90, height: 20 });
  let status;
  let loads = 0;
  const resetAt = new Date(2030, 9, 3, 18, 30).valueOf();
  const absolute = formatLimitReset(resetAt, "absolute", Date.now(), "uk");
  render(() => {
    const [settings, save] = createSignal<DisplaySettings>({ showPanel: true, showResets: false });
    status = createStatusController({ settings, save: (next) => { save(next); },
      modes: ["panel", "hidden"], active: () => true, subscribe: () => undefined,
    }, async () => { loads += 1; return { windows: [
      { label: "5h", remaining: "42%", reset: "old date", resetAt },
    ] }; });
    return <StatusView status={status} locale="uk" colors={colors} />;
  }, ui.renderer);
  try {
    await ui.waitFor(() => Boolean(status.usage()));
    await ui.flush();
    assert.ok(ui.captureCharFrame().includes(absolute));
    assert.match(ui.captureCharFrame(), /жовт/);
    const requests = loads;
    await status.toggleTimeFormat();
    await ui.flush();
    assert.ok(ui.captureCharFrame().includes(formatLimitReset(resetAt, "countdown", status.now(), "uk")));
    assert.ok(!ui.captureCharFrame().includes(absolute));
    assert.equal(loads, requests);
    await status.toggleTimeFormat();
    await ui.flush();
    assert.ok(ui.captureCharFrame().includes(absolute));
    assert.equal(loads, requests);
  } finally { status.dispose(); ui.renderer.destroy(); }
});
