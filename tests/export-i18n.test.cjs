const {test} = require("node:test");
const assert = require("node:assert/strict");
const Export = require("../extension/export.js"), I = require("../extension/i18n.js");
const state = {version: 1, groups: [{id: "g", name: "AI | 研究"}], channels: [{id: "/@one", title: '=HYPERLINK("bad")', description: '<img>\n说明', aliases: ["/@one"], groupIds: ["g"]}]};

test("portable exports preserve categories and neutralize spreadsheet formulas and Markdown markup", () => {
  assert.deepEqual(JSON.parse(Export.document(state).text), state);
  const csv = Export.document(state, "csv");
  assert.equal(csv.extension, "csv"); assert.ok(csv.text.startsWith("\uFEFF"));
  assert.ok(csv.text.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.text.includes('"AI | 研究"'));
  const md = Export.document(state, "markdown");
  assert.ok(md.text.includes("https://www.youtube.com/@one"));
  assert.ok(md.text.includes("AI \\| 研究"));
  assert.ok(!md.text.includes("<img>"));
  for (const title of ["+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1+2"]) {
    assert.ok(Export.document({...state, channels: [{...state.channels[0], title}]}, "csv").text.includes('"\''));
  }
  assert.throws(() => Export.document(state, "unknown"));
});

test("translation handles real progress, errors and reversible bindings without translating channel data", () => {
  I.change("en");
  assert.equal(I.t("最小化分类窗口"), "Minimize channel window");
  assert.equal(I.t("恢复频道分类窗口"), "Restore channel window");
  assert.equal(I.t("生成分类建议"), "Generate suggestions");
  assert.equal(I.t("当前预览 134 个频道，已勾选 132 个。"), "Preview: 134 channels; 132 selected.");
  assert.ok(I.t("已完成 20 / 45 个频道。AI 请求失败（HTTP 500），请检查登录、额度或密钥。可继续处理剩余 25 个，已完成的建议会保留。").includes("AI request failed (HTTP 500)"));
  assert.equal(I.t("Alpha AI"), "Alpha AI");
  const element = {setAttribute(name, value) { this[name] = value; }, querySelectorAll() { return []; }, nodeType: 1};
  I.set(element, "textContent", "保存设置"); assert.equal(element.textContent, "Save settings");
  I.change("zh-CN"); I.refresh(element); assert.equal(element.textContent, "保存设置");
  assert.throws(() => I.change("invalid"));
});

test("JSON avatar backups round trip while unsafe image addresses are discarded", () => {
  const Core = require("../extension/core.js"), avatarUrl = "https://yt3.ggpht.com/channel=s88-c";
  const value = {...state, channels: [{...state.channels[0], avatarUrl}]};
  assert.deepEqual(Core.reduce(Core.empty(), {type: "merge", state: JSON.parse(Export.document(value).text)}, () => "g"), value);
  const hostile = {...value, channels: [{...value.channels[0], avatarUrl: "javascript:alert(1)"}]};
  assert.equal(JSON.parse(Export.document(hostile).text).channels[0].avatarUrl, undefined);
});
