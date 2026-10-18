const {test} = require("node:test");
const assert = require("node:assert/strict");
const {measure, normalizeSize, resize, move, normalizePosition, placeLauncher, moveLauncher} = require("../extension/layout.js");

test("icon movement clamps its own geometry without changing the saved window", () => {
  const size = {width: 580, height: 740, right: 240, bottom: 50, floating: true}, original = structuredClone(size);
  const rect = {x: 1116, y: 956, width: 44, height: 44};
  const position = moveLauncher({rect, dx: -400, dy: -500, width: 1400, height: 1050});
  assert.deepEqual(position, {right: 640, bottom: 550});
  assert.deepEqual(placeLauncher({position, width: 1400, height: 1050}), position);
  assert.deepEqual(moveLauncher({rect, dx: -99999, dy: -99999, width: 1400, height: 1050}), {right: 1344, bottom: 994});
  assert.deepEqual(moveLauncher({rect, dx: 99999, dy: 99999, width: 1400, height: 1050}), {right: 12, bottom: 12});
  const smaller = placeLauncher({position, width: 390, height: 400, iconWidth: 48, iconHeight: 48});
  assert.deepEqual(smaller, {right: 330, bottom: 340});
  assert.deepEqual(placeLauncher({position, width: 1400, height: 1050}), position);
  assert.deepEqual(placeLauncher({position: null, fallback: size, width: 1400, height: 1050}), {right: 240, bottom: 50});
  assert.deepEqual(size, original); assert.equal(measure({width: 1400, height: 1050, size}).panelWidth, 580);
});

test("icon position storage accepts finite offsets and discards malformed or unrelated data", () => {
  for (const value of [null, undefined, {}, [], {right: "100", bottom: 20}, {right: Infinity, bottom: 20}, {right: 100, bottom: NaN}]) assert.equal(normalizePosition(value), null);
  assert.deepEqual(normalizePosition({right: 100.8, bottom: -40, width: 999, secret: "fixture"}), {right: 101, bottom: 12});
  assert.deepEqual(normalizePosition({right: 99999999, bottom: 99999999}), {right: 100000, bottom: 100000});
  assert.deepEqual(placeLauncher({width: 320, height: 200}), {right: 12, bottom: 16});
});

test("all viewports use a floating window without reserving any page space", () => {
  const screen = {width: 1400, height: 1050, open: true};
  const plan = measure(screen);
  assert.equal(plan.mode, "floating"); assert.equal(plan.panelWidth, 360); assert.equal(plan.panelHeight, 954); assert.equal(plan.reserved, 0);
  assert.equal(measure({...screen, open: false}).reserved, 0);
  assert.equal(measure({...screen, fullscreen: true}).reserved, 0);
  assert.equal(measure({...screen, fullscreen: true}).suppressed, true);
  for (const width of [320, 800, 1200, 1800, 3000]) {
    const item = measure({...screen, width});
    assert.equal(item.mode, "floating"); assert.equal(item.reserved, 0); assert.equal(item.leftLimit, 12);
  }
});

test("custom window sizes use the available viewport without changing the saved preference", () => {
  const size = {width: 640, height: 1000};
  const wide = measure({width: 1400, height: 1050, open: true, size});
  assert.equal(wide.panelWidth, 640); assert.equal(wide.panelHeight, 954); assert.equal(wide.reserved, 0);
  const small = measure({width: 390, height: 500, open: true, size});
  assert.equal(small.panelWidth, 366); assert.equal(small.panelHeight, 404);
  assert.deepEqual(size, {width: 640, height: 1000});
  const below = measure({width: 800, height: 844, playerBottom: 500, size});
  assert.equal(below.panelHeight, 316);
  assert.equal(measure({width: 800, height: 844, size: {width: 420, height: 700}}).panelHeight, 700);
  assert.deepEqual(normalizeSize({width: Infinity, height: "900"}), {width: 360, height: null});
  assert.deepEqual(normalizeSize({width: 100, height: 9999}), {width: 320, height: 9999});
  assert.deepEqual(normalizeSize(), {width: 360, height: null});
});

test("each edge follows the pointer and leaves the opposite edge fixed", () => {
  const rect = {left: 1000, right: 1500, top: 200, bottom: 900};
  for (const edge of ["n", "s", "w", "e", "nw", "ne", "sw", "se"]) {
    const dx = edge.includes("w") ? -80 : edge.includes("e") ? 80 : 0;
    const dy = edge.includes("n") ? -40 : edge.includes("s") ? 40 : 0;
    const size = {width: 500, height: 700, right: 300, bottom: 200, ...resize({rect, edge, dx, dy, width: 1800, height: 1100, leftLimit: 12})};
    const right = 1800 - size.right, bottom = 1100 - size.bottom;
    assert.equal(right - size.width, rect.left + (edge.includes("w") ? dx : 0), edge);
    assert.equal(right, rect.right + (edge.includes("e") ? dx : 0), edge);
    assert.equal(bottom - size.height, rect.top + (edge.includes("n") ? dy : 0), edge);
    assert.equal(bottom, rect.bottom + (edge.includes("s") ? dy : 0), edge);
  }
  const bounded = resize({rect, edge: "nw", dx: -9999, dy: -9999, width: 1800, height: 1100, leftLimit: 12});
  assert.equal(1800 - bounded.right - bounded.width, 12); assert.equal(1100 - bounded.bottom - bounded.height, 80);
});

test("free sizes can exceed the old caps and stored offsets remain inside the viewport", () => {
  const large = measure({width: 3000, height: 2400, open: true, size: {width: 1400, height: 2000}});
  assert.equal(large.panelWidth, 1400); assert.equal(large.panelHeight, 2000);
  for (const width of [390, 1200, 1800]) {
    const plan = measure({width, height: 844, open: true, playerBottom: 400, size: {width: 900, height: 900, right: 500, bottom: 500}});
    assert.ok(width - plan.right - plan.panelWidth >= plan.leftLimit);
    assert.ok(844 - plan.bottom - plan.panelHeight >= plan.topLimit);
    assert.equal(plan.reserved, 0); assert.equal(plan.mode, "floating");
  }
  assert.deepEqual(normalizeSize({width: 450, height: 600, right: 100, bottom: 80}), {width: 450, height: 600, right: 100, bottom: 80});
});

test("floating panels fit the viewport and leave room below a video when possible", () => {
  const plan = measure({width: 390, height: 844, open: true, playerBottom: 312});
  assert.equal(plan.mode, "floating"); assert.equal(plan.reserved, 0);
  assert.ok(plan.panelWidth <= 390 - 24);
  assert.ok(844 - 16 - plan.panelHeight >= 312 + 12);
  for (const [width, height] of [[800, 480], [320, 400], [1400, 400]]) {
    const item = measure({width, height, open: true});
    assert.ok(item.panelWidth <= width - 24); assert.ok(item.panelHeight <= height - (height < 480 ? 28 : 96));
  }
});

test("manual movement keeps size and clamps the title bar inside the viewport", () => {
  const rect = {left: 1000, top: 250, width: 400, height: 500};
  const size = move({rect, dx: -450, dy: -80, width: 1600, height: 1100});
  assert.deepEqual(size, {width: 400, height: 500, right: 650, bottom: 430, floating: true});
  const plan = measure({width: 1600, height: 1100, open: true, playerBottom: 700, size});
  assert.equal(plan.mode, "floating"); assert.equal(plan.reserved, 0); assert.equal(plan.right, 650); assert.equal(plan.bottom, 430); assert.equal(plan.topLimit, 80);
  const bounded = move({rect, dx: -9999, dy: -9999, width: 1600, height: 1100});
  assert.equal(1600 - bounded.right - bounded.width, 12); assert.equal(1100 - bounded.bottom - bounded.height, 80);
  const small = measure({width: 390, height: 600, open: true, size});
  assert.ok(small.right + small.panelWidth <= 378); assert.ok(small.bottom + small.panelHeight <= 520);
  assert.equal(normalizeSize(size).floating, true); assert.equal(normalizeSize().floating, undefined);
});
