"use strict";
globalThis.createYCGOrganizer = function ({node, button, call, getState, mutate, say, onBusy, onApplied, showReview}) {
  const I = YCGI18n;
  const instructions = node("textarea", {rows: "3", maxlength: "700", "aria-label": "精简分类要求", placeholder: "例如：合并成 6 大类，AI 和编程分别保留，其他主题适当合并。也可要求 4–6 类或最多 8 类。"});
  const countHint = node("p", {class: "muted"});
  const progress = node("p", {class: "organization-progress", role: "status", "aria-live": "polite"});
  const meter = node("progress", {max: "1", value: "0", hidden: "", "aria-label": "精简分类进度"});
  const elapsed = node("p", {class: "muted"});
  const planView = node("div", {class: "organization-plan", hidden: ""});
  const planInfo = node("p", {class: "muted"}), assignmentInfo = node("p", {class: "muted review-summary"});
  const preview = node("div", {class: "review-home"});
  let running = false, plan = [], nameInputs = [], base = null, assignments = [], job = null, stopRequested = false, applied = false;
  let timer, started = 0, language = "zh-CN", jobInstructions = "";
  let comparedState, comparedBase, changed;
  const stale = () => {
    const state = getState();
    if (state !== comparedState || base !== comparedBase) { comparedState = state; comparedBase = base; changed = base && JSON.stringify(base) !== JSON.stringify(state); }
    return changed;
  };
  function busy(value) { running = value; onBusy(!!value); update(); }
  function startTimer() {
    started = Date.now();
    timer = setInterval(() => I.set(elapsed, "textContent", `当前请求已等待 ${Math.floor((Date.now() - started) / 1000)} 秒。`), 1000);
  }
  function endTimer() { clearInterval(timer); elapsed.textContent = ""; }
  function names() { return YCGAI.taxonomyNames(nameInputs.map(input => input.value)); }
  const generatePlan = button("生成精简方案", async () => {
    if (running) return;
    try {
      YCGAI.planData(getState(), instructions.value, I.language);
      busy("plan"); startTimer();
      meter.hidden = false; meter.removeAttribute("value");
      I.set(progress, "textContent", "正在根据你的要求规划总体分类…");
      language = I.language; jobInstructions = instructions.value;
      const response = await call({type: "aiPlan", instructions: jobInstructions, language});
      base = response.base; plan = response.plan;
      nameInputs = plan.map(item => node("input", {type: "text", value: item.name, maxlength: "40", "aria-label": `方案分类 ${plan.indexOf(item) + 1}`}));
      planView.replaceChildren(planInfo, ...plan.map((item, index) => node("div", {class: "plan-category"}, [
        node("label", {class: "control-label", text: `方案分类 ${index + 1}`}, [nameInputs[index]]), node("p", {class: "muted", text: item.description, localize: false})
      ])));
      planView.hidden = false;
      I.set(planInfo, "textContent", `方案共 ${plan.length} 类，参考 ${response.sampleCount} 个频道样本；将重新归类全部 ${base.channels.length} 个已收集频道。`);
      I.set(progress, "textContent", "请检查分类数量与名称，再开始自动归类。此时尚未修改分类。");
    } catch (error) { I.set(progress, "textContent", error.message); }
    finally { endTimer(); meter.hidden = !base; if (base) { meter.max = 1; meter.value = 1; } busy(false); }
  }, {class: "primary"});
  const classify = button("按方案自动归类全部频道", async () => {
    if (running || !base || stale()) return;
    try {
      if (!job) {
        const taxonomy = names();
        job = {pending: base.channels.map(channel => channel.id), total: base.channels.length, taxonomy};
      }
      if (!job.pending.length) return;
      stopRequested = false; busy("classify"); startTimer();
      while (job.pending.length && !stopRequested) {
        if (stale()) throw new Error("频道或分类已变更，请重新生成精简方案");
        const channelIds = job.pending.slice(0, YCGAI.BATCH), done = job.total - job.pending.length;
        started = Date.now();
        I.set(progress, "textContent", `按固定 ${job.taxonomy.length} 类归类：已完成 ${done} / ${job.total} 个频道。`);
        const outputLanguage = language === "en" ? "Use English explanations. " : "请使用中文说明。";
        const response = await call({type: "aiSuggest", taxonomy: job.taxonomy, channelIds, instructions: outputLanguage + jobInstructions});
        assignments.push(...response.suggestions);
        job.pending.splice(0, channelIds.length); renderAssignments();
        if (!job.reviewOpened) { job.reviewOpened = true; showReview(true); }
      }
      I.set(progress, "textContent", job.pending.length ? "已暂停；可继续剩余频道，已有结果会保留。" : "归类预览已完成。应用将替换全部旧分类和频道归属；可撤销最近一次应用。");
      say("AI 建议尚未应用，请在预览中确认");
    } catch (error) { I.set(progress, "textContent", `${I.t(error.message)} ${I.t("已有结果保留；可继续剩余频道，或重新规划。")}`); }
    finally { endTimer(); busy(false); }
  });
  const stop = button("本批完成后停止", () => { stopRequested = true; update(); }, {hidden: ""});
  const apply = button("替换旧分类并应用", async () => {
    if (running || !job || job.pending.length || stale() || applied) return;
    try {
      busy("apply"); meter.removeAttribute("value");
      I.set(progress, "textContent", "正在替换分类并保存全部频道归属…");
      await mutate({type: "applyOrganization", base, names: job.taxonomy, suggestions: assignments.map(item => ({channelId: item.channelId, groups: item.groups}))});
      applied = true; onApplied();
      I.set(progress, "textContent", `已整理为 ${job.taxonomy.length} 类，处理 ${assignments.length} 个频道。可撤销上次 AI 分类。`);
      say("精简分类已应用");
    } catch (error) { I.set(progress, "textContent", error.message); }
    finally { busy(false); }
  }, {class: "primary", disabled: ""});
  const reset = button("重新规划", () => {
    if (running) return;
    plan = []; nameInputs = []; base = null; assignments = []; job = null; applied = false;
    planView.replaceChildren(); planView.hidden = true; review.refresh({reset: true}); showReview(false); meter.hidden = true;
    progress.textContent = ""; update();
  });
  const review = createYCGReview({node, button, getItems: () => assignments, getChannels: () => base ? YCGCore.channelMap(base) : new Map(),
    getNames: () => job?.taxonomy || [], renderItem: renderAssignment, disabled: () => !!running || applied || !!stale(),
    setGroups(item, groups) { item.groups = groups; update(); }
  });
  preview.append(review.element);
  const reviewEntry = button("打开审核工作台", () => showReview(true), {class: "review-entry", hidden: ""});
  const element = node("div", {class: "organizer", hidden: ""}, [
    node("div", {class: "ai-configuration"}, [node("p", {class: "muted", text: "先按自然语言规划 1–20 个总体分类，再用固定方案归类全部已收集频道。应用时替换旧分类列表，包括手动分类。"}),
    node("label", {class: "control-label", text: "精简分类要求"}, [instructions]), countHint,
    node("p", {class: "muted", text: "规划会发送现有分类名称及最多 100 个频道的名称和简介样本；归类时按批次发送全部频道信息。可能消耗模型额度。"}),
    node("div", {class: "tools"}, [generatePlan, reset]), planView]),
    node("div", {class: "ai-actions"}, [node("div", {class: "tools"}, [classify, stop, apply]), meter, progress, elapsed]),
    assignmentInfo, reviewEntry, preview
  ]);
  instructions.addEventListener("input", update);
  function update() {
    try { const rule = YCGAI.countRule(instructions.value); I.set(countHint, "textContent", `数量约束：${rule.min}–${rule.max} 类。其他自然语言要求由 AI 理解，请检查方案。`); }
    catch (error) { I.set(countHint, "textContent", error.message); }
    const changed = stale() && !applied;
    instructions.disabled = !!running || !!base;
    generatePlan.disabled = !!running || !!base || !getState().channels.length;
    reset.disabled = !!running;
    classify.hidden = !base || applied || (job && !job.pending.length);
    classify.disabled = !!running || !!changed || (job && !job.pending.length);
    I.set(classify, "textContent", job?.pending.length ? `继续归类剩余 ${job.pending.length} 个频道` : "按方案自动归类全部频道");
    stop.hidden = running !== "classify"; stop.disabled = stopRequested;
    apply.hidden = !job || applied;
    apply.disabled = !!running || !!changed || !!job?.pending.length || !assignments.length;
    reviewEntry.hidden = !assignments.length;
    nameInputs.forEach(input => { input.disabled = !!running || !!job; });
    preview.querySelectorAll("input").forEach(input => { input.disabled = !!running || applied || !!changed; });
    if (job && running !== "apply") { meter.hidden = false; meter.max = job.total; meter.value = job.total - job.pending.length; }
    const missing = assignments.filter(item => !item.groups.length).length, low = assignments.filter(item => item.certainty === "low").length;
    I.set(assignmentInfo, "textContent", assignments.length ? `预览 ${assignments.length} 个频道，其中 ${missing} 个未分类、${low} 个低把握。信息不足时可保留未分类。` : "");
    if (changed && !running) I.set(progress, "textContent", "频道或分类已变更，请重新生成精简方案");
    review.update();
  }
  function renderAssignments() {
    review.refresh(); update();
  }
  function renderAssignment(item, channel) {
      const summary = node("summary", {text: item.groups.join(" / ") || I.t("未分类"), localize: false});
      const controls = job.taxonomy.map(name => {
        const input = node("input", {type: "checkbox", "aria-label": `${channel.title}：${name}（精简方案）`, onChange: event => {
          if (event.target.checked && item.groups.length >= 3) { input.checked = false; I.set(progress, "textContent", "每个频道最多选择 3 类"); return; }
          item.groups = item.groups.filter(value => value !== name);
          if (event.target.checked) item.groups.push(name);
          item.reviewed = true; summary.textContent = item.groups.join(" / ") || I.t("未分类"); update();
        }});
        input.checked = item.groups.includes(name);
        return node("label", {class: "membership"}, [input, node("span", {text: name, localize: false})]);
      });
      return node("li", {class: "ai-suggestion"}, [node("div", {class: "channel-identity"}, [createYCGAvatar(node, channel), node("strong", {text: channel.title, localize: false})]),
        node("details", {class: "assignment-edit"}, [summary, node("div", {class: "memberships"}, controls)]),
        node("p", {class: "muted", text: item.reason, localize: false})]);
  }
  return {element, update, dispose() { clearInterval(timer); }, localize() { if (assignments.length) renderAssignments(); update(); }, didUndo() { showReview(false); I.set(progress, "textContent", "上次 AI 分类已撤销"); }};
};
