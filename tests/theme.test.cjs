const {test} = require("node:test");
const assert = require("node:assert/strict");
const Theme = require("../extension/theme.js");

test("theme snapshots accept only bounded color values and strip unrelated data", () => {
  const theme = Theme.fallback(true);
  assert.equal(Theme.validate({...theme, sourceTabId: 1, secret: "test-only"}).secret, undefined);
  for (const invalid of [null, {...theme, mode: "automatic"}, {...theme, colors: {}}, {...theme, colors: {...theme.colors, bg: "red; background:url(https://invalid.test)"}}, {...theme, colors: {...theme.colors, ink: "var(--unsafe)"}}]) assert.throws(() => Theme.validate(invalid));
  assert.notEqual(Theme.fallback().colors.bg, theme.colors.bg);
});

test("rendered YouTube colors take precedence over the operating system and support both token generations", () => {
  let darkAttribute = false, background = "rgb(255, 255, 255)";
  const values = {"--yt-spec-text-primary": "#111111", "--yt-sys-color-baseline--text-secondary": "#666666"};
  const html = {hasAttribute: name => name === "dark" && darkAttribute};
  const document = {documentElement: html, body: {}, querySelector() { return null; }};
  const view = {getComputedStyle() { return {backgroundColor: background, getPropertyValue(name) { return values[name] || ""; }}; }, CSS: {supports() { return true; }}, matchMedia() { return {matches: true}; }};
  const light = Theme.read(document, view);
  assert.equal(light.mode, "light"); assert.equal(light.colors.bg, background);
  assert.equal(light.colors.ink, "#111111"); assert.equal(light.colors.muted, "#666666");
  darkAttribute = true; background = "rgb(15, 15, 15)";
  assert.equal(Theme.read(document, view).mode, "dark");
  darkAttribute = false; background = "rgb(255, 255, 0)";
  assert.equal(Theme.read(document, view).colors.bg, background);
});
