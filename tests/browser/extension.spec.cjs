const {test, expect, chromium} = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const {AxeBuilder} = require("@axe-core/playwright");

let context, profile, worker, testClient;
let mockServer, mockOrigin, mockMode = "valid", nativeLog, expectedID, nativeManifestPath;
let mockFailureAt = 0, mockHoldAt = 0, releaseMock;
const aiRequests = [];
const extension = process.env.YCG_TEST_EXTENSION || path.resolve(__dirname, "../../extension");
const artifacts = path.resolve(__dirname, "../../artifacts");
function fixtureResults(data, mode = "valid") {
  const planning = data.channels[0].id.startsWith("/ycg-category/");
  const plannedCount = Number(data.instructions.match(/规划为 \d+–(\d+) 个/)?.[1] || 3);
  return {suggestions: data.channels.map((channel, index) => ({channelId: channel.id,
    groups: planning ? (index < (mode === "plan-wrong" ? plannedCount + 1 : plannedCount) ? [`总体分类${index + 1}`] : [])
      : data.instructions.startsWith("固定分类任务") ? (mode === "org-rogue" ? ["方案外新分类"] : mode === "org-unknown" && channel.id === "/@bulk0" ? [] : [data.groups[index % data.groups.length]]) : [index ? "音乐" : "AI建议"],
    reason: "模拟响应，仅测试流程", certainty: planning || data.instructions.startsWith("固定分类任务") || mode === "bulk" || !index ? "high" : "low"}))};
}
const channel = (handle, title, id = "") => `<ytd-channel-renderer><a id="main-link" href="/@${handle}"><span id="channel-title">${title}</span><small> · 10 万位订阅者</small></a>${id ? `<a id="avatar" href="/channel/${id}"></a>` : ""}<div id="description"><a href="/@mentioned">推荐频道</a></div></ytd-channel-renderer>`;
const video = (handle, title, type = "ytd-rich-item-renderer") => `<${type} data-test-channel="${handle}"><div class="thumbnail">▶</div><h3>${title}</h3><ytd-channel-name id="channel-name"><a href="/@${handle}">${handle}</a></ytd-channel-name></${type}>`;
const html = body => `<!doctype html><html lang="zh-CN"><head><title>频道分类 · 隔离测试页面</title><style>html{--yt-spec-base-background:#fff;--yt-spec-raised-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060;--yt-spec-call-to-action:#065fd4;--yt-spec-outline:rgba(0,0,0,.2);--yt-spec-badge-chip-background:rgba(0,0,0,.05)}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-raised-background:#212121;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa;--yt-spec-call-to-action:#3ea6ff;--yt-spec-outline:rgba(255,255,255,.2);--yt-spec-badge-chip-background:rgba(255,255,255,.1)}html,body{background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary)}body{margin:0;font:16px system-ui}header{height:56px;background:var(--yt-spec-raised-background);border-bottom:1px solid #ddd;padding:12px 28px;box-sizing:border-box}ytd-app{display:block;width:100%}main{margin:36px 40px 50px}h1{font-size:24px}ytd-channel-renderer{display:block;padding:18px;background:var(--yt-spec-raised-background);border-radius:12px;margin:10px 0}a{color:var(--yt-spec-text-primary);text-decoration:none}ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-video-renderer,yt-lockup-view-model{display:block;background:var(--yt-spec-raised-background);padding:12px;margin:12px 0;border-radius:12px}.thumbnail{height:105px;background:#e4e9e6;display:grid;place-items:center;border-radius:8px;color:#6c8173;font-size:24px}h3{font-size:16px;margin:8px 0}small{color:#777}</style></head><body><ytd-app><header>▶ YouTube <small> / 扩展功能测试 · 示例频道</small></header><main>${body}</main></ytd-app></body></html>`;

test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "ycg-extension-test-"));
  const testExtension = path.join(profile, "extension");
  await fs.cp(extension, testExtension, {recursive: true});
  // A separate extension page sends real messages to the service worker.
  // It exists only in the temporary test copy and is never shipped.
  await fs.writeFile(path.join(testExtension, "test-client.html"), "<!doctype html><title>Test client</title>");
  // Grant only the disposable local test provider; production uses optional grants.
  const testManifest = JSON.parse(await fs.readFile(path.join(testExtension, "manifest.json"), "utf8"));
  testManifest.host_permissions = ["http://127.0.0.1/*"];
  await fs.writeFile(path.join(testExtension, "manifest.json"), JSON.stringify(testManifest));
  expectedID = crypto.createHash("sha256").update(await fs.realpath(testExtension)).digest().subarray(0, 16).toString("hex").replace(/[0-9a-f]/g, hex => String.fromCharCode(97 + parseInt(hex, 16)));
  nativeLog = path.join(profile, "native-calls.jsonl");
  const fakeCLI = path.join(profile, "fake-cli");
  await fs.writeFile(fakeCLI, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);const input=fs.readFileSync(0,'utf8');const data=JSON.parse(input.slice(input.indexOf('{')));fs.appendFileSync(${JSON.stringify(nativeLog)},JSON.stringify({pid:process.pid,args,data})+'\\n');if(data.instructions.includes('hold-native')){setInterval(()=>{},1000);}else{const result=(${fixtureResults.toString()})(data);if(args.includes('--output-last-message'))fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(result));else console.log(JSON.stringify({structured_output:result}));}\n`, {mode: 0o755});
  const config = path.join(profile, "native-config.json");
  await fs.writeFile(config, JSON.stringify({origins: [`chrome-extension://${expectedID}/`], executables: {codex: fakeCLI, claude: fakeCLI}}));
  const nativeDirectory = path.join(profile, "browser-profile/NativeMessagingHosts");
  await fs.mkdir(nativeDirectory, {recursive: true});
  nativeManifestPath = path.join(nativeDirectory, "com.dtjgp.youtube_channel_groups.json");
  await fs.writeFile(nativeManifestPath, JSON.stringify({name: "com.dtjgp.youtube_channel_groups", description: "Disposable native test host", path: path.resolve(__dirname, "../../artifacts/native/ycg-native-host"), type: "stdio", allowed_origins: [`chrome-extension://${expectedID}/`]}));
  const results = data => fixtureResults(data, mockMode);
  mockServer = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    response.setHeader("Content-Type", "application/json");
    aiRequests.push({url: request.url, authorization: request.headers.authorization, body});
    const requestNumber = aiRequests.length;
    if (requestNumber === mockHoldAt) await new Promise(resolve => { releaseMock = resolve; });
    if (requestNumber === mockFailureAt) {
      mockFailureAt = 0; response.statusCode = 500; response.end("{}"); return;
    }
    if (request.url === "/v1/chat/completions") {
      const data = JSON.parse(body.messages[1].content);
      response.end(JSON.stringify({choices: [{message: {content: mockMode === "malformed" ? "not json" : JSON.stringify(results(data))}}]}));
    } else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise(resolve => mockServer.listen(0, "127.0.0.1", resolve));
  mockOrigin = "http://127.0.0.1:" + mockServer.address().port;
  const candidates = [process.env.YCG_CHROMIUM, ...["1243", "1234", "1228"].map(build => path.join(os.homedir(), `Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`))].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await fs.access(candidate); executablePath = candidate; break; } catch {} }
  context = await chromium.launchPersistentContext(path.join(profile, "browser-profile"), {
    channel: "chromium", executablePath, headless: true, viewport: {width: 1400, height: 1050}, locale: "zh-CN",
    env: {...process.env, YCG_NATIVE_CONFIG: config},
    args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  expect(new URL(worker.url()).host).toBe(expectedID);
  testClient = await context.newPage();
  await testClient.goto(new URL("test-client.html", worker.url()).href);
  await context.route("https://www.youtube.com/**", route => {
    const url = new URL(route.request().url());
    let body = "<h1>测试首页</h1>";
    if (url.pathname === "/feed/channels") body = `<h1>所有订阅频道</h1>${channel("AlphaAI", "Alpha AI", "UCAlpha")}${channel("BetaMusic", "Beta Music")}${channel("GammaCode", "Gamma Code")}`;
    if (url.pathname === "/feed/subscriptions") body = `<h1>订阅视频</h1>${video("AlphaAI", "理解大语言模型")}${video("BetaMusic", "周末音乐精选")}${video("GammaCode", "编写第一个扩展", "yt-lockup-view-model")}<ytd-rich-item-renderer data-test-channel="unknown">Shorts 合集（未识别内容保留）</ytd-rich-item-renderer>`;
    if (url.pathname === "/watch") body = `<h1>视频播放 · 示例</h1><video aria-label="示例视频播放器" style="display:block;width:100%;height:220px;background:#111" controls></video><button id="fullscreen-test" onclick="document.body.requestFullscreen()">全屏测试</button><p>分类面板应减少对视频的遮挡。</p>`;
    if (url.pathname.startsWith("/@")) body = `<ytd-page-header-renderer><h1>New Channel</h1></ytd-page-header-renderer>`;
    return route.fulfill({contentType: "text/html; charset=utf-8", body: html(body)});
  });
  await fs.mkdir(artifacts, {recursive: true});
});

// Fixture screenshots do not cover this manually launched context, so keep evidence of failed tests.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !context) return;
  for (const [index, page] of context.pages().entries()) {
    const file = testInfo.outputPath(`failure-page-${index}.png`);
    try { await page.screenshot({path: file, timeout: 5000}); await testInfo.attach(`page-${index}`, {path: file, contentType: "image/png"}); } catch {}
  }
});

test.afterAll(async () => {
  await context?.close();
  if (mockServer) await new Promise(resolve => mockServer.close(resolve));
  if (profile) await fs.rm(profile, {recursive: true, force: true});
});

const getState = () => worker.evaluate(async () => (await chrome.storage.local.get("ycg.state.v1"))["ycg.state.v1"]);
// Backup and category management are collapsed sections; open one by clicking its summary like a user.
async function expand(page, selector) {
  const details = page.locator(`#ycg-root ${selector}`);
  if (!await details.evaluate(element => element.open)) await details.locator(":scope > summary").click();
}
const message = action => testClient.evaluate(action => chrome.runtime.sendMessage({scope: "ycg", type: "mutate", action}), action);

test("real extension: collect, categorize, filter, dynamic cards, navigation, backup, reload", async () => {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://www.youtube.com/feed/channels");
  await expect.poll(() => page.locator(".launcher img").evaluate(image => image.complete && image.naturalWidth === 48)).toBe(true);
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect(page.getByText("3 个频道", {exact: true})).toBeVisible();
  expect((await getState()).channels[0].title).toBe("Alpha AI");
  expect((await getState()).channels.flatMap(channel => channel.aliases)).not.toContain("/@mentioned");
  for (const name of ["AI", "编程", "音乐"]) {
    await page.getByRole("textbox", {name: "新分类名称"}).fill(name);
    await page.getByRole("button", {name: "创建", exact: true}).click();
    await expect(page.getByRole("button", {name: new RegExp(`^${name} 0$`)})).toBeVisible();
  }
  await page.getByRole("checkbox", {name: "Alpha AI：AI", exact: true}).check();
  await expect.poll(async () => (await getState()).channels.find(channel => channel.id === "/@alphaai").groupIds.length).toBe(1);
  await page.getByRole("checkbox", {name: "Alpha AI：编程", exact: true}).check();
  await expect.poll(async () => (await getState()).channels.find(channel => channel.id === "/@alphaai").groupIds.length).toBe(2);
  await page.getByRole("checkbox", {name: "Beta Music：音乐", exact: true}).check();
  await expect.poll(async () => (await getState()).channels.find(channel => channel.id === "/@betamusic").groupIds.length).toBe(1);
  await page.getByRole("checkbox", {name: "Gamma Code：编程", exact: true}).check();
  await expect(page.getByRole("button", {name: "编程 2", exact: true})).toBeVisible();

  await page.getByRole("link", {name: "按分类筛选订阅视频 ↗"}).click();
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByRole("button", {name: "AI 1", exact: true}).click();
  await expect(page.locator('[data-test-channel="AlphaAI"]')).toBeVisible();
  await expect(page.locator('[data-test-channel="BetaMusic"]')).toBeHidden();
  await expect(page.locator('[data-test-channel="GammaCode"]')).toBeHidden();
  await expect(page.locator('[data-test-channel="unknown"]')).toBeVisible();
  await page.evaluate(markup => document.querySelector("main").insertAdjacentHTML("beforeend", markup), video("BetaMusic", "新加载音乐视频"));
  await expect(page.locator('[data-test-channel="BetaMusic"]').last()).toBeHidden();
  await page.screenshot({path: path.join(artifacts, "preview.png")});
  await page.emulateMedia({colorScheme: "light"});
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "dark");
  await page.screenshot({path: path.join(artifacts, "preview-dark.png")});
  await page.setViewportSize({width: 390, height: 844});
  const bounds = await page.getByRole("region", {name: "频道分类面板"}).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({path: path.join(artifacts, "preview-narrow.png")});
  await page.setViewportSize({width: 1400, height: 1050});
  await page.evaluate(() => document.documentElement.removeAttribute("dark"));
  await page.emulateMedia({colorScheme: "light"});

  // SPA navigation must restore cards outside the subscription feed.
  await page.evaluate(() => { history.pushState({}, "", "/"); document.dispatchEvent(new Event("yt-navigate-finish")); });
  await expect(page.locator('[data-test-channel="BetaMusic"]').first()).toBeVisible();
  await page.evaluate(() => { history.pushState({}, "", "/feed/subscriptions"); document.dispatchEvent(new Event("yt-navigate-finish")); });
  await expect(page.locator('[data-test-channel="BetaMusic"]').first()).toBeHidden();
  await page.getByRole("button", {name: "显示全部", exact: true}).click();
  await expect(page.locator('[data-test-channel="BetaMusic"]').first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await expand(page, ".footer-menu");
  await page.getByRole("button", {name: "导出备份", exact: true}).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(backup.channels).toHaveLength(3);
  expect(backup.groups).toHaveLength(3);
  const before = JSON.stringify(await getState());
  await page.locator('input[type="file"]').setInputFiles({name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup))});
  await expect(page.locator(".status")).toHaveText("备份已合并，保留了现有分类");
  expect(JSON.stringify(await getState())).toBe(before);
  await page.locator('input[type="file"]').setInputFiles({name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":2}')});
  await expect(page.locator(".status")).toContainText("格式或版本不支持");
  expect(JSON.stringify(await getState())).toBe(before);

  await page.reload();
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect(page.getByRole("checkbox", {name: "Alpha AI：AI", exact: true})).toBeChecked();
  await page.getByRole("searchbox", {name: "搜索频道"}).fill("Beta");
  await expect(page.getByText("1 个频道", {exact: true})).toBeVisible();
  expect(errors).toEqual([]);
  await page.close();
});

test("multi-tab serialized writes, cross-tab updates, delete, add current channel, hostile text", async () => {
  await worker.evaluate(() => chrome.storage.local.set({"ycg.state.v1": {version: 1, groups: [{id: "ai", name: "AI"}, {id: "code", name: "编程"}, {id: "music", name: "音乐"}], channels: [
    {id: "/@alphaai", title: "Alpha AI", aliases: ["/@alphaai", "/channel/UCAlpha"], groupIds: ["ai", "code"]},
    {id: "/@betamusic", title: "Beta Music", aliases: ["/@betamusic"], groupIds: ["music"]},
    {id: "/@gammacode", title: "Gamma Code", aliases: ["/@gammacode"], groupIds: ["code"]}
  ]}}));
  const page = await context.newPage(), second = await context.newPage();
  await page.goto("https://www.youtube.com/feed/channels");
  await second.goto("https://www.youtube.com/feed/channels");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await second.getByRole("button", {name: "频道分类", exact: true}).click();
  // Concurrent internal extension requests exercise the actual service-worker queue.
  const responses = await testClient.evaluate(async () => Promise.all(Array.from({length: 8}, (_, n) => chrome.runtime.sendMessage({scope: "ycg", type: "mutate", action: {type: "createGroup", name: `并发${n}`}}))));
  expect(responses.every(response => response.ok)).toBe(true);
  const state = await getState();
  expect(state.groups.filter(group => group.name.startsWith("并发"))).toHaveLength(8);
  await expect(second.getByRole("button", {name: "并发7 0", exact: true})).toBeVisible();
  const ai = state.groups.find(group => group.name === "AI");
  const programming = state.groups.find(group => group.name === "编程");
  await expand(page, ".manage-groups");
  await page.getByRole("textbox", {name: "重命名 AI", exact: true}).fill("人工智能");
  await page.getByRole("textbox", {name: "重命名 AI", exact: true}).press("Enter");
  await expect(second.getByRole("button", {name: "人工智能 1", exact: true})).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", {name: "删除 人工智能", exact: true}).click();
  await expect(second.getByRole("button", {name: "人工智能 1", exact: true})).toHaveCount(0);
  expect((await getState()).channels.find(channel => channel.id === "/@alphaai").groupIds).toEqual([programming.id]);
  expect((await getState()).groups.some(group => group.id === ai.id)).toBe(false);
  await page.goto("https://www.youtube.com/@newchannel");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByRole("button", {name: "加入当前频道", exact: true}).click();
  await expect(page.getByRole("link", {name: "New Channel", exact: true})).toBeVisible();
  const hostile = '<img src=x onerror="alert(1)">';
  expect((await message({type: "collect", channels: [{id: "/@hostile", title: hostile}]})).ok).toBe(true);
  await expect(page.getByRole("link", {name: hostile, exact: true})).toBeVisible();
  expect(await page.locator("#ycg-root").evaluate(host => host.shadowRoot.querySelectorAll(".channel img").length)).toBe(0);
  // Failed action must leave the queue available for the next operation.
  expect((await message({type: "createGroup", name: "音乐"})).ok).toBe(false);
  expect((await message({type: "createGroup", name: "失败后恢复"})).ok).toBe(true);
  await page.close(); await second.close();
});

const aiSeed = {version: 1, groups: [{id: "manual", name: "原有分类"}], channels: [
  {id: "/@alphaai", title: "Alpha AI", aliases: ["/@alphaai"], groupIds: ["manual"], description: "机器学习教程"},
  {id: "/@betamusic", title: "Beta Music", aliases: ["/@betamusic"], groupIds: [], description: "音乐频道"}
]};
async function configureAI(provider, endpoint, secret = "fixture") {
  const options = await context.newPage();
  await options.goto(new URL("options.html", worker.url()).href);
  await options.getByLabel("接入方式", {exact: true}).selectOption(provider);
  if (provider === "api") {
    await options.locator("#endpoint").fill(endpoint);
    await options.getByLabel("模型名称", {exact: true}).fill("test-model");
    await options.locator("#secret").fill(secret);
  }
  await options.getByRole("button", {name: provider === "api" ? "保存并授权连接地址" : "保存设置", exact: true}).click();
  await expect(options.locator("#status")).toContainText("已保存");
  return options;
}

test("AI cloud: trusted settings, real local HTTP, editable preview, secret isolation and malformed response", async () => {
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), aiSeed);
  const options = await configureAI("api", mockOrigin + "/v1", "test-only-api-key");
  const denied = await testClient.evaluate(() => chrome.runtime.sendMessage({scope: "ycg", type: "settingsGet"}));
  expect(denied.ok).toBe(false);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const worlds = [];
  session.on("Runtime.executionContextCreated", ({context}) => worlds.push(context));
  await session.send("Runtime.enable");
  await page.goto("https://www.youtube.com/feed/subscriptions");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByText("✦ AI 分类助手", {exact: true}).click();
  await page.getByLabel("AI 分类范围", {exact: true}).selectOption("all");
  const before = await getState();
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.getByLabel("Alpha AI 的建议分类", {exact: true})).toBeVisible();
  expect(await getState()).toEqual(before);
  await expect(page.getByRole("checkbox", {name: "应用 Beta Music 的 AI 建议", exact: true})).not.toBeChecked();
  await page.getByLabel("Alpha AI 的建议分类", {exact: true}).fill("AI研究, 编程");
  await page.screenshot({path: path.join(artifacts, "preview-ai.png")});
  const isolated = worlds.find(world => world.origin === "chrome-extension://" + new URL(worker.url()).host);
  expect(isolated).toBeTruthy();
  const blocked = await session.send("Runtime.evaluate", {expression: "chrome.storage.local.get('ycg.ai.settings.v1').then(() => false, () => true)", contextId: isolated.id, awaitPromise: true, returnByValue: true});
  expect(blocked.result.value).toBe(true);
  expect(await page.locator("#ycg-root").evaluate(host => host.shadowRoot.textContent.includes("test-only-api-key"))).toBe(false);
  const request = aiRequests.findLast(item => item.url === "/v1/chat/completions");
  expect(request.authorization).toBe("Bearer test-only-api-key");
  expect(request.body.messages[1].content).not.toContain("aliases");
  expect(request.body.messages[1].content).not.toContain("groupIds");
  await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
  await expect(page.getByText("已应用 1 个频道的建议，原有分类已保留。", {exact: true})).toBeVisible();
  const after = await getState();
  expect(after.channels[0].groupIds).toHaveLength(3);
  expect(after.channels[0].groupIds).toContain("manual");
  expect(after.channels[1].groupIds).toEqual([]);
  await expect(page.getByRole("button", {name: "生成分类建议", exact: true})).toBeDisabled();
  await page.getByRole("button", {name: "从头检查", exact: true}).click();
  mockMode = "malformed";
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("AI 未返回有效 JSON，请重试或更换模型");
  expect(await getState()).toEqual(after);
  mockMode = "valid";
  // Changing destinations must not forward the previous API key.
  await options.locator("#endpoint").fill(mockOrigin + "/other-v1");
  await options.getByRole("button", {name: "保存并授权连接地址", exact: true}).click();
  await expect(options.locator("#status")).toContainText("已保存");
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("ycg.ai.settings.v1"))["ycg.ai.settings.v1"].secret)).toBe("");
  await options.screenshot({path: path.join(artifacts, "preview-ai-settings.png"), fullPage: true});
  await page.close(); await options.close();
});

test("native Codex and Claude: browser starts compiled host and fixed CLI adapters automatically", async () => {
  await worker.evaluate(() => chrome.storage.local.set({"ycg.ai.settings.v1": {provider: "codex", endpoint: "http://127.0.0.1:8765", model: "", secret: "old-fixture"}}));
  for (const provider of ["codex", "claude"]) {
    await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), aiSeed);
    const options = await configureAI(provider, mockOrigin);
    const saved = await worker.evaluate(async () => (await chrome.storage.local.get("ycg.ai.settings.v1"))["ycg.ai.settings.v1"]);
    expect(saved.endpoint).toBe(""); expect(saved.secret).toBe("");
    await expect(options.locator("#api-fields")).toBeHidden();
    await options.getByRole("button", {name: "检测小助手", exact: true}).click();
    await expect(options.locator("#native-status")).toContainText("小助手 0.3.0 已连接");
    await options.screenshot({path: path.join(artifacts, "preview-native-settings.png"), fullPage: true});
    const page = await context.newPage();
    await page.goto("https://www.youtube.com/feed/subscriptions");
    await page.getByRole("button", {name: "频道分类", exact: true}).click();
    await page.getByText("✦ AI 分类助手", {exact: true}).click();
    await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
    await expect(page.getByLabel("Beta Music 的建议分类", {exact: true})).toBeVisible();
    const calls = (await fs.readFile(nativeLog, "utf8")).trim().split("\n").map(JSON.parse);
    expect(calls.at(-1).args.includes("exec")).toBe(provider === "codex");
    expect((await getState()).groups).toHaveLength(1);
    await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
    await expect(page.getByText("已应用 1 个频道的建议，原有分类已保留。", {exact: true})).toBeVisible();
    expect((await getState()).groups).toHaveLength(2);
    await expect(page.getByRole("button", {name: "生成分类建议", exact: true})).toBeDisabled();
    await page.getByRole("button", {name: "从头检查", exact: true}).click();
    await page.getByLabel("AI 分类范围", {exact: true}).selectOption("all");
    await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
    await expect(page.getByLabel("Beta Music 的建议分类", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "跳过这些建议", exact: true}).click();
    await expect(page.getByRole("button", {name: "生成分类建议", exact: true})).toBeDisabled();
    await page.close(); await options.close();
  }
  await fs.rename(nativeManifestPath, nativeManifestPath + ".temporarily-disabled");
  const options = await configureAI("codex");
  try {
    await options.getByRole("button", {name: "检测小助手", exact: true}).click();
    await expect(options.locator("#native-status")).toContainText("无法连接本机小助手");
  } finally {
    await fs.rename(nativeManifestPath + ".temporarily-disabled", nativeManifestPath);
    await options.close();
  }
});

const bulkSeed = count => ({version: 1, groups: [], channels: Array.from({length: count}, (_, i) => ({id: `/@bulk${i}`, title: `批量频道 ${i}`, aliases: [`/@bulk${i}`], groupIds: []}))});
const sentChannels = () => aiRequests.map(request => JSON.parse(request.body.messages[1].content).channels.map(channel => channel.id));
async function openAssistant() {
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/feed/subscriptions");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByText("✦ AI 分类助手", {exact: true}).click();
  return page;
}

test("all 134 channels: seven automatic requests, one preview and atomic apply", async () => {
  const seed = bulkSeed(134);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  mockMode = "bulk"; aiRequests.length = 0;
  const page = await openAssistant();
  await expect(page.getByLabel("AI 处理数量", {exact: true})).toHaveValue("all");
  await expect(page.getByText(/将处理 134 \/ 134 个剩余频道/)).toBeVisible();
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已完成 134 个频道的建议");
  expect(sentChannels().map(batch => batch.length)).toEqual([20, 20, 20, 20, 20, 20, 14]);
  expect(sentChannels().flat()).toEqual(seed.channels.map(channel => channel.id));
  await expect(page.locator(".ai-suggestion")).toHaveCount(8);
  expect(await getState()).toEqual(seed);
  await page.screenshot({path: path.join(artifacts, "preview-ai-all.png")});
  await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已应用 134 个频道的建议");
  expect((await getState()).channels.every(channel => channel.groupIds.length === 1)).toBe(true);
  await expect(page.getByRole("button", {name: "生成分类建议", exact: true})).toBeDisabled();
  await page.close(); await options.close(); mockMode = "valid";
});

test("failed batch resumes remaining channels and preserves successful previews", async () => {
  const seed = bulkSeed(45);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  mockMode = "bulk"; aiRequests.length = 0; mockFailureAt = 2;
  const page = await openAssistant();
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("HTTP 500");
  await expect(page.locator(".ai-progress")).toContainText("已完成 20 / 45");
  await expect(page.locator(".ai-suggestion")).toHaveCount(8);
  expect(await getState()).toEqual(seed);
  await page.getByLabel("批量频道 0 的建议分类", {exact: true}).fill("人工修正");
  await page.getByRole("button", {name: "继续剩余 25 个频道", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已完成 45 个频道的建议");
  expect(sentChannels().map(batch => batch.length)).toEqual([20, 20, 20, 5]);
  expect(sentChannels()[2]).toEqual(sentChannels()[1]);
  expect(new Set([...sentChannels()[0], ...sentChannels().slice(2).flat()]).size).toBe(45);
  await expect(page.getByLabel("批量频道 0 的建议分类", {exact: true})).toHaveValue("人工修正");
  await expect(page.locator(".ai-suggestion")).toHaveCount(8);
  await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已应用 45 个频道的建议");
  await page.close(); await options.close(); mockMode = "valid";
});

test("stop after the current batch, apply partial results, resume and select single-batch mode", async () => {
  const seed = bulkSeed(45);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  mockMode = "bulk"; aiRequests.length = 0; mockHoldAt = 1;
  const page = await openAssistant();
  try {
    await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
    await expect.poll(() => !!releaseMock).toBe(true);
    await expect(page.locator(".ai-progress")).toContainText("第 1 / 3 批");
    await expect(page.getByLabel("AI 分类范围", {exact: true})).toBeDisabled();
    await page.getByRole("button", {name: "本批完成后停止", exact: true}).click();
    releaseMock(); releaseMock = null; mockHoldAt = 0;
    await expect(page.locator(".ai-progress")).toContainText("已暂停，已完成 20 / 45");
    expect(sentChannels().map(batch => batch.length)).toEqual([20]);
    expect(await getState()).toEqual(seed);
    await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
    await expect(page.locator(".ai-progress")).toContainText("已应用 20 个频道的建议");
    await page.getByRole("button", {name: "继续剩余 25 个频道", exact: true}).click();
    await expect(page.locator(".ai-progress")).toContainText("已完成 45 个频道的建议");
    expect(sentChannels().map(batch => batch.length)).toEqual([20, 20, 5]);
    await expect(page.locator(".ai-suggestion")).toHaveCount(8);
    await page.getByRole("button", {name: "跳过这些建议", exact: true}).click();
    await expect(page.getByRole("button", {name: "生成分类建议", exact: true})).toBeDisabled();
    await page.getByRole("button", {name: "从头检查", exact: true}).click();
    await page.getByLabel("AI 处理数量", {exact: true}).selectOption("batch");
    aiRequests.length = 0;
    await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
    await expect(page.locator(".ai-progress")).toContainText("已完成 20 个频道的建议");
    expect(sentChannels().map(batch => batch.length)).toEqual([20]);
    await page.getByRole("button", {name: "跳过这些建议", exact: true}).click();
    await expect(page.getByText(/将处理 5 \/ 5 个剩余频道/)).toBeVisible();
  } finally {
    releaseMock?.(); releaseMock = null; mockHoldAt = mockFailureAt = 0; mockMode = "valid";
    await page.close(); await options.close();
  }
});

test("all categorized channels can be reclassified; unselected channels and later manual edits are protected", async () => {
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state, "ycg.ai.undo.v1": null}), aiSeed);
  const options = await configureAI("api", mockOrigin + "/v1");
  const page = await openAssistant();
  await page.getByLabel("AI 分类范围", {exact: true}).selectOption("all");
  await page.getByLabel("AI 应用方式", {exact: true}).selectOption("replace");
  mockMode = "valid"; aiRequests.length = 0;
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已完成 2 个频道");
  expect(sentChannels().flat()).toEqual(aiSeed.channels.map(channel => channel.id));
  expect(await getState()).toEqual(aiSeed);
  await expect(page.getByRole("progressbar", {name: "AI 分类进度", exact: true})).toHaveAttribute("value", "2");
  await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已重新分类 1 个频道");
  let current = await getState();
  expect(current.channels[0].groupIds).not.toContain("manual");
  expect(current.channels[1].groupIds).toEqual([]);
  await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("上次 AI 分类已撤销");
  expect((await getState()).channels).toEqual(aiSeed.channels);
  await page.getByRole("button", {name: "从头检查", exact: true}).click();
  await page.getByRole("button", {name: "生成分类建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已完成 2 个频道");
  await page.getByRole("button", {name: "应用勾选建议", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("已重新分类 1 个频道");
  await message({type: "membership", channelId: "/@alphaai", groupId: "manual", checked: true});
  current = await getState();
  await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("后续修改");
  expect(await getState()).toEqual(current);
  await page.close(); await options.close();
});

test("live bilingual settings, real save milestones, draft preservation, exports and persistent language", async () => {
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), aiSeed);
  const options = await configureAI("api", mockOrigin + "/v1");
  const page = await openAssistant();
  await options.getByLabel("模型名称", {exact: true}).fill("unsaved-model");
  await expect.poll(() => options.locator(".app-icon").evaluate(image => image.complete && image.naturalWidth === 128)).toBe(true);
  await expect(options.locator("#save-phase")).toHaveText("尚未保存");
  await expect(options.locator("#draft-summary")).toContainText("unsaved-model");
  await options.getByLabel("界面语言", {exact: true}).selectOption("en");
  await expect(options.getByRole("heading", {name: "Settings and connection", exact: true})).toBeVisible();
  await expect(options.getByLabel("Model name", {exact: true})).toHaveValue("unsaved-model");
  await expect(options.getByRole("progressbar", {name: "Settings save progress", exact: true})).toHaveAttribute("value", "0");
  await expect(page.getByRole("button", {name: "Generate suggestions", exact: true})).toBeVisible();
  await expect(page.getByLabel("AI channel scope", {exact: true})).toHaveCount(1);
  await expect(page.getByRole("button", {name: "原有分类 1", exact: true})).toBeVisible();
  await options.evaluate(() => {
    window.savePhases = [];
    new MutationObserver(records => records.forEach(record => window.savePhases.push([...record.addedNodes].map(node => node.textContent).join("")))).observe(document.querySelector("#save-phase"), {childList: true});
  });
  await options.getByRole("button", {name: "Save and allow this address", exact: true}).click();
  await expect(options.locator("#status")).toContainText("Saved.");
  await expect(options.locator("#save-phase")).toHaveText("Settings saved");
  await expect(options.getByRole("progressbar", {name: "Settings save progress", exact: true})).toHaveAttribute("value", "4");
  expect(await options.evaluate(() => window.savePhases)).toEqual(expect.arrayContaining(["Validating settings…", "Requesting host permission…", "Saving locally…", "Settings saved"]));
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("ycg.ai.settings.v1"))["ycg.ai.settings.v1"].model)).toBe("unsaved-model");
  await options.screenshot({path: path.join(artifacts, "preview-settings-en.png"), fullPage: true});
  await page.getByLabel("AI channel scope", {exact: true}).selectOption("all");
  mockMode = "valid";
  await page.getByRole("button", {name: "Generate suggestions", exact: true}).click();
  await expect(page.locator(".ai-progress")).toContainText("Suggestions ready for 2 channels");
  expect(JSON.parse(aiRequests.at(-1).body.messages[1].content).instructions).toContain("Use English");
  await expect(page.getByLabel("Suggested categories for Alpha AI", {exact: true})).toBeVisible();
  await page.screenshot({path: path.join(artifacts, "preview-panel-en.png")});
  await page.getByRole("button", {name: "Back to channels and settings", exact: true}).click();
  await expect(page.getByLabel("Suggested categories for Alpha AI", {exact: true})).toHaveValue("AI建议");
  await expand(page, ".footer-menu");
  for (const [format, suffix] of [["csv", ".csv"], ["markdown", ".md"], ["json", ".json"]]) {
    await page.getByLabel("Export format", {exact: true}).selectOption(format);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", {name: "Export", exact: true}).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(suffix.replace(".", "\\.") + "$"));
    const text = await fs.readFile(await download.path(), "utf8");
    expect(text).toContain(format === "json" ? "manual" : "原有分类");
    expect(text).not.toContain("fixture");
  }
  await page.reload();
  await page.getByRole("button", {name: "Channel Groups", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Channel Groups", exact: true})).toBeVisible();
  await options.getByLabel("Interface language", {exact: true}).selectOption("zh-CN");
  await expect(page.getByRole("heading", {name: "频道分类", exact: true})).toBeVisible();
  await expect(options.getByLabel("模型名称", {exact: true})).toHaveValue("unsaved-model");
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await options.emulateMedia({colorScheme: "light"});
  await options.screenshot({path: path.join(artifacts, "preview-settings-dark.png"), fullPage: true});
  await options.setViewportSize({width: 390, height: 844});
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await options.screenshot({path: path.join(artifacts, "preview-settings-narrow.png"), fullPage: true});
  await page.close(); await options.close();
});

const panelPalette = page => page.locator(".panel").evaluate(element => {
  const style = getComputedStyle(element);
  return {background: style.getPropertyValue("--bg").trim(), color: style.color, border: style.borderTopColor};
});
const settingsColors = page => page.locator("html").evaluate(element => {
  const style = getComputedStyle(element);
  return {background: style.backgroundColor, color: style.color, scheme: style.colorScheme};
});

test("YouTube theme overrides system theme, updates colors live, and synchronizes the settings page", async () => {
  const page = await openAssistant();
  await page.bringToFront();
  await page.emulateMedia({colorScheme: "light"});
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "dark");
  await expect.poll(() => panelPalette(page)).toMatchObject({background: "rgb(15, 15, 15)", color: "rgb(241, 241, 241)"});
  const Design=require('../../extension/design.js');
  const borderContrast=async()=>{const p=await panelPalette(page);expect(Design.ratio(Design.parse(p.border),Design.parse(p.background))).toBeGreaterThanOrEqual(3);};
  await borderContrast();
  expect(await page.locator('#ycg-root').evaluate(e=>e.style.getPropertyValue('--line'))).toBe('rgba(255,255,255,.2)');
  await expect.poll(() => page.locator(".primary").first().evaluate(element => ({background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color}))).toEqual({background: "rgb(241, 241, 241)", color: "rgb(15, 15, 15)"});
  const options = await context.newPage();
  await options.emulateMedia({colorScheme: "light"});
  await options.goto(new URL("options.html", worker.url()).href);
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await options.getByLabel("模型名称", {exact: true}).fill("theme-draft");
  await page.evaluate(() => {
    const colors = {"base-background": "#181a20", "raised-background": "#252834", "text-primary": "#e9ecf1", "text-secondary": "#b0b7c3", "outline": "#46505e", "call-to-action": "#81b3ff", "badge-chip-background": "#333944"};
    for (const [key, value] of Object.entries(colors)) document.documentElement.style.setProperty("--yt-spec-" + key, value);
  });
  await expect.poll(() => panelPalette(page)).toMatchObject({background: "rgb(24, 26, 32)", color: "rgb(233, 236, 241)"});
  await borderContrast();
  await expect.poll(() => settingsColors(options)).toEqual({background: "rgb(24, 26, 32)", color: "rgb(233, 236, 241)", scheme: "dark"});
  await expect.poll(() => options.locator("#model").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(24, 26, 32)");
  expect(await options.locator('html').evaluate(e=>e.style.getPropertyValue('--card'))).toBe('#252834');
  await expect(options.getByLabel("模型名称", {exact: true})).toHaveValue("theme-draft");
  await page.screenshot({path: path.join(artifacts, "preview-youtube-theme-dark.png")});
  await options.screenshot({path: path.join(artifacts, "preview-youtube-settings-dark.png"), fullPage: true});
  await page.evaluate(() => { document.documentElement.removeAttribute("dark"); document.documentElement.removeAttribute("style"); });
  await page.emulateMedia({colorScheme: "dark"});
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "light");
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "light");
  await expect.poll(() => panelPalette(page)).toMatchObject({background: "rgb(255, 255, 255)", color: "rgb(15, 15, 15)"});
  await borderContrast();
  await page.screenshot({path: path.join(artifacts, "preview-youtube-theme-light.png")});
  // CSSOM edits do not emit MutationObserver events. The fallback detects them.
  await page.bringToFront();
  await page.evaluate(() => document.styleSheets[0].insertRule("html { --yt-spec-base-background: #fafafa !important; }", document.styleSheets[0].cssRules.length));
  await expect.poll(() => panelPalette(page)).toMatchObject({background: "rgb(250, 250, 250)"});
  await expect.poll(() => settingsColors(options)).toMatchObject({background: "rgb(250, 250, 250)"});
  // Another active YouTube tab takes ownership; the old tab keeps its own theme.
  const second = await openAssistant();
  await second.bringToFront();
  await expect.poll(() => settingsColors(options)).toMatchObject({background: "rgb(255, 255, 255)"});
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "dark");
  await expect.poll(() => settingsColors(options)).toMatchObject({scheme: "light"});
  await page.bringToFront();
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await options.reload();
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await second.close(); await page.close();
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await options.close();
});

test("settings use the system only before any YouTube theme is available", async () => {
  await worker.evaluate(() => chrome.storage.local.remove("ycg.theme.v1"));
  const options = await context.newPage();
  await options.emulateMedia({colorScheme: "dark"});
  await options.goto(new URL("options.html", worker.url()).href);
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "dark");
  await options.emulateMedia({colorScheme: "light"});
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "light");
  const page = await openAssistant();
  await page.bringToFront();
  await expect.poll(() => worker.evaluate(async () => !!(await chrome.storage.local.get("ycg.theme.v1"))["ycg.theme.v1"])).toBe(true);
  await options.emulateMedia({colorScheme: "dark"});
  await expect(options.locator("html")).toHaveAttribute("data-ycg-theme", "light");
  await page.close(); await options.close();
});

// Playwright pins color scheme, motion and contrast but not transparency. Hosted macOS runners
// enable "Reduce transparency", so glass tests pin the default preference through CDP.
// The emulation lasts only while its CDP session stays attached, so each page keeps one session.
const mediaSessions = new WeakMap();
async function pinMedia(page, {colorScheme = "light", reducedMotion = "no-preference", contrast = "no-preference", reducedTransparency = "no-preference"} = {}) {
  if (!mediaSessions.has(page)) mediaSessions.set(page, await context.newCDPSession(page));
  await mediaSessions.get(page).send("Emulation.setEmulatedMedia", {media: "", features: [
    {name: "prefers-color-scheme", value: colorScheme}, {name: "prefers-reduced-motion", value: reducedMotion},
    {name: "prefers-contrast", value: contrast}, {name: "prefers-reduced-transparency", value: reducedTransparency}]});
}
const youtubeGeometry = page => page.evaluate(() => {
  const box = selector => { const element = document.querySelector(selector); if (!element) return null; const r = element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
  return {app:box('ytd-app'),header:box('ytd-app > header'),main:box('ytd-app > main'),video:box('video'),scrollX,scrollY,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,appStyle:document.querySelector('ytd-app').getAttribute('style')};
});

test("glass window overlays the wide page without changing layout and preserves drafts on collapse", async () => {
  await worker.evaluate(() => chrome.storage.local.remove('ycg.panel-size.v1'));
  const page = await context.newPage(); await pinMedia(page); await page.goto('https://www.youtube.com/feed/subscriptions');
  await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();
  await page.locator('#ycg-root').evaluate(host=>{host.style.display='none';});
  const original=await youtubeGeometry(page);
  await page.locator('#ycg-root').evaluate(host=>host.style.removeProperty('display'));
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout");
  await expect(page.locator('.panel')).toHaveAttribute('data-layout','floating');
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  const panel = await page.locator(".panel").boundingBox(), app = await page.locator("ytd-app").boundingBox(), header = await page.locator("ytd-app > header").boundingBox();
  expect(app.width).toBe(1400); expect(app.x + app.width).toBeGreaterThan(panel.x);
  expect(header.y + header.height).toBeLessThan(panel.y);
  expect(panel.width).toBe(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".panel").evaluate(element => getComputedStyle(element).backdropFilter)).toContain("blur(");
  // YouTube's own high-priority menus must remain above the extension.
  expect(await page.evaluate(() => {
    const menu = document.createElement("div");
    menu.style.cssText = "position:fixed;right:20px;top:100px;width:220px;height:120px;z-index:2200;background:white";
    document.querySelector("ytd-app").append(menu);
    const bounds = menu.getBoundingClientRect();
    const visible = document.elementFromPoint(bounds.x + 10, bounds.y + 10) === menu;
    menu.remove(); return visible;
  })).toBe(true);
  await expect(page.locator(".dock")).toBeHidden();
  await page.getByRole("searchbox", {name: "搜索频道", exact: true}).fill("Alpha");
  await page.getByRole("button", {name: "关闭分类面板", exact: true}).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout", "docked");
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  expect(await page.locator("ytd-app").evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(1400);
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  await expect(page.getByRole("searchbox", {name: "搜索频道", exact: true})).toHaveValue("Alpha");
  await page.locator(".body").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({path: path.join(artifacts, "preview-glass-light.png")});
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "dark");
  await page.screenshot({path: path.join(artifacts, "preview-glass-dark.png")});
  await page.close();
});

test("narrow glass window leaves the video unchanged and stays open during page interaction", async () => {
  const page = await context.newPage(); await pinMedia(page);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("https://www.youtube.com/watch?v=example");
  await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();
  const original=await youtubeGeometry(page);
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect(page.locator(".panel")).toHaveAttribute("data-layout", "floating");
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout", "docked");
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  const panel = await page.locator(".panel").boundingBox(), video = await page.locator("video").boundingBox();
  expect(video.y + video.height).toBeLessThanOrEqual(panel.y - 10);
  expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await page.getByRole("searchbox", {name: "搜索频道", exact: true}).fill("draft");
  // Report the overflow in pixels so a failure shows how far the field extends below the scroll area.
  await expect.poll(async () => {
    const input = await page.getByRole("searchbox", {name: "搜索频道", exact: true}).boundingBox();
    const body = await page.locator(".body").boundingBox();
    return input.y + input.height - (body.y + body.height);
  }).toBeLessThanOrEqual(0);
  await page.screenshot({path: path.join(artifacts, "preview-glass-narrow-video.png")});
  await page.locator("video").click({position: {x: 10, y: 10}});
  await expect(page.locator(".panel")).toBeVisible();
  await expect.poll(()=>youtubeGeometry(page)).toEqual(original);
  await expect(page.getByRole("searchbox", {name: "搜索频道", exact: true})).toHaveValue("draft");
  // Esc first clears the search term and keeps the panel open; a second Esc closes it.
  await page.getByRole("searchbox", {name: "搜索频道", exact: true}).press("Escape");
  await expect(page.getByRole("searchbox", {name: "搜索频道", exact: true})).toHaveValue("");
  await expect(page.locator(".panel")).toBeVisible();
  await page.getByRole("searchbox", {name: "搜索频道", exact: true}).press("Escape");
  await expect(page.locator(".panel")).toBeHidden();
  await page.close();
});

test("fullscreen suspends the panel without losing state; high contrast removes glass blur", async () => {
  const page = await context.newPage(); await pinMedia(page);
  await page.goto("https://www.youtube.com/watch?v=example");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByRole("searchbox", {name: "搜索频道", exact: true}).fill("preserved");
  await page.getByRole("button", {name: "全屏测试", exact: true}).click();
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-suppressed", "");
  await expect(page.locator(".panel")).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout", "docked");
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator(".panel")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout");
  await expect(page.getByRole("searchbox", {name: "搜索频道", exact: true})).toHaveValue("preserved");
  await expect(page.locator(".panel")).toHaveCSS("backdrop-filter", /blur\(/);
  await pinMedia(page, {contrast: "more", reducedMotion: "reduce"});
  await expect.poll(() => page.locator(".panel").evaluate(element => getComputedStyle(element).backdropFilter)).toBe("none");
  await expect.poll(() => page.locator(".launcher").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  const options = await context.newPage(); await pinMedia(options);
  await options.goto(new URL("options.html", worker.url()).href);
  expect(await options.locator(".language-card").evaluate(element => getComputedStyle(element).backdropFilter)).toContain("blur(");
  await options.screenshot({path: path.join(artifacts, "preview-glass-settings.png"), fullPage: true});
  await pinMedia(options, {contrast: "more", reducedMotion: "reduce"});
  await expect.poll(() => options.locator(".language-card").evaluate(element => getComputedStyle(element).backdropFilter)).toBe("none");
  await page.close(); await options.close();
});

test("panel resizing supports drag, keyboard, persistence and responsive limits without size settings", async () => {
  await worker.evaluate(() => chrome.storage.local.remove("ycg.panel-size.v1"));
  const page = await context.newPage();
  await page.setViewportSize({width: 1600, height: 1100});
  await page.goto("https://www.youtube.com/");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  const panel = page.locator(".panel"), grip = page.getByRole("button", {name: "调整大小：拖动或使用方向键", exact: true});
  const original = await panel.boundingBox(), corner = await grip.boundingBox();
  await page.mouse.move(corner.x + 14, corner.y + 14); await page.mouse.down();
  await page.mouse.move(corner.x - 106, corner.y + 184, {steps: 6}); await page.mouse.up();
  await expect.poll(async () => Math.round((await panel.boundingBox()).width)).toBe(480);
  await expect.poll(async () => Math.round((await panel.boundingBox()).height)).toBe(Math.round(original.height - 170));
  const savedSize = () => worker.evaluate(async () => (await chrome.storage.local.get("ycg.panel-size.v1"))["ycg.panel-size.v1"]);
  await expect.poll(savedSize).toEqual({width: 480, height: original.height - 170});
  const app = await page.locator("ytd-app").boundingBox(), resized = await panel.boundingBox();
  expect(app.width).toBe(1600); expect(app.x + app.width).toBeGreaterThan(resized.x);

  await page.reload();
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(async () => Math.round((await panel.boundingBox()).width)).toBe(480);
  const second = await context.newPage();
  await second.setViewportSize({width: 1600, height: 1100});
  await second.goto("https://www.youtube.com/");
  await second.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(async () => Math.round((await second.locator(".panel").boundingBox()).width)).toBe(480);
  await expect(page.locator(".size-controls, .size-button")).toHaveCount(0);
  const west = await page.locator('.resize-edge[data-edge="w"]').boundingBox();
  await page.mouse.move(west.x + 3, west.y + west.height / 2); await page.mouse.down(); await page.mouse.move(west.x - 37, west.y + west.height / 2); await page.mouse.up();
  await expect.poll(async () => Math.round((await second.locator(".panel").boundingBox()).width)).toBe(520);
  const north = await page.locator('.resize-edge[data-edge="n"]').boundingBox();
  await page.mouse.move(north.x + north.width / 2, north.y + 3); await page.mouse.down(); await page.mouse.move(north.x + north.width / 2, north.y + 77); await page.mouse.up();
  await expect.poll(savedSize).toEqual({width: 520, height: 760});
  await grip.focus(); await grip.press("ArrowRight");
  await expect.poll(savedSize).toEqual({width: 500, height: 760});

  const beforeCancel = await panel.boundingBox(), cancelCorner = await grip.boundingBox();
  await page.mouse.move(cancelCorner.x + 14, cancelCorner.y + 14); await page.mouse.down();
  await page.mouse.move(cancelCorner.x - 36, cancelCorner.y + 64, {steps: 3});
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(panel).toBeVisible();
  await expect.poll(async()=>Math.round((await panel.boundingBox()).width)).toBe(Math.round(beforeCancel.width));

  const invalid = await testClient.evaluate(() => chrome.runtime.sendMessage({scope: "ycg", type: "panelSizeSave", size: {width: "unsafe", height: 600}}));
  expect(invalid.ok).toBe(false);
  await expect.poll(savedSize).toEqual({width: 500, height: 760});
  await page.screenshot({path: path.join(artifacts, "preview-resizable-panel.png")});
  await page.setViewportSize({width: 390, height: 600});
  await expect(panel).toHaveAttribute("data-layout", "floating");
  const small = await panel.boundingBox();
  expect(small.width).toBe(366); expect(small.height).toBeLessThanOrEqual(504);
  expect(small.x).toBeGreaterThanOrEqual(0); expect(small.y).toBeGreaterThanOrEqual(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: path.join(artifacts, "preview-resizable-narrow.png")});
  await page.setViewportSize({width: 1600, height: 1100});
  await expect.poll(async () => Math.round((await panel.boundingBox()).width)).toBe(500);
  await expect.poll(async () => Math.round((await panel.boundingBox()).height)).toBe(760);
  await grip.dblclick();
  await expect.poll(savedSize).toEqual({width: 360, height: null});
  await expect.poll(async () => Math.round((await panel.boundingBox()).height)).toBe(original.height);
  await grip.dblclick();
  await expect.poll(savedSize).toEqual({width: 360, height: null});
  await page.close(); await second.close();
});

test("category browsing opens channel videos and filters loaded subscription choices", async () => {
  const seed = {version: 1, groups: [{id: "ai", name: "AI"}, {id: "music", name: "音乐"}], channels: aiSeed.channels.map((channel, index) => ({...channel, groupIds: [index ? "music" : "ai"]}))};
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/feed/subscriptions");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByRole("button", {name: "AI 1", exact: true}).click();
  await expect(page.locator(".channel")).toHaveCount(1);
  await expect(page.locator(".channel-title")).toHaveText("Alpha AI");
  const videos = page.getByRole("link", {name: "查看视频：Alpha AI", exact: true});
  await expect(videos).toHaveAttribute("href", "https://www.youtube.com/@alphaai/videos");
  await expect(videos).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await videos.click(); const popup = await popupPromise;
  await expect(popup).toHaveURL("https://www.youtube.com/@alphaai/videos");
  await popup.close();
  await expect(page.locator('[data-test-channel="AlphaAI"]')).toBeVisible();
  await expect(page.locator('[data-test-channel="BetaMusic"]')).toBeHidden();
  await page.getByRole("button", {name: "音乐 1", exact: true}).click();
  await expect(page.locator(".channel-title")).toHaveText("Beta Music");
  await expect(page.locator('[data-test-channel="BetaMusic"]')).toBeVisible();
  await expect(page.locator('[data-test-channel="AlphaAI"]')).toBeHidden();
  await page.screenshot({path: path.join(artifacts, "preview-category-browse.png")});
  expect(await getState()).toEqual(seed);
  const options = await context.newPage();
  await options.goto(new URL("options.html", worker.url()).href);
  await options.getByLabel("界面语言", {exact: true}).selectOption("en");
  await expect(page.getByRole("link", {name: "View videos: Beta Music", exact: true})).toHaveText("View videos ↗");
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.locator(".head")).toHaveAttribute("aria-label", "Move panel: drag the title bar or use arrow keys");
  await options.getByLabel("Interface language", {exact: true}).selectOption("zh-CN");
  await page.close(); await options.close();
});

async function openOrganization(text = "合并成3大类，每个频道最多3类") {
  const page = await openAssistant();
  await page.getByRole("combobox", {name: "AI 任务", exact: true}).selectOption("organize");
  await page.getByRole("textbox", {name: "精简分类要求", exact: true}).fill(text);
  return page;
}
const organizationSeed = count => ({...bulkSeed(count), groups: Array.from({length: 8}, (_, i) => ({id: `old${i}`, name: `旧分类${i}`})), channels: bulkSeed(count).channels.map((channel, i) => ({...channel, groupIds: [`old${i % 8}`]}))});

test("organization: natural count, edited plan, fixed batches, whole replacement and complete conflict-safe undo", async () => {
  const seed = organizationSeed(45);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  mockMode = "org-unknown"; aiRequests.length = 0;
  const page = await openOrganization();
  const progress = page.locator(".organization-progress");
  await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
  await expect(page.locator(".plan-category")).toHaveCount(3);
  await expect(page.getByText(/方案共 3 类，参考 45 个频道样本/)).toBeVisible();
  await expect(page.getByRole("progressbar", {name: "精简分类进度", exact: true})).toHaveAttribute("value", "1");
  expect(await getState()).toEqual(seed);
  await page.getByRole("textbox", {name: "方案分类 1", exact: true}).fill("科技与AI");
  await options.getByLabel("界面语言", {exact: true}).selectOption("en");
  await expect(page.getByRole("button", {name: "Classify all channels with this plan", exact: true})).toBeVisible();
  await expect(page.getByRole("textbox", {name: "Planned category 1", exact: true})).toHaveValue("科技与AI");
  await options.getByLabel("Interface language", {exact: true}).selectOption("zh-CN");
  await page.screenshot({path: path.join(artifacts, "preview-organization-plan.png")});
  await page.setViewportSize({width: 390, height: 844});
  await page.locator(".organization-plan").scrollIntoViewIfNeeded();
  expect(await page.locator(".panel").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const narrowPlan = await page.locator(".panel").boundingBox();
  expect(narrowPlan.x).toBeGreaterThanOrEqual(0); expect(narrowPlan.x + narrowPlan.width).toBeLessThanOrEqual(390);
  await page.screenshot({path: path.join(artifacts, "preview-organization-narrow.png")});
  await page.setViewportSize({width: 1400, height: 1050});
  await page.getByRole("button", {name: "按方案自动归类全部频道", exact: true}).click();
  await expect(progress).toContainText("归类预览已完成");
  expect(aiRequests).toHaveLength(4);
  const requests = aiRequests.slice(1).map(request => JSON.parse(request.body.messages[1].content));
  expect(requests.map(data => data.channels.length)).toEqual([20, 20, 5]);
  expect(requests.every(data => JSON.stringify(data.groups) === JSON.stringify(["科技与AI", "总体分类2", "总体分类3"]))).toBe(true);
  expect(requests.flatMap(data => data.channels.map(channel => channel.id))).toEqual(seed.channels.map(channel => channel.id));
  expect(await getState()).toEqual(seed);
  await expect(page.getByText(/预览 45 个频道，其中 1 个未分类/)).toBeVisible();
  const first = page.locator(".organizer .ai-suggestion").first();
  await first.locator("summary").click();
  await first.getByRole("checkbox", {name: "批量频道 0：科技与AI（精简方案）", exact: true}).check();
  await expect(page.getByText(/预览 45 个频道，其中 0 个未分类/)).toBeVisible();
  await page.screenshot({path: path.join(artifacts, "preview-organization-results.png")});
  await page.getByRole("button", {name: "替换旧分类并应用", exact: true}).click();
  await expect(progress).toContainText("已整理为 3 类");
  const saved = await getState();
  expect(saved.groups.map(group => group.name)).toEqual(["科技与AI", "总体分类2", "总体分类3"]);
  expect(saved.channels).toHaveLength(45);
  expect(saved.channels.every(channel => channel.groupIds.length === 1)).toBe(true);
  expect(saved.groups.some(group => group.id.startsWith("old"))).toBe(false);
  await page.reload();
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.getByText("✦ AI 分类助手", {exact: true}).click();
  await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
  await expect.poll(getState).toEqual(seed);

  const reapplied = await message({type: "applyOrganization", base: seed, names: ["统一分类"], suggestions: seed.channels.map(channel => ({channelId: channel.id, groups: ["统一分类"]}))});
  expect(reapplied.ok).toBe(true);
  await message({type: "createGroup", name: "后续手工修改"});
  const edited = await getState();
  await page.getByRole("combobox", {name: "AI 任务", exact: true}).selectOption("organize");
  await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
  await expect(page.locator(".ai-assistant > p[role=status]")).toContainText("后续修改");
  expect(await getState()).toEqual(edited);
  await page.close(); await options.close(); mockMode = "valid";
});

test("organization: count errors, rogue categories, pause, failed batch resume and stale-plan rejection", async () => {
  const seed = organizationSeed(45);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  const page = await openOrganization("请精简成3类");
  const progress = page.locator(".organization-progress");
  mockMode = "plan-wrong"; aiRequests.length = 0;
  await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
  await expect(progress).toContainText("不符合要求的分类数量");
  expect(await getState()).toEqual(seed);
  mockMode = "valid";
  await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
  await expect(page.locator(".plan-category")).toHaveCount(3);
  mockMode = "org-rogue"; aiRequests.length = 0;
  await page.getByRole("button", {name: "按方案自动归类全部频道", exact: true}).click();
  await expect(progress).toContainText("方案以外");
  expect(await getState()).toEqual(seed);
  mockMode = "valid"; mockHoldAt = 2;
  try {
    await page.getByRole("button", {name: "继续归类剩余 45 个频道", exact: true}).click();
    await expect.poll(() => typeof releaseMock).toBe("function");
    await page.getByRole("button", {name: "本批完成后停止", exact: true}).click();
    releaseMock(); releaseMock = null;
    await expect(progress).toContainText("已暂停");
    await expect(page.getByRole("progressbar", {name: "精简分类进度", exact: true})).toHaveAttribute("value", "20");
    await expect(page.getByRole("button", {name: "替换旧分类并应用", exact: true})).toBeDisabled();
    mockHoldAt = mockFailureAt = 3;
    await page.getByRole("button", {name: "继续归类剩余 25 个频道", exact: true}).click();
    await expect.poll(() => typeof releaseMock).toBe("function");
    await expect(page.getByRole("button", {name: "本批完成后停止", exact: true})).toBeEnabled();
    releaseMock(); releaseMock = null;
    await expect(progress).toContainText("HTTP 500");
    await expect(page.getByRole("progressbar", {name: "精简分类进度", exact: true})).toHaveAttribute("value", "20");
    await page.getByRole("button", {name: "继续归类剩余 25 个频道", exact: true}).click();
    await expect(progress).toContainText("归类预览已完成");
    expect(aiRequests.map(request => JSON.parse(request.body.messages[1].content).channels.length)).toEqual([20, 20, 20, 20, 5]);
    expect(await getState()).toEqual(seed);
    await message({type: "renameGroup", id: "old0", name: "手工改名"});
    await expect(progress).toContainText("已变更");
    await expect(page.getByRole("button", {name: "替换旧分类并应用", exact: true})).toBeDisabled();
    const edited = await getState();
    expect((await message({type: "applyOrganization", base: seed, names: ["总体分类1", "总体分类2", "总体分类3"], suggestions: seed.channels.map(channel => ({channelId: channel.id, groups: ["总体分类1"]}))})).ok).toBe(false);
    expect(await getState()).toEqual(edited);
  } finally {
    releaseMock?.(); releaseMock = null; mockHoldAt = mockFailureAt = 0; mockMode = "valid";
    await page.close(); await options.close();
  }
});

test("organization stays compatible with installed-protocol Codex and Claude native hosts", async () => {
  for (const provider of ["codex", "claude"]) {
    await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state}), aiSeed);
    const options = await configureAI(provider);
    const beforeCalls = (await fs.readFile(nativeLog, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).length;
    const page = await openOrganization("合并成2类");
    await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
    await expect(page.locator(".plan-category")).toHaveCount(2);
    await page.getByRole("button", {name: "按方案自动归类全部频道", exact: true}).click();
    await expect(page.locator(".organization-progress")).toContainText("归类预览已完成");
    const calls = (await fs.readFile(nativeLog, "utf8")).trim().split("\n").map(line => JSON.parse(line)).slice(beforeCalls);
    expect(calls).toHaveLength(2);
    expect(calls[0].data.channels).toHaveLength(20);
    expect(calls[1].data.groups).toEqual(["总体分类1", "总体分类2"]);
    expect(await getState()).toEqual(aiSeed);
    await page.getByRole("button", {name: "替换旧分类并应用", exact: true}).click();
    await expect.poll(async () => (await getState()).groups.length).toBe(2);
    await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
    await expect.poll(getState).toEqual(aiSeed);
    await page.close(); await options.close();
  }
});

test("window borders: eight real hit targets, pixel resizing, fixed opposite edges and persistent offsets", async () => {
  const page = await context.newPage();
  await page.setViewportSize({width: 1800, height: 1100});
  await page.goto("https://www.youtube.com/");
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  const panel = page.locator(".panel"), initial = {width: 500, height: 600, right: 100, bottom: 100};
  const save = size => testClient.evaluate(size => chrome.runtime.sendMessage({scope: "ycg", type: "panelSizeSave", size}), size);
  const stored = () => worker.evaluate(async () => (await chrome.storage.local.get("ycg.panel-size.v1"))["ycg.panel-size.v1"]);
  const rect = async () => panel.evaluate(element => { const r = element.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height}; });
  async function start(edge) {
    const r = await rect();
    const x = edge.includes("w") ? r.left + (edge.length === 2 ? 12 : 3) : edge.includes("e") ? r.right - (edge.length === 2 ? 12 : 3) : (r.left + r.right) / 2;
    const y = edge.includes("n") ? r.top + (edge.length === 2 ? 12 : 3) : edge.includes("s") ? r.bottom - (edge.length === 2 ? 12 : 3) : (r.top + r.bottom) / 2;
    await page.mouse.move(x, y);
    expect(await page.evaluate(({x, y}) => document.querySelector("#ycg-root").shadowRoot.elementFromPoint(x, y)?.dataset.edge, {x, y})).toBe(edge);
    expect(await page.locator(`.resize-edge[data-edge="${edge}"]`).evaluate(element => getComputedStyle(element).cursor)).toBe(edge + "-resize");
    await page.mouse.down();
    return {x, y, r};
  }
  for (const edge of ["n", "s", "w", "e", "nw", "ne", "sw", "se"]) {
    await save(initial);
    await expect.poll(rect).toEqual({left: 1200, right: 1700, top: 400, bottom: 1000, width: 500, height: 600});
    const {x, y, r} = await start(edge);
    const dx = edge.includes("w") ? -37 : edge.includes("e") ? 37 : 0, dy = edge.includes("n") ? -29 : edge.includes("s") ? 29 : 0;
    await page.mouse.move(x + dx, y + dy, {steps: 4});
    await expect(page.locator("html")).toHaveAttribute("data-ycg-resizing", edge);
    await page.mouse.up();
    const result = await rect();
    expect(result.left).toBe(r.left + (edge.includes("w") ? dx : 0));
    expect(result.right).toBe(r.right + (edge.includes("e") ? dx : 0));
    expect(result.top).toBe(r.top + (edge.includes("n") ? dy : 0));
    expect(result.bottom).toBe(r.bottom + (edge.includes("s") ? dy : 0));
    await expect.poll(stored).toEqual({width: result.width, height: result.height, right: 1800 - result.right, bottom: 1100 - result.bottom});
    await expect(page.locator("html")).not.toHaveAttribute("data-ycg-resizing");
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ycg-resize-cursor"))).toBe("");
    const app = await page.locator("ytd-app").boundingBox();
    expect(app.width).toBe(1800);
  }
  const savedRect = await rect();
  await page.reload(); await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(rect).toEqual(savedRect);
  const drag = await start("e");
  await page.mouse.move(drag.x + 20, drag.y); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(rect).toEqual(savedRect);
  await expect(panel).toBeVisible(); await expect(page.locator("html")).not.toHaveAttribute("data-ycg-resizing");
  const interrupted = await start("w");
  await page.mouse.move(interrupted.x - 20, interrupted.y);
  await page.setViewportSize({width: 1100, height: 720}); await page.mouse.up();
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-resizing");
  // The panel is clamped after the viewport resize is observed, not synchronously.
  await expect.poll(async () => { const small = await rect(); return small.left >= 12 && small.right <= 1088 && small.top >= 80 || small; }).toBe(true);
  await page.setViewportSize({width: 1800, height: 1100});
  await expect.poll(rect).toEqual(savedRect);
  await page.screenshot({path: path.join(artifacts, "preview-border-resize.png")});

  await page.locator('.resize-edge[data-edge="w"]').dblclick();
  await expect.poll(stored).toEqual({width: 360, height: null});
  await page.setViewportSize({width: 3000, height: 2400});
  await expect.poll(async () => (await rect()).width).toBe(360);
  const left = await start("w"); await page.mouse.move(left.x - 840, left.y, {steps: 5}); await page.mouse.up();
  await expect.poll(async () => (await rect()).width).toBe(1200);
  const top = await start("n"); await page.mouse.move(top.x, top.y + 404, {steps: 5}); await page.mouse.up();
  await expect.poll(async () => (await rect()).height).toBe(1900);
  await expect.poll(stored).toEqual({width: 1200, height: 1900});
  await page.locator('.resize-edge[data-edge="w"]').dblclick();
  await expect.poll(stored).toEqual({width: 360, height: null});
  await page.close();
});

test("title bar moves the floating window, remembers position, keeps page layout and excludes close controls", async () => {
  await worker.evaluate(() => chrome.storage.local.set({"ycg.panel-size.v1": {width: 500, height: 600}}));
  const page = await context.newPage();
  await page.setViewportSize({width: 1800, height: 1100});
  await page.goto("https://www.youtube.com/watch?v=example");
  await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();
  const originalPage=await youtubeGeometry(page);
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  const panel = page.locator(".panel"), head = page.locator(".head");
  const stored = () => worker.evaluate(async () => (await chrome.storage.local.get("ycg.panel-size.v1"))["ycg.panel-size.v1"]);
  const initial = await panel.boundingBox(), header = await head.boundingBox();
  await page.mouse.move(header.x + 100, header.y + 35); await page.mouse.down();
  await page.mouse.move(header.x - 500, header.y - 65, {steps: 6}); await page.mouse.up();
  const moved = await panel.boundingBox();
  expect(moved.x).toBe(initial.x - 600); expect(moved.y).toBe(initial.y - 100);
  expect(moved.width).toBe(initial.width); expect(moved.height).toBe(initial.height);
  await expect(panel).toHaveAttribute("data-layout", "floating");
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout");
  expect(await page.locator("ytd-app").evaluate(element => element.getBoundingClientRect().width)).toBe(1800);
  await expect.poll(()=>youtubeGeometry(page)).toEqual(originalPage);
  const expected = {width: 500, height: 600, right: 1800 - moved.x - moved.width, bottom: 1100 - moved.y - moved.height, floating: true};
  await expect.poll(stored).toEqual(expected);
  await page.locator("video").click({position: {x: 5, y: 5}});
  await expect(panel).toBeVisible();
  await expect(page.locator(".size-controls, .size-button, input[type=range]")).toHaveCount(0);
  const second = await context.newPage(); await second.setViewportSize({width: 1800, height: 1100});
  await second.goto("https://www.youtube.com/"); await second.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(() => second.locator(".panel").boundingBox()).toEqual(moved);
  await page.reload(); await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await expect.poll(() => panel.boundingBox()).toEqual(moved);
  const beforeCancel = await head.boundingBox();
  await page.mouse.move(beforeCancel.x + 90, beforeCancel.y + 35); await page.mouse.down();
  await page.mouse.move(beforeCancel.x + 180, beforeCancel.y + 85); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(() => panel.boundingBox()).toEqual(moved);
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-resizing");
  await page.getByRole("button", {name: "关闭分类面板", exact: true}).click();
  await expect(panel).toBeHidden(); await expect.poll(stored).toEqual(expected);
  await page.getByRole("button", {name: "频道分类", exact: true}).click();
  await page.screenshot({path: path.join(artifacts, "preview-moved-panel.png")});
  await head.dblclick({position: {x: 100, y: 30}});
  await expect.poll(stored).toEqual({width: 360, height: null});
  await expect(page.locator("html")).not.toHaveAttribute("data-ycg-layout");
  await expect.poll(()=>youtubeGeometry(page)).toEqual(originalPage);
  await head.focus(); await head.press("ArrowLeft");
  await expect.poll(async () => (await stored()).floating).toBe(true);
  await page.setViewportSize({width: 390, height: 600});
  await expect.poll(async () => { const box = await panel.boundingBox(); return box.x >= 12 && box.y >= 80 && box.x + box.width <= 378 && box.y + box.height <= 584; }).toBe(true);
  const small = await panel.boundingBox();
  expect(small.x).toBeGreaterThanOrEqual(12); expect(small.y).toBeGreaterThanOrEqual(80);
  expect(small.x + small.width).toBeLessThanOrEqual(378); expect(small.y + small.height).toBeLessThanOrEqual(584);
  await page.close(); await second.close();
});

test("review workspace pins targets and actions, pages results and saves real drag edits only on apply", async () => {
  const seed = organizationSeed(34);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state, "ycg.panel-size.v1": {width: 720, height: 950}}), seed);
  const options = await configureAI("api", mockOrigin + "/v1");
  mockMode = "org-unknown";
  const page = await openOrganization("合并成3类");
  await page.setViewportSize({width: 1800, height: 1100});
  await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
  await expect(page.locator(".plan-category")).toHaveCount(3);
  await page.getByRole("button", {name: "按方案自动归类全部频道", exact: true}).click();
  await expect(page.locator(".organization-progress")).toContainText("归类预览已完成");
  await expect(page.locator(".panel")).toHaveAttribute("data-review", "");
  await expect(page.locator(".body")).toBeHidden(); await expect(page.locator(".footer")).toBeHidden();
  const cards = page.locator(".organizer .review-card");
  await expect(cards).toHaveCount(8);
  await expect(page.getByText("第 1 / 5 页", {exact: true})).toBeVisible();
  const list = await page.locator(".organizer .review-list").boundingBox(), targets = await page.locator(".organizer .review-targets").boundingBox(), apply = await page.getByRole("button", {name: "替换旧分类并应用", exact: true}).boundingBox();
  expect(targets.y + targets.height).toBeLessThanOrEqual(list.y); expect(apply.y + apply.height).toBeLessThan(list.y);
  const firstBox = await cards.nth(0).boundingBox(), secondBox = await cards.nth(1).boundingBox();
  expect(secondBox.x).toBeGreaterThan(firstBox.x);
  await page.getByRole("combobox", {name: "审核筛选", exact: true}).selectOption("needs");
  await expect(cards).toHaveCount(1);
  await cards.first().locator(".review-drag-label").dragTo(page.locator('.organizer .review-target[data-category="总体分类2"]'));
  await expect(cards).toHaveCount(0);
  await expect(page.locator(".organizer .review-notice")).toContainText("批量频道 0");
  expect(await getState()).toEqual(seed);
  await page.getByRole("combobox", {name: "审核筛选", exact: true}).selectOption("all");
  await expect(cards.first().locator("summary")).toHaveText("总体分类2");
  await page.getByRole("combobox", {name: "审核筛选", exact: true}).selectOption("g:总体分类2");
  await expect(cards.nth(1)).toHaveAttribute("data-channel-id", "/@bulk1");
  await cards.nth(1).locator(".review-drag-label").dragTo(page.locator('.organizer .review-target[data-category="总体分类3"]'));
  await expect(page.locator('.organizer .review-card[data-channel-id="/@bulk1"]')).toHaveCount(0);
  await page.getByRole("combobox", {name: "审核筛选", exact: true}).selectOption("all");
  await page.getByRole("button", {name: "下一页", exact: true}).click();
  await expect(page.getByText("第 2 / 5 页", {exact: true})).toBeVisible();
  await expect(cards.first()).toHaveAttribute("data-channel-id", "/@bulk8");
  await page.getByRole("searchbox", {name: "审核搜索频道", exact: true}).fill("频道 33");
  await expect(cards).toHaveCount(1); await expect(cards.first()).toHaveAttribute("data-channel-id", "/@bulk33");
  await cards.first().locator(".review-drag-label").dragTo(page.locator('.organizer .review-target[data-category="总体分类3"]'));
  await expect(cards.first().locator("summary")).toHaveText("总体分类3");
  await page.getByRole("button", {name: "返回分类与设置", exact: true}).click();
  await expect(page.getByRole("textbox", {name: "精简分类要求", exact: true})).toHaveValue("合并成3类");
  await page.getByRole("button", {name: "打开审核工作台", exact: true}).click();
  await expect(page.getByRole("searchbox", {name: "审核搜索频道", exact: true})).toHaveValue("频道 33");
  await page.getByRole("searchbox", {name: "审核搜索频道", exact: true}).fill("");
  await page.screenshot({path: path.join(artifacts, "preview-review-workspace.png")});
  await options.getByLabel("界面语言", {exact: true}).selectOption("en");
  await expect(page.getByRole("combobox", {name: "Review filter", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: /^总体分类2 \d+$/})).toBeVisible();
  await options.getByLabel("Interface language", {exact: true}).selectOption("zh-CN");
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.locator(".panel")).toHaveAttribute("data-review", "");
  expect(await page.locator(".review-pane").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const smallPanel = await page.locator(".panel").boundingBox(), pager = await page.getByRole("button", {name: "下一页", exact: true}).boundingBox();
  expect(pager.y + pager.height).toBeLessThanOrEqual(smallPanel.y + smallPanel.height);
  await page.screenshot({path: path.join(artifacts, "preview-review-narrow.png")});
  await page.setViewportSize({width: 1800, height: 1100});
  expect(await getState()).toEqual(seed);
  await page.getByRole("button", {name: "替换旧分类并应用", exact: true}).click();
  await expect.poll(getState).not.toEqual(seed);
  const saved = await getState(), id = name => saved.groups.find(group => group.name === name).id;
  expect(saved.channels.find(channel => channel.id === "/@bulk0").groupIds).toEqual([id("总体分类2")]);
  expect(saved.channels.find(channel => channel.id === "/@bulk33").groupIds).toEqual([id("总体分类3")]);
  expect(saved.channels.find(channel => channel.id === "/@bulk1").groupIds).toEqual([id("总体分类3")]);
  await page.getByRole("button", {name: "撤销上次 AI 分类", exact: true}).click();
  await expect.poll(getState).toEqual(seed);
  await page.close(); await options.close(); mockMode = "valid";
});

test("guidance audit: current screenshots, accessibility scans, language, review focus and reflow", async () => {
  test.setTimeout(90000);
  const audit = path.join(artifacts, "quality-v0100", "audit");
  await fs.mkdir(audit, {recursive: true});
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state, "ycg.panel-size.v1": {width: 720, height: 950}, "ycg.preferences.v1": {language: "zh-CN"}}), organizationSeed(24));
  const options = await configureAI("api", mockOrigin + "/v1");
  const page = await openOrganization("合并成3类");
  await page.setViewportSize({width: 1800, height: 1100});
  const reports = [];
  async function capture(name, target, selector) {
    const snapshot = await target.locator(selector).ariaSnapshot();
    await fs.writeFile(path.join(audit, name + ".aria.txt"), snapshot);
    await target.screenshot({path: path.join(audit, name + ".png"), fullPage: selector === "main"});
    const result = await new AxeBuilder({page: target}).include(selector).analyze();
    await fs.writeFile(path.join(audit, name + ".axe.json"), JSON.stringify(result, null, 2));
    reports.push({name, violations: result.violations.map(({id, impact, nodes}) => ({id, impact, nodes: nodes.map(n => ({target: n.target, summary: n.failureSummary}))})), incomplete: result.incomplete.map(({id, nodes}) => ({id, count: nodes.length}))});
    if (!process.env.YCG_AUDIT_BASELINE && selector === "#ycg-root") {
      // Transparent glass prevents axe from resolving backgrounds. Check the actual solid fallback separately.
      await target.emulateMedia({contrast: "more"});
      const solid = await new AxeBuilder({page: target}).include(selector).withRules(["color-contrast"]).analyze();
      await fs.writeFile(path.join(audit, name + ".solid-contrast.json"), JSON.stringify(solid, null, 2));
      expect(solid.violations).toEqual([]);
      // Keep unresolved contrast checks in the report; an empty violations array is not full conformance.
      await target.emulateMedia({contrast: "no-preference"});
    }
  }
  await capture("01-panel", page, "#ycg-root");
  await page.getByRole("button", {name: "生成精简方案", exact: true}).click();
  await expect(page.locator(".plan-category")).toHaveCount(3);
  await page.getByRole("button", {name: "按方案自动归类全部频道", exact: true}).click();
  await expect(page.locator(".organization-progress")).toContainText("归类预览已完成");
  const focusAfterReview = await page.evaluate(() => document.querySelector("#ycg-root").shadowRoot.activeElement?.outerHTML || null);
  await capture("02-review", page, "#ycg-root");
  await options.getByLabel("界面语言", {exact: true}).selectOption("en");
  await expect(page.getByRole("combobox", {name: "Review filter", exact: true})).toBeVisible();
  const language = await page.locator("#ycg-root").getAttribute("lang");
  await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
  await expect(page.locator("#ycg-root")).toHaveAttribute("data-ycg-theme", "dark");
  await page.setViewportSize({width: 320, height: 844});
  await capture("03-narrow-dark", page, "#ycg-root");
  const reflow = await page.locator(".review-pane").evaluate(element => ({client: element.clientWidth, scroll: element.scrollWidth}));
  await options.setViewportSize({width: 740, height: 1000});
  await capture("04-settings", options, "main");
  await fs.writeFile(path.join(audit, "summary.json"), JSON.stringify({browser: context.browser()?.version(), language, focusAfterReview, reflow, reports}, null, 2));
  if (!process.env.YCG_AUDIT_BASELINE) {
    expect(language).toBe("en");
    expect(focusAfterReview).toContain("review");
    expect(reflow.scroll).toBeLessThanOrEqual(reflow.client);
    expect(reports.flatMap(report => report.violations.map(v => ({step: report.name, ...v})))).toEqual([]);
  }
  await page.close(); await options.close(); mockMode = "valid";
});

test("guidance keyboard: saved selection keeps focus, field errors are associated, toolbar needs no tab URL", async () => {
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1": state, "ycg.preferences.v1": {language: "zh-CN"}}), aiSeed);
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/feed/subscriptions");
  const tabsBefore = context.pages().length;
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await openFromAction({id: tab.id});
  });
  await expect(page.locator(".panel")).toBeVisible();
  expect(context.pages()).toHaveLength(tabsBefore);
  const membership = page.getByRole("checkbox", {name: "Beta Music：原有分类", exact: true});
  await membership.check();
  await expect(membership).toBeChecked(); await expect(membership).toBeFocused();
  await page.getByRole("button", {name: "关闭分类面板", exact: true}).click();
  await expect(page.getByRole("button", {name: "频道分类", exact: true})).toBeFocused();
  const options = await configureAI("api", mockOrigin + "/v1");
  await options.getByLabel("模型名称", {exact: true}).fill("invalid model");
  await options.getByRole("button", {name: "保存并授权连接地址", exact: true}).click();
  await expect(options.locator("#model")).toBeFocused();
  await expect(options.locator("#model")).toHaveAttribute("aria-invalid", "true");
  await expect(options.locator("#model")).toHaveAttribute("aria-describedby", "model-hint status");
  await options.locator("#model").fill("test-model");
  await expect(options.locator("#model")).not.toHaveAttribute("aria-invalid");
  await options.locator("#endpoint").fill("http://example.com/v1");
  await options.getByRole("button", {name: "保存并授权连接地址", exact: true}).click();
  await expect(options.locator("#endpoint")).toBeFocused();
  await expect(options.locator("#endpoint")).toHaveAttribute("aria-invalid", "true");
  await expect(options.locator("#status")).toContainText("HTTPS");
  await page.close(); await options.close();
});

test("quality: actual browser zoom, coarse pointer, keyboard path and complete contrast scans", async () => {
  test.setTimeout(90000);
  await worker.evaluate(state => chrome.storage.local.set({"ycg.state.v1":state,"ycg.preferences.v1":{language:"zh-CN"}}),aiSeed);
  const page=await context.newPage(); page.setDefaultTimeout(8000); await page.setViewportSize({width:1400,height:1050});
  await page.goto('https://www.youtube.com/feed/subscriptions'); await page.bringToFront();
  const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  const report=[]; const directory=path.join(artifacts,'quality-v0100'); await fs.mkdir(directory,{recursive:true});
  for(const zoom of [1,2,4]) {
    await worker.evaluate(({id,zoom})=>chrome.tabs.setZoom(id,zoom),{id:tabId,zoom});
    // Reopening shows the previous cards until the new render replaces them; a key press on an old card is lost.
    await page.locator('#ycg-root').evaluate(host=>host.shadowRoot.querySelectorAll('.channel').forEach(card=>{card.dataset.stale='';}));
    await page.getByRole('button',{name:'频道分类',exact:true}).click();
    await expect(page.locator('.channel:not([data-stale])')).toHaveCount(2);
    const width=await page.evaluate(()=>innerWidth), box=await page.locator('.panel').boundingBox();
    expect(width).toBeLessThanOrEqual(1400/zoom+1); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    const checkbox=page.getByRole('checkbox',{name:'Beta Music：原有分类',exact:true});
    // Each toggle is saved before the next one: the panel refuses a change while a save is running.
    // On slow hosts a late re-render can also replace the focused checkbox between keydown and keyup,
    // so press again only when the panel is idle and nothing was saved; Space must still toggle it.
    const idle=()=>expect(page.locator('.panel')).not.toHaveAttribute('aria-busy','true');
    const saved=async()=>(await getState()).channels.find(channel=>channel.id==='/@betamusic').groupIds.includes('manual');
    await expect(async()=>{
      await idle();
      if (!await saved()) { await checkbox.focus(); await checkbox.press('Space'); }
      await expect.poll(saved,{timeout:3000}).toBe(true);
    }).toPass({timeout:15000});
    await idle(); await expect(checkbox).toBeChecked(); await expect(checkbox).toBeFocused();
    await expect(checkbox).toBeVisible(); let rect; await expect.poll(async()=> { rect=await checkbox.boundingBox(); return rect!==null; }).toBe(true); const height=await page.evaluate(()=>innerHeight);
    expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y+rect.height).toBeLessThanOrEqual(height+1);
    await checkbox.press('Space'); await expect.poll(saved).toBe(false); await idle(); await expect(checkbox).not.toBeChecked();
    await page.screenshot({path:path.join(directory,`zoom-${zoom*100}.png`)});
    const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();
    await fs.writeFile(path.join(directory,`zoom-${zoom*100}.axe.json`),JSON.stringify(scan,null,2));
    expect(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    const scrolledChecks=[];
    for(const issue of scan.incomplete) {
      expect(issue.id).toBe('color-contrast');
      for(const node of issue.nodes) {
        const selector=node.target.flat().join(' ');await page.locator(selector).scrollIntoViewIfNeeded();
        const followup=await new AxeBuilder({page}).include(node.target[0]).withRules(['color-contrast']).analyze();
        expect(followup.violations).toEqual([]);expect(followup.incomplete).toEqual([]);
        scrolledChecks.push({target:node.target,violations:followup.violations.length,incomplete:followup.incomplete.length});
      }
    }
    report.push({zoom,cssWidth:width,cssHeight:height,box,violations:scan.violations.length,incomplete:scan.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),scrolledChecks});
    await page.getByRole('button',{name:'关闭分类面板',exact:true}).click();
  }
  await worker.evaluate(id=>chrome.tabs.setZoom(id,1),tabId);
  const cdp=await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  expect((await page.locator('.close').boundingBox()).height).toBeGreaterThanOrEqual(48);
  await page.locator('.head').focus(); await page.locator('.head').press('ArrowLeft'); await page.locator('.head').press('Enter');
  await page.screenshot({path:path.join(directory,'coarse-pointer.png')});
  await fs.writeFile(path.join(directory,'zoom.json'),JSON.stringify(report,null,2));
  await page.close();
});

test("quality: large collections stay paged and responsive under CPU throttling", async () => {
  test.setTimeout(90000);
  const seed=bulkSeed(10000); seed.groups=Array.from({length:100},(_,i)=>({id:'g'+i,name:'分类'+i}));
  seed.channels.forEach(channel=>{channel.avatarUrl='https://yt3.ggpht.com/stress-avatar=s88-c';});
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),seed);
  const page=await context.newPage();
  // The budget means 4x slower than the reference Mac (best steady-state benchmark 12 ms). Slower hosts,
  // such as hosted CI runners, get a lower rate so that the total slowdown stays the same.
  const benchmark=await page.evaluate(()=>{const run=()=>{const t=performance.now();let x=0;for(let i=0;i<2e7;i++)x+=Math.sqrt(i);return performance.now()-t;};for(let i=0;i<5;i++)run();return Math.min(...Array.from({length:5},run));});
  const referenceHost=benchmark<=12*1.25, cpuThrottle=referenceHost?4:Math.max(1,4*12/benchmark);
  const cdp=await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuThrottle});
  await page.route('https://yt3.ggpht.com/**',route=>route.fulfill({status:404,body:''}));
  await page.bringToFront();
  await page.addInitScript(()=>{window.qualityTasks=[];window.qualityEvents=[];new PerformanceObserver(list=>window.qualityTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});new PerformanceObserver(list=>window.qualityEvents.push(...list.getEntries().map(e=>({name:e.name,duration:e.duration,interactionId:e.interactionId})))).observe({type:'event',durationThreshold:16,buffered:true});});
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await expect(page.locator('#ycg-root')).toBeAttached(); if (!process.env.YCG_BENCHMARK_BASELINE) expect(await page.locator('.channel').count()).toBe(0);
  await page.getByRole('button',{name:'频道分类',exact:true}).click(); await expect(page.locator('.channel')).toHaveCount(process.env.YCG_BENCHMARK_BASELINE ? 100 : 20);
  if (!process.env.YCG_BENCHMARK_BASELINE) { await page.getByRole('button',{name:'下一页频道',exact:true}).click(); await expect(page.locator('.channel-pagination')).toContainText('第 2 / 500 页'); }
  await page.getByRole('searchbox',{name:'搜索频道',exact:true}).fill('9999'); await expect(page.locator('.channel')).toHaveCount(1);
  await expect(page.locator('.channel-title')).toHaveText('批量频道 9999');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0)))));
  const result=await page.evaluate(({cpuThrottle,benchmark})=>({cpuThrottle,benchmark,longTasks:window.qualityTasks,events:window.qualityEvents,domNodes:document.querySelector('#ycg-root').shadowRoot.querySelectorAll('*').length}),{cpuThrottle,benchmark});
  await fs.mkdir(path.join(artifacts,'quality-v0100'),{recursive:true});
  await fs.writeFile(path.join(artifacts,process.env.YCG_BENCHMARK_BASELINE?'quality-v0100/stress-before.json':'quality-v0100/stress.json'),JSON.stringify(result,null,2));
  if (!process.env.YCG_BENCHMARK_BASELINE) {
    // The 50 ms long-task budget is defined on the reference Mac. Hosted macOS VMs run cold code much slower
    // than their steady-state benchmark shows, so there every task must stay inside the 200 ms interaction budget.
    if (referenceHost) expect(result.longTasks).toEqual([]);
    else {
      test.info().annotations.push({type:'long tasks on a slower host',description:`benchmark ${benchmark} ms, throttle ${cpuThrottle.toFixed(2)}x: ${JSON.stringify(result.longTasks)}`});
      expect(Math.max(0,...result.longTasks.map(task=>task.duration))).toBeLessThan(200);
    }
    expect(Math.max(0,...result.events.filter(e=>e.interactionId).map(e=>e.duration))).toBeLessThan(200);
  }
  await page.close();
});

test("quality: confirmed deletion cancels AI, clears all data, rejects stale writes and prevents recollection", async () => {
  test.setTimeout(60000);
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.ai.undo.v1':{entries:[{channelId:'/@alphaai',before:[],after:['manual']}]},'ycg.preferences.v1':{language:'zh-CN'},'ycg.launcher-position.v1':{right:320,bottom:90}}),aiSeed);
  const options=await configureAI('api',mockOrigin+'/v1'); const page=await openAssistant();
  await worker.evaluate(()=>chrome.storage.session.set({'ycg.ai.draft.999':{epoch:null,draft:{version:1,suggestions:[]}}}));
  aiRequests.length=0; mockHoldAt=1;
  await page.getByRole('button',{name:'生成分类建议',exact:true}).click(); await expect.poll(()=>aiRequests.length).toBe(1);
  await options.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();
  await expect(options.getByRole('dialog')).toBeVisible();
  await options.getByRole('button',{name:'取消',exact:true}).click(); expect((await getState()).channels.length).toBe(2);
  await options.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();
  await options.getByRole('button',{name:'确认删除全部数据',exact:true}).click(); await expect(options.getByRole('dialog')).toBeVisible();
  await options.getByRole('checkbox',{name:'我理解将永久删除此浏览器中的全部分类和设置',exact:true}).check();
  await options.screenshot({path:path.join(artifacts,'quality-v0100/delete-confirm.png'),fullPage:true});
  await options.getByRole('button',{name:'确认删除全部数据',exact:true}).click(); await expect(options.getByRole('dialog')).toBeHidden();
  await expect(options.locator('#privacy-status')).toContainText('本机数据已删除');
  releaseMock?.(); mockHoldAt=0;
  const stored=await worker.evaluate(()=>chrome.storage.local.get(null)); expect(Object.keys(stored)).toEqual(['ycg.privacy.v1']); expect(await worker.evaluate(()=>chrome.storage.session.get(null))).toEqual({}); expect(stored['ycg.privacy.v1'].collectionPaused).toBe(true);
  const staleIcon=await testClient.evaluate(()=>chrome.runtime.sendMessage({scope:'ycg',type:'launcherPositionSave',epoch:null,position:{right:80,bottom:80}}));expect(staleIcon.ok).toBe(false);
  expect((await message({type:'collect',channels:aiSeed.channels})).ok).toBe(false);
  await page.goto('https://www.youtube.com/feed/channels'); await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect(page.locator('.channel')).toHaveCount(0); await page.reload(); await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect(page.locator('.channel')).toHaveCount(0);
  await page.evaluate(()=>document.documentElement.setAttribute('dark',''));
  await expect(options.locator('html')).toHaveAttribute('data-ycg-theme','dark');
  expect(Object.keys(await worker.evaluate(()=>chrome.storage.local.get(null)))).toEqual(['ycg.privacy.v1']);
  await page.getByRole('button',{name:'恢复收集已加载频道',exact:true}).click(); await expect(page.locator('.channel')).toHaveCount(3);
  const saved=await getState(); expect(saved.groups).toEqual([]); expect(saved.channels).toHaveLength(3);
  await page.close(); await options.close(); mockMode='valid';
  await worker.evaluate(()=>chrome.storage.local.clear());
});

test('quality: low-contrast source colors keep AA reading surfaces and Trusted Types blocks unsafe sinks',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),aiSeed);
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/subscriptions');
  await page.evaluate(()=>{for(const key of ['base-background','raised-background','text-primary','text-secondary','call-to-action','outline'])document.documentElement.style.setProperty('--yt-spec-'+key,'rgb(145, 145, 145)');});
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect.poll(()=>page.locator('#ycg-root').evaluate(e=>e.style.getPropertyValue('--bg'))).toBe('rgb(145, 145, 145)');
  const colors=await page.locator('#ycg-root').evaluate(host=>{const c=getComputedStyle(host);return Object.fromEntries(['surface','text','muted-text','control-line','focus-ring'].map(k=>[k,c.getPropertyValue('--'+k)]));});
  const Design=require('../../extension/design.js');
  for(const key of ['text','muted-text'])expect(Design.ratio(Design.parse(colors[key]),Design.parse(colors.surface))).toBeGreaterThanOrEqual(4.5);
  for(const key of ['control-line','focus-ring'])expect(Design.ratio(Design.parse(colors[key]),Design.parse(colors.surface))).toBeGreaterThanOrEqual(3);
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);expect(scan.incomplete).toEqual([]);
  await page.locator('.ai-assistant > summary').click();
  await page.evaluate(()=>{for(const [key,color] of Object.entries({'base-background':'#000','raised-background':'#fff','text-primary':'#000','text-secondary':'#111'}))document.documentElement.style.setProperty('--yt-spec-'+key,color);});
  await expect.poll(()=>page.locator('#ycg-root').evaluate(e=>getComputedStyle(e).getPropertyValue('--surface'))).toBe('rgb(0, 0, 0)');
  const opposite=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(opposite.violations).toEqual([]);expect(opposite.incomplete).toEqual([]);
  await fs.writeFile(path.join(artifacts,'quality-v0100/custom-theme.json'),JSON.stringify({colors,violations:scan.violations,incomplete:scan.incomplete,oppositeSurfaces:{violations:opposite.violations,incomplete:opposite.incomplete}},null,2));
  const options=await context.newPage();await options.goto(new URL('options.html',worker.url()).href);
  expect(await options.evaluate(()=>{try{document.createElement('div').innerHTML='<b>test</b>';return false;}catch(error){return error instanceof TypeError;}})).toBe(true);
  expect(await options.evaluate(()=>{try{trustedTypes.createPolicy('unapproved',{createHTML:s=>s});return false;}catch(error){return error instanceof TypeError;}})).toBe(true);
  expect(await worker.evaluate(()=>{try{bootstrap.createScriptURL('https://example.invalid/code.js');return false;}catch(error){return error instanceof TypeError;}})).toBe(true);
  await options.getByLabel('界面语言',{exact:true}).selectOption('en');
  await expect(page.getByRole('button',{name:'Close channel panel',exact:true}).locator('svg')).toBeVisible();
  await page.close();await options.close();
});

test('quality: a pending settings permission request cannot restore deleted credentials',async()=>{
  await worker.evaluate(()=>chrome.storage.local.clear());
  const options=await configureAI('api',mockOrigin+'/v1');
  await options.evaluate(()=>{chrome.permissions.request=()=>new Promise(resolve=>{window.finishTestPermission=()=>resolve(true);});});
  await options.locator('#model').fill('pending-model');await options.getByRole('button',{name:'保存并授权连接地址',exact:true}).click();
  await expect(options.locator('#save-phase')).toContainText('请求连接权限');
  const other=await context.newPage();await other.goto(new URL('options.html',worker.url()).href);
  await other.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();
  await other.getByRole('checkbox',{name:'我理解将永久删除此浏览器中的全部分类和设置',exact:true}).check();
  await other.getByRole('button',{name:'确认删除全部数据',exact:true}).click();await expect(other.getByRole('dialog')).toBeHidden();
  await options.evaluate(()=>window.finishTestPermission());
  await expect(options.locator('#status')).toContainText('旧操作已取消');
  const stored=await worker.evaluate(()=>chrome.storage.local.get(null));expect(Object.keys(stored)).toEqual(['ycg.privacy.v1']);
  const stale=await options.evaluate(()=>chrome.runtime.sendMessage({scope:'ycg',type:'settingsSave',epoch:null,config:{provider:'codex',model:''}}));expect(stale.ok).toBe(false);
  await options.close();await other.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('quality: full deletion disconnects the native host and terminates pending Codex and Claude processes',async()=>{
  for(const provider of ['codex','claude']) {
    await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),aiSeed);
    const options=await configureAI(provider,'');const page=await openAssistant();
    await page.getByRole('textbox',{name:'AI 分类要求',exact:true}).fill('hold-native');
    const previousCalls=(await fs.readFile(nativeLog,'utf8').catch(()=> '')).trim().split('\n').filter(Boolean).length;
    await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
    let pid;await expect.poll(async()=>{const text=await fs.readFile(nativeLog,'utf8').catch(()=> '');const calls=text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));pid=calls.slice(previousCalls).find(c=>c.data.instructions.includes('hold-native'))?.pid;return Boolean(pid);}).toBe(true);
    await options.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();
    await options.getByRole('checkbox',{name:'我理解将永久删除此浏览器中的全部分类和设置',exact:true}).check();
    await options.getByRole('button',{name:'确认删除全部数据',exact:true}).click();await expect(options.getByRole('dialog')).toBeHidden();
    await expect.poll(()=>{try{process.kill(pid,0);return true;}catch{return false;}}).toBe(false);
    expect(Object.keys(await worker.evaluate(()=>chrome.storage.local.get(null)))).toEqual(['ycg.privacy.v1']);
    await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
  }
});

test('floating window: opening, resizing, moving, resetting and closing preserve the scrolled page geometry',async()=>{
  const directory=path.join(artifacts,'quality-v0100');await fs.mkdir(directory,{recursive:true});const reports=[];
  for(const width of [1400,390]) {
    await worker.evaluate(()=>chrome.storage.local.remove('ycg.panel-size.v1'));
    const page=await context.newPage();await page.setViewportSize({width,height:width===1400?1050:844});
    await page.goto('https://www.youtube.com/watch?v=example');
    await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();
    await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1400px';document.querySelector('ytd-app > main').append(spacer);window.scrollTo(0,100);});
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(100);
    const baseline=await youtubeGeometry(page),checks=[];
    const verify=async phase=>{await expect.poll(()=>youtubeGeometry(page)).toEqual(baseline);checks.push({phase,geometry:await youtubeGeometry(page)});};
    await page.getByRole('button',{name:'频道分类',exact:true}).click();await verify('open');
    const panel=page.locator('.panel'),initial=await panel.boundingBox();
    await page.screenshot({path:path.join(directory,`overlay-${width}.png`)});
    const edge=await page.locator('.resize-edge[data-edge="e"]').boundingBox();
    await page.mouse.move(edge.x+3,edge.y+edge.height/2);await page.mouse.down();await page.mouse.move(edge.x-21,edge.y+edge.height/2,{steps:3});await page.mouse.up();
    await expect.poll(async()=>Math.round((await panel.boundingBox()).width)).toBe(Math.round(initial.width-24));await verify('resize');
    const header=page.locator('.head'),box=await header.boundingBox();
    await page.mouse.move(box.x+80,box.y+35);await page.mouse.down();await page.mouse.move(box.x+40,box.y+35,{steps:4});await page.mouse.up();
    await expect.poll(async()=>(await panel.boundingBox()).x).toBeLessThan(initial.x);await verify('move');
    const moved=await panel.boundingBox();
    await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();await expect(panel).toBeHidden();await verify('minimize');
    const icon=page.getByRole('button',{name:'恢复频道分类窗口',exact:true});await expect(icon).toBeFocused();
    expect(await icon.boundingBox()).toMatchObject({width:44,height:44});
    await page.screenshot({path:path.join(directory,`minimized-${width}.png`)});
    await icon.press('Enter');await expect.poll(()=>panel.boundingBox()).toEqual(moved);await verify('restore');
    await header.focus();await header.press('Enter');await expect.poll(()=>panel.boundingBox()).toEqual(initial);await verify('reset');
    await page.getByRole('button',{name:'关闭分类面板',exact:true}).click();await expect(panel).toBeHidden();await verify('close');
    reports.push({width,baseline,checks});await page.close();
  }
  await fs.writeFile(path.join(directory,'overlay-geometry.json'),JSON.stringify(reports,null,2));
});

test('minimize: preserves drafts, review, saved geometry, theme, keyboard and full-screen behavior',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'},'ycg.panel-size.v1':{width:580,height:740,right:240,bottom:50,floating:true}}),aiSeed);
  const options=await configureAI('api',mockOrigin+'/v1'),page=await openAssistant();
  const panel=page.locator('.panel'),geometry=await panel.boundingBox();
  await page.getByRole('textbox',{name:'AI 分类要求',exact:true}).fill('保留最小化前的要求');
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  const restore=page.getByRole('button',{name:'恢复频道分类窗口',exact:true});
  await expect(restore).toBeFocused();await expect(panel).toBeHidden();
  await page.evaluate(()=>document.documentElement.setAttribute('dark',''));
  await expect.poll(()=>page.locator('#ycg-root').getAttribute('data-ycg-theme')).toBe('dark');
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);
  await options.getByLabel('界面语言',{exact:true}).selectOption('en');
  await expect(page.getByRole('button',{name:'Restore channel window',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Restore channel window',exact:true}).press('Space');
  await expect(page.getByRole('button',{name:'Minimize channel window',exact:true})).toBeFocused();
  await expect.poll(()=>panel.boundingBox()).toEqual(geometry);
  await expect(page.getByRole('textbox',{name:'AI instructions',exact:true})).toHaveValue('保留最小化前的要求');
  await options.getByLabel('Interface language',{exact:true}).selectOption('zh-CN');
  await page.getByLabel('AI 分类范围',{exact:true}).selectOption('all');
  await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
  const suggested=page.getByLabel('Alpha AI 的建议分类',{exact:true});await expect(suggested).toBeVisible();await suggested.fill('保留审核编辑');
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();await restore.click();
  await expect(panel).toHaveAttribute('data-review','');await expect(suggested).toHaveValue('保留审核编辑');
  await expect.poll(()=>panel.boundingBox()).toEqual(geometry);
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  await page.evaluate(()=>{const b=document.createElement('button');b.id='request-fullscreen';b.textContent='测试全屏';b.onclick=()=>document.body.requestFullscreen();document.querySelector('main').prepend(b);});
  await page.locator('#request-fullscreen').click();await expect(restore).toBeHidden();
  await page.evaluate(()=>document.exitFullscreen());await expect(restore).toBeVisible();await restore.click();
  await expect.poll(()=>panel.boundingBox()).toEqual(geometry);
  await page.reload();await page.getByRole('button',{name:'频道分类',exact:true}).click();await expect.poll(()=>panel.boundingBox()).toEqual(geometry);
  await page.getByRole('button',{name:'关闭分类面板',exact:true}).click();await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();
  await fs.writeFile(path.join(artifacts,'quality-v0100/minimize.json'),JSON.stringify({geometry,violations:scan.violations,incomplete:scan.incomplete},null,2));
  await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('channel avatars: collect, refresh, fallback, review, backup, current channel and deletion',async()=>{
  const page=await context.newPage(),directory=path.join(artifacts,'quality-v0100');await fs.mkdir(directory,{recursive:true});
  const resolveContrast=async scan=>{
    expect(scan.violations).toEqual([]);const checks=[];
    for(const issue of scan.incomplete){
      expect(issue.id).toBe('color-contrast');
      for(const node of issue.nodes){
        await page.locator(node.target.flat().join(' ')).scrollIntoViewIfNeeded();
        const followup=await new AxeBuilder({page}).include(node.target[0]).withRules(['color-contrast']).analyze();
        expect(followup.violations).toEqual([]);expect(followup.incomplete).toEqual([]);
        checks.push({target:node.target,violations:followup.violations,incomplete:followup.incomplete});
      }
    }
    return checks;
  };
  const base='https://yt3.googleusercontent.com/',first=base+'alpha=s88-c',updated=base+'alpha-new=s88-c',beta='https://yt3.ggpht.com/beta=s88-c';
  await worker.evaluate(()=>chrome.storage.local.clear());
  await page.route('https://yt3.googleusercontent.com/**',route=>route.request().url().includes('broken')?route.fulfill({status:404,body:''}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="#d9e7f4"/><text x="44" y="58" text-anchor="middle" font-family="sans-serif" font-size="42" fill="#263e55">A</text></svg>'}));
  await page.route('https://yt3.ggpht.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="#f0dcd6"/><text x="44" y="58" text-anchor="middle" font-family="sans-serif" font-size="42" fill="#593b32">B</text></svg>'}));
  await page.route('https://www.youtube.com/feed/channels?avatars=1',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html(`<h1>示例频道头像</h1>${channel('AlphaAI','Alpha AI','UCAlpha').replace('<a id="main-link" href="/@AlphaAI">',`<a id="main-link" href="/@AlphaAI"><yt-img-shadow><img width="40" height="40" src="${first}" alt="" /></yt-img-shadow>`)}${channel('BetaMusic','Beta Music').replace('<a id="main-link" href="/@BetaMusic">',`<a id="main-link" href="/@BetaMusic"><img width="40" height="40" data-src="${beta}" alt="" />`)}${channel('GammaCode','Gamma Code').replace('<a id="main-link" href="/@GammaCode">','<a id="main-link" href="/@GammaCode"><img src="https://evil.test/unsafe-avatar" alt="" />').replace('<div id="description">',`<div id="description"><yt-avatar-shape><img data-src="${base}mentioned" alt="" /></yt-avatar-shape>`)}<img src="https://i.ytimg.com/thumbnail.jpg" alt="" />`)}));
  await page.route('https://evil.test/**',route=>route.abort());await page.route('https://i.ytimg.com/**',route=>route.abort());
  await page.goto('https://www.youtube.com/feed/channels?avatars=1');await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect(page.locator('.channel-avatar')).toHaveCount(3);
  const card=name=>page.locator('.channel').filter({has:page.getByRole('link',{name,exact:true})});
  const scrollCard=async name=>{await expect(async()=>{await card(name).scrollIntoViewIfNeeded();await expect(card(name)).toBeInViewport();}).toPass({timeout:5000});};
  await scrollCard('Alpha AI');await expect.poll(()=>card('Alpha AI').locator('.channel-avatar img').evaluate(img=>img.complete&&img.naturalWidth===88)).toBe(true);
  await expect(card('Beta Music').locator('.channel-avatar img')).toHaveAttribute('src',beta);
  await expect(card('Gamma Code').locator('.channel-avatar img')).toHaveCount(0);await expect(card('Gamma Code').locator('.channel-avatar')).toHaveText('GA');
  expect((await getState()).channels.find(c=>c.title==='Alpha AI').avatarUrl).toBe(first);
  await expect(card('Alpha AI').locator('.channel-avatar img')).toHaveAttribute('referrerpolicy','no-referrer');
  await page.screenshot({path:path.join(directory,'channel-avatars-light.png')});
  await page.locator('ytd-channel-renderer #main-link img').first().evaluate((img,url)=>{img.src=url;},updated);
  await expect.poll(async()=>(await getState()).channels.find(c=>c.title==='Alpha AI').avatarUrl).toBe(updated);
  await expect(card('Alpha AI').locator('.channel-avatar img')).toHaveAttribute('src',updated);
  const brokenRequest=page.waitForRequest(base+'broken=s88-c');
  await message({type:'collect',channels:[{id:'/@gammacode',avatarUrl:base+'broken=s88-c'}]});
  await scrollCard('Gamma Code');await brokenRequest;await expect(card('Gamma Code').locator('.channel-avatar img')).toHaveCount(0);await expect(card('Gamma Code').locator('.channel-avatar')).toHaveText('GA');
  await expand(page,'.footer-menu');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出备份',exact:true}).click();const download=await downloadPromise;
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));expect(backup.channels.find(c=>c.title==='Alpha AI').avatarUrl).toBe(updated);
  const options=await configureAI('api',mockOrigin+'/v1');
  await page.getByText('✦ AI 分类助手',{exact:true}).click();await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
  await expect(page.locator('.ai-suggestion .channel-avatar')).toHaveCount(3);await page.locator('.ai-suggestion').first().scrollIntoViewIfNeeded();
  const reviewScan=await new AxeBuilder({page}).include('#ycg-root').analyze(),reviewChecks=await resolveContrast(reviewScan);
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();await page.getByRole('button',{name:'恢复频道分类窗口',exact:true}).click();await expect(page.locator('.ai-suggestion .channel-avatar')).toHaveCount(3);
  await page.goto('https://www.youtube.com/@newchannel');await page.evaluate(url=>{document.querySelector('h1').textContent='';for(const [key,value] of [['og:image',url],['og:title','New Channel']]){const meta=document.createElement('meta');meta.setAttribute('property',key);meta.content=value;document.head.append(meta);}},base+'current=s88-c');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();await page.getByRole('button',{name:'加入当前频道',exact:true}).click();
  await expect.poll(async()=>(await getState()).channels.find(c=>c.id==='/@newchannel')?.avatarUrl).toBe(base+'current=s88-c');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.setAttribute('dark',''));
  await page.getByRole('searchbox',{name:'搜索频道',exact:true}).fill('New Channel');await expect(page.locator('.channel')).toHaveCount(1);await scrollCard('New Channel');
  await expect.poll(()=>card('New Channel').locator('.channel-avatar img').evaluate(img=>img.complete&&img.naturalWidth===88)).toBe(true);
  await page.screenshot({path:path.join(directory,'channel-avatars-dark-narrow.png')});
  const narrowScan=await new AxeBuilder({page}).include('#ycg-root').analyze(),scrolledChecks=await resolveContrast(narrowScan);
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  await options.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();await options.getByRole('checkbox',{name:'我理解将永久删除此浏览器中的全部分类和设置',exact:true}).check();await options.getByRole('button',{name:'确认删除全部数据',exact:true}).click();await expect(options.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeVisible();expect(Object.keys(await worker.evaluate(()=>chrome.storage.local.get(null)))).toEqual(['ycg.privacy.v1']);
  await page.getByRole('button',{name:'频道分类',exact:true}).click();await expect(page.locator('.channel-avatar')).toHaveCount(0);
  await fs.writeFile(path.join(directory,'avatars.json'),JSON.stringify({backup,review:{violations:reviewScan.violations,incomplete:reviewScan.incomplete,scrolledChecks:reviewChecks},narrow:{violations:narrowScan.violations,incomplete:narrowScan.incomplete,scrolledChecks}},null,2));
  await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});


test('launcher drag: independent position survives restore, reload, cross-tab changes and viewport limits',async()=>{
  const key='ycg.launcher-position.v1',size={width:580,height:740,right:240,bottom:50,floating:true};
  await worker.evaluate(({state,size})=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'},'ycg.panel-size.v1':size}),{state:aiSeed,size});
  await worker.evaluate(key=>chrome.storage.local.remove(key),key);
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=example');
  const baseline=await youtubeGeometry(page),panel=page.locator('.panel'),icon=page.getByRole('button',{name:'恢复频道分类窗口',exact:true});
  await page.getByRole('button',{name:'频道分类',exact:true}).click();const windowBox=await panel.boundingBox();
  await page.getByRole('searchbox',{name:'搜索频道',exact:true}).fill('Alpha');
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  const start=await icon.boundingBox();
  const drag=async(dx,dy)=>{const box=await icon.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+22+dx,box.y+22+dy,{steps:8});await page.mouse.up();};
  await drag(-400,-500);await expect(panel).toBeHidden();
  const position={right:640,bottom:550};
  await expect.poll(()=>worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]),key)).toEqual(position);
  const moved={x:start.x-400,y:start.y-500,width:44,height:44};await expect.poll(()=>icon.boundingBox()).toEqual(moved);
  await expect.poll(()=>youtubeGeometry(page)).toEqual(baseline);
  await icon.click();await expect.poll(()=>panel.boundingBox()).toEqual(windowBox);await expect(page.getByRole('searchbox',{name:'搜索频道',exact:true})).toHaveValue('Alpha');
  expect(await worker.evaluate(()=>chrome.storage.local.get('ycg.panel-size.v1').then(v=>v['ycg.panel-size.v1']))).toEqual(size);
  await page.reload();await page.getByRole('button',{name:'频道分类',exact:true}).click();await expect.poll(()=>panel.boundingBox()).toEqual(windowBox);
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();await expect.poll(()=>icon.boundingBox()).toEqual(moved);
  const other=await context.newPage();await other.goto('https://www.youtube.com/watch?v=example');await other.getByRole('button',{name:'频道分类',exact:true}).click();await other.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  const otherIcon=other.getByRole('button',{name:'恢复频道分类窗口',exact:true});await expect.poll(()=>otherIcon.boundingBox()).toEqual(moved);
  await page.bringToFront();await drag(-100,-50);await expect.poll(()=>otherIcon.boundingBox()).toEqual({x:moved.x-100,y:moved.y-50,width:44,height:44});
  const saved=await icon.boundingBox(),stored=await worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]),key);
  await page.setViewportSize({width:390,height:400});await expect.poll(()=>icon.boundingBox()).toEqual({x:12,y:12,width:44,height:44});
  expect(await worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]),key)).toEqual(stored);
  await page.setViewportSize({width:1400,height:1050});await expect.poll(()=>icon.boundingBox()).toEqual(saved);
  await icon.focus();await icon.press('Shift+ArrowUp');await expect.poll(async()=>(await icon.boundingBox()).y).toBe(saved.y-50);
  await expect.poll(()=>worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]?.bottom),key)).toBe(stored.bottom+50);
  await icon.press('Home');await expect.poll(()=>worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]??null),key)).toBeNull();
  await expect.poll(()=>icon.boundingBox()).toEqual(start);
  await drag(2,1);await expect(panel).toBeVisible();await expect.poll(()=>panel.boundingBox()).toEqual(windowBox);
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  const invalid=await testClient.evaluate(()=>chrome.runtime.sendMessage({scope:'ycg',type:'launcherPositionSave',epoch:null,position:{right:'unsafe',bottom:40}}));expect(invalid.ok).toBe(false);
  await page.screenshot({path:path.join(artifacts,'quality-v0100/draggable-icon.png')});
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);expect(scan.incomplete).toEqual([]);
  await otherIcon.press('Enter');await expect.poll(()=>other.locator('.panel').boundingBox()).toEqual(windowBox);
  await fs.writeFile(path.join(artifacts,'quality-v0100/launcher-drag.json'),JSON.stringify({windowBox,start,moved,saved,stored,baseline,violations:scan.violations,incomplete:scan.incomplete},null,2));
  await other.close();await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('launcher drag: cancel, pointer capture loss and touch movement keep the panel unchanged',async()=>{
  const key='ycg.launcher-position.v1',position={right:500,bottom:300};
  await worker.evaluate(({key,position})=>chrome.storage.local.set({[key]:position,'ycg.panel-size.v1':{width:540,height:600,right:100,bottom:60},'ycg.preferences.v1':{language:'zh-CN'}}),{key,position});
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=example');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();const panel=page.locator('.panel'),windowBox=await panel.boundingBox();await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  const icon=page.getByRole('button',{name:'恢复频道分类窗口',exact:true}),start=await icon.boundingBox();
  const begin=async()=>{const box=await icon.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x-80,box.y-80,{steps:5});await expect.poll(async()=>(await icon.boundingBox()).x).not.toBe(box.x);};
  await begin();await icon.press('Escape');await page.mouse.up();await expect(panel).toBeHidden();await expect.poll(()=>icon.boundingBox()).toEqual(start);
  await begin();await icon.evaluate(el=>el.releasePointerCapture(1));await page.mouse.up();await expect.poll(()=>icon.boundingBox()).toEqual(start);await expect(panel).toBeHidden();
  await begin();await page.setViewportSize({width:1300,height:1000});await page.mouse.up();await expect(panel).toBeHidden();
  expect(await worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]),key)).toEqual(position);
  await page.setViewportSize({width:390,height:844});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await expect.poll(()=>icon.boundingBox()).toMatchObject({x:12,width:48,height:48});const touchStart=await icon.boundingBox(),baseline=await youtubeGeometry(page);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  await touch('touchStart',touchStart.x+24,touchStart.y+24);await touch('touchMove',touchStart.x+174,touchStart.y-96);await touch('touchEnd');
  await expect(panel).toBeHidden();await expect.poll(()=>icon.boundingBox()).toEqual({x:touchStart.x+150,y:touchStart.y-120,width:48,height:48});
  const after=await icon.boundingBox();await expect.poll(()=>worker.evaluate(key=>chrome.storage.local.get(key).then(v=>v[key]),key)).toEqual({right:390-after.x-48,bottom:844-after.y-48});
  await expect.poll(()=>youtubeGeometry(page)).toEqual(baseline);
  await touch('touchStart',after.x+24,after.y+24);await touch('touchMove',after.x+44,after.y+44);await touch('touchCancel');await expect.poll(()=>icon.boundingBox()).toEqual(after);
  await page.screenshot({path:path.join(artifacts,'quality-v0100/draggable-icon-touch.png')});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await page.setViewportSize({width:1400,height:1050});await icon.press('Enter');await expect.poll(()=>panel.boundingBox()).toEqual(windowBox);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('shortcut toggle and browser-language default: toggle restores drafts, manifest declares the command',async()=>{
  // No saved preference: the zh-CN test locale decides the language.
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state}),aiSeed);
  expect(await worker.evaluate(async()=>(await chrome.storage.local.get('ycg.preferences.v1'))['ycg.preferences.v1'])).toBeUndefined();
  const manifest=await worker.evaluate(()=>chrome.runtime.getManifest().commands);
  expect(manifest['toggle-panel'].suggested_key.default).toBe('Alt+Shift+Y');
  // Manifest strings come from _locales; both locales define every key.
  expect(await worker.evaluate(()=>['ycg_extension_name','ycg_extension_description','ycg_action_title','ycg_command_toggle'].map(key=>chrome.i18n.getMessage(key)))).toEqual(expect.arrayContaining([expect.stringMatching(/YouTube Channel Groups/)]));
  expect((await worker.evaluate(()=>['ycg_extension_name','ycg_extension_description','ycg_action_title','ycg_command_toggle'].map(key=>chrome.i18n.getMessage(key)))).every(Boolean)).toBe(true);
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=example');
  const panel=page.locator('.panel');
  await expect(page.getByRole('button',{name:'频道分类',exact:true})).toBeEnabled();
  // Playwright cannot press a browser command; send the message that the command handler sends.
  // Without the tabs permission URLs are hidden, so message every tab; only YouTube content scripts answer.
  const toggle=()=>worker.evaluate(async()=>{for(const tab of await chrome.tabs.query({}))await chrome.tabs.sendMessage(tab.id,{scope:'ycg',type:'toggle'},{frameId:0}).catch(()=>{});});
  await toggle();await expect(panel).toBeVisible();
  await page.getByRole('searchbox',{name:'搜索频道',exact:true}).fill('Alpha');
  await toggle();await expect(panel).toBeHidden();
  await expect(page.getByRole('button',{name:'恢复频道分类窗口',exact:true})).toBeVisible();
  await toggle();await expect(panel).toBeVisible();
  await expect(page.getByRole('searchbox',{name:'搜索频道',exact:true})).toHaveValue('Alpha');
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('AI draft: unapplied edits survive a reload of the same tab and are removed after apply or tab close',async()=>{
  mockMode='valid';
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),aiSeed);
  const drafts=()=>worker.evaluate(async()=>Object.keys(await chrome.storage.session.get(null)).filter(key=>key.startsWith('ycg.ai.draft.')));
  const options=await configureAI('api',mockOrigin+'/v1');
  let page=await openAssistant();
  await page.getByLabel('AI 分类范围',{exact:true}).selectOption('all');
  await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
  const suggested=()=>page.getByLabel('Alpha AI 的建议分类',{exact:true});
  await expect(suggested()).toBeVisible();await suggested().fill('刷新后保留, 编程');
  await expect.poll(async()=>(await worker.evaluate(async()=>Object.values(await chrome.storage.session.get(null))[0]?.draft?.suggestions?.[0]?.groups))).toEqual(['刷新后保留','编程']);
  // Page scripts must not see the draft.
  expect(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}).includes('刷新后保留'))).toBe(false);
  await page.reload();
  await page.getByRole('button',{name:'频道分类',exact:true}).click();await page.getByText('✦ AI 分类助手',{exact:true}).click();
  await expect(page.getByText(/^已恢复刷新前未应用的 AI 预览：2 条建议，待处理 0 个频道。/)).toBeVisible();
  await page.getByRole('button',{name:'打开审核工作台',exact:true}).click();
  await expect(suggested()).toHaveValue('刷新后保留, 编程');
  await page.getByRole('button',{name:'应用勾选建议',exact:true}).click();
  await expect(page.getByText('已应用 1 个频道的建议，原有分类已保留。',{exact:true})).toBeVisible();
  const state=await getState(),group=state.groups.find(item=>item.name==='刷新后保留');
  expect(group).toBeTruthy();expect(state.channels[0].groupIds).toContain(group.id);
  await expect.poll(drafts).toEqual([]);
  await page.close();
  page=await openAssistant();
  await page.getByLabel('AI 分类范围',{exact:true}).selectOption('all');
  await page.getByRole('button',{name:'从头检查',exact:true}).click();
  await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
  await expect(suggested()).toBeVisible();
  await expect.poll(async()=>(await drafts()).length).toBe(1);
  await page.close();
  await expect.poll(drafts).toEqual([]);
  await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('auto-load: scrolls until the subscription list ends, reports coverage, and can be stopped',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.preferences.v1':{language:'zh-CN'}}));
  // YouTube appends channels when the list bottom scrolls into view and drops the loader at the end.
  const infinite=({pages,stall})=>{const main=document.querySelector('main');const spacer=document.createElement('div');spacer.style.height='2400px';main.append(spacer);
    const loader=document.createElement('ytd-continuation-item-renderer');loader.textContent='正在加载…';main.append(loader);let page=0;
    addEventListener('scroll',()=>{if(stall||page>=pages||innerHeight+scrollY<document.documentElement.scrollHeight-5)return;page++;
      for(let i=0;i<5;i++)loader.insertAdjacentHTML('beforebegin',`<ytd-channel-renderer><a id="main-link" href="/@more${page}x${i}"><span id="channel-title">更多频道 ${page}-${i}</span></a></ytd-channel-renderer>`);
      if(page===pages)loader.remove();});};
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/channels');
  await page.evaluate(infinite,{pages:3,stall:false});
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'刷新订阅',exact:true}).click();
  await expect(page.getByRole('button',{name:'停止刷新',exact:true})).toBeVisible();
  await expect(page.locator('.coverage')).toHaveText('已到列表底部：已收集全部 18 个订阅频道。',{timeout:20000});
  expect((await getState()).channels).toHaveLength(18);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  await page.goto('https://www.youtube.com/feed/subscriptions');await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await expect(page.locator('.coverage')).toBeHidden();
  await page.goto('https://www.youtube.com/feed/channels');await page.evaluate(infinite,{pages:3,stall:true});
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'刷新订阅',exact:true}).click();
  await page.getByRole('button',{name:'停止刷新',exact:true}).click();
  await expect(page.locator('.coverage')).toHaveText('已停止自动加载：已加载 3 个频道，列表可能未完。',{timeout:10000});
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('channel names ignore the YouTube hover tooltip; header button switches and saves the language',async()=>{
  // Saved before the fix: the tooltip copy doubled the name. The next collection repairs it.
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.preferences.v1':{language:'zh-CN'},'ycg.state.v1':{version:1,groups:[],channels:[{id:'/@bytebytego',title:'ByteByteGo ByteByteGo',aliases:['/@bytebytego'],groupIds:[]}]}}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/channels');
  await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend',
    '<ytd-channel-renderer><a id="main-link" href="/@bytebytego"><ytd-channel-name id="channel-title"><div id="container"><div id="text-container"><yt-formatted-string id="text">ByteByteGo</yt-formatted-string></div>'+
    '<tp-yt-paper-tooltip aria-hidden="true" role="tooltip"><div id="tooltip">ByteByteGo</div></tp-yt-paper-tooltip></div></ytd-channel-name></a></ytd-channel-renderer>'));
  await expect.poll(async()=>(await getState()).channels.find(channel=>channel.id==='/@bytebytego')?.title).toBe('ByteByteGo');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  const toggle=page.getByRole('button',{name:'EN: Switch to English',exact:true});
  await expect(toggle).toHaveText('EN');
  const options=await context.newPage();await options.goto(new URL('options.html',worker.url()).href);
  await toggle.click();
  await expect(page.getByRole('button',{name:'中：切换到中文',exact:true})).toHaveText('中');
  await expect(page.getByRole('button',{name:'Minimize channel window',exact:true})).toBeVisible();
  await expect(options.getByLabel('Interface language',{exact:true})).toHaveValue('en');
  await page.locator('.panel').screenshot({path:path.join(artifacts,'preview-language-toggle.png')});
  expect((await worker.evaluate(()=>chrome.storage.local.get('ycg.preferences.v1')))['ycg.preferences.v1'].language).toBe('en');
  const box=await page.locator('.panel').boundingBox();
  await page.getByRole('button',{name:'中：切换到中文',exact:true}).click();
  await expect(page.getByRole('button',{name:'EN: Switch to English',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'最小化分类窗口',exact:true})).toBeVisible();
  expect(await page.locator('.panel').boundingBox()).toEqual(box);
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);
  await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

// Signed-in YouTube cannot be loaded in tests, so this imitates its subscribe flow: "已订阅" opens a menu (or,
// in the older layout, the dialog), "取消订阅" opens yt-confirm-dialog-renderer, and only its confirm button
// changes the button to "订阅". Confirm clicks record isTrusted: a script click by the extension would be false.
const fakeSubscriptions=({menu,dialogTag='yt-confirm-dialog-renderer'})=>{
  window.ycgConfirmClicks=[];
  const popup=()=>document.querySelector('ytd-popup-container')||document.body.appendChild(document.createElement('ytd-popup-container'));
  const dialog=()=>{popup().innerHTML=`<${dialogTag}><p>取消订阅该频道？</p><button id="cancel-unsubscribe">取消</button><button id="confirm-unsubscribe">取消订阅</button></${dialogTag}>`;};
  document.addEventListener('click',event=>{
    const subscribe=event.target.closest('#subscribe-button button');
    if(subscribe&&subscribe.textContent.trim()==='已订阅'){window.ycgTarget=subscribe;if(menu)popup().innerHTML='<tp-yt-iron-dropdown><tp-yt-paper-listbox><tp-yt-paper-item role="menuitem">全部</tp-yt-paper-item><tp-yt-paper-item role="menuitem">取消订阅</tp-yt-paper-item></tp-yt-paper-listbox></tp-yt-iron-dropdown>';else dialog();return;}
    const item=event.target.closest('ytd-popup-container [role=menuitem]');
    if(item&&item.textContent.trim()==='取消订阅'){dialog();return;}
    if(event.target.closest('#confirm-unsubscribe')){window.ycgConfirmClicks.push(event.isTrusted);window.ycgTarget.textContent='订阅';popup().innerHTML='';return;}
    if(event.target.closest('#cancel-unsubscribe'))popup().innerHTML='';
  },true);
  document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('ytd-channel-renderer, ytd-page-header-renderer').forEach(host=>host.insertAdjacentHTML('beforeend','<div id="subscribe-button"><button>已订阅</button></div>'));});
};

test('unsubscribe: opens YouTube confirmation, leaves the final click to the user, removes on confirm, keeps on cancel',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.preferences.v1':{language:'zh-CN'}}));
  const page=await context.newPage();await page.addInitScript(fakeSubscriptions,{menu:true});
  await page.goto('https://www.youtube.com/feed/channels');
  await expect.poll(async()=>(await getState())?.channels.length).toBe(3);
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  const panel=page.locator('.panel'),dialog=page.locator('yt-confirm-dialog-renderer');
  await panel.screenshot({path:path.join(artifacts,'preview-unsubscribe.png')});
  // Cancel in YouTube: nothing changes.
  await page.getByRole('button',{name:'取消关注：Beta Music',exact:true}).click();
  await expect(dialog).toBeVisible();await expect(panel).toBeHidden();
  await page.locator('#cancel-unsubscribe').click();
  await expect(page.locator('.status')).toHaveText('未检测到“Beta Music”已取消关注，扩展中的记录保持不变。如果你已在 YouTube 中确认，请点击“刷新订阅”同步。');
  await expect(panel).toBeVisible();expect((await getState()).channels).toHaveLength(3);
  // Confirm in YouTube: the extension waits for the user and then removes the channel.
  await page.getByRole('button',{name:'取消关注：Alpha AI',exact:true}).click();
  await expect(dialog).toBeVisible();await page.waitForTimeout(800);
  expect((await getState()).channels).toHaveLength(3);
  await page.locator('#confirm-unsubscribe').click();
  await expect(page.locator('.status')).toHaveText('已取消关注“Alpha AI”，并已从扩展中移除');
  expect((await getState()).channels.map(channel=>channel.id)).not.toContain('/@alphaai');
  // The old card stays on the page with "订阅"; a later scan must not collect it again.
  await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<p>触发重新收集</p>'));await page.waitForTimeout(1200);
  expect((await getState()).channels.map(channel=>channel.id)).not.toContain('/@alphaai');
  expect(await page.evaluate(()=>window.ycgConfirmClicks)).toEqual([true]);
  // Already unsubscribed in YouTube: offer to remove the local record only.
  await page.evaluate(()=>{[...document.querySelectorAll('ytd-channel-renderer')].find(card=>card.textContent.includes('Gamma Code')).querySelector('#subscribe-button button').textContent='订阅';});
  page.once('dialog',prompt=>{expect(prompt.message()).toContain('YouTube 显示你没有订阅“Gamma Code”');prompt.accept();});
  await page.getByRole('button',{name:'取消关注：Gamma Code',exact:true}).click();
  await expect.poll(async()=>(await getState()).channels.map(channel=>channel.id)).toEqual(['/@betamusic']);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('unsubscribe: a channel that is not on the page opens its channel page and continues there',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),{version:1,groups:[],channels:[{id:'/@gammacode',title:'Gamma Code',aliases:['/@gammacode'],groupIds:[]}]});
  const page=await context.newPage();await page.addInitScript(fakeSubscriptions,{menu:false});
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'取消关注：Gamma Code',exact:true}).click();
  await page.waitForURL('https://www.youtube.com/@gammacode');
  await expect(page.locator('yt-confirm-dialog-renderer')).toBeVisible();
  await page.locator('#confirm-unsubscribe').click();
  await expect(page.locator('.status')).toHaveText('已取消关注“Gamma Code”，并已从扩展中移除');
  expect((await getState()).channels).toEqual([]);
  expect(await page.evaluate(()=>window.ycgConfirmClicks)).toEqual([true]);
  // The pending request is used once: a reload does not reopen the dialog.
  await page.reload();await page.waitForTimeout(1500);await expect(page.locator('yt-confirm-dialog-renderer')).toHaveCount(0);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('refresh subscriptions: opens the full list, offers channels no longer subscribed, removes only confirmed ones',async()=>{
  const saved=(id,title,groupIds=[])=>({id,title,aliases:[id],groupIds});
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),{version:1,groups:[{id:'g',name:'AI'}],channels:[
    saved('/@alphaai','Alpha AI',['g']),saved('/@betamusic','Beta Music'),saved('/@gammacode','Gamma Code'),saved('/@gonechannel','Gone Channel',['g']),saved('/@leftchannel','Left Channel'),
    saved('/@gammaold','Gamma Code',['g'])]});
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/subscriptions');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'刷新订阅',exact:true}).click();
  await page.waitForURL('https://www.youtube.com/feed/channels');
  const review=page.getByRole('region',{name:'已不在订阅列表中的频道'});
  await expect(review).toContainText('有 3 个已保存的频道不在你当前的订阅列表中',{timeout:20000});
  expect((await getState()).channels).toHaveLength(6);
  // Nothing is preselected; each item shows what would be lost, and a same-name record is flagged.
  for (const name of ['Gone Channel','Left Channel','Gamma Code']) await expect(page.getByRole('checkbox',{name:`移除 ${name}`,exact:true})).not.toBeChecked();
  await expect(review).toContainText('属于 1 个分类');
  await expect(review).toContainText('可能与列表中的 /@gammacode 是同一频道（地址已变化），建议保留');
  await page.getByRole('checkbox',{name:'移除 Gone Channel',exact:true}).check();
  await page.locator('.panel').screenshot({path:path.join(artifacts,'preview-refresh-subscriptions.png')});
  await page.getByRole('button',{name:'移除所选频道',exact:true}).click();
  await expect(page.locator('.status')).toHaveText('已从扩展中移除 1 个频道');
  expect((await getState()).channels.map(channel=>channel.id)).toEqual(['/@alphaai','/@betamusic','/@gammacode','/@leftchannel','/@gammaold']);
  await expect(review).toBeHidden();
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('refresh subscriptions: an incomplete list suggests nothing',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),{version:1,groups:[],channels:[{id:'/@gonechannel',title:'Gone Channel',aliases:['/@gonechannel'],groupIds:[]}]});
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/channels');
  // A loader that never finishes, as on a slow connection.
  await page.evaluate(()=>{const main=document.querySelector('main');const spacer=document.createElement('div');spacer.style.height='2400px';main.append(spacer,document.createElement('ytd-continuation-item-renderer'));});
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'刷新订阅',exact:true}).click();
  await page.getByRole('button',{name:'停止刷新',exact:true}).click();
  await expect(page.getByRole('region',{name:'已不在订阅列表中的频道'})).toContainText('订阅列表没有加载完整，无法判断哪些频道已取消关注。',{timeout:10000});
  await expect(page.getByRole('button',{name:'移除所选频道',exact:true})).toHaveCount(0);
  expect((await getState()).channels.map(channel=>channel.id)).toContain('/@gonechannel');
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('unsubscribe: an unrecognized YouTube dialog still works because the result comes from the button state',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),{version:1,groups:[],channels:[{id:'/@gammacode',title:'Gamma Code',aliases:['/@gammacode'],groupIds:[]}]});
  // A dialog element the extension does not know, without a dialog role, reached from the channel page.
  const page=await context.newPage();await page.addInitScript(fakeSubscriptions,{menu:true,dialogTag:'ycg-unknown-confirm'});
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'取消关注：Gamma Code',exact:true}).click();
  await page.waitForURL('https://www.youtube.com/@gammacode');
  await expect(page.locator('#confirm-unsubscribe')).toBeVisible();
  // Longer than the old 5-second give-up: the extension must still be waiting.
  await page.waitForTimeout(6000);
  expect((await getState()).channels).toHaveLength(1);
  await page.locator('#confirm-unsubscribe').click();
  await expect(page.locator('.status')).toHaveText('已取消关注“Gamma Code”，并已从扩展中移除');
  expect((await getState()).channels).toEqual([]);
  expect(await page.evaluate(()=>window.ycgConfirmClicks)).toEqual([true]);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('page scripts cannot trigger privileged panel actions through the open shadow root',async()=>{
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'}}),aiSeed);
  const options=await configureAI('api',mockOrigin+'/v1'),page=await openAssistant();
  await page.getByLabel('AI 分类范围',{exact:true}).selectOption('all');
  const before=await getState();aiRequests.length=0;
  // What a YouTube main-world script could do: find the buttons and call click() or dispatch change events.
  const clicked=await page.evaluate(()=>{
    const root=document.getElementById('ycg-root').shadowRoot,labels=['生成分类建议','刷新订阅','生成精简方案'];
    const hits=[...root.querySelectorAll('button')].filter(button=>labels.includes(button.textContent.trim())||button.classList.contains('channel-unsubscribe'));
    hits.forEach(button=>button.click());
    const box=root.querySelector('.membership input');if(box){box.checked=!box.checked;box.dispatchEvent(new Event('change',{bubbles:true}));}
    return hits.length;
  });
  expect(clicked).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(1500);
  expect(aiRequests).toEqual([]);
  expect(await getState()).toEqual(before);
  expect(page.url()).toBe('https://www.youtube.com/feed/subscriptions');
  await expect(page.locator('.coverage')).toBeHidden();
  // A real click still works.
  await page.getByRole('button',{name:'生成分类建议',exact:true}).click();
  await expect(page.getByLabel('Alpha AI 的建议分类',{exact:true})).toBeVisible();
  await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('refresh subscriptions: a card already showing Subscribe counts as unsubscribed; deletion clears the review',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.preferences.v1':{language:'zh-CN'}}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/feed/channels');
  await expect.poll(async()=>(await getState())?.channels.length).toBe(3);
  // Unsubscribed earlier in this page session: YouTube keeps the card with a "订阅" button until reload.
  await page.evaluate(()=>document.querySelectorAll('ytd-channel-renderer').forEach(card=>card.insertAdjacentHTML('beforeend',`<div id="subscribe-button"><button>${card.textContent.includes('Beta Music')?'订阅':'已订阅'}</button></div>`)));
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'刷新订阅',exact:true}).click();
  const review=page.getByRole('region',{name:'已不在订阅列表中的频道'});
  await expect(review).toContainText('有 1 个已保存的频道不在你当前的订阅列表中',{timeout:20000});
  await expect(page.getByRole('checkbox',{name:'移除 Beta Music',exact:true})).toBeVisible();
  const options=await context.newPage();await options.goto(new URL('options.html',worker.url()).href);
  await options.getByRole('button',{name:'删除全部扩展数据…',exact:true}).click();
  await options.getByRole('checkbox',{name:'我理解将永久删除此浏览器中的全部分类和设置',exact:true}).check();
  await options.getByRole('button',{name:'确认删除全部数据',exact:true}).click();
  await expect(options.locator('#privacy-status')).toContainText('本机数据已删除');
  await expect(review).toBeHidden();await expect(page.locator('.coverage')).toBeHidden();
  await page.close();await options.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('first run, collapsed sections, Esc order and messages while minimized',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.preferences.v1':{language:'zh-CN'}}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=example');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  // No channels: the three steps are shown; category management is open because there are no categories.
  await expect(page.getByText('开始使用',{exact:true})).toBeVisible();
  await expect(page.locator('#ycg-root .manage-groups')).toHaveJSProperty('open',true);
  await expect(page.locator('#ycg-root .footer-menu')).toHaveJSProperty('open',false);
  await expect(page.getByRole('button',{name:'恢复收集已加载频道',exact:true})).toBeHidden();
  await expect(page.getByText('先在下方创建分类，再为频道勾选。')).toHaveCount(0);
  // Esc in a field with text only leaves the field; the panel stays open.
  await page.getByRole('textbox',{name:'新分类名称',exact:true}).fill('草稿');
  await page.getByRole('textbox',{name:'新分类名称',exact:true}).press('Escape');
  await expect(page.locator('.panel')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'新分类名称',exact:true})).toHaveValue('草稿');
  // Channels exist: the first-run steps disappear.
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state}),aiSeed);
  await expect(page.getByText('开始使用',{exact:true})).toBeHidden();
  // A message while minimized reaches the outside live region, and the icon shows a dot until restored.
  await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();
  // Moving the icon with the keyboard saves its position, which reports a status message.
  await page.locator('#ycg-root').evaluate(host=>host.shadowRoot.querySelector('.launcher').focus());
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#ycg-root .dock')).toHaveAttribute('data-attention','');
  await expect(page.locator('#ycg-root > p[role=status], #ycg-root p.sr-only[role=status]').first()).not.toHaveText('');
  await page.getByRole('button',{name:'恢复频道分类窗口',exact:true}).click();
  await expect(page.locator('#ycg-root .dock')).not.toHaveAttribute('data-attention','');
  const scan=await new AxeBuilder({page}).include('#ycg-root').analyze();expect(scan.violations).toEqual([]);
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});

test('README screenshots: main panel in both languages and the review workspace',async()=>{
  const out=path.join(artifacts,'readme');await fs.mkdir(out,{recursive:true});
  const groups=[{id:'ai',name:'AI'},{id:'code',name:'编程'},{id:'music',name:'音乐'}];
  const sample=(id,title,groupIds)=>({id,title,aliases:[id],groupIds});
  await worker.evaluate(state=>chrome.storage.local.set({'ycg.state.v1':state,'ycg.preferences.v1':{language:'zh-CN'},'ycg.panel-size.v1':{width:400,height:820,right:24,bottom:24,floating:true}}),{version:1,groups,channels:[
    sample('/@alphaai','Alpha AI',['ai']),sample('/@betamusic','Beta Music',['music']),sample('/@gammacode','Gamma Code',['code','ai']),sample('/@deltalab','Delta Lab',['ai']),sample('/@echojazz','Echo Jazz',[])]});
  const options=await configureAI('api',mockOrigin+'/v1');await options.close();
  const page=await context.newPage();await pinMedia(page);await page.setViewportSize({width:1280,height:900});
  await page.goto('https://www.youtube.com/feed/subscriptions');
  await page.getByRole('button',{name:'频道分类',exact:true}).click();
  await page.getByRole('button',{name:'AI 3',exact:true}).click();
  const panel=page.locator('.panel');await expect(page.locator('.channel')).toHaveCount(3);
  await panel.screenshot({path:path.join(out,'panel-zh.png')});
  await page.getByRole('button',{name:'EN: Switch to English',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh subscriptions',exact:true})).toBeVisible();
  await panel.screenshot({path:path.join(out,'panel-en.png')});
  await page.getByText('✦ AI assistant',{exact:true}).click();
  await page.getByLabel('AI channel scope',{exact:true}).selectOption('all');
  await page.getByRole('button',{name:'Generate suggestions',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Classification review',exact:true})).toBeVisible();
  await panel.screenshot({path:path.join(out,'review-en.png')});
  await page.close();await worker.evaluate(()=>chrome.storage.local.clear());
});
