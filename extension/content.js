(async function () {
  "use strict";
  if (document.getElementById("ycg-root")) return;
  const Core = globalThis.YCGCore, Dom = globalThis.YCGDom, I = globalThis.YCGI18n;
  let state = Core.empty(), selected = "all", search = "", channelPage = 0;
  let privacy = {epoch: null, collectionPaused: false}, renderTicket = 0, renderFrame = 0, groupsSignature = "", filterTicket = 0;
  let scanTimer, scanning = false, lastScan = "", busy = false;
  let resizeSession = null, sizeSaveTimer, sizeWrites = 0, sizeSaveId = 0;
  let minimized = false, loadingAll = false;
  let initialized = false, openWhenReady = false;
  let launcherSession = null, suppressLauncherClick = false, launcherSaveTimer, launcherWrites = 0, launcherSaveId = 0;
  const host = document.createElement("div");
  host.id = "ycg-root";
  host.lang = I.language;
  document.body.append(host);
  const shadow = host.attachShadow({mode: "open"});

  let controlId = 0;
  function node(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "localize") continue;
      if (key === "text") {
        const target = children.length ? document.createElement("span") : element;
        if (attributes.localize === false) target.textContent = value; else I.set(target, "textContent", value);
        if (children.length) element.append(target);
      }
      else if (key.startsWith("on")) element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (["aria-label", "placeholder", "title"].includes(key) && attributes.localize !== false) I.set(element, key, value);
      else element.setAttribute(key, value);
    }
    element.append(...children);
    if (tag === "label") {
      const control = element.querySelector("input, select, textarea");
      if (control) { control.id ||= `ycg-control-${++controlId}`; element.htmlFor = control.id; }
    }
    return element;
  }
  // The shadow root is open, so YouTube's own scripts can reach these buttons. Actions that spend AI quota,
  // change subscriptions or remove data ignore synthetic clicks (isTrusted is false for element.click()).
  const button = (text, onClick, {privileged = false, ...attributes} = {}) => node("button", {type: "button", text, ...attributes,
    onClick: privileged ? event => { if (event.isTrusted) return onClick(event); } : onClick});
  const link = (text, href, attributes = {}) => node("a", {text, href, ...attributes});
  const css = node("style", {text: globalThis.YCGStyles});
  const pageCss = node("style", {text: "[data-ycg-hidden] { display: none !important; }" + YCGLayout.pageCSS});
  document.documentElement.append(pageCss);
  const status = node("div", {class: "status", role: "status", "aria-live": "polite", text: "正在读取本地分类…"});
  const feedStatus = node("p", {class: "feed-status"});
  const chips = node("div", {class: "chips", role: "group", "aria-label": "按分类筛选"});
  const channelList = node("ul", {id: "ycg-channels", tabindex: "-1", class: "channel-list", "aria-label": "频道列表"});
  const count = node("p", {class: "count"});
  const groupList = node("div");
  const searchInput = node("input", {id: "ycg-channel-search", type: "search", maxlength: "200", placeholder: "搜索频道名称或 @handle", "aria-label": "搜索频道", onInput: event => {
    search = event.target.value; channelPage = 0; render();
  }});
  const launcherText = node("span", {text: "频道分类"});
  const launcher = node("button", {type: "button", onClick: event => {
    if (event.detail > 0 && suppressLauncherClick) { suppressLauncherClick = false; event.preventDefault(); return; }
    suppressLauncherClick = false; openPanel();
  }, class: "launcher", disabled: "", "aria-label": "频道分类", "aria-expanded": "false", "aria-controls": "ycg-panel"}, [
    node("img", {src: chrome.runtime.getURL("icons/icon48.png"), width: "24", height: "24", alt: ""}), launcherText
  ]);
  const reset = button("显示全部", () => choose("all"), {hidden: ""});
  const dock = node("div", {class: "dock"}, [launcher]);
  const launcherHelp = node("span", {id: "ycg-launcher-help", class: "sr-only", text: "拖动小图标或使用方向键移动；Shift 加快；Home 复位；Enter 或空格恢复窗口。"});
  const minimize = node("button", {type: "button", onClick: () => minimizePanel(), class: "window-control minimize", "aria-label": "最小化分类窗口", title: "最小化分类窗口"});
  const minimizeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({viewBox: "0 0 20 20", width: "20", height: "20", "aria-hidden": "true", focusable: "false"})) minimizeIcon.setAttribute(key, value);
  const minimizePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [key, value] of Object.entries({d: "M5 10h10", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round"})) minimizePath.setAttribute(key, value);
  minimizeIcon.append(minimizePath); minimize.append(minimizeIcon);
  // Shows the target language. The choice is saved and syncs to other tabs and the settings page.
  const languageToggle = node("button", {type: "button", class: "window-control language-toggle", lang: "en", localize: false, onClick: async () => {
    const next = I.language === "en" ? "zh-CN" : "en";
    languageToggle.disabled = true;
    try { I.change((await call({type: "preferencesSave", preferences: {language: next}})).preferences.language); say("界面语言已保存"); }
    catch (error) { say(error.message, true); }
    finally { languageToggle.disabled = false; }
  }});
  function updateLanguageToggle() {
    const english = I.language === "en";
    languageToggle.textContent = english ? "中" : "EN"; languageToggle.lang = english ? "zh-CN" : "en";
    // The accessible name starts with the visible text (WCAG 2.5.3 label in name).
    languageToggle.setAttribute("aria-label", english ? "中：切换到中文" : "EN: Switch to English");
    languageToggle.title = english ? "切换到中文" : "Switch to English";
  }
  updateLanguageToggle();
  const close = node("button", {type: "button", onClick: () => closePanel(), class: "close", "aria-label": "关闭分类面板"});
  const closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({viewBox: "0 0 20 20", width: "20", height: "20", "aria-hidden": "true", focusable: "false"})) closeIcon.setAttribute(key, value);
  const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [key, value] of Object.entries({d: "m6 6 8 8m0-8-8 8", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round"})) closePath.setAttribute(key, value);
  closeIcon.append(closePath); close.append(closeIcon);
  const layoutLabel = node("p", {class: "layout-label muted"});
  const panel = node("section", {class: "panel", id: "ycg-panel", "aria-label": "频道分类面板", hidden: ""});
  const resizeLabels = {n: "调整上边框大小", s: "调整下边框大小", w: "调整左边框大小", e: "调整右边框大小", nw: "调整大小：拖动或使用方向键", ne: "调整右上角大小", sw: "调整左下角大小", se: "调整右下角大小"};
  const windowHelp = node("p", {id: "ycg-window-help", class: "sr-only", text: "方向键移动或调整；Shift 加快；Enter 或空格恢复默认；Esc 关闭或取消拖动。"});
  const resizeHandles = Object.entries(resizeLabels).map(([edge, label]) => button("", event => { if (event.detail === 0) { layout.setSize(); scheduleSizeSave(); } }, {class: "resize-edge", "data-edge": edge, tabindex: edge === "nw" ? "0" : "-1", "aria-label": label, "aria-describedby": "ycg-window-help", title: "拖动边框调整大小；双击恢复默认"}));
  const previousChannels = button("上一页频道", () => { channelPage--; render(); });
  const nextChannels = button("下一页频道", () => { channelPage++; render(); });
  const channelPageLabel = node("span", {class: "muted", role: "status"});
  const channelPagination = node("nav", {class: "channel-pagination", "aria-label": "频道翻页"}, [previousChannels, channelPageLabel, nextChannels]);
  const createInput = node("input", {id: "ycg-new-category", type: "text", maxlength: "40", placeholder: "例如：AI、编程、音乐", "aria-label": "新分类名称", required: ""});
  const createForm = node("form", {class: "group-form", onSubmit: event => {
    event.preventDefault();
    run(async () => { await mutate({type: "createGroup", name: createInput.value}); createInput.value = ""; }, "分类已创建");
  }}, [createInput, node("button", {type: "submit", class: "primary", text: "创建"})]);
  const collectButton = button("收集已加载频道", () => run(async () => { if (privacy.collectionPaused) privacy = (await call({type: "privacyResume"})).privacy; await scan(true); }, "频道已收集；继续滚动可发现更多"));
  const coverage = node("p", {class: "muted coverage", role: "status", hidden: ""});
  const loadAllButton = button("自动加载全部订阅", () => loadAllChannels(), {privileged: true, title: "自动滚动订阅频道列表，直到不再加载新频道"});
  async function loadAllChannels(trigger = loadAllButton) {
    if (loadingAll) { loadingAll = false; I.set(trigger, "textContent", "正在停止…"); return null; }
    if (location.pathname.replace(/\/$/, "") !== "/feed/channels") { say("请先打开订阅频道列表", true); return null; }
    const epoch = privacy.epoch;
    loadingAll = true; I.set(trigger, "textContent", trigger === syncButton ? "停止刷新" : "停止自动加载"); coverage.hidden = false; syncReview.hidden = true;
    I.set(coverage, "textContent", "正在自动加载订阅频道…");
    try {
      if (privacy.collectionPaused) privacy = (await call({type: "privacyResume"})).privacy;
      const result = await Dom.loadAll(document, window, {
        shouldContinue: () => loadingAll && epoch === privacy.epoch && location.pathname.replace(/\/$/, "") === "/feed/channels",
        onProgress: count => I.set(coverage, "textContent", `正在自动加载订阅频道：已加载 ${count} 个…`)
      });
      if (epoch !== privacy.epoch) throw new Error("数据已删除，旧操作已取消；请重新开始");
      await scan(true);
      const text = result.complete ? `已到列表底部：已收集全部 ${result.count} 个订阅频道。`
        : result.stopped ? `已停止自动加载：已加载 ${result.count} 个频道，列表可能未完。` : `列表可能未完：已加载 ${result.count} 个频道。可稍后再次自动加载。`;
      I.set(coverage, "textContent", text); say(text);
      return result;
    } catch (error) { I.set(coverage, "textContent", error.message); say(error.message, true); return null; }
    finally { loadingAll = false; I.set(loadAllButton, "textContent", "自动加载全部订阅"); I.set(syncButton, "textContent", "刷新订阅"); }
  }
  // Refresh: load the whole subscription list, then offer to remove saved channels that are no longer in it.
  // Nothing is suggested unless the list reached its end, and nothing is removed without confirmation.
  const syncButton = button("刷新订阅", () => syncSubscriptions(), {privileged: true, title: "加载完整的订阅列表，找出已取消关注的频道"});
  const syncReview = node("section", {class: "sync-review", "aria-label": "已不在订阅列表中的频道", hidden: ""});
  async function syncSubscriptions() {
    if (loadingAll) { loadAllChannels(syncButton); return; }
    if (location.pathname.replace(/\/$/, "") !== "/feed/channels") {
      try { await call({type: "pendingSet", pending: {action: "sync"}}); } catch (error) { say(error.message, true); return; }
      say("正在打开订阅频道列表以刷新订阅…");
      location.assign("https://www.youtube.com/feed/channels");
      return;
    }
    const result = await loadAllChannels(syncButton);
    if (!result) return;
    if (!result.complete) { showSync(null, "订阅列表没有加载完整，无法判断哪些频道已取消关注。没有移除任何频道；可稍后再次刷新。"); return; }
    const cards = YCGUnsubscribe.subscribedCards(document);
    const present = new Set(cards.flatMap(item => item.aliases));
    if (!present.size) { showSync(null, "没有识别到订阅频道。请确认已登录 YouTube；没有移除任何频道。"); return; }
    // A record with no shared address may still be the same channel (for example, a changed handle).
    const titles = new Map(cards.map(item => [item.title.toLowerCase(), item])), avatars = new Map(cards.filter(item => item.avatarUrl).map(item => [item.avatarUrl, item]));
    const stale = state.channels.filter(channel => !channel.aliases.some(alias => present.has(alias)))
      .map(channel => ({channel, twin: titles.get(channel.title.toLowerCase()) || (channel.avatarUrl && avatars.get(channel.avatarUrl)) || null}));
    showSync(stale, stale.length ? `有 ${stale.length} 个已保存的频道不在你当前的订阅列表中。勾选要从扩展中移除的频道；默认不勾选。` : "已刷新：扩展中的频道都仍在订阅列表中。");
  }
  function showSync(stale, message) {
    const items = (stale || []).map(({channel, twin}) => {
      const input = node("input", {type: "checkbox", "aria-label": `移除 ${channel.title}`, "data-channel": channel.id});
      const notes = [channel.groupIds.length ? `属于 ${channel.groupIds.length} 个分类` : "未分类"];
      if (twin) notes.push(`可能与列表中的 ${twin.id} 是同一频道（地址已变化），建议保留`);
      return node("li", {class: "sync-item"}, [node("label", {class: "row"}, [input, createYCGAvatar(node, channel), node("span", {text: channel.title, localize: false}), node("span", {class: "muted", text: channel.id, localize: false})]),
        node("p", {class: twin ? "muted danger" : "muted", text: notes.map(note => I.t(note)).join(" · "), localize: false})]);
    });
    const children = [node("p", {text: message})];
    if (items.length) {
      if (items.length > state.channels.length / 2) children.push(node("p", {class: "danger", text: "超过一半的已保存频道不在列表中。请确认已登录正确的 YouTube 账号。"}));
      children.push(node("p", {class: "muted", text: "通过“加入当前频道”添加、但从未订阅的频道也会出现在这里。移除会同时删除它们的分类归属。"}),
        node("ul", {class: "sync-list"}, items),
        node("div", {class: "tools"}, [
          button("移除所选频道", () => {
            const channelIds = [...syncReview.querySelectorAll("input[data-channel]:checked")].map(input => input.dataset.channel);
            if (!channelIds.length) { say("请先勾选要移除的频道", true); return; }
            run(async () => { await mutate({type: "removeChannels", channelIds}); syncReview.hidden = true; }, `已从扩展中移除 ${channelIds.length} 个频道`);
          }, {class: "primary", privileged: true}),
          button("全部保留", () => { syncReview.hidden = true; say("已保留全部频道"); })
        ]));
    }
    syncReview.replaceChildren(...children);
    syncReview.hidden = false;
    say(message, !stale);
  }
  const currentButton = button("加入当前频道", () => run(async () => {
    const channel = Dom.current(document, location.pathname);
    if (!channel) throw new Error("请先打开一个 YouTube 频道主页");
    await mutate({type: "collect", channels: [channel]});
  }, "当前频道已加入本地列表"));
  let assistantGeneration = 0;
  function makeAssistant() {
    const generation = ++assistantGeneration;
    const current = () => generation === assistantGeneration;
    const guardedCall = async message => { if (!current()) throw new Error("数据已删除，旧操作已取消；请重新开始"); const result = await call(message); if (!current()) throw new Error("数据已删除，旧操作已取消；请重新开始"); return result; };
    return createYCGAssistant({node, button, call: guardedCall, getState: () => state, mutate: async action => { if (!current()) throw new Error("数据已删除，旧操作已取消；请重新开始"); await mutate(action); }, say: (...args) => { if (current()) say(...args); }, showReview: open => { if (current()) showReview(open); }});
  }
  let assistant = makeAssistant();
  const assistantHome = node("div", {class: "assistant-home"}, [assistant.element]);
  const fileInput = node("input", {type: "file", accept: ".json,application/json", hidden: "", "aria-label": "选择分类备份", onChange: event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const importEpoch = privacy.epoch;
    run(async () => {
      if (file.size > Core.MAX_BYTES) throw new Error("备份过大，最多 4 MB");
      const incoming = JSON.parse(await file.text());
      if (privacy.epoch !== importEpoch) throw new Error("数据已删除，旧操作已取消；请重新开始");
      await mutate({type: "merge", state: incoming});
    }, "备份已合并，保留了现有分类");
  }});
  const exportFormat = node("select", {"aria-label": "导出格式"}, [node("option", {value: "json", text: "JSON 备份"}), node("option", {value: "csv", text: "CSV 表格"}), node("option", {value: "markdown", text: "Markdown 笔记"})]);
  const head = node("header", {class: "head", role: "group", tabindex: "0", "aria-describedby": "ycg-window-help", "aria-label": "移动面板：拖动标题栏或使用方向键", title: "拖动标题栏移动；双击恢复默认位置"}, [node("div", {}, [
      node("p", {class: "eyebrow", text: "YouTube"}),
      node("h2", {text: "频道分类"}), layoutLabel
    ]), node("div", {class: "head-actions"}, [languageToggle, minimize, close])]);
  panel.append(head,
    node("div", {class: "body"}, [link("跳到频道列表", "#ycg-channels", {class: "skip-link", onClick: event => { event.preventDefault(); channelList.focus(); }}),
      node("div", {class: "intro"}, [node("strong", {text: "从你的订阅频道开始"}), node("p", {text: "打开订阅列表，滚动加载频道。扩展会收集已加载的频道；然后在下方勾选分类。"}),
        node("nav", {class: "links", "aria-label": "YouTube 页面"}, [link("① 订阅频道列表 ↗", "https://www.youtube.com/feed/channels"), link("② 订阅视频 ↗", "https://www.youtube.com/feed/subscriptions")])
      ]),
      node("div", {class: "tools"}, [collectButton, loadAllButton, syncButton, currentButton]), coverage, syncReview,
      assistantHome,
      node("p", {class: "section-label", text: "我的分类"}), node("div", {class: "category-tools"}, [chips, reset]), feedStatus,
      node("label", {class: "control-label", for: "ycg-channel-search", text: "搜索频道"}), searchInput, count, channelList, channelPagination,
      node("details", {open: ""}, [node("summary", {text: "管理分类"}), node("label", {class: "control-label", for: "ycg-new-category", text: "新分类名称"}), createForm, groupList])
    ]),
    node("footer", {class: "footer"}, [node("details", {class: "footer-menu", open: ""}, [node("summary", {text: "备份与数据"}), node("div", {class: "tools"}, [
      exportFormat, button("导出备份", () => run(exportState, "备份已生成")),
      button("合并备份", () => fileInput.click()), button("数据与隐私", () => call({type: "openSettings"}).catch(error => say(error.message, true))),
      node("span", {class: "muted", text: "卸载前请备份"}), fileInput
    ])]), status]), windowHelp, ...resizeHandles
  );
  const body = panel.querySelector(".body"), footer = panel.querySelector(".footer");
  const compactHeight = matchMedia("(max-height: 600px)");
  const compactFooter = () => { panel.querySelector(".footer-menu").open = !compactHeight.matches; };
  compactHeight.addEventListener("change", compactFooter); compactFooter();
  const reviewSurface = node("div", {class: "ai-assistant review-surface", "data-review": ""});
  const reviewTitle = node("h3", {id: "ycg-review-title", tabindex: "-1", text: "分类审核工作台"});
  const reviewPane = node("div", {class: "review-pane", hidden: ""}, [node("div", {class: "review-heading"}, [button("返回分类与设置", () => showReview(false)), reviewTitle]), reviewSurface]);
  let reviewReturnFocus;
  panel.insertBefore(reviewPane, footer);
  function showReview(open) {
    if (open === panel.hasAttribute("data-review")) return;
    if (open) reviewReturnFocus = shadow.activeElement;
    panel.toggleAttribute("data-review", open);
    body.hidden = footer.hidden = open; reviewPane.hidden = !open;
    if (open) { assistant.element.open = true; [...assistant.element.children].filter(child => child.tagName !== "SUMMARY").forEach(child => reviewSurface.append(child)); }
    else assistant.element.append(...reviewSurface.children);
    if (!panel.hidden) {
      const target = open ? reviewTitle : reviewReturnFocus?.checkVisibility() && !reviewReturnFocus.disabled ? reviewReturnFocus : assistant.element.querySelector("summary");
      target?.focus({preventScroll: true});
    }
  }
  shadow.append(css, dock, panel, launcherHelp);
  const layout = YCGLayout.attach({host, panel, dock,
    onMeasure: (plan, size) => I.set(layoutLabel, "textContent", size.floating ? "浮动窗口 · 双击标题栏复位" : "悬浮窗口 · 拖动标题栏移动")
  });
  const theme = YCGTheme.watchYouTube(host, (theme, active) => call({type: "themeSet", theme, active}));

  function scheduleSizeSave() {
    clearTimeout(sizeSaveTimer);
    sizeSaveTimer = setTimeout(() => { sizeSaveTimer = null; saveSize(); }, 180);
  }
  async function saveSize() {
    const request = ++sizeSaveId;
    sizeWrites++;
    try { await call({type: "panelSizeSave", size: layout.size}); if (request === sizeSaveId) say("面板位置与尺寸已保存"); }
    catch (error) { if (request === sizeSaveId) say(error.message, true); }
    finally { sizeWrites--; }
  }
  function cancelResize() {
    if (!resizeSession) return;
    const previous = resizeSession; resizeSession = null;
    layout.setSize(previous.size);
    clearResizeCursor();
    if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id);
    restoreResizeFocus(previous);
    scheduleSizeSave();
  }
  function clearResizeCursor() {
    panel.removeAttribute("data-resizing"); document.documentElement.removeAttribute("data-ycg-resizing");
    document.documentElement.style.removeProperty("--ycg-resize-cursor");
  }
  function restoreResizeFocus(session) {
    if (shadow.activeElement !== session.handle) return;
    if (session.focus?.isConnected && !session.focus.matches(".resize-edge") && document.hasFocus()) session.focus.focus({preventScroll: true});
    else session.handle.blur();
  }
  function resizedSize(session, dx, dy) {
    return {...session.size, ...YCGLayout.resize({rect: session.rect, edge: session.edge, dx, dy, width: innerWidth, height: innerHeight, ...session.limits})};
  }
  const viewportChanged = session => session.viewport.width !== innerWidth || session.viewport.height !== innerHeight;
  async function saveLauncherPosition() {
    clearTimeout(launcherSaveTimer); launcherSaveTimer = null;
    const request = ++launcherSaveId; launcherWrites++;
    try { await call({type: "launcherPositionSave", position: layout.launcherPosition}); if (request === launcherSaveId) say("小图标位置已保存"); }
    catch (error) { if (request === launcherSaveId) say(error.message, true); }
    finally { launcherWrites--; }
  }
  function cancelLauncherDrag() {
    if (!launcherSession) return;
    const session = launcherSession; launcherSession = null;
    suppressLauncherClick = session.moved;
    layout.setLauncherPosition(session.position);
    dock.removeAttribute("data-dragging"); clearResizeCursor();
    if (launcher.hasPointerCapture(session.id)) launcher.releasePointerCapture(session.id);
  }
  launcher.addEventListener("dragstart", event => event.preventDefault());
  launcher.addEventListener("pointerdown", event => {
    if (!minimized || event.button !== 0 || launcherSession) return;
    suppressLauncherClick = false;
    if (launcherSaveTimer) saveLauncherPosition();
    launcherSession = {id: event.pointerId, x: event.clientX, y: event.clientY, rect: launcher.getBoundingClientRect(), viewport: {width: innerWidth, height: innerHeight}, position: layout.launcherPosition, moved: false};
    launcher.focus({preventScroll: true}); launcher.setPointerCapture(event.pointerId); event.preventDefault();
  });
  launcher.addEventListener("pointermove", event => {
    const session = launcherSession;
    if (!session || session.id !== event.pointerId) return;
    if (viewportChanged(session)) { cancelLauncherDrag(); return; }
    const dx = event.clientX - session.x, dy = event.clientY - session.y;
    if (!session.moved && Math.hypot(dx, dy) < 6) return;
    session.moved = true; suppressLauncherClick = true;
    dock.setAttribute("data-dragging", ""); document.documentElement.setAttribute("data-ycg-resizing", "move");
    document.documentElement.style.setProperty("--ycg-resize-cursor", "grabbing");
    layout.setLauncherPosition(YCGLayout.moveLauncher({rect: session.rect, dx, dy, width: innerWidth, height: innerHeight}));
  });
  launcher.addEventListener("pointerup", event => {
    const session = launcherSession;
    if (!session || session.id !== event.pointerId) return;
    if (viewportChanged(session)) { cancelLauncherDrag(); return; }
    launcherSession = null; dock.removeAttribute("data-dragging"); clearResizeCursor();
    launcher.releasePointerCapture(event.pointerId);
    if (session.moved) saveLauncherPosition();
  });
  for (const event of ["pointercancel", "lostpointercapture"]) launcher.addEventListener(event, cancelLauncherDrag);
  launcher.addEventListener("keydown", event => {
    if (!minimized) return;
    if (event.key === "Escape" && launcherSession) { event.preventDefault(); event.stopPropagation(); cancelLauncherDrag(); return; }
    const delta = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (!delta && event.key !== "Home") return;
    event.preventDefault(); event.stopPropagation(); cancelLauncherDrag();
    const step = event.shiftKey ? 50 : 20;
    layout.setLauncherPosition(delta ? YCGLayout.moveLauncher({rect: launcher.getBoundingClientRect(), dx: delta[0] * step, dy: delta[1] * step, width: innerWidth, height: innerHeight}) : null);
    clearTimeout(launcherSaveTimer); launcherSaveTimer = setTimeout(saveLauncherPosition, 180);
  });
  window.addEventListener("blur", cancelLauncherDrag);
  window.addEventListener("resize", cancelLauncherDrag);
  document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement) cancelLauncherDrag(); });
  for (const handle of resizeHandles) {
    const edge = handle.dataset.edge;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || resizeSession) return;
      clearTimeout(sizeSaveTimer); sizeSaveTimer = null;
      resizeSession = {handle, edge, id: event.pointerId, x: event.clientX, y: event.clientY, viewport: {width: innerWidth, height: innerHeight}, rect: panel.getBoundingClientRect(), limits: layout.bounds, size: layout.size, focus: shadow.activeElement, moved: false};
      panel.setAttribute("data-resizing", edge); document.documentElement.setAttribute("data-ycg-resizing", edge);
      document.documentElement.style.setProperty("--ycg-resize-cursor", edge + "-resize");
      handle.focus({preventScroll: true}); handle.setPointerCapture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
    });
    handle.addEventListener("pointermove", event => {
      if (!resizeSession || resizeSession.handle !== handle || resizeSession.id !== event.pointerId) return;
      if (viewportChanged(resizeSession)) { cancelResize(); return; }
      const dx = event.clientX - resizeSession.x, dy = event.clientY - resizeSession.y;
      if (Math.abs(dx) + Math.abs(dy) < 3 && !resizeSession.moved) return;
      resizeSession.moved = true; layout.setSize(resizedSize(resizeSession, dx, dy));
    });
    handle.addEventListener("pointerup", event => {
      if (!resizeSession || resizeSession.handle !== handle || resizeSession.id !== event.pointerId) return;
      if (viewportChanged(resizeSession)) { cancelResize(); return; }
      const session = resizeSession; resizeSession = null; clearResizeCursor(); handle.releasePointerCapture(event.pointerId); restoreResizeFocus(session);
      if (session.moved) scheduleSizeSave();
    });
    for (const event of ["pointercancel", "lostpointercapture"]) handle.addEventListener(event, () => { if (resizeSession?.handle === handle) cancelResize(); });
    handle.addEventListener("dblclick", () => { layout.setSize(); scheduleSizeSave(); });
    handle.addEventListener("keydown", event => {
      const delta = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
      if (!delta) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 50 : 20;
      layout.setSize(resizedSize({edge, rect: panel.getBoundingClientRect(), limits: layout.bounds, size: layout.size}, delta[0] * step, delta[1] * step)); scheduleSizeSave();
    });
  }
  head.addEventListener("pointerdown", event => {
    if (event.button !== 0 || resizeSession || event.target.closest("button, a, input, select, textarea")) return;
    clearTimeout(sizeSaveTimer); sizeSaveTimer = null;
    resizeSession = {kind: "move", handle: head, id: event.pointerId, x: event.clientX, y: event.clientY, viewport: {width: innerWidth, height: innerHeight}, rect: panel.getBoundingClientRect(), size: layout.size, focus: shadow.activeElement, moved: false};
    panel.setAttribute("data-resizing", "move"); document.documentElement.setAttribute("data-ycg-resizing", "move");
    document.documentElement.style.setProperty("--ycg-resize-cursor", "grabbing");
    head.focus({preventScroll: true}); head.setPointerCapture(event.pointerId); event.preventDefault();
  });
  head.addEventListener("pointermove", event => {
    if (resizeSession?.kind !== "move" || resizeSession.id !== event.pointerId) return;
    if (viewportChanged(resizeSession)) { cancelResize(); return; }
    const dx = event.clientX - resizeSession.x, dy = event.clientY - resizeSession.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !resizeSession.moved) return;
    resizeSession.moved = true;
    layout.setSize(YCGLayout.move({rect: resizeSession.rect, dx, dy, width: innerWidth, height: innerHeight}));
  });
  head.addEventListener("pointerup", event => {
    if (resizeSession?.kind !== "move" || resizeSession.id !== event.pointerId) return;
    if (viewportChanged(resizeSession)) { cancelResize(); return; }
    const session = resizeSession; resizeSession = null; clearResizeCursor(); head.releasePointerCapture(event.pointerId); restoreResizeFocus(session);
    if (session.moved) scheduleSizeSave();
  });
  for (const event of ["pointercancel", "lostpointercapture"]) head.addEventListener(event, () => { if (resizeSession?.kind === "move") cancelResize(); });
  head.addEventListener("dblclick", event => { if (!event.target.closest("button")) { layout.setSize(); scheduleSizeSave(); } });
  head.addEventListener("keydown", event => {
    if (event.target !== head) return;
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); layout.setSize(); scheduleSizeSave(); return; }
    const delta = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 50 : 20;
    layout.setSize(YCGLayout.move({rect: panel.getBoundingClientRect(), dx: delta[0] * step, dy: delta[1] * step, width: innerWidth, height: innerHeight})); scheduleSizeSave();
  });
  window.addEventListener("blur", cancelResize);
  window.addEventListener("resize", cancelResize);
  document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement) cancelResize(); });

  function say(message, error = false) {
    I.set(status, "textContent", message);
    status.classList.toggle("error", error);
  }
  async function call(message) {
    let response;
    const epoch = privacy.epoch;
    try { response = await chrome.runtime.sendMessage({scope: "ycg", epoch, ...message}); }
    catch { throw new Error("扩展连接已失效，请刷新 YouTube 页面后重试"); }
    if (epoch !== privacy.epoch) throw new Error("数据已删除，旧操作已取消；请重新开始");
    if (!response?.ok) throw new Error(response?.error || "读取或保存失败");
    return response;
  }
  async function send(message) { return (await call(message)).state; }
  async function mutate(action) {
    state = await send({type: "mutate", action});
    render();
  }
  async function run(task, success) {
    if (busy) { say("正在保存，请稍候"); return; }
    busy = true;
    panel.setAttribute("aria-busy", "true");
    try { await task(); if (success) say(success); }
    catch (error) { say(error.message || "操作失败，请重试", true); }
    finally { busy = false; panel.removeAttribute("aria-busy"); }
  }
  function openPanel() {
    if (!initialized) { openWhenReady = true; return; }
    if (document.fullscreenElement) return;
    cancelLauncherDrag();
    const restoring = minimized;
    minimized = false; updateLauncher();
    panel.hidden = false;
    layout.setOpen(true);
    launcher.setAttribute("aria-expanded", "true");
    (restoring ? minimize : close).focus({preventScroll: true});
    render(); applyFilter();
  }
  function updateLauncher() {
    dock.toggleAttribute("data-minimized", minimized);
    launcherText.hidden = minimized;
    if (minimized) launcher.setAttribute("aria-describedby", launcherHelp.id); else launcher.removeAttribute("aria-describedby");
    I.set(launcher, "aria-label", minimized ? "恢复频道分类窗口" : "频道分类");
    I.set(launcher, "title", minimized ? "恢复频道分类窗口" : "频道分类");
  }
  function minimizePanel() {
    if (panel.hidden || document.fullscreenElement) return;
    cancelResize();
    minimized = true; updateLauncher();
    panel.hidden = true;
    layout.setOpen(false);
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus({preventScroll: true});
  }
  function closePanel(restoreFocus = true) {
    cancelLauncherDrag();
    cancelResize();
    minimized = false; updateLauncher();
    panel.hidden = true;
    layout.setOpen(false);
    launcher.setAttribute("aria-expanded", "false");
    if (restoreFocus && !document.fullscreenElement) launcher.focus({preventScroll: true});
  }
  shadow.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) { event.stopPropagation(); if (resizeSession) cancelResize(); else closePanel(); } });
  // Keep the field being edited in view when the panel or the channel list changes size. A search that
  // shortens the list can shrink the panel and clamp its scroll position after the focus handler ran.
  const keepEditingVisible = new ResizeObserver(() => {
    const editing = shadow.activeElement;
    if (!panel.hidden && editing?.matches("input:not([type=checkbox]), textarea, select")) editing.scrollIntoView({block: "nearest", inline: "nearest"});
  });
  for (const target of [panel, shadow.querySelector(".body"), channelList]) keepEditingVisible.observe(target);
  shadow.addEventListener("focusin", event => {
    const input = event.target;
    if (!input.matches("input, select, textarea, button, summary, a, [tabindex]")) return;
    requestAnimationFrame(() => { if (!panel.hidden && shadow.activeElement === input) input.scrollIntoView({block: "nearest", inline: "nearest"}); });
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.scope !== "ycg") return;
    if (message.type === "open") openPanel();
    else if (message.type === "toggle") { if (panel.hidden) openPanel(); else minimizePanel(); }
    else if (message.type === "syncTheme") theme.sync();
  });

  function choose(id) { selected = id; channelPage = 0; render(); applyFilter(); }
  async function applyFilter() {
    const ticket = ++filterTicket;
    const result = await Dom.filterAsync(document, location.pathname, state, selected, () => ticket === filterTicket);
    if (!result || ticket !== filterTicket) return;
    const name = state.groups.find(group => group.id === selected)?.name || I.t(selected === "unassigned" ? "未分类" : "全部");
    const subscriptions = location.pathname.replace(/\/$/, "") === "/feed/subscriptions";
    I.set(feedStatus, "textContent", subscriptions
      ? `已加载视频：${result.visible} / ${result.recognized}。仅筛选可识别的频道视频；Shorts 合集等未识别内容保留。${result.unknown ? `另有 ${result.unknown} 个未识别卡片。` : ""}`
      : "选择分类可查看频道；在“订阅视频”页面还会筛选已加载的视频。");
    I.set(launcherText, "textContent", "频道分类");
    I.set(launcher, "title", minimized ? "恢复频道分类窗口" : result.active ? `${name} · ${result.visible} 个视频` : "频道分类");
    reset.hidden = !result.active;
    collectButton.disabled = location.pathname.replace(/\/$/, "") !== "/feed/channels";
    loadAllButton.hidden = collectButton.disabled; if (collectButton.disabled && !loadingAll) coverage.hidden = true;
    currentButton.hidden = !Core.path(location.pathname);
  }
  function render() {
    renderTicket++;
    if (panel.hidden || renderFrame) return;
    renderFrame = requestAnimationFrame(() => { renderFrame = 0; renderView(renderTicket).catch(error => say(error.message, true)); });
  }
  async function renderView(ticket) {
    if (panel.hidden) return;
    const current = () => ticket === renderTicket && !panel.hidden;
    const view = (await call({type: "browse", query: {filter: selected, query: search, page: channelPage, language: I.language}})).view;
    if (!current()) return;
    const focusKey = shadow.activeElement?.dataset.focusKey;
    channelPage = view.page;
    shadow.querySelector(".intro").classList.toggle("compact", state.channels.length > 0);
    if (!["all", "unassigned", ...state.groups.map(group => group.id)].includes(selected)) selected = "all";
    chips.replaceChildren(...[
      {id: "all", name: I.t("全部"), count: state.channels.length},
      {id: "unassigned", name: I.t("未分类"), count: view.unassigned},
      ...state.groups.map(group => ({...group, count: view.counts[group.id] || 0}))
    ].map(group => button(`${group.name} ${group.count}`, () => choose(group.id), {class: "chip", "data-focus-key": `group:${group.id}`, "aria-pressed": String(selected === group.id)})));
    const cards = [];
    await YCGWork.each(view.channels, channel => cards.push(channelCard(channel)), current);
    if (!current()) return;
    channelList.replaceChildren(...cards);
    if (!cards.length) channelList.append(node("li", {class: "empty", text: state.channels.length ? "这个分类或搜索没有匹配频道。" : "还没有频道。打开订阅频道列表并滚动加载，或在频道主页点击“加入当前频道”。"}));
    I.set(count, "textContent", `${view.total} 个频道`);
    I.set(channelPageLabel, "textContent", `第 ${view.page + 1} / ${view.pages} 页`);
    previousChannels.disabled = view.page === 0; nextChannels.disabled = view.page === view.pages - 1;
    channelPagination.hidden = view.pages <= 1;
    const signature = JSON.stringify([I.language, state.groups]);
    if (signature !== groupsSignature) { await renderGroups(current); if (!current()) return; groupsSignature = signature; }
    assistant.update();
    if (focusKey && !shadow.activeElement) [...shadow.querySelectorAll("[data-focus-key]")].find(element => element.dataset.focusKey === focusKey)?.focus();
    applyFilter();
  }
  function channelCard(channel) {
    return node("li", {class: "channel"}, [
      node("div", {class: "channel-identity"}, [createYCGAvatar(node, channel), node("div", {class: "channel-name"}, [
        link(channel.title, `https://www.youtube.com${channel.id}`, {class: "channel-title", localize: false, target: "_blank", rel: "noopener noreferrer"}),
        node("p", {class: "channel-path", text: channel.id, localize: false})
      ])]),
      node("div", {class: "channel-actions"}, [
        link("查看视频 ↗", `https://www.youtube.com${channel.id}/videos`, {class: "channel-videos", target: "_blank", rel: "noopener noreferrer", "aria-label": `查看视频：${channel.title}`}),
        button("取消关注…", () => unsubscribe(channel), {class: "channel-unsubscribe", privileged: true, "aria-label": `取消关注：${channel.title}`})
      ]),
      state.groups.length ? memberships(channel) : node("p", {class: "muted", text: "先在下方创建分类，再为频道勾选。"})
    ]);
  }
  // Unsubscribe in YouTube itself: the extension opens YouTube's confirmation and the user confirms there.
  // After YouTube shows the subscribe state again, the channel is removed from the extension.
  let unsubscribing = false;
  // YouTube keeps an unsubscribed channel's card on the page until reload; do not collect it again.
  const unsubscribedAliases = new Set();
  const forget = channel => { channel.aliases.forEach(alias => unsubscribedAliases.add(alias)); return mutate({type: "removeChannel", channelId: channel.id}); };
  async function unsubscribe(channel) {
    if (unsubscribing) { say("另一个取消关注操作尚未完成", true); return; }
    const findArea = () => YCGUnsubscribe.area(document, location.pathname, channel);
    const control = findArea();
    if (!control) {
      try { await call({type: "pendingSet", pending: {action: "unsubscribe", channelId: channel.id}}); } catch (error) { say(error.message, true); return; }
      say("这个频道不在当前页面，正在打开频道主页…");
      location.assign(`https://www.youtube.com${channel.id}`);
      return;
    }
    const current = YCGUnsubscribe.status(control);
    if (current.state === "unsubscribed") {
      if (confirm(I.t(`YouTube 显示你没有订阅“${channel.title}”。只从扩展中移除这个频道？`))) run(() => forget(channel), "已从扩展中移除");
      return;
    }
    if (current.state !== "subscribed") { say("未能识别 YouTube 的订阅按钮。请在 YouTube 中手动取消订阅；仅支持中文或英文的 YouTube 界面。", true); return; }
    unsubscribing = true;
    const epoch = privacy.epoch;
    try {
      say("正在打开 YouTube 的取消订阅确认框…");
      const confirmation = await YCGUnsubscribe.open(document, current.button);
      // Move the panel aside so that YouTube's dialog is not covered.
      if (!panel.hidden) minimizePanel();
      say(`请在 YouTube 的确认框中确认取消订阅“${channel.title}”`);
      const result = await YCGUnsubscribe.wait(document, findArea, {seenDialog: !!confirmation});
      if (epoch !== privacy.epoch) return;
      if (minimized) openPanel();
      if (result !== "done") { say(`未检测到“${channel.title}”已取消关注，扩展中的记录保持不变。如果你已在 YouTube 中确认，请点击“刷新订阅”同步。`, true); return; }
      try { await forget(channel); say(`已取消关注“${channel.title}”，并已从扩展中移除`); }
      catch (error) { say(`已在 YouTube 取消关注“${channel.title}”，但未能从扩展中移除：${error.message}`, true); }
    } catch (error) { say(error.message, true); }
    finally { unsubscribing = false; }
  }
  // Continue an unsubscribe or a refresh that had to open another page first.
  async function resumePending() {
    const {pending} = await call({type: "pendingTake"});
    if (pending?.action === "sync") { openPanel(); return syncSubscriptions(); }
    const channel = pending?.action === "unsubscribe" && state.channels.find(item => item.id === pending.channelId);
    if (!channel) return;
    openPanel();
    for (const end = Date.now() + 10000; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 250))) {
      if (YCGUnsubscribe.area(document, location.pathname, channel)) return unsubscribe(channel);
    }
    say(`未能在频道主页找到“${channel.title}”的订阅按钮。请在 YouTube 中手动取消订阅。`, true);
  }
  function memberships(channel) {
    const build = () => node("div", {class: "memberships"}, state.groups.map(group => {
        const input = node("input", {type: "checkbox", "data-focus-key": `${channel.id}:${group.id}`, "aria-label": `${channel.title}：${group.name}`, onChange: event => {
          if (!event.isTrusted || busy) { input.checked = channel.groupIds.includes(group.id); if (busy) say("正在保存，请稍候"); return; }
          const checked = event.target.checked;
          run(async () => {
            try { await mutate({type: "membership", channelId: channel.id, groupId: group.id, checked}); }
            catch (error) { render(); throw error; }
          }, "分类已保存");
        }});
        input.checked = channel.groupIds.includes(group.id);
        return node("label", {class: "membership"}, [input, node("span", {text: group.name, localize: false})]);
    }));
    if (state.groups.length <= 20) return build();
    const details = node("details", {class: "channel-memberships"}, [node("summary", {text: "编辑频道分类"})]);
    details.addEventListener("toggle", () => { if (details.open && details.children.length === 1) details.append(build()); });
    return details;
  }
  async function renderGroups(current) {
    const forms = [];
    await YCGWork.each(state.groups, group => {
      const input = node("input", {type: "text", value: group.name, maxlength: "40", required: "", "data-focus-key": `rename:${group.id}`, "aria-label": `重命名 ${group.name}`});
      forms.push(node("form", {class: "group-form", onSubmit: event => {
        event.preventDefault(); run(() => mutate({type: "renameGroup", id: group.id, name: input.value}), "分类名称已保存");
      }}, [input, node("button", {type: "submit", text: "保存", "data-focus-key": `save:${group.id}`, "aria-label": `保存 ${group.name}`}), button("删除", () => {
        if (confirm(I.t(`删除“${group.name}”分类？频道仍会保留，其他分类不受影响。`))) run(() => mutate({type: "deleteGroup", id: group.id}), "分类已删除");
      }, {class: "danger", "aria-label": `删除 ${group.name}`})]));
    }, current);
    if (current()) groupList.replaceChildren(...forms);
  }

  async function scan(explicit = false) {
    if (location.pathname.replace(/\/$/, "") !== "/feed/channels") {
      if (explicit) throw new Error("请先打开订阅频道列表");
      return;
    }
    if (scanning || privacy.collectionPaused) return;
    const epoch = privacy.epoch;
    const loaded = await Dom.collectAsync(document, location.pathname, () => epoch === privacy.epoch && !privacy.collectionPaused);
    if (!loaded || epoch !== privacy.epoch) return;
    const channels = loaded.filter(item => !item.aliases.some(alias => unsubscribedAliases.has(alias)));
    if (!channels.length) {
      if (explicit) throw new Error("暂未识别到频道。请确认已登录，并等待列表加载或向下滚动");
      return;
    }
    const signature = JSON.stringify(channels);
    if (!explicit && signature === lastScan) return;
    scanning = true;
    try {
      await mutate({type: "collect", channels});
      lastScan = signature;
      say(`已收集 ${state.channels.length} 个频道；滚动列表可继续收集`);
    } finally { scanning = false; }
  }
  function schedule() {
    if (scanTimer) return;
    scanTimer = setTimeout(async () => {
      scanTimer = null;
      try { await scan(); applyFilter(); }
      catch (error) { say(error.message, true); }
      layout.update();
    }, 650);
  }
  async function exportState() {
    state = await send({type: "get"});
    const exported = YCGExport.document(state, exportFormat.value);
    const blob = new Blob([exported.text], {type: exported.type});
    const url = URL.createObjectURL(blob);
    const anchor = link("", url, {download: `youtube-channel-groups-${new Date().toISOString().slice(0, 10)}.${exported.extension}`});
    shadow.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  I.onChange(() => { host.lang = I.language; I.refresh(shadow); updateLanguageToggle(); render(); assistant.localize(); });
  try {
    privacy = (await call({type: "privacyGet"})).privacy;
    I.set(collectButton, "textContent", privacy.collectionPaused ? "恢复收集已加载频道" : "收集已加载频道");
    I.change(I.preferred((await call({type: "preferencesGet"})).preferences.language));
    layout.setSize((await call({type: "panelSizeGet"})).size);
    layout.setLauncherPosition((await call({type: "launcherPositionGet"})).position);
    state = await send({type: "get"}); render(); say("分类仅保存在这个浏览器配置文件中");
    assistant.restoreDraft();
    resumePending().catch(error => say(error.message, true));
  } catch (error) { say(error.message, true); openPanel(); }
  finally { initialized = true; launcher.disabled = false; if (openWhenReady) { openWhenReady = false; openPanel(); } }
  function connectUpdates() {
    try {
      const port = chrome.runtime.connect({name: "ycg-updates"});
      port.onMessage.addListener(message => {
        try {
          if (message.privacy) {
            const changed = privacy.epoch !== message.privacy.epoch;
            privacy = message.privacy;
            if (changed) {
              renderTicket++; filterTicket++; clearTimeout(scanTimer); scanTimer = null;
              cancelResize(); clearTimeout(sizeSaveTimer); sizeSaveTimer = null; sizeSaveId++; selected = "all"; search = ""; searchInput.value = ""; channelPage = 0; lastScan = ""; groupsSignature = "";
              cancelLauncherDrag(); clearTimeout(launcherSaveTimer); launcherSaveTimer = null; launcherSaveId++; layout.setLauncherPosition(null);
              state = Core.empty(); showReview(false); assistantGeneration++; assistant.dispose();
              reviewSurface.replaceChildren(); assistant = makeAssistant(); assistantHome.replaceChildren(assistant.element); assistant.restoreDraft();
              loadingAll = false; syncReview.replaceChildren(); syncReview.hidden = true; coverage.hidden = true;
              minimized = false; updateLauncher(); layout.setSize(); I.change(I.preferred()); render(); applyFilter();
              say("本机数据已删除，自动收集已暂停");
            }
            I.set(collectButton, "textContent", privacy.collectionPaused ? "恢复收集已加载频道" : "收集已加载频道");
          }
          if (message.preferences && I.preferred(message.preferences.language) !== I.language) I.change(I.preferred(message.preferences.language));
          if (message.panelSize && !resizeSession && !sizeWrites && !sizeSaveTimer) layout.setSize(message.panelSize);
          if (Object.hasOwn(message, "launcherPosition") && !launcherSession && !launcherWrites && !launcherSaveTimer) layout.setLauncherPosition(message.launcherPosition);
          if (typeof message.undoAvailable === "boolean") assistant.setUndoAvailable(message.undoAvailable);
          if (message.state) { state = message.state; render(); }
        }
        catch (error) { say(error.message, true); }
      });
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.id) setTimeout(async () => {
          connectUpdates();
          try { state = await send({type: "get"}); render(); } catch (error) { say(error.message, true); }
        }, 1000);
      });
    } catch { say("请刷新页面以连接扩展", true); }
  }
  connectUpdates();
  new MutationObserver(records => { Dom.invalidate(records); schedule(); }).observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "src", "srcset", "data-src"]});
  document.addEventListener("load", event => {
    if (event.target.matches?.("img") && event.target.closest("ytd-channel-renderer, ytd-grid-channel-renderer")) { Dom.invalidate([{target: event.target}]); schedule(); }
  }, true);
  document.addEventListener("yt-navigate-finish", () => { lastScan = ""; schedule(); });
  window.addEventListener("popstate", schedule);
  window.addEventListener("focus", () => assistant.refreshInfo());
  schedule();
})();
