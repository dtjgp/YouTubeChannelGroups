"use strict";
const $ = id => document.getElementById(id), I = YCGI18n;
const provider = $("provider"), endpoint = $("endpoint"), model = $("model"), secret = $("secret"), status = $("status");
let saving = false;
let privacy = {epoch: null, collectionPaused: false}, erasing = false;
const sharedStyle = document.createElement("style"); sharedStyle.textContent = YCGDesign.tokens; document.head.append(sharedStyle);
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let hasYouTubeTheme = false;
function syncTheme(value) {
  try { YCGTheme.apply(document.documentElement, value); hasYouTubeTheme = true; } catch {}
}
YCGTheme.apply(document.documentElement, YCGTheme.fallback(systemTheme.matches));
systemTheme.addEventListener("change", () => {
  if (!hasYouTubeTheme) YCGTheme.apply(document.documentElement, YCGTheme.fallback(systemTheme.matches));
});
send("themeGet").then(({theme}) => { if (theme) syncTheme(theme); }).catch(() => {});
function connectLiveTheme() {
  const port = chrome.runtime.connect({name: "ycg-updates"});
  port.onMessage.addListener(message => { if (message.theme) syncTheme(message.theme); });
  port.onDisconnect.addListener(() => { if (chrome.runtime.id) setTimeout(connectLiveTheme, 1000); });
}
connectLiveTheme();
I.register(document);
function say(text, error = false) { I.set(status, "textContent", text); status.classList.toggle("error", error); }
async function send(type, extra = {}) {
  const epoch = privacy.epoch;
  const response = await chrome.runtime.sendMessage({scope: "ycg", epoch, type, ...extra});
  if (epoch !== privacy.epoch && !["privacyGet", "privacyDelete"].includes(type)) throw new Error("数据已删除，旧操作已取消；请重新开始");
  if (!response?.ok) throw new Error(response?.error || "设置保存失败");
  return response;
}
function phase(value, text) { $("save-progress").value = value; I.set($("save-phase"), "textContent", text); }
function summary() {
  const names = {codex: "本机 Codex", claude: "本机 Claude", api: "云端 API"};
  const values = [I.t(names[provider.value]), model.value || I.t("CLI 默认模型")];
  if (provider.value === "api" && endpoint.value) { try { values.push(new URL(endpoint.value).host); } catch {} }
  $("draft-summary").textContent = values.join(" · ");
}
function labels() {
  const api = provider.value === "api";
  $("api-fields").hidden = !api; $("native-fields").hidden = api; endpoint.required = api;
  I.set($("save"), "textContent", api ? "保存并授权连接地址" : "保存设置");
  model.required = api; I.set(model, "placeholder", api ? "供应商提供的模型名称" : "留空使用 CLI 默认模型"); summary();
  I.set($("model-hint"), "textContent", api ? "供应商提供的模型名称" : "本机模式可留空，使用 CLI 默认模型");
}
I.onChange(language => { I.refresh(document); document.documentElement.lang = language; $("language").value = language; labels(); });
$("language").addEventListener("change", async () => {
  $("language").disabled = true; I.set($("language-status"), "textContent", "正在保存界面语言…");
  try {
    const {preferences} = await send("preferencesSave", {preferences: {language: $("language").value}});
    I.change(preferences.language); I.set($("language-status"), "textContent", "界面语言已保存");
  } catch (error) { $("language").value = I.language; I.set($("language-status"), "textContent", error.message); }
  finally { $("language").disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[YCGTheme.KEY]?.newValue) syncTheme(changes[YCGTheme.KEY].newValue);
  const language = changes["ycg.preferences.v1"]?.newValue?.language;
  if (area === "local" && language && language !== I.language) I.change(language);
  if (area === "local" && changes[YCGPrivacy.KEY]?.newValue) {
    const next = YCGPrivacy.normalize(changes[YCGPrivacy.KEY].newValue), changed = next.epoch !== privacy.epoch;
    privacy = next;
    if (changed) resetOptions();
  }
});
provider.addEventListener("change", () => {
  endpoint.value = ""; model.value = ""; secret.value = ""; I.set(secret, "placeholder", "请输入"); labels();
  for (const input of [endpoint, model, secret]) { input.removeAttribute("aria-invalid"); input.setAttribute("aria-describedby", input.id + "-hint"); }
});
for (const event of ["input", "change"]) $("settings").addEventListener(event, () => { if (!saving) { phase(0, "尚未保存"); summary(); } });
$("settings").addEventListener("invalid", event => { event.target.setAttribute("aria-invalid", "true"); }, true);
$("settings").addEventListener("input", event => {
  event.target.removeAttribute("aria-invalid");
  const description = event.target.getAttribute("aria-describedby");
  if (description) event.target.setAttribute("aria-describedby", description.replace(/\s*status\b/g, "").trim());
});
$("settings").addEventListener("submit", async event => {
  event.preventDefault(); if (saving) return;
  const operationEpoch = privacy.epoch;
  let config;
  try { config = YCGAI.settings({provider: provider.value, endpoint: endpoint.value, model: model.value, secret: secret.value}); }
  catch (error) {
    phase(0, "尚未保存"); say(error.message, true);
    const field = $(error.field);
    if (field) { field.setAttribute("aria-invalid", "true"); field.setAttribute("aria-describedby", `${field.id}-hint status`); field.focus(); }
    return;
  }
  saving = true; $("settings").setAttribute("aria-busy", "true"); $("save").disabled = $("clear").disabled = true;
  $("settings").querySelectorAll("input, select").forEach(input => { input.disabled = true; });
  try {
    phase(1, "正在验证设置…");
    if (config.provider === "api") {
      phase(2, "正在请求连接权限…");
      const granted = await chrome.permissions.request({origins: [YCGAI.originPattern(config.endpoint)]});
      if (!granted) throw new Error("未获授权；AI 配置未修改");
      if (privacy.epoch !== operationEpoch) {
        try {
          const origin = YCGAI.originPattern(config.endpoint);
          if (YCGPrivacy.optionalOrigins(await chrome.permissions.getAll(), chrome.runtime.getManifest()).includes(origin)) {
            if (!await chrome.permissions.remove({origins: [origin]}) || await chrome.permissions.contains({origins: [origin]})) throw new Error("Permission remains");
          }
        } catch { throw new Error("本机数据已删除，部分权限未撤销，请重试撤销权限"); }
        throw new Error("数据已删除，旧操作已取消；请重新开始");
      }
    }
    phase(3, "正在保存到本机…");
    const result = await send("settingsSave", {config, epoch: operationEpoch});
    secret.value = ""; I.set(secret, "placeholder", result.config.secretConfigured ? "已保存；留空保留" : "未配置");
    phase(4, "设置已保存"); say("已保存。回到 YouTube 分类面板，点击“生成分类建议”。");
  } catch (error) { phase(0, "尚未保存"); say(error.message, true); }
  finally {
    config.secret = "";
    saving = false; $("settings").removeAttribute("aria-busy"); $("save").disabled = $("clear").disabled = false;
    $("settings").querySelectorAll("input, select").forEach(input => { input.disabled = false; });
    if (document.activeElement === document.body) $("save").focus({preventScroll: true});
  }
});
$("extension-id").textContent = chrome.runtime.id;
$("copy-id").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(chrome.runtime.id); say("扩展 ID 已复制，可粘贴到安装器。"); }
  catch { say("请手动复制上方扩展 ID。"); }
});
$("detect").addEventListener("click", async () => {
  $("detect").disabled = true; I.set($("native-status"), "textContent", "正在由浏览器启动小助手…");
  try {
    const result = await send("nativeStatus");
    I.set($("native-status"), "textContent", `小助手 ${result.version} 已连接。已检测到：${result.providers.join(", ") || "尚未找到命令，请安装官方 CLI 后重新安装小助手"}。账号登录状态仍需首次分类确认。`);
  } catch (error) { I.set($("native-status"), "textContent", error.message); }
  finally { $("detect").disabled = false; }
});
$("clear").addEventListener("click", async () => {
  if (saving) return;
  try { const result = await send("settingsClear"); secret.value = ""; I.set(secret, "placeholder", "未配置"); phase(0, "尚未保存"); say(result.remaining.length ? "AI 配置已清除，部分权限未撤销，请重试撤销权限" : "AI 配置及密钥已清除，可选连接权限已撤销"); }
  catch (error) { say(error.message, true); }
});
(async () => {
  try {
    privacy = (await send("privacyGet")).privacy;
    I.change(I.preferred((await send("preferencesGet")).preferences.language));
    const {config} = await send("settingsGet");
    if (config) { provider.value = config.provider; endpoint.value = config.endpoint; model.value = config.model; I.set(secret, "placeholder", config.secretConfigured ? "已保存；留空保留" : "未配置"); phase(4, "设置已保存"); }
    labels();
  } catch (error) { say(error.message, true); }
  // The fields stay disabled until the saved settings load, so the load cannot overwrite early edits.
  finally { $("settings-fields").disabled = false; }
})();

function resetOptions() {
  provider.value = "codex"; endpoint.value = model.value = secret.value = ""; secret.type = "password";
  $("show-secret").setAttribute("aria-pressed", "false"); I.set($("show-secret"), "textContent", "显示密钥");
  for (const field of [model, endpoint, secret]) { field.removeAttribute("aria-invalid"); field.setAttribute("aria-describedby", field.id + "-hint"); }
  I.set(secret, "placeholder", "未配置"); hasYouTubeTheme = false; I.change(I.preferred()); labels(); phase(0, "尚未保存");
}
$("show-secret").addEventListener("click", () => {
  const show = secret.type === "password"; secret.type = show ? "text" : "password";
  $("show-secret").setAttribute("aria-pressed", String(show)); I.set($("show-secret"), "textContent", show ? "隐藏密钥" : "显示密钥");
});
$("privacy-export").addEventListener("click", async () => {
  try {
    const {state} = await send("get"), exported = YCGExport.document(state, "json"), url = URL.createObjectURL(new Blob([exported.text], {type: exported.type}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "youtube-channel-groups-backup.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); I.set($("privacy-status"), "textContent", "备份已生成");
  } catch (error) { I.set($("privacy-status"), "textContent", error.message); }
});
$("privacy-delete").addEventListener("click", () => { $("erase-ack").checked = false; $("erase-status").textContent = ""; $("erase-dialog").showModal(); });
$("erase-cancel").addEventListener("click", () => { if (!erasing) $("erase-dialog").close(); });
$("erase-dialog").addEventListener("cancel", event => { if (erasing) event.preventDefault(); });
$("erase-form").addEventListener("submit", async event => {
  event.preventDefault(); if (erasing) return;
  erasing = true; $("erase-confirm").disabled = $("erase-cancel").disabled = true;
  I.set($("erase-status"), "textContent", "正在删除本机数据并撤销权限…");
  try {
    const result = await send("privacyDelete", {confirm: "DELETE_ALL"}); privacy = result.privacy;
    resetOptions(); $("erase-dialog").close(); $("privacy-delete").focus();
    I.set($("privacy-status"), "textContent", result.remaining.length ? "本机数据已删除，部分权限未撤销，请重试撤销权限" : "本机数据已删除，自动收集已暂停");
  } catch (error) { I.set($("erase-status"), "textContent", error.message); }
  finally { erasing = false; $("erase-confirm").disabled = $("erase-cancel").disabled = false; }
});
$("privacy-revoke").addEventListener("click", async () => {
  try { const result = await send("privacyRevoke"); I.set($("privacy-status"), "textContent", result.remaining.length ? "部分权限未撤销，请重试" : "可选连接权限已撤销"); }
  catch (error) { I.set($("privacy-status"), "textContent", error.message); }
});
