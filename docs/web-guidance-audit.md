# Chrome Modern Web Guidance 设计审查

日期：2026-10-18（Europe/Rome）。检查版本：v0.7.0；修复版本：v0.7.1。

**结论：当前部分符合，尚不能宣布全部严格符合。** 已修复本轮确认的语义、语言、焦点、标签和窄屏进度问题。对比度、真实页面性能、辅助技术和完整删除流程仍有未关闭项。

依据用户提供的 [disciplines 入口](https://developer.chrome.com/docs/modern-web-guidance/disciplines)，本项目已建立持续使用的 [设计与验收要求](design-guidance.md)。入口约束网页质量，并未要求固定的配色、圆角或图标样式。YouTube 主题与玻璃外观可以继续保留。

## 范围与证据

实际运行本项目扩展，使用独立 Chromium 配置文件和模拟 YouTube 页面、频道、AI 服务及 CLI。没有调用真实模型，没有修改用户订阅或原浏览器数据。截图背景明确标记为隔离测试页面，不能代表真实 YouTube 的所有页面变体。

浏览器：Chromium 153.0.8010.12；axe-core 4.14。桌面视口 1800 × 1100，窄视口 320 × 844，设置页 740 × 1000。设置截图为完整页面。

所有截图均在本轮重新捕获并打开检查。原始截图、辅助功能树和扫描 JSON 保存在 `artifacts/web-guidance-audit/{before,after}/`。[来源及下载文件摘要](../artifacts/web-guidance-audit/sources.json)记录参考指南网址、取回时间和 SHA-256，避免依赖后续可能变化的网页内容。

## 四步体验检查

### 1. 分类面板与分类要求：已修复，部分待验收

优点：任务入口、分类浏览和设置入口可见；面板在宽屏预留空间；输入与页面滚动可分开操作。

问题与修复：原面板没有自身语言声明，切成英文仍可能继承 YouTube 的中文语言。现已同步宿主的 `lang`。补充搜索、新分类和分类要求的持久标签及显式关联。分类保存后恢复原复选框焦点，避免每次保存打断键盘操作。

限制：多组辅助文字仍然较小；真实默认宽度和长名称下的阅读舒适度，以及实际浏览器缩放需要进一步检查。

![步骤 1：修复后的中文分类面板](/Users/dtjgp/Projects/YouTubeChannelGroups/artifacts/web-guidance-audit/after/01-panel.png)

### 2. 分类审核工作台：已修复，玻璃对比度待验收

优点：分类目标、应用操作与分页从结果列表分离，支持搜索、筛选和逐频道调整。既有回归确认拖放只改预览，应用才保存，并可撤销。

问题与修复：原审核卡片在 `article` 上设置不允许的 `listitem` 角色；现使用原生 `ul/li`。原目标按钮可见名称含频道数，辅助功能名称却不含计数；现直接使用可见名称。命名容器补充有效的组语义。进入审核后焦点移到标题，返回时恢复可用入口，重复批次更新不反复抢走焦点。

限制：不能只凭截图或 axe 检查宣称读屏和语音控制完全可用；仍需辅助技术实测。

![步骤 2：修复后的审核工作台](/Users/dtjgp/Projects/YouTubeChannelGroups/artifacts/web-guidance-audit/after/02-review.png)

### 3. 英文深色窄屏：重排检查通过，放大及触控待验收

优点：320 像素视口中工作台没有横向溢出，分页仍可见。实测内部客户区和滚动宽度均为 294 像素。

问题与修复：原进度段落限制高度并形成独立滚动区，隐藏了完整提示，也没有键盘焦点入口。现显示完整文字。增大拖动提示字号、分类选择区域和四角命中区；添加粗指针下的较大表单目标样式。

限制：320 像素重排不是实际 200%／400% 浏览器缩放或触屏测试。细边框的替代角目标和方向键仍需人工验收。

![步骤 3：英文深色窄屏](/Users/dtjgp/Projects/YouTubeChannelGroups/artifacts/web-guidance-audit/after/03-narrow-dark.png)

### 4. AI 设置与保存：所测流程通过，隐私流程仍有待办

优点：设置使用原生标签和控件；保存进度有实际验证、授权和持久化阶段；密钥不出现在备份和 YouTube 内容界面中。

问题与修复：增加模型、网址、密钥提示及 `aria-describedby`；自定义验证错误定位到字段，并设置 `aria-invalid`。输入修正时清除该字段错误关联。保存期间防止重复提交，结束后恢复必要焦点。

限制：清除 AI 配置不等于删除全部频道数据，也不自动撤销已授予主机权限。完整数据删除入口和保留说明尚未完成；第三方 AI 服务的记录不能由扩展直接控制。

![步骤 4：英文 AI 设置及保存结果](/Users/dtjgp/Projects/YouTubeChannelGroups/artifacts/web-guidance-audit/after/04-settings.png)

## 按规范核对

| 规范 | 当前判断 | 依据与缺口 |
| --- | --- | --- |
| [Accessibility](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/accessibility/accessibility/guide.md) | 部分符合 | 本轮修复语言、语义、焦点及标签；对比度、屏幕阅读器、缩放和触控仍未完整验收 |
| [HTML](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/html/html/guide.md) | 所测结构已改进 | 原生列表、表单、按钮、链接和披露控件；尚未做所有动态状态的完整 HTML 验证 |
| [CSS](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/css/css/guide.md) | 部分符合 | 语义颜色变量、隔离样式及偏好回退已存在；移除通配符盒模型重置；级联层、相对字号和重复尺寸仍待整理 |
| CSS layout | 原指南未能核验 | 入口的 GitHub 链接返回 404；补读 [web.dev Layout](https://web.dev/learn/css/layout)，实际验证 Flex／Grid 重排、移动和八方向缩放，不能据此宣布缺失指南全部通过 |
| [Forms](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/forms/forms/guide.md) | 部分符合 | 持久标签、提示、字段错误、原生约束和保存进度已检查；字段分组和更多设备／输入方式尚待检查 |
| [Performance](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/performance/performance/guide.md) | 待实测 | 内容脚本延后加载、观察事件合并、审核分页已实现；没有真实页面 LCP／INP／CLS 或低性能设备测量；不能用回归测试耗时代替性能指标 |
| [Privacy](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/privacy/privacy/guide.md) | 部分符合 | 本地存储、主动触发 AI、说明发送字段、按主机授权和导出已核对；删除及保留流程未完成 |
| [Security](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/security/security/guide.md) | 已有基线，未完成完整审计 | 文本写入、输入与输出验证、凭据隔离、HTTPS 边界、响应上限和超时已存在；本轮明确本地脚本、禁止对象、限制 base 和表单提交的扩展 CSP；未启用 Trusted Types 强制模式 |
| [Chrome extensions](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/skills-src/chrome-extensions/SKILL.md) | 核心结构符合，仍有待办 | Manifest V3、按需 Native Messaging、持久存储和可选主机权限已核对。修复工具栏处理器依赖 `tab.url` 的逻辑，无须增加标签页权限；大量 DOM 更新分批及全生命周期性能仍需核验。商店发布未执行 |

非模态浮层继续允许操作 YouTube 视频，因此不锁住整页焦点。没有为了采用原生模态对话框而阻止视频区域操作。扩展页面 CSP 按 [Chrome 官方扩展 CSP 规则](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) 配置；未向 YouTube 注入网站级安全响应头。

Passkeys、WebMCP、支付、网站账户注册及商店发布不属于当前产品流程。没有为了形式上覆盖这些指南而新增权限或功能。

## 自动检测结果

| 截图／扫描状态 | axe 违规规则数 | 尚需人工判断 |
| --- | --- | --- |
| 01-panel | 0 | color-contrast：37 个节点; label-content-name-mismatch：1 个节点 |
| 02-review | 0 | color-contrast：51 个节点; label-content-name-mismatch：1 个节点 |
| 03-narrow-dark | 0 | color-contrast：26 个节点; label-content-name-mismatch：1 个节点 |
| 04-settings | 0 | 无 |

`incomplete` 不是通过。玻璃和复合背景使扫描器无法确定多处文字背景；关闭符号还需人工判断名称及对比度。实色偏好回退也保存独立扫描结果，仍有未解析节点。没有排除这些项目来制造完整符合结果。

修复前：步骤 2 的原生语义和名称检查共触发 2 类规则、12 个节点；步骤 3 触发 3 类规则、13 个节点。两者包括同一组卡片，不能相加称为 25 个独立问题。语言和页面切换焦点另由运行时检查发现；修复前分别为无宿主语言和无审核焦点，修复后为 `en` 及审核标题。

## 验证与后续顺序

- `npm run check`：14 个运行脚本检查通过，退出码 0。
- `npm test`：27 / 27 通过，退出码 0。
- `npm run test:browser`：24 / 24 通过，退出码 0；最终完整运行 34.5 秒。既有分类、全量分批、撤销、主题、拖动、缩放和模拟 Native Messaging 均回归通过。
- 新检查覆盖语言、审核焦点、320 像素重排、四步 axe 扫描、保存分类后的焦点、字段错误及无 `tab.url` 的工具栏处理逻辑。
- 初次新增检查复现旧版缺少语言声明等问题；中间测试的对比度未解析与测试数据定位错误均已区分处理。Trusted Types 强制模式试验未通过正常保存流程，因此未保留；不能宣称该策略通过。

优先补齐：玻璃及控件对比度、真实页面性能、屏幕阅读器与放大、完整数据删除及权限撤销流程。随后整理 CSS 优先级、字号和重复尺寸，并补 Edge／Brave 实机验证。具体完成条件见 [设计与验收要求](design-guidance.md)。

安装包和源码一致性记录见 [verification.md](verification.md)。本轮不发布，不推送，不重新安装本机小助手。
