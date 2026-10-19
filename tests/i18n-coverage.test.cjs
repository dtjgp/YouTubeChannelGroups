const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const I = require("../extension/i18n.js");

const directory = path.join(__dirname, "../extension");
const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const chinese = /[㐀-鿿]/;
// Model-facing prompts, regular expressions and strings assembled from parts that are translated separately.
const exempt = [
  /^你是频道分类助手/, /^\\n\\n以下 JSON/, /^\(\?:/, /^十$/, /^\(\$\{number\}\)/, /^这是总体分类规划任务/, /^分类槽位 /,
  /^固定分类任务/, /^请使用中文/, /^\$\{label\}无效$/, /^(分类 ID|分类名称|频道名称)$/, /^\$\{I\.t\(/,
  /^AI 请求失败（HTTP $/, /^），请检查登录/,
  // The language button names the target language in that language, so it is never translated.
  /^中$/, /^(中：)?切换到中文$/
];

test("every Chinese interface string has an English translation", () => {
  I.change("en");
  const missing = [];
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".js") && name !== "i18n.js")) {
    for (const match of fs.readFileSync(path.join(directory, file), "utf8").matchAll(literal)) {
      const source = match[1] ?? match[2] ?? match[3];
      if (!chinese.test(source) || exempt.some(pattern => pattern.test(source))) continue;
      const sample = source.replace(/\$\{[^}]*\}/g, "7");
      if (I.t(sample) === sample) missing.push(`${file}: ${source.slice(0, 80)}`);
    }
  }
  I.change("zh-CN");
  assert.deepEqual(missing, []);
});

test("assembled validation and connection errors translate as complete sentences", () => {
  I.change("en");
  assert.equal(I.t("分类名称无效"), "Invalid category name");
  assert.equal(I.t("AI 请求失败（HTTP 500），请检查登录、额度或密钥"), "AI request failed (HTTP 500). Check login, credits, or API key");
  assert.equal(I.t("无法连接本机小助手：连接中断。请在 AI 设置中检测安装，并确认扩展 ID 已授权。"), "Cannot connect to the helper: Connection lost. Check installation and extension ID in AI settings.");
  I.change("zh-CN");
});

test("a saved language wins; without one the browser language decides", () => {
  assert.equal(I.preferred("en", "zh-CN"), "en");
  assert.equal(I.preferred("zh-CN", "en-US"), "zh-CN");
  assert.equal(I.preferred(null, "zh-Hans-US"), "zh-CN");
  assert.equal(I.preferred(null, "zh-TW"), "zh-CN");
  assert.equal(I.preferred(null, "en-US"), "en");
  assert.equal(I.preferred(undefined, "de-DE"), "en");
  assert.equal(I.preferred("fr", "en-GB"), "en");
});
