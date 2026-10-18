"use strict";
// Decorative avatars share the adjacent channel name. No extra accessible name or layout shift.
globalThis.createYCGAvatar = function (node, channel) {
  const title = channel?.title || channel?.id || "?";
  const initials = [...title.trim().replace(/^@/, "")].slice(0, 2).join("").toLocaleUpperCase();
  const fallback = node("span", {text: initials || "?", localize: false});
  const element = node("span", {class: "channel-avatar", "aria-hidden": "true"}, [fallback]);
  const src = YCGCore.avatar(channel?.avatarUrl);
  if (src) element.append(node("img", {alt: "", width: "40", height: "40", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", onLoad: () => { fallback.hidden = true; }, onError: event => { fallback.hidden = false; event.target.remove(); }, src}));
  return element;
};
globalThis.createYCGReview = function ({node, button, getItems, getChannels, getNames, renderItem, setGroups, disabled}) {
  const I = YCGI18n, pageSize = 8;
  let page = 0, query = "", filter = "all", nameSignature = "", targetSignature = "", channels = new Map();
  const search = node("input", {type: "search", "aria-label": "审核搜索频道", placeholder: "搜索本次结果", onInput: event => { query = event.target.value; page = 0; render(); }});
  const select = node("select", {"aria-label": "审核筛选", onChange: event => { filter = event.target.value; page = 0; updateTargets(); render(); }});
  const targets = node("div", {class: "review-targets", role: "group", "aria-label": "拖放分类目标"});
  const list = node("ul", {class: "ai-preview review-list", "aria-label": "本页分类建议"});
  const count = node("p", {class: "review-count muted"}), notice = node("p", {class: "review-notice muted", role: "status", "aria-live": "polite"});
  const previous = button("上一页", () => { page--; render(); });
  const next = button("下一页", () => { page++; render(); });
  const pageLabel = node("span", {class: "muted"});
  const element = node("div", {class: "review-board"}, [
    node("search", {class: "review-toolbar"}, [node("label", {class: "control-label", text: "审核搜索频道"}, [search]), node("label", {class: "control-label", text: "审核筛选"}, [select])]),
    node("p", {class: "review-hint muted", text: "拖动频道到分类目标；按住 Shift 可追加分类。只修改预览，应用后才保存。"}),
    targets, count, list, notice,
    node("div", {class: "review-pagination"}, [previous, pageLabel, next])
  ]);
  function title(item) { return channels.get(item.channelId)?.title || item.channelId; }
  function matched() {
    const needle = query.trim().toLowerCase();
    return getItems().filter(item => (!needle || `${title(item)} ${item.channelId}`.toLowerCase().includes(needle))
      && (filter === "all" || (filter === "needs" ? !item.reviewed && (item.certainty === "low" || !item.groups.length) : filter === "unassigned" ? !item.groups.length : item.groups.includes(filter.slice(2)))));
  }
  function updateTargets() {
    const focused = targets.getRootNode().activeElement;
    const focusCategory = focused?.classList.contains("review-target") ? focused.dataset.category : null;
    const names = getNames(), all = getItems(), totals = new Map([[null, 0]]);
    for (const item of all) { if (!item.groups.length) totals.set(null, totals.get(null) + 1); item.groups.forEach(name => totals.set(name, (totals.get(name) || 0) + 1)); }
    const signature = JSON.stringify([I.language, names, [...totals]]);
    if (signature === targetSignature) return;
    targetSignature = signature;
    const visible = names;
    targets.replaceChildren(...[null, ...visible].map(name => {
      const label = name === null ? I.t("未分类") : name;
      const total = totals.get(name) || 0;
      const target = button(`${label} ${total}`, () => { filter = name === null ? "unassigned" : "g:" + name; select.value = filter; page = 0; render(); }, {class: "review-target", localize: false, "data-category": name ?? "", title: label});
      target.addEventListener("dragover", event => { if (disabled()) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; target.setAttribute("data-over", ""); });
      target.addEventListener("dragleave", event => { if (!target.contains(event.relatedTarget)) target.removeAttribute("data-over"); });
      target.addEventListener("drop", event => {
        event.preventDefault(); target.removeAttribute("data-over");
        if (disabled()) return;
        const id = event.dataTransfer.getData("application/x-ycg-channel"), item = getItems().find(item => item.channelId === id);
        if (!item) return;
        const groups = name === null ? [] : event.shiftKey ? [...new Set([...item.groups, name])] : [name];
        try {
          if (groups.length > 3) throw new Error("每个频道最多选择 3 类");
          setGroups(item, groups); item.reviewed = true; update(); render();
          I.set(notice, "textContent", `已调整 ${title(item)} 的预览分类；点击应用后保存。`);
        } catch (error) { I.set(notice, "textContent", error.message); }
      });
      return target;
    }));
    if (focusCategory !== null) [...targets.children].find(target => target.dataset.category === focusCategory)?.focus({preventScroll: true});
  }
  function update() {
    channels = getChannels();
    const names = getNames(), signature = JSON.stringify([I.language, names]);
    if (signature !== nameSignature) {
      nameSignature = signature;
      select.replaceChildren(node("option", {value: "all", text: "全部建议"}), node("option", {value: "needs", text: "需复核"}), node("option", {value: "unassigned", text: "未分类"}), ...names.map(name => node("option", {value: "g:" + name, text: name, localize: false})));
      if (filter.startsWith("g:") && !names.includes(filter.slice(2))) filter = "all";
      select.value = filter;
    }
    updateTargets();
    list.querySelectorAll(".review-card").forEach(card => { card.draggable = !disabled(); });
  }
  function render() {
    const items = matched(), pages = Math.max(1, Math.ceil(items.length / pageSize));
    page = Math.max(0, Math.min(page, pages - 1));
    const visible = items.slice(page * pageSize, (page + 1) * pageSize);
    list.replaceChildren(...visible.map(item => {
      const card = renderItem(item, channels.get(item.channelId));
      card.classList.add("review-card"); card.dataset.channelId = item.channelId; card.draggable = !disabled();
      card.prepend(node("span", {class: "review-drag-label", text: "拖动归类"}));
      card.addEventListener("dragstart", event => {
        if (disabled() || event.target.closest("input, textarea, select, button, summary")) { event.preventDefault(); return; }
        event.dataTransfer.setData("application/x-ycg-channel", item.channelId); event.dataTransfer.effectAllowed = "move"; card.setAttribute("data-dragging", "");
      });
      card.addEventListener("dragend", () => { card.removeAttribute("data-dragging"); targets.querySelectorAll("[data-over]").forEach(target => target.removeAttribute("data-over")); });
      return card;
    }));
    if (!visible.length) list.append(node("li", {class: "empty", text: "没有匹配的建议，请更换筛选或搜索。"}));
    list.scrollTop = 0;
    previous.disabled = page === 0; next.disabled = page === pages - 1;
    I.set(pageLabel, "textContent", `第 ${page + 1} / ${pages} 页`);
    I.set(count, "textContent", `匹配 ${items.length} / ${getItems().length} 个频道 · 每页最多 ${pageSize} 个`);
    update();
  }
  function refresh({reset = false} = {}) {
    if (reset) { page = 0; query = ""; filter = "all"; search.value = ""; nameSignature = ""; notice.textContent = ""; }
    update(); render();
  }
  return {element, list, update, refresh};
};
