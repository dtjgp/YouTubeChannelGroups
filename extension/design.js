/* Shared tokens and contrast calculations. Original YouTube colors remain available unchanged. */
(function (root) {
  "use strict";
  const clamp = (n, max = 255) => Math.min(max, Math.max(0, n));
  function parse(value) {
    if (typeof value !== "string") return null;
    if (/^#[\da-f]{3,8}$/i.test(value)) {
      let hex = value.slice(1);
      if ([3, 4].includes(hex.length)) hex = [...hex].map(c => c + c).join("");
      if (![6, 8].includes(hex.length)) return null;
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
    }
    const rgb = value.match(/^rgba?\((.+)\)$/i);
    if (rgb) {
      const parts = rgb[1].trim().split(/[\s,/]+/);
      if (parts.length < 3 || parts.length > 4) return null;
      const numbers = parts.map((p, i) => parseFloat(p) * (p.endsWith("%") ? (i === 3 ? .01 : 2.55) : 1));
      return numbers.every(Number.isFinite) ? numbers.slice(0, 3).map(n => clamp(n)).concat(clamp(numbers[3] ?? 1, 1)) : null;
    }
    const hsl = value.match(/^hsla?\((.+)\)$/i);
    if (hsl) {
      const p = hsl[1].trim().split(/[\s,/]+/), h = ((parseFloat(p[0]) % 360) + 360) % 360 / 60;
      const s = clamp(parseFloat(p[1]) / 100, 1), l = clamp(parseFloat(p[2]) / 100, 1);
      const a = p[3] === undefined ? 1 : parseFloat(p[3]) * (p[3].endsWith("%") ? .01 : 1);
      if (![h, s, l, a].every(Number.isFinite)) return null;
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
      return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)].map(n => (n + m) * 255).concat(clamp(a, 1));
    }
    return null;
  }
  const mix = (foreground, background) => foreground.slice(0, 3).map((v, i) => v * (foreground[3] ?? 1) + background[i] * (1 - (foreground[3] ?? 1))).concat(1);
  function luminance(rgb) {
    const linear = rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return linear.reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  }
  function ratio(a, b) { const l = [luminance(a), luminance(b)].sort((x, y) => x - y); return (l[1] + .05) / (l[0] + .05); }
  const cssColor = rgb => `rgb(${rgb.slice(0, 3).map(Math.round).join(", ")})`;
  function ensure(color, background, minimum) {
    const opaque = mix(color, background);
    if (ratio(opaque, background) >= minimum) return opaque;
    const end = ratio([0, 0, 0], background) >= ratio([255, 255, 255], background) ? [0, 0, 0] : [255, 255, 255];
    // Use a margin for rounding and retain the source hue as far as the requirement allows.
    let low = 0, high = 1;
    for (let n = 0; n < 22; n++) {
      const t = (low + high) / 2, value = opaque.map((v, i) => i < 3 ? v + (end[i] - v) * t : 1);
      if (ratio(value, background) >= minimum + .08) high = t; else low = t;
    }
    return opaque.map((v, i) => i < 3 ? Math.round(v + (end[i] - v) * high) : 1);
  }
  function surfaces(theme, resolve = value => parse(value)) {
    const base = theme.mode === "dark" ? [15, 15, 15, 1] : [255, 255, 255, 1];
    const read = (key, fallback) => resolve(theme.colors[key]) || fallback;
    const surface = mix(read("bg", base), base), raised = mix(read("card", surface), surface);
    // One reading surface avoids unknown backgrounds behind text. Glass is confined to the frame.
    const ink = ensure(read("ink", base), surface, 7);
    const values = {surface, raised,
      text: ink, mutedText: ensure(read("muted", ink), surface, 4.5),
      accentText: ensure(read("accent", ink), surface, 4.5),
      dangerText: ensure(read("danger", ink), surface, 4.5),
      controlLine: ensure(read("line", ink), surface, 3),
      focusRing: ensure(read("focus", ink), surface, 3),
      raisedText: ensure(read("ink", ink), raised, 7),
      raisedMuted: ensure(read("muted", ink), raised, 4.5),
      raisedAccent: ensure(read("accent", ink), raised, 4.5),
      raisedDanger: ensure(read("danger", ink), raised, 4.5),
      raisedLine: ensure(read("line", ink), raised, 3),
      raisedFocus: ensure(read("focus", ink), raised, 3),
      selection: ink, selectionText: ensure(surface, ink, 7)};
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/[A-Z]/g, c => "-" + c.toLowerCase()), cssColor(value)]));
  }
  const tokens = `
@layer ycg.tokens, ycg.base, ycg.components, ycg.states, ycg.preferences;
@layer ycg.tokens {
  :host, :root {
    --ycg-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    --ycg-type: max(14px, .875rem);
    --ycg-small: calc(var(--ycg-type) * .93);
    --ycg-title: calc(var(--ycg-type) * 1.43);
    --ycg-gap: 8px; --ycg-radius: 10px; --ycg-target: 32px;
    --surface: #fff; --raised: #fff; --text: #0f0f0f; --muted-text: #555;
    --accent-text: #065fd4; --danger-text: #b00000; --control-line: #777; --focus-ring: #065fd4;
    --raised-text: #0f0f0f; --raised-muted: #555; --raised-accent: #065fd4; --raised-danger: #b00000; --raised-line: #777; --raised-focus: #065fd4;
    --selection: #0f0f0f; --selection-text: #fff;
  }
}
`;
  root.YCGDesign = {parse, mix, luminance, ratio, ensure, surfaces, tokens};
  if (typeof module !== "undefined") module.exports = root.YCGDesign;
})(globalThis);
