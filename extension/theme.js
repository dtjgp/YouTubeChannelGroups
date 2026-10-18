/* YouTube colors are read from the rendered page, never from account data. */
(function (root) {
  "use strict";
  const KEY = "ycg.theme.v1";
  const light = {bg: "#ffffff", card: "#ffffff", ink: "#0f0f0f", muted: "#606060", line: "rgba(0,0,0,0.2)", accent: "#065fd4", soft: "rgba(0,0,0,0.05)", hover: "rgba(0,0,0,0.1)", selected: "#0f0f0f", onSelected: "#ffffff", danger: "#c00", focus: "#065fd4"};
  const dark = {bg: "#0f0f0f", card: "#212121", ink: "#f1f1f1", muted: "#aaaaaa", line: "rgba(255,255,255,0.2)", accent: "#3ea6ff", soft: "rgba(255,255,255,0.1)", hover: "rgba(255,255,255,0.2)", selected: "#f1f1f1", onSelected: "#0f0f0f", danger: "#ff4e45", focus: "#3ea6ff"};
  const keys = Object.keys(light);
  function color(value) {
    return typeof value === "string" && value.length <= 80 && (/^#[a-f\d]{3,8}$/i.test(value) || /^(?:rgb|hsl)a?\([\d\s.,%/+\-deg]+\)$/i.test(value) || (/^[a-z]{3,30}$/i.test(value) && !/^(transparent|inherit|initial|unset|revert|currentcolor)$/i.test(value)));
  }
  function validate(value) {
    if (!value || !["light", "dark"].includes(value.mode) || !value.colors || keys.some(key => !color(value.colors[key]))) throw new Error("无效的 YouTube 主题");
    return {mode: value.mode, colors: Object.fromEntries(keys.map(key => [key, value.colors[key]]))};
  }
  function fallback(darkMode = false) { return {mode: darkMode ? "dark" : "light", colors: {...(darkMode ? dark : light)}}; }
  function apply(element, value) {
    const theme = validate(value);
    element.setAttribute("data-ycg-theme", theme.mode);
    element.style.setProperty("color-scheme", theme.mode);
    for (const key of keys) element.style.setProperty("--" + key, theme.colors[key]);
    if (root.YCGDesign) {
      const resolve = value => {
        const parsed = root.YCGDesign.parse(value);
        if (parsed || !element.ownerDocument?.body) return parsed;
        const probe = element.ownerDocument.createElement("span");
        probe.style.color = value; probe.hidden = true; element.ownerDocument.body.append(probe);
        const result = root.YCGDesign.parse(element.ownerDocument.defaultView.getComputedStyle(probe).color);
        probe.remove(); return result;
      };
      for (const [key, color] of Object.entries(root.YCGDesign.surfaces(theme, resolve))) element.style.setProperty("--" + key, color);
    }
  }
  function read(document, view) {
    const html = document.documentElement, app = document.querySelector("ytd-app");
    const styles = [app, document.body, html].filter(Boolean).map(element => view.getComputedStyle(element));
    const usable = value => color(value) && view.CSS.supports("color", value);
    const background = styles.map(style => style.backgroundColor).find(value => usable(value) && !/^rgba\(.*[,/]\s*0(?:\.0*)?\s*\)$/.test(value));
    const components = background?.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const isDark = html.hasAttribute("dark") || (components ? (+components[1] * .2126 + +components[2] * .7152 + +components[3] * .0722) < 128 : view.matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = fallback(isDark), colors = theme.colors;
    function pick(names, defaultValue) {
      for (const name of names) for (const style of styles) {
        const value = style.getPropertyValue(name).trim();
        if (usable(value)) return value;
      }
      return defaultValue;
    }
    colors.bg = background || pick(["--yt-spec-base-background", "--yt-sys-color-baseline--base-background"], colors.bg);
    colors.card = pick(["--yt-spec-menu-background", "--yt-spec-raised-background", "--yt-sys-color-baseline--raised-background"], colors.card);
    colors.ink = pick(["--yt-spec-text-primary", "--yt-sys-color-baseline--text-primary"], colors.ink);
    colors.muted = pick(["--yt-spec-text-secondary", "--yt-sys-color-baseline--text-secondary"], colors.muted);
    colors.line = pick(["--yt-spec-outline", "--yt-sys-color-baseline--solid-rim"], colors.line);
    colors.accent = pick(["--yt-spec-call-to-action", "--yt-sys-color-baseline--call-to-action"], colors.accent);
    colors.soft = pick(["--yt-spec-badge-chip-background", "--yt-sys-color-baseline--button-chip-background"], colors.soft);
    colors.hover = pick(["--yt-spec-button-chip-background-hover", "--yt-sys-color-baseline--button-chip-background-hover"], colors.hover);
    colors.danger = pick(["--yt-spec-error-indicator", "--yt-sys-color-baseline--error-indicator", "--yt-deprecated-brand-light-red"], colors.danger);
    colors.selected = colors.ink; colors.onSelected = colors.bg; colors.focus = colors.accent;
    return theme;
  }
  function watchYouTube(element, publish, document = root.document, view = root) {
    let frame, signature = "", published = "", stopped = false;
    function sync(force = false, activated = false) {
      if (stopped) return;
      const theme = read(document, view), next = JSON.stringify(theme);
      if (signature !== next) { apply(element, theme); signature = next; }
      if (force || published !== next) {
        published = next;
        Promise.resolve(publish(theme, activated || (document.visibilityState !== "hidden" && document.hasFocus()))).catch(() => { published = ""; });
      }
    }
    function schedule() { if (!frame && !stopped) { frame = true; view.requestAnimationFrame(() => { frame = false; sync(); }); } }
    const observer = new view.MutationObserver(schedule);
    for (const target of [document.documentElement, document.body, document.querySelector("ytd-app")].filter(Boolean)) observer.observe(target, {attributes: true, attributeFilter: ["dark", "light", "class", "style", "color-version", "darker-dark-theme"]});
    if (document.head) observer.observe(document.head, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href", "media", "disabled"]});
    const media = view.matchMedia("(prefers-color-scheme: dark)");
    const active = () => sync(true);
    media.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", active); view.addEventListener("focus", active);
    document.addEventListener("yt-navigate-finish", schedule);
    // CSSOM-only edits have no DOM mutation event.
    const timer = view.setInterval(() => { if (document.visibilityState !== "hidden") sync(); }, 1000);
    sync();
    return {sync: () => sync(true, true), disconnect() { stopped = true; observer.disconnect(); view.clearInterval(timer); media.removeEventListener("change", schedule); document.removeEventListener("visibilitychange", active); view.removeEventListener("focus", active); document.removeEventListener("yt-navigate-finish", schedule); }};
  }
  const api = {KEY, fallback, validate, apply, read, watchYouTube};
  root.YCGTheme = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
