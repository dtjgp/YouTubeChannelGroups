"use strict";
// This policy accepts only bundled worker dependencies, never message or page input.
const workerScripts = ["design.js", "privacy.js", "core.js", "ai.js", "theme.js", "layout.js"];
const bootstrap = globalThis.trustedTypes?.createPolicy("ycg-bootstrap", {
  createScriptURL(value) {
    if (!workerScripts.includes(value)) throw new TypeError("Unrecognized worker dependency");
    return value;
  }
});
importScripts(...workerScripts.map(value => bootstrap ? bootstrap.createScriptURL(value) : value));

// Restrict secrets to extension pages and the service worker.
const ready = chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
const ports = new Set();
const PREFERENCES = "ycg.preferences.v1", UNDO = "ycg.ai.undo.v1", DRAFT = "ycg.ai.draft.", PENDING = "ycg.pending.";
// Drafts live in session storage per tab: they survive a reload but not closing the tab or browser.
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove([DRAFT + tabId, PENDING + tabId]).catch(() => {}); });
// One-time repair after an install or update (reloading an unpacked extension also counts).
const REPAIRS = "ycg.repairs.v1";
chrome.runtime.onInstalled.addListener(details => { if (YCGCore.needsNameRepair(details)) serial(repairSavedNames).catch(() => {}); });
async function repairSavedNames() {
  const stored = await chrome.storage.local.get([YCGCore.KEY, REPAIRS]);
  if (stored[REPAIRS]?.doubledNames) return;
  const updates = {[REPAIRS]: {doubledNames: true}};
  // After a full deletion every saved name was collected by a fixed version, so there is nothing to repair.
  const deleted = !!YCGPrivacy.normalize((await chrome.storage.local.get(YCGPrivacy.KEY))[YCGPrivacy.KEY]).epoch;
  if (stored[YCGCore.KEY] && !deleted) {
    const {state, repaired} = YCGCore.repairDoubledNames(YCGCore.validate(stored[YCGCore.KEY]));
    if (repaired) updates[YCGCore.KEY] = state;
  }
  await chrome.storage.local.set(updates);
}
// A null language means no saved choice; pages resolve it from the browser language.
const preferences = value => ({language: ["zh-CN", "en"].includes(value?.language) ? value.language : null});
const syncTabTheme = tabId => chrome.tabs.sendMessage(tabId, {scope: "ycg", type: "syncTheme"}).catch(() => {});
chrome.tabs.onActivated.addListener(({tabId}) => { syncTabTheme(tabId); });
chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId < 0) return;
  try { const [tab] = await chrome.tabs.query({active: true, windowId}); if (tab?.id) await syncTabTheme(tab.id); } catch {}
});
let queue = Promise.resolve(), generating = false;
let requestController = new AbortController();
let transientTheme = null;
async function readPrivacy() { return YCGPrivacy.normalize((await chrome.storage.local.get(YCGPrivacy.KEY))[YCGPrivacy.KEY]); }
async function guard(message) { const privacy = await readPrivacy(); YCGPrivacy.assertCurrent(privacy, message.epoch); return privacy; }
function serial(task) {
  const result = queue.then(() => ready).then(task);
  queue = result.catch(() => {});
  return result;
}
async function readState() {
  const stored = await chrome.storage.local.get(YCGCore.KEY);
  return YCGCore.validate(stored[YCGCore.KEY] ?? YCGCore.empty());
}
async function stateHash(state) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(state)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "ycg-updates" || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const update = {};
  if (changes[YCGCore.KEY]) update.state = YCGCore.validate(changes[YCGCore.KEY].newValue ?? YCGCore.empty());
  if (changes[PREFERENCES]) update.preferences = preferences(changes[PREFERENCES].newValue);
  if (changes[YCGLayout.KEY]) update.panelSize = YCGLayout.normalizeSize(changes[YCGLayout.KEY].newValue);
  if (changes[YCGLayout.LAUNCHER_KEY]) update.launcherPosition = YCGLayout.normalizePosition(changes[YCGLayout.LAUNCHER_KEY].newValue);
  if (changes[UNDO]) update.undoAvailable = !!changes[UNDO].newValue;
  if (changes[YCGPrivacy.KEY]) update.privacy = YCGPrivacy.normalize(changes[YCGPrivacy.KEY].newValue);
  if (!Object.keys(update).length) return;
  for (const port of ports) {
    try { port.postMessage(update); }
    catch { ports.delete(port); }
  }
});
async function savedConfig() {
  await ready;
  const stored = await chrome.storage.local.get(YCGAI.SETTINGS_KEY);
  const previous = stored[YCGAI.SETTINGS_KEY];
  if (!previous) return null;
  const config = YCGAI.settings(previous);
  return config;
}
function trustedSettingsPage(sender) {
  return sender.url === chrome.runtime.getURL("options.html");
}
async function jsonFetch(url, options, timeout = 25000, signal) {
  let response;
  try {
    response = await fetch(url, {credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", ...options, signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])});
  } catch { throw new Error("AI 连接失败或超时；请检查服务地址、密钥和网络"); }
  if (!response.ok) throw new Error("AI 请求失败（HTTP " + response.status + "），请检查登录、额度或密钥");
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200000) { await reader.cancel(); throw new Error("AI 返回内容过长"); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); }
  catch { throw new Error("AI 服务未返回有效 JSON"); }
}
function nativeRequest(message, timeout = 135000, signal) {
  return new Promise((resolve, reject) => {
    let port, timer, done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      try { port?.disconnect(); } catch {}
      if (error) reject(new Error(error)); else resolve(result);
    };
    const cancel = () => finish("AI 连接已取消；请重新开始");
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, {once: true});
    try {
      port = chrome.runtime.connectNative(YCGAI.NATIVE_HOST);
      port.onMessage.addListener(response => {
        if (!response?.ok) finish(response?.error || "本机小助手返回错误");
        else finish(null, response);
      });
      port.onDisconnect.addListener(() => {
        const detail = chrome.runtime.lastError?.message || "连接中断";
        finish(`无法连接本机小助手：${detail}。请在 AI 设置中检测安装，并确认扩展 ID 已授权。`);
      });
      timer = setTimeout(() => finish("本机 AI 等待超时，请稍后重试"), timeout);
      port.postMessage(message);
    } catch { finish("本机小助手未安装或不受当前浏览器支持，请打开 AI 设置"); }
  });
}
async function suggest(message) {
  if (generating) throw new Error("已有 AI 请求正在运行，请等待完成");
  generating = true;
  const controller = requestController;
  try {
    await guard(message);
    const config = await savedConfig();
    if (!config) throw new Error("请先打开“AI 设置”选择 Codex、Claude 或云端 API");
    const state = await serial(readState), planning = message.type === "aiPlan";
    let data;
    if (planning) data = YCGAI.planData(state, message.instructions, message.language);
    else {
      data = YCGAI.requestData(state, message.channelIds, message.instructions);
      if (message.taxonomy) {
        if (typeof message.instructions !== "string" || message.instructions.length > 750) throw new Error("请用 1–700 字描述分类数量和侧重点");
        data.groups = YCGAI.taxonomyNames(message.taxonomy);
        data.instructions = "固定分类任务：严格只使用 groups 中的分类名，不得新增或改名。每频道最多3类；信息不足时返回空 groups。用户要求：" + message.instructions;
      }
    }
    let answer;
    await guard(message);
    if (controller.signal.aborted) throw new Error("数据已删除，旧操作已取消；请重新开始");
    if (config.provider === "api") {
      if (!await chrome.permissions.contains({origins: [YCGAI.originPattern(config.endpoint)]})) throw new Error("尚未授权 AI 服务地址，请在 AI 设置中保存并授权");
      const url = config.endpoint.endsWith("/chat/completions") ? config.endpoint : config.endpoint + "/chat/completions";
      const result = await jsonFetch(url, {method: "POST", headers: {"Content-Type": "application/json", ...(config.secret ? {Authorization: "Bearer " + config.secret} : {})}, body: JSON.stringify({model: config.model, stream: false, max_tokens: 4096, messages: [{role: "system", content: YCGAI.SYSTEM}, {role: "user", content: JSON.stringify(data)}]})}, 25000, controller.signal);
      answer = result.choices?.[0]?.message?.content;
    } else {
      answer = (await nativeRequest({action: "classify", provider: config.provider, model: config.model, data}, 135000, controller.signal)).result;
    }
    await guard(message);
    if (planning) return {ok: true, plan: YCGAI.parsePlan(answer, message.instructions), base: state, sampleCount: Math.min(100, state.channels.length)};
    return {ok: true, suggestions: message.taxonomy ? YCGAI.parseFixed(answer, data.channels.map(channel => channel.id), message.taxonomy) : YCGAI.parse(answer, data.channels.map(channel => channel.id))};
  } finally { if (requestController === controller) generating = false; }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.scope !== "ycg" || sender.id !== chrome.runtime.id) return;
  let task;
  if (message.type === "aiSuggest" || message.type === "aiPlan") {
    if (!sender.url?.startsWith("https://www.youtube.com/") || sender.frameId !== 0) task = Promise.reject(new Error("只允许 YouTube 主页面请求 AI 分类"));
    else task = suggest(message);
  }
  else if (["privacyGet", "privacyResume", "privacyDelete", "privacyRevoke"].includes(message.type)) task = serial(async () => {
    if (message.type === "privacyGet") return {ok: true, privacy: await readPrivacy()};
    if (message.type === "privacyResume") {
      const privacy = await guard(message); privacy.collectionPaused = false;
      await chrome.storage.local.set({[YCGPrivacy.KEY]: privacy}); return {ok: true, privacy};
    }
    if (!trustedSettingsPage(sender)) throw new Error("数据管理仅可在扩展设置页操作");
    if (message.type === "privacyRevoke") {
      await guard(message);
      requestController.abort(); requestController = new AbortController(); generating = false;
      return {ok: true, ...await YCGPrivacy.revoke(chrome.permissions, chrome.runtime.getManifest())};
    }
    if (message.confirm !== "DELETE_ALL") throw new Error("请先确认删除全部扩展数据");
    await guard(message);
    requestController.abort(); requestController = new AbortController(); generating = false;
    transientTheme = null;
    await chrome.storage.session.clear();
    const result = await YCGPrivacy.erase(chrome.storage.local, chrome.permissions, chrome.runtime.getManifest(), crypto.randomUUID());
    return {ok: true, ...result};
  });
  else if (message.type === "draftGet" || message.type === "draftSave") task = serial(async () => {
    if (!sender.url?.startsWith("https://www.youtube.com/") || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) throw new Error("只允许 YouTube 主页面保存 AI 预览");
    const privacy = await guard(message), key = DRAFT + sender.tab.id;
    const channelIds = (await readState()).channels.map(channel => channel.id);
    if (message.type === "draftSave") {
      const draft = message.draft && YCGAI.draft(message.draft, channelIds);
      if (draft && new TextEncoder().encode(JSON.stringify(draft)).length > 4 * 1024 * 1024) throw new Error("AI 预览过大，刷新后无法恢复");
      if (draft) await chrome.storage.session.set({[key]: {epoch: privacy.epoch, draft}}); else await chrome.storage.session.remove(key);
      return {ok: true};
    }
    const stored = (await chrome.storage.session.get(key))[key];
    return {ok: true, draft: stored?.epoch === privacy.epoch ? YCGAI.draft(stored.draft, channelIds) : null};
  });
  // A pending unsubscribe or subscription refresh survives one navigation in the same tab, for at most a minute.
  else if (message.type === "pendingSet" || message.type === "pendingTake") task = serial(async () => {
    if (!sender.url?.startsWith("https://www.youtube.com/") || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) throw new Error("只允许 YouTube 主页面执行此操作");
    const privacy = await guard(message), key = PENDING + sender.tab.id;
    if (message.type === "pendingSet") {
      const action = message.pending?.action;
      if (action === "unsubscribe" && !YCGCore.path(message.pending.channelId)) throw new Error("频道已不存在");
      if (!["unsubscribe", "sync"].includes(action)) throw new Error("操作无效");
      await chrome.storage.session.set({[key]: {epoch: privacy.epoch, action, ...(action === "unsubscribe" ? {channelId: message.pending.channelId} : {}), expires: Date.now() + 60000}});
      return {ok: true};
    }
    const pending = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    return {ok: true, pending: pending?.epoch === privacy.epoch && pending.expires > Date.now() ? {action: pending.action, channelId: pending.channelId} : null};
  });
  else if (message.type === "browse") task = serial(async () => ({ok: true, view: YCGCore.browse(await readState(), message.query)}));
  else if (message.type === "nativeStatus") task = trustedSettingsPage(sender) ? nativeRequest({action: "status"}, 10000) : Promise.reject(new Error("请在 AI 设置页检测安装"));
  else if (message.type === "openSettings") task = chrome.runtime.openOptionsPage().then(() => ({ok: true}));
  else if (message.type === "panelSizeGet" || message.type === "panelSizeSave") task = serial(async () => {
    if (message.type === "panelSizeSave") {
      await guard(message);
      const size = message.size;
      if (!size || !Number.isFinite(size.width) || (size.height !== null && !Number.isFinite(size.height)) || ["right", "bottom"].some(key => Object.hasOwn(size, key) && !Number.isFinite(size[key])) || (Object.hasOwn(size, "floating") && typeof size.floating !== "boolean")) throw new Error("面板尺寸无效");
      await chrome.storage.local.set({[YCGLayout.KEY]: YCGLayout.normalizeSize(size)});
    }
    return {ok: true, size: YCGLayout.normalizeSize((await chrome.storage.local.get(YCGLayout.KEY))[YCGLayout.KEY])};
  });
  else if (message.type === "launcherPositionGet" || message.type === "launcherPositionSave") task = serial(async () => {
    if (message.type === "launcherPositionSave") {
      await guard(message);
      const position = YCGLayout.normalizePosition(message.position);
      if (message.position !== null && !position) throw new Error("小图标位置无效");
      if (position) await chrome.storage.local.set({[YCGLayout.LAUNCHER_KEY]: position});
      else await chrome.storage.local.remove(YCGLayout.LAUNCHER_KEY);
    }
    return {ok: true, position: YCGLayout.normalizePosition((await chrome.storage.local.get(YCGLayout.LAUNCHER_KEY))[YCGLayout.LAUNCHER_KEY])};
  });
  else if (message.type === "themeGet" || message.type === "themeSet") task = serial(async () => {
    const paused = (await readPrivacy()).collectionPaused;
    const previous = paused ? transientTheme : (await chrome.storage.local.get(YCGTheme.KEY))[YCGTheme.KEY];
    if (message.type === "themeSet") {
      if (!sender.url?.startsWith("https://www.youtube.com/") || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) throw new Error("只允许 YouTube 主页面同步主题");
      const theme = YCGTheme.validate(message.theme);
      const tab = await chrome.tabs.get(sender.tab.id);
      // Keep following the last focused YouTube tab, even while settings is open.
      if (!previous || !Number.isInteger(previous.sourceTabId) || (message.active === true && tab.active) || previous.sourceTabId === sender.tab.id) {
        const next = {...theme, sourceTabId: sender.tab.id};
        if (JSON.stringify(next) !== JSON.stringify(previous)) {
          if (paused) {
            transientTheme = next;
            for (const port of ports) { try { port.postMessage({theme}); } catch { ports.delete(port); } }
          } else await chrome.storage.local.set({[YCGTheme.KEY]: next});
        }
      }
    }
    const saved = paused ? transientTheme : (await chrome.storage.local.get(YCGTheme.KEY))[YCGTheme.KEY];
    let theme = null;
    try { if (saved) theme = YCGTheme.validate(saved); } catch {}
    return {ok: true, theme};
  });
  else if (message.type === "aiInfo") task = savedConfig().then(async config => ({ok: true, config: YCGAI.publicSettings(config), undoAvailable: !!(await chrome.storage.local.get(UNDO))[UNDO]}));
  else if (message.type === "preferencesGet" || message.type === "preferencesSave") task = serial(async () => {
    if (message.type === "preferencesSave") {
      await guard(message);
      if (!["zh-CN", "en"].includes(message.preferences?.language)) throw new Error("请选择中文或 English");
      await chrome.storage.local.set({[PREFERENCES]: preferences(message.preferences)});
    }
    return {ok: true, preferences: preferences((await chrome.storage.local.get(PREFERENCES))[PREFERENCES])};
  });
  else if (["settingsGet", "settingsSave", "settingsClear"].includes(message.type)) task = serial(async () => {
    if (!trustedSettingsPage(sender)) throw new Error("AI 设置仅可在扩展设置页修改");
    if (message.type === "settingsClear") {
      await guard(message);
      requestController.abort(); requestController = new AbortController(); generating = false;
      await chrome.storage.local.remove(YCGAI.SETTINGS_KEY);
      return {ok: true, config: null, ...await YCGPrivacy.revoke(chrome.permissions, chrome.runtime.getManifest())};
    }
    const previous = await savedConfig();
    if (message.type === "settingsGet") return {ok: true, config: YCGAI.publicSettings(previous)};
    await guard(message);
    const config = YCGAI.settings(message.config);
    if (config.provider === "api") {
      if (!config.secret && previous?.provider === config.provider && previous.endpoint === config.endpoint) config.secret = previous.secret;
      if (!await chrome.permissions.contains({origins: [YCGAI.originPattern(config.endpoint)]})) throw new Error("请先授权 AI 服务地址");
    }
    await chrome.storage.local.set({[YCGAI.SETTINGS_KEY]: config});
    return {ok: true, config: YCGAI.publicSettings(config)};
  });
  else task = serial(async () => {
    const state = await readState();
    if (message.type === "get") return {ok: true, state};
    if (message.type !== "mutate") throw new Error("不支持的操作");
    const privacy = await guard(message);
    const action = message.action;
    if (action?.type === "collect" && privacy.collectionPaused) throw new Error("自动收集已暂停；点击收集按钮后恢复");
    if (action?.type === "restoreSuggestions") throw new Error("请使用撤销 AI 分类操作");
    let next, updates;
    if (action?.type === "undoSuggestions") {
      const undo = (await chrome.storage.local.get(UNDO))[UNDO];
      if (undo?.kind === "organization") {
        if (await stateHash(state) !== undo.afterHash) throw new Error("分类已发生后续修改，无法安全撤销；请手动调整或恢复备份");
        next = YCGCore.validate(undo.before);
      } else next = YCGCore.reduce(state, {type: "restoreSuggestions", entries: undo?.entries});
      updates = {[UNDO]: null};
    } else {
      next = YCGCore.reduce(state, action);
      if (action?.type === "applySuggestions") {
        const before = new Map(state.channels.map(channel => [channel.id, channel.groupIds]));
        const after = new Map(next.channels.map(channel => [channel.id, channel.groupIds]));
        updates = {[UNDO]: {entries: action.suggestions.map(item => ({channelId: item.channelId, before: before.get(item.channelId), after: after.get(item.channelId)}))}};
      }
      if (action?.type === "applyOrganization") updates = {[UNDO]: {kind: "organization", before: state, afterHash: await stateHash(next)}};
    }
    await chrome.storage.local.set({...updates, [YCGCore.KEY]: next});
    return {ok: true, state: next};
  });
  task.then(reply, error => reply({ok: false, error: error.message || "操作失败"}));
  return true;
});
async function openFromAction(tab) {
  try {
    // A tab ID needs no browsing-history permission. Only our matched content script can answer.
    await chrome.tabs.sendMessage(tab.id, {scope: "ycg", type: "open"}, {frameId: 0});
  } catch { await chrome.tabs.create({url: "https://www.youtube.com/feed/channels"}); }
}
chrome.action.onClicked.addListener(openFromAction);
// The shortcut acts only on a YouTube tab that already has the panel; it never opens a new tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-panel") return;
  try {
    const target = tab?.id ? tab : (await chrome.tabs.query({active: true, lastFocusedWindow: true}))[0];
    if (target?.id) await chrome.tabs.sendMessage(target.id, {scope: "ycg", type: "toggle"}, {frameId: 0});
  } catch {}
});
