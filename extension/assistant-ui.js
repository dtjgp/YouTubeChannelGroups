"use strict";
globalThis.createYCGAssistant = function ({node, button, call, getState, mutate, say, showReview}) {
  const I = YCGI18n;
  const info = node("p", {class: "muted assistant-info", text: "选择本机 Codex、Claude 或自定义云端 API。"});
  const scope = node("select", {"aria-label": "AI 分类范围"}, [node("option", {value: "unassigned", text: "仅未分类频道"}), node("option", {value: "all", text: "全部频道（包括已分类）"})]);
  const mode = node("select", {"aria-label": "AI 处理数量"}, [node("option", {value: "all", text: "全部剩余频道（自动分批）"}), node("option", {value: "batch", text: "仅下一批（最多 20 个）"})]);
  const applyMode = node("select", {"aria-label": "AI 应用方式"}, [node("option", {value: "add", text: "补充分类（保留已有分类）"}), node("option", {value: "replace", text: "重新分类（替换勾选频道的分类）"})]);
  const replaceHint = node("p", {class: "muted", text: "只替换勾选频道的分类；未勾选频道不变。应用后可撤销最近一次 AI 分类。", hidden: ""});
  const instructions = node("textarea", {rows: "2", maxlength: "900", placeholder: "例如：用中文分类，区分 AI 研究、AI 工具、编程教学", "aria-label": "AI 分类要求"});
  const disclosure = node("p", {class: "muted", text: "点击生成即按所选范围向服务分批发送频道名称、地址、已收集简介和分类要求。处理全部频道会产生多次请求，可能消耗更多账号额度。"});
  const batchInfo = node("p", {class: "muted"});
  const progress = node("p", {class: "ai-progress", role: "status", "aria-live": "polite"});
  const preview = node("div", {class: "review-home"});
  const previewCount = node("p", {class: "muted"});
  const meter = node("progress", {max: "1", value: "0", "aria-label": "AI 分类进度", hidden: ""});
  const elapsed = node("p", {class: "muted"});
  const undoStatus = node("p", {class: "muted", role: "status", "aria-live": "polite"});
  let running = false, suggestions = [], job = null, stopRequested = false, undoAvailable = false, organizerBusy = false;
  let timer, batchStarted, draftTimer, draftReady = false;
  const reviewed = new Set();
  const generate = button("生成分类建议", async () => {
    if (running) return;
    if (!job) {
      const channels = candidates().slice(0, mode.value === "batch" ? YCGAI.BATCH : undefined);
      if (!channels.length) { I.set(progress, "textContent", "没有待分类频道，请先收集频道或更改分类范围。"); return; }
      job = {pending: channels.map(channel => channel.id), total: channels.length, completed: 0, instructions: instructions.value, language: I.language};
    }
    if (!job.pending.length) return;
    running = "generate"; stopRequested = false; update();
    timer = setInterval(updateElapsed, 1000);
    try {
      while (job.pending.length && !stopRequested) {
        const channelIds = job.pending.slice(0, YCGAI.BATCH);
        batchStarted = Date.now();
        I.set(progress, "textContent", `正在处理第 ${Math.floor(job.completed / YCGAI.BATCH) + 1} / ${Math.ceil(job.total / YCGAI.BATCH)} 批，已完成 ${job.completed} / ${job.total} 个频道。本机每批最多等待约两分钟…`);
        const language = job.language === "en" ? "Use English for category names and explanations. " : "请使用中文分类名称和说明。";
        const response = await call({type: "aiSuggest", channelIds, instructions: language + job.instructions});
        suggestions.push(...response.suggestions.map(item => ({...item, selected: item.groups.length > 0 && item.certainty !== "low"})));
        job.pending.splice(0, channelIds.length); job.completed += channelIds.length;
        renderPreview();
        if (!job.reviewOpened) { job.reviewOpened = true; showReview(true); }
      }
      I.set(progress, "textContent", job.pending.length
        ? `已暂停，已完成 ${job.completed} / ${job.total} 个频道。可继续处理剩余 ${job.pending.length} 个，已有建议不会重复请求。`
        : `已完成 ${job.total} 个频道的建议。请检查后应用；低把握建议默认不勾选。`);
      say("AI 建议尚未应用，请在预览中确认");
    } catch (error) {
      I.set(progress, "textContent", `已完成 ${job.completed} / ${job.total} 个频道。${error.message}。可继续处理剩余 ${job.pending.length} 个，已完成的建议会保留。`);
    }
    finally { clearInterval(timer); running = false; update(); updateElapsed(); }
  }, {class: "primary"});
  const stop = button("本批完成后停止", () => {
    if (running !== "generate") return;
    stopRequested = true; update();
    I.set(progress, "textContent", "将在当前批次返回后停止；已完成的建议会保留。");
  }, {hidden: ""});
  const apply = button("应用勾选建议", async () => {
    if (running) return;
    try {
      const chosen = suggestions.filter(item => item.selected).map(item => ({channelId: item.channelId, groups: item.groups}));
      if (!chosen.length) throw new Error("请先勾选至少一条含有分类名称的建议");
      running = true; update();
      I.set(progress, "textContent", `正在应用 ${chosen.length} 个频道的建议…`);
      meter.hidden = false; meter.removeAttribute("value");
      const mode = applyMode.value;
      await mutate({type: "applySuggestions", suggestions: chosen, mode});
      suggestions.forEach(item => reviewed.add(item.channelId));
      clearPreview();
      undoAvailable = true; meter.max = chosen.length; meter.value = chosen.length;
      I.set(progress, "textContent", mode === "replace" ? `已重新分类 ${chosen.length} 个频道；其他频道不变。` : `已应用 ${chosen.length} 个频道的建议，原有分类已保留。`);
      say("AI 分类建议已应用");
    } catch (error) { I.set(progress, "textContent", error.message); }
    finally { running = false; update(); }
  }, {disabled: ""});
  const undo = button("撤销上次 AI 分类", async () => {
    if (running || !undoAvailable) return;
    running = true; update();
    try {
      await mutate({type: "undoSuggestions"}); undoAvailable = false;
      organizer.didUndo(); say("上次 AI 分类已撤销");
      I.set(undoStatus, "textContent", "上次 AI 分类已撤销");
      reviewed.clear(); I.set(progress, "textContent", "上次 AI 分类已撤销。空分类可在管理分类中删除。");
    } catch (error) { I.set(progress, "textContent", error.message); I.set(undoStatus, "textContent", error.message); }
    finally { running = false; update(); }
  }, {disabled: ""});
  const skip = button("跳过这些建议", () => {
    if (running) return;
    suggestions.forEach(item => reviewed.add(item.channelId)); clearPreview();
    I.set(progress, "textContent", "预览中的建议已跳过。可以继续生成剩余频道，或从头检查。"); update();
  }, {disabled: ""});
  const reset = button("从头检查", () => {
    if (running) return;
    reviewed.clear(); job = null; clearPreview(); I.set(progress, "textContent", "已重置本轮进度。"); update();
  });
  const review = createYCGReview({node, button, getItems: () => suggestions, getChannels: () => YCGCore.channelMap(getState()),
    getNames: () => [...new Set([...getState().groups.map(group => group.name), ...suggestions.flatMap(item => item.groups)])],
    renderItem: renderSuggestion, disabled: () => !!running,
    setGroups(item, groups) { item.groups = groups; item.selected = groups.length > 0; update(); }
  });
  preview.append(review.element);
  const reviewEntry = button("打开审核工作台", () => showReview(true), {class: "review-entry", hidden: ""});
  const purpose = node("select", {"aria-label": "AI 任务"}, [node("option", {value: "classify", text: "频道分类建议"}), node("option", {value: "organize", text: "精简分类并重新归类"})]);
  const organizer = createYCGOrganizer({node, button, call, getState, mutate, say, showReview,
    onBusy(value) { organizerBusy = value; if (value) I.set(undoStatus, "textContent", ""); update(); },
    onApplied() { undoAvailable = true; reviewed.clear(); job = null; clearPreview(false); update(); }
  });
  const standard = node("div", {class: "standard-assistant"}, [node("div", {class: "ai-configuration"}, [
    node("label", {class: "control-label", text: "分类范围"}, [scope]),
    node("label", {class: "control-label", text: "处理数量"}, [mode]),
    node("label", {class: "control-label", text: "应用方式"}, [applyMode]), replaceHint,
    node("p", {class: "muted", text: "仅处理已收集频道；未加载的订阅频道需先在订阅列表中收集。"}),
    node("label", {class: "control-label", text: "AI 分类要求"}, [instructions]), batchInfo, disclosure]),
    node("div", {class: "ai-actions"}, [node("div", {class: "tools"}, [generate, stop, apply]), meter, progress, elapsed, previewCount]),
    node("div", {class: "tools review-secondary"}, [skip, reset, reviewEntry]), preview
  ]);
  const element = node("details", {class: "ai-assistant"}, [
    node("summary", {text: "✦ AI 分类助手"}), info,
    node("div", {class: "tools assistant-settings"}, [button("AI 设置", async () => {
      try { await call({type: "openSettings"}); } catch (error) { I.set(progress, "textContent", error.message); }
    })]),
    node("label", {class: "control-label assistant-purpose", text: "任务"}, [purpose]), standard, organizer.element,
    node("div", {class: "tools shared-tools"}, [undo]), undoStatus
  ]);
  purpose.addEventListener("change", () => { standard.hidden = purpose.value !== "classify"; organizer.element.hidden = purpose.value !== "organize"; update(); });
  scope.addEventListener("change", () => { reviewed.clear(); clearPreview(); update(); });
  mode.addEventListener("change", update);
  applyMode.addEventListener("change", update);
  async function refreshInfo() {
    try {
      const {config, undoAvailable: available} = await call({type: "aiInfo"});
      undoAvailable = available;
      const names = {codex: "本机 Codex", claude: "本机 Claude", api: "云端 API"};
      I.set(info, "textContent", config ? `${I.t(names[config.provider])} · ${config.model || I.t("CLI 默认模型")} · ${config.provider === "api" ? new URL(config.endpoint).host : I.t("浏览器自动启动")}` : "尚未配置。请先打开“AI 设置”。");
      update();
    } catch (error) { if (!running) I.set(progress, "textContent", error.message); }
  }
  element.addEventListener("toggle", () => { if (element.open) { update(); refreshInfo(); } });
  function candidates() {
    return getState().channels.filter(channel => !reviewed.has(channel.id) && (scope.value === "all" || !channel.groupIds.length));
  }
  function update() {
    scheduleDraft();
    if (!element.open && !running && !organizerBusy) return;
    const total = candidates().length;
    const count = mode.value === "batch" ? Math.min(total, YCGAI.BATCH) : total;
    I.set(batchInfo, "textContent", job
      ? `本轮 ${job.total} 个频道，已完成 ${job.completed} 个，待处理 ${job.pending.length} 个。应用后，未勾选项本轮跳过。`
      : `将处理 ${count} / ${total} 个剩余频道，自动分为 ${Math.ceil(count / YCGAI.BATCH)} 批，每批最多 ${YCGAI.BATCH} 个。本轮已检查 ${reviewed.size} 个。`);
    I.set(generate, "textContent", job?.pending.length ? `继续剩余 ${job.pending.length} 个频道` : "生成分类建议");
    generate.disabled = !!running || (!job?.pending.length && (!!suggestions.length || !total));
    apply.disabled = skip.disabled = !!running || !suggestions.length;
    reviewEntry.hidden = !suggestions.length;
    reset.disabled = !!running;
    undo.disabled = !!running || organizerBusy || !undoAvailable;
    purpose.disabled = !!running || organizerBusy;
    scope.disabled = mode.disabled = instructions.disabled = !!running || !!job;
    applyMode.disabled = !!running;
    replaceHint.hidden = applyMode.value !== "replace";
    stop.hidden = running !== "generate";
    stop.disabled = stopRequested;
    preview.querySelectorAll("input").forEach(input => { input.disabled = !!running; });
    I.set(previewCount, "textContent", `当前预览 ${suggestions.length} 个频道，已勾选 ${suggestions.filter(item => item.selected).length} 个。`);
    if (job) { meter.hidden = false; meter.max = job.total; meter.value = job.completed; }
    review.update();
    organizer.update();
  }
  // Save the unapplied preview so a reload of this tab can restore it. Nothing is saved before the restore attempt ends.
  function scheduleDraft() {
    if (!draftReady) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const draft = suggestions.length || job?.pending.length ? {version: 1, suggestions, reviewed: [...reviewed], scope: scope.value, applyMode: applyMode.value,
        job: job && {pending: job.pending, total: job.total, completed: job.completed, instructions: job.instructions, language: job.language}} : null;
      call({type: "draftSave", draft}).catch(() => {});
    }, 300);
  }
  async function restoreDraft() {
    try {
      const {draft} = await call({type: "draftGet"});
      if (draft && !running && !suggestions.length && !job) {
        suggestions = draft.suggestions; reviewed.clear(); draft.reviewed.forEach(id => reviewed.add(id));
        scope.value = draft.scope; applyMode.value = draft.applyMode;
        job = {...draft.job, reviewOpened: true};
        review.refresh();
        I.set(progress, "textContent", `已恢复刷新前未应用的 AI 预览：${suggestions.length} 条建议，待处理 ${job.pending.length} 个频道。应用前请再次检查。`);
      }
    } catch {}
    finally { draftReady = true; update(); }
  }
  function updateElapsed() {
    I.set(elapsed, "textContent", running === "generate" && batchStarted ? `本批已等待 ${Math.floor((Date.now() - batchStarted) / 1000)} 秒；已生成 ${job.completed} / ${job.total} 个频道的建议。` : "");
  }
  function clearPreview(close = true) {
    suggestions = []; review.refresh({reset: true});
    if (close) showReview(false);
    if (!job?.pending.length) job = null; else job.reviewOpened = false;
  }
  function renderPreview() {
    review.refresh();
    update();
  }
  function renderSuggestion(item, channel) {
    const names = {high: "较高", medium: "一般", low: "较低"};
      const checkbox = node("input", {type: "checkbox", "aria-label": `应用 ${channel?.title || item.channelId} 的 AI 建议`, onChange: event => { item.selected = event.target.checked; update(); }});
      checkbox.checked = item.selected;
      const input = node("input", {type: "text", value: item.groups.join(", "), "aria-label": `${channel?.title || item.channelId} 的建议分类`, onInput: event => {
        item.groups = [...new Set(event.target.value.split(/[,，]/).map(name => name.trim()).filter(Boolean))];
        item.reviewed = true; update();
      }});
      return node("li", {class: "ai-suggestion"}, [
        node("label", {class: "row"}, [checkbox, createYCGAvatar(node, channel), node("strong", {text: channel?.title || item.channelId, localize: false})]), node("label", {class: "control-label", text: "建议分类"}, [input]),
        node("p", {class: "muted", text: `模型把握：${names[item.certainty]} · ${item.reason}`})
      ]);
  }
  return {element, update, refreshInfo, restoreDraft, dispose() { clearInterval(timer); clearTimeout(draftTimer); draftReady = false; organizer.dispose(); }, localize() { update(); organizer.localize(); refreshInfo(); }, setUndoAvailable(value) { undoAvailable = value; update(); }};
};
