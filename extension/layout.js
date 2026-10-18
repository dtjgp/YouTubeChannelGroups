/* Floating window geometry. The YouTube document keeps its original layout. */
(function (root) {
  "use strict";
  const KEY = "ycg.panel-size.v1";
  const LAUNCHER_KEY = "ycg.launcher-position.v1";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function normalizePosition(value) {
    if (!value || !Number.isFinite(value.right) || !Number.isFinite(value.bottom)) return null;
    return {right: Math.round(clamp(value.right, 12, 100000)), bottom: Math.round(clamp(value.bottom, 12, 100000))};
  }
  function placeLauncher({position, fallback, width, height, iconWidth = 44, iconHeight = 44}) {
    const saved = normalizePosition(position) || normalizePosition(fallback) || {right: 12, bottom: 16};
    return {right: clamp(saved.right, 12, Math.max(12, width - iconWidth - 12)), bottom: clamp(saved.bottom, 12, Math.max(12, height - iconHeight - 12))};
  }
  function moveLauncher({rect, dx, dy, width, height}) {
    return normalizePosition(placeLauncher({position: {right: width - rect.x - rect.width - dx, bottom: height - rect.y - rect.height - dy}, width, height, iconWidth: rect.width, iconHeight: rect.height}));
  }
  function normalizeSize(value) {
    const bounded = (number, fallback, min, max) => typeof number === "number" && Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
    const size = {width: bounded(value?.width, 360, 320, 100000), height: bounded(value?.height, null, 360, 100000)};
    for (const [key, fallback] of [["right", 12], ["bottom", 16]]) {
      const offset = bounded(value?.[key], fallback, fallback, 100000);
      if (offset !== fallback) size[key] = offset;
    }
    if (value?.floating === true) size.floating = true;
    return size;
  }
  function measure({width, height, fullscreen = false, playerBottom = 0, size}) {
    size = normalizeSize(size);
    const mode = "floating", wide = width >= 1200, leftLimit = 12;
    const right = clamp(size.right ?? 12, 12, Math.max(12, width - leftLimit - Math.min(320, width - leftLimit - 12)));
    const maxWidth = Math.max(0, width - leftLimit - right);
    const panelWidth = Math.min(size.width, maxWidth);
    const avoidPlayer = !wide && !size.floating && playerBottom > 0 && height - playerBottom - 28 >= 260;
    const topLimit = height < 480 ? 12 : avoidPlayer ? Math.max(80, playerBottom + 12) : 80;
    const minHeight = Math.min(360, Math.max(0, height - topLimit - 16));
    const bottom = clamp(size.bottom ?? 16, 16, Math.max(16, height - topLimit - minHeight));
    const maxHeight = Math.floor(Math.max(0, height - topLimit - bottom));
    const autoHeight = wide ? maxHeight : Math.min(680, height * .68);
    const panelHeight = Math.floor(Math.min(maxHeight, size.height ?? autoHeight));
    return {mode, panelWidth, panelHeight, maxWidth, maxHeight, right, bottom, leftLimit, topLimit, reserved: 0, suppressed: fullscreen};
  }
  function resize({rect, edge, dx, dy, width, height, leftLimit = 12, topLimit = 80}) {
    let {left, right, top, bottom} = rect;
    if (edge.includes("w")) left = clamp(left + dx, leftLimit, right - Math.min(320, Math.max(0, right - leftLimit)));
    if (edge.includes("e")) right = clamp(right + dx, left + Math.min(320, Math.max(0, width - 12 - left)), width - 12);
    if (edge.includes("n")) top = clamp(top + dy, topLimit, bottom - Math.min(360, Math.max(0, bottom - topLimit)));
    if (edge.includes("s")) bottom = clamp(bottom + dy, top + Math.min(360, Math.max(0, height - 16 - top)), height - 16);
    const result = {};
    if (/[we]/.test(edge)) { result.width = Math.round(right - left); result.right = Math.round(width - right); }
    if (/[ns]/.test(edge)) { result.height = Math.round(bottom - top); result.bottom = Math.round(height - bottom); }
    return result;
  }
  function move({rect, dx, dy, width, height}) {
    const panelWidth = Math.min(rect.width, Math.max(0, width - 24)), panelHeight = Math.min(rect.height, Math.max(0, height - (height < 480 ? 24 : 96)));
    const left = clamp(rect.left + dx, 12, Math.max(12, width - panelWidth - 12));
    const topLimit = height < 480 ? 12 : 80;
    const top = clamp(rect.top + dy, topLimit, Math.max(topLimit, height - panelHeight - 16));
    return {width: Math.round(panelWidth), height: Math.round(panelHeight), right: Math.round(width - left - panelWidth), bottom: Math.round(height - top - panelHeight), floating: true};
  }
  const pageCSS = `
html[data-ycg-resizing], html[data-ycg-resizing] * { cursor: var(--ycg-resize-cursor) !important; user-select: none !important; }
`;
  function attach({host, panel, dock, onMode, onMeasure, document = root.document, view = root}) {
    let open = false, scheduled = false, last = "", video, size = normalizeSize(), bounds, launcherPosition = null;
    // Remove only reservation markers owned by earlier extension versions.
    document.documentElement.removeAttribute("data-ycg-layout");
    document.documentElement.style.removeProperty("--ycg-reserved-width");
    const videoResize = new view.ResizeObserver(schedule);
    const coarsePointer = view.matchMedia?.("(pointer: coarse)");
    function update() {
      const visibleVideo = !open ? undefined : video?.isConnected ? video : [...document.querySelectorAll("video")].find(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < view.innerHeight; });
      if (video !== visibleVideo) { videoResize.disconnect(); video = visibleVideo; if (video) videoResize.observe(video); }
      const box = video?.getBoundingClientRect();
      const plan = measure({width: view.innerWidth, height: view.innerHeight, fullscreen: !!document.fullscreenElement, playerBottom: /^\/(watch|shorts)(?:\/|$)/.test(view.location.pathname) && box ? box.bottom : 0, size});
      dock.hidden = open || plan.suppressed;
      const minimized = dock.hasAttribute("data-minimized"), iconSize = coarsePointer?.matches ? 48 : 44;
      const iconPlan = placeLauncher({position: launcherPosition, fallback: plan, width: view.innerWidth, height: view.innerHeight, iconWidth: iconSize, iconHeight: iconSize});
      const signature = JSON.stringify({...plan, open, size, minimized, iconPlan});
      if (signature === last) return;
      last = signature;
      bounds = plan;
      panel.dataset.layout = plan.mode;
      host.toggleAttribute("data-ycg-suppressed", plan.suppressed);
      host.style.setProperty("--ycg-panel-width", plan.panelWidth + "px");
      host.style.setProperty("--ycg-panel-height", plan.panelHeight + "px");
      host.style.setProperty("--ycg-panel-right", plan.right + "px");
      host.style.setProperty("--ycg-panel-bottom", plan.bottom + "px");
      host.style.setProperty("--ycg-launcher-right", iconPlan.right + "px");
      host.style.setProperty("--ycg-launcher-bottom", iconPlan.bottom + "px");
      // The launcher does not need to cover content while the panel is open.
      dock.hidden = open || plan.suppressed;
      onMode?.(plan.mode);
      onMeasure?.(plan, size);
    }
    function schedule() { if (!scheduled) { scheduled = true; view.requestAnimationFrame(() => { scheduled = false; update(); }); } }
    view.addEventListener("resize", schedule, {passive: true});
    coarsePointer?.addEventListener("change", schedule);
    view.addEventListener("scroll", () => { if (open && !size.floating && panel.dataset.layout === "floating") schedule(); }, {passive: true});
    for (const event of ["fullscreenchange", "yt-navigate-finish", "loadedmetadata"]) document.addEventListener(event, schedule, true);
    update();
    return {setOpen(value) { open = value; update(); }, setSize(value) { size = normalizeSize(value); schedule(); }, setLauncherPosition(value) { launcherPosition = normalizePosition(value); schedule(); }, get launcherPosition() { return launcherPosition ? {...launcherPosition} : null; }, update: schedule, get mode() { return panel.dataset.layout; }, get size() { return {...size}; }, get bounds() { return {...bounds}; }};
  }
  root.YCGLayout = {KEY, LAUNCHER_KEY, normalizePosition, placeLauncher, moveLauncher, normalizeSize, measure, resize, move, attach, pageCSS};
  if (typeof module !== "undefined") module.exports = root.YCGLayout;
})(globalThis);
