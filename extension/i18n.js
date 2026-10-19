(function (root) {
  "use strict";
  const english = {
    "小图标位置无效": "Invalid icon position", "小图标位置已保存": "Icon position saved",
    "拖动小图标或使用方向键移动；Shift 加快；Home 复位；Enter 或空格恢复窗口。": "Drag the icon or use arrow keys to move it. Shift moves faster. Home resets its position. Enter or Space restores the window.",
    "最小化分类窗口": "Minimize channel window", "恢复频道分类窗口": "Restore channel window",
    "移动面板：拖动标题栏或使用方向键": "Move panel: drag the title bar or use arrow keys", "拖动标题栏移动；双击恢复默认位置": "Drag the title bar to move; double-click to reset",
    "浮动窗口 · 双击标题栏复位": "Floating window · Double-click the title bar to reset", "悬浮窗口 · 拖动标题栏移动": "Floating window · Drag the title bar to move",
    "返回分类与设置": "Back to channels and settings", "分类审核工作台": "Classification review", "打开审核工作台": "Open review workspace",
    "审核搜索频道": "Search review channels", "搜索本次结果": "Search these results", "审核筛选": "Review filter", "拖放分类目标": "Category drop targets",
    "本页分类建议": "Suggestions on this page", "上一页": "Previous", "下一页": "Next", "全部建议": "All suggestions", "需复核": "Needs review", "拖动归类": "Drag to categorize",
    "拖动频道到分类目标；按住 Shift 可追加分类。只修改预览，应用后才保存。": "Drag channels onto a category. Hold Shift to add one. Changes stay in the preview until applied.",
    "拖放到 {category}": "Drop into {category}", "已调整 {channel} 的预览分类；点击应用后保存。": "Preview updated for {channel}. Apply to save.",
    "没有匹配的建议，请更换筛选或搜索。": "No matching suggestions. Change the filter or search.", "第 {page} / {pages} 页": "Page {page} of {pages}",
    "匹配 {count} / {total} 个频道 · 每页最多 {size} 个": "{count} of {total} channels match · Up to {size} per page",
    "面板位置与尺寸已保存": "Panel position and size saved",
    "调整上边框大小": "Resize top edge", "调整下边框大小": "Resize bottom edge", "调整左边框大小": "Resize left edge", "调整右边框大小": "Resize right edge",
    "调整右上角大小": "Resize top-right corner", "调整左下角大小": "Resize bottom-left corner", "调整右下角大小": "Resize bottom-right corner", "拖动边框调整大小；双击恢复默认": "Drag an edge to resize; double-click to reset",
    "任务": "Task", "AI 任务": "AI task", "频道分类建议": "Channel suggestions", "精简分类并重新归类": "Simplify categories and reclassify",
    "精简分类要求": "Category organization instructions", "精简分类进度": "Organization progress",
    "例如：合并成 6 大类，AI 和编程分别保留，其他主题适当合并。也可要求 4–6 类或最多 8 类。": "Example: merge into 6 categories, keep AI and coding separate. You can request 4–6 categories or at most 8.",
    "生成精简方案": "Plan fewer categories", "按方案自动归类全部频道": "Classify all channels with this plan", "替换旧分类并应用": "Replace old categories and apply", "重新规划": "Start a new plan",
    "先按自然语言规划 1–20 个总体分类，再用固定方案归类全部已收集频道。应用时替换旧分类列表，包括手动分类。": "Describe 1–20 categories, then classify all collected channels with the fixed plan. Applying replaces existing categories, including manual ones.",
    "规划会发送现有分类名称及最多 100 个频道的名称和简介样本；归类时按批次发送全部频道信息。可能消耗模型额度。": "Planning sends existing category names and up to 100 channel name and description samples. Classification sends all channel metadata in batches. Model credits may be used.",
    "正在根据你的要求规划总体分类…": "Planning categories from your instructions…", "请检查分类数量与名称，再开始自动归类。此时尚未修改分类。": "Review the category count and names, then start classification. No categories have changed yet.",
    "当前请求已等待 {seconds} 秒。": "Current request: {seconds}s elapsed.", "方案分类 {number}": "Planned category {number}",
    "方案共 {count} 类，参考 {samples} 个频道样本；将重新归类全部 {total} 个已收集频道。": "Plan: {count} categories, based on {samples} channel samples. All {total} collected channels will be reclassified.",
    "按固定 {count} 类归类：已完成 {done} / {total} 个频道。": "Using {count} fixed categories: {done} of {total} channels complete.",
    "已暂停；可继续剩余频道，已有结果会保留。": "Paused. Resume remaining channels; completed results are retained.",
    "归类预览已完成。应用将替换全部旧分类和频道归属；可撤销最近一次应用。": "Preview complete. Applying replaces all old categories and assignments. You can undo the latest application.",
    "已有结果保留；可继续剩余频道，或重新规划。": "Completed results are retained. Resume remaining channels or start a new plan.",
    "正在替换分类并保存全部频道归属…": "Replacing categories and saving all channel assignments…",
    "已整理为 {count} 类，处理 {total} 个频道。可撤销上次 AI 分类。": "Organized into {count} categories for {total} channels. You can undo the last AI application.",
    "精简分类已应用": "Category organization applied", "继续归类剩余 {count} 个频道": "Resume classifying {count} remaining channels",
    "数量约束：{min}–{max} 类。其他自然语言要求由 AI 理解，请检查方案。": "Count constraint: {min}–{max} categories. AI interprets the other instructions. Review its plan.",
    "预览 {count} 个频道，其中 {missing} 个未分类、{low} 个低把握。信息不足时可保留未分类。": "Preview: {count} channels; {missing} uncategorized, {low} low confidence. Keep channels uncategorized when information is limited.",
    "{channel}：{name}（精简方案）": "{channel}: {name} (organization plan)", "每个频道最多选择 3 类": "Choose up to 3 categories per channel", "显示更多建议": "Show more suggestions",
    "精简分类支持 1–20 类，请调整数量要求": "Organization supports 1–20 categories. Adjust the requested count",
    "精简方案需要 1–20 个分类": "The plan needs 1–20 categories", "精简方案包含重复分类": "The plan contains duplicate categories",
    "请用 1–700 字描述分类数量和侧重点": "Describe the category count and focus in 1–700 characters", "请先收集频道再整理分类": "Collect channels before organizing categories",
    "每个规划槽位只能返回一个分类": "Each planning slot must return one category at most", "AI 方案不符合要求的分类数量，请重新生成": "The AI plan does not match the requested count. Generate it again",
    "AI 使用了方案以外的分类，本批未接受": "AI used categories outside the plan. This batch was rejected",
    "频道或分类已变更，请重新生成精简方案": "Channels or categories changed. Generate a new organization plan",
    "精简分类必须覆盖全部已收集频道": "Organization must cover all collected channels",
    "上次 AI 分类已撤销，原分类列表和频道归属已恢复。": "Last AI application undone. Previous categories and assignments are restored.", "上次 AI 分类已撤销": "Last AI application undone",
    "尺寸": "Size", "调整面板大小": "Resize panel", "面板宽度": "Panel width", "面板高度": "Panel height", "宽度": "Width", "高度": "Height",
    "恢复默认": "Reset size", "尺寸自动适应窗口和视频空间。": "Size adapts to the window and video space.", "面板尺寸已保存": "Panel size saved", "面板尺寸无效": "Invalid panel size",
    "调整大小：拖动或使用方向键": "Resize: drag or use arrow keys", "拖动左上角调整大小；双击恢复默认": "Drag the top-left corner to resize; double-click to reset",
    "查看视频 ↗": "View videos ↗", "查看 {title} 的视频": "View videos from {title}",
    "侧栏模式 · 为页面留出空间": "Docked · Space reserved for the page",
    "浮层模式 · 点击外部可收起": "Floating · Click outside to collapse",
    "频道分类 · AI 设置": "Channel Groups · Settings",
    "选择你的 AI 助手": "Choose your AI assistant",
    "界面语言": "Interface language",
    "设置与连接": "Settings and connection",
    "默认自动分批处理全部剩余频道，每次请求最多 20 个。生成后可统一预览、修改并应用。": "Process all remaining channels in batches of up to 20. Review and edit suggestions before applying them.",
    "接入方式": "AI provider", "模型名称": "Model name",
    "本机 Codex（已有命令行登录）": "Local Codex (CLI login)", "本机 Claude（已有命令行登录）": "Local Claude (CLI login)",
    "自定义云端 API（Chat Completions 兼容）": "Custom API (Chat Completions compatible)",
    "API 基础地址或完整 Chat Completions 地址": "API base URL or Chat Completions URL", "API 密钥": "API key",
    "本机模式可留空，使用 CLI 默认模型": "Leave blank to use the CLI default model",
    "供应商提供的模型名称": "Model name from your provider", "留空使用 CLI 默认模型": "Leave blank to use the CLI default model",
    "未配置": "Not configured", "请输入": "Enter a value", "已保存；留空保留": "Saved; leave blank to keep",
    "留空保留同一 API 地址的已存密钥；更改地址后，需重新填写。": "Leave blank to keep the key for this URL. Enter a new key when changing the URL.",
    "本机小助手由浏览器按需自动启动。首次双击安装器完成安装后，无须打开终端。": "Install the helper once. Your browser starts it when needed; no terminal is required.",
    "本扩展 ID：": "Extension ID:", "复制扩展 ID": "Copy extension ID", "检测小助手": "Check helper",
    "检测不会调用模型，也不会消耗模型额度。": "This check does not call a model or use model credits.",
    "保存设置": "Save settings", "保存并授权连接地址": "Save and allow this address", "清除 AI 配置": "Clear AI settings",
    "连接本机订阅": "Connect your local CLI", "发送哪些信息": "Data sent to the provider",
    "首次双击安装包中的“安装YouTube分类小助手.app”，核对上方扩展 ID 并安装。安装器会自动查找 Codex／Claude 命令，不要求安装 Python。": "Open the helper installer, check your extension ID, and install. It finds Codex and Claude commands. Python is not required.",
    "返回本页检测小助手，选择 Codex 或 Claude 并保存。以后在 YouTube 点击“生成分类建议”，浏览器会自动启动小助手并调用已登录的官方命令行工具。": "Check the helper here, choose Codex or Claude, and save. Generate suggestions on YouTube to call your signed-in official CLI.",
    "请求仍可能发送到对应云服务并消耗账号额度。小助手按需退出，不监听端口，不设置开机启动。命令存在不代表账号已经登录。": "Requests can use cloud services and account credits. The helper exits when finished. Finding a command does not verify login.",
    "点击生成建议时，按所选范围分批发送频道名称、地址、已收集简介、现有分类名称和你填写的分类要求。处理全部频道会产生多次请求，可能消耗更多账号额度。": "Generation sends channel names, URLs, collected descriptions, category names, and your instructions. All-channel processing makes multiple requests and can use more credits.",
    "云端 API 密钥保存在扩展本地存储中，不会加入频道备份，也不会提供给 YouTube 页面。此存储不是操作系统密码库。本机模式不保存订阅账号密钥。": "API keys stay in trusted extension storage. Backups and YouTube pages do not receive them. This storage is not an OS keychain.",
    "云端地址可填 API 基础地址或完整的 Chat Completions 地址。保存时只申请连接该主机的权限。": "Use an API base URL or a full Chat Completions URL. Saving requests permission for that host only.",
    "尚未保存": "Unsaved changes", "修改后点击保存。语言切换会立即保存。": "Save after editing. Language changes save immediately.",
    "正在验证设置…": "Validating settings…", "正在请求连接权限…": "Requesting host permission…", "正在保存到本机…": "Saving locally…", "设置已保存": "Settings saved",
    "已保存。回到 YouTube 分类面板，点击“生成分类建议”。": "Saved. Return to YouTube and generate suggestions.",
    "正在保存界面语言…": "Saving interface language…", "界面语言已保存": "Interface language saved",
    "未获授权；AI 配置未修改": "Permission was denied. AI settings were not changed.", "设置保存失败": "Could not save settings",
    "扩展 ID 已复制，可粘贴到安装器。": "Extension ID copied. Paste it into the installer.", "请手动复制上方扩展 ID。": "Copy the extension ID above manually.",
    "正在由浏览器启动小助手…": "Starting the helper through your browser…",
    "小助手 {version} 已连接。已检测到：{providers}。账号登录状态仍需首次分类确认。": "Helper {version} connected. Commands found: {providers}. The first classification checks account access.",
    "尚未找到命令，请安装官方 CLI 后重新安装小助手": "No commands found. Install the official CLI, then reinstall the helper",
    "AI 配置及密钥已清除；已授予的主机权限可在浏览器扩展管理中撤销。": "AI settings and key cleared. Revoke existing host permissions in browser extension settings.",
    "选择本机 Codex、Claude 或自定义云端 API。": "Choose local Codex, Claude, or a custom API.",
    "仅未分类频道": "Uncategorized channels", "全部频道（包括已分类）": "All channels (including categorized)",
    "全部剩余频道（自动分批）": "All remaining channels (automatic batches)", "仅下一批（最多 20 个）": "Next batch only (up to 20)",
    "分类范围": "Channel scope", "处理数量": "Processing size", "应用方式": "Apply mode",
    "仅处理已收集频道；未加载的订阅频道需先在订阅列表中收集。": "Only collected channels are processed. Load and collect missing subscriptions first.",
    "补充分类（保留已有分类）": "Add categories (keep existing)", "重新分类（替换勾选频道的分类）": "Reclassify (replace selected channels' categories)",
    "只替换勾选频道的分类；未勾选频道不变。应用后可撤销最近一次 AI 分类。": "Replace categories for selected channels only. You can undo the most recent AI application.",
    "例如：用中文分类，区分 AI 研究、AI 工具、编程教学": "Example: separate AI research, AI tools, and coding tutorials",
    "AI 分类范围": "AI channel scope", "AI 处理数量": "AI processing size", "AI 应用方式": "AI apply mode", "AI 分类要求": "AI instructions",
    "点击生成即按所选范围向服务分批发送频道名称、地址、已收集简介和分类要求。处理全部频道会产生多次请求，可能消耗更多账号额度。": "Generation sends the selected channel metadata and instructions in batches. More channels can use more account credits.",
    "生成分类建议": "Generate suggestions", "本批完成后停止": "Stop after this batch", "应用勾选建议": "Apply selected suggestions", "跳过这些建议": "Skip these suggestions", "从头检查": "Start over",
    "撤销上次 AI 分类": "Undo last AI application", "上次 AI 分类已撤销。空分类可在管理分类中删除。": "Last AI application undone. Remove unused categories in Manage categories.",
    "没有待分类频道，请先收集频道或更改分类范围。": "No channels to process. Collect channels or change the scope.",
    "正在处理第 {batch} / {batches} 批，已完成 {done} / {total} 个频道。本机每批最多等待约两分钟…": "Processing batch {batch} of {batches}; {done} of {total} channels complete. Local batches can take about two minutes each…",
    "已暂停，已完成 {done} / {total} 个频道。可继续处理剩余 {remaining} 个，已有建议不会重复请求。": "Paused: {done} of {total} complete. Resume the remaining {remaining}; successful channels will not be requested again.",
    "已完成 {total} 个频道的建议。请检查后应用；低把握建议默认不勾选。": "Suggestions ready for {total} channels. Review before applying. Low-confidence suggestions are unchecked.",
    "已完成 {done} / {total} 个频道。{error}。可继续处理剩余 {remaining} 个，已完成的建议会保留。": "{done} of {total} complete. {error}. Resume the remaining {remaining}; completed suggestions are retained.",
    "将在当前批次返回后停止；已完成的建议会保留。": "Stopping when this batch returns. Completed suggestions will be retained.",
    "AI 建议尚未应用，请在预览中确认": "Suggestions are not applied. Review the preview first.", "请先勾选至少一条含有分类名称的建议": "Select at least one suggestion with a category",
    "正在应用 {count} 个频道的建议…": "Applying suggestions for {count} channels…",
    "已应用 {count} 个频道的建议，原有分类已保留。": "Applied suggestions for {count} channels. Existing categories were kept.",
    "已重新分类 {count} 个频道；其他频道不变。": "Reclassified {count} channels. Other channels were unchanged.",
    "AI 分类建议已应用": "AI suggestions applied", "预览中的建议已跳过。可以继续生成剩余频道，或从头检查。": "Preview suggestions skipped. Process remaining channels or start over.",
    "已重置本轮进度。": "Session progress reset.", "✦ AI 分类助手": "✦ AI assistant", "AI 设置": "AI settings",
    "本机 Codex": "Local Codex", "本机 Claude": "Local Claude", "云端 API": "Cloud API", "CLI 默认模型": "CLI default model", "浏览器自动启动": "Started by your browser",
    "尚未配置。请先打开“AI 设置”。": "Not configured. Open AI settings first.",
    "本轮 {total} 个频道，已完成 {done} 个，待处理 {remaining} 个。应用后，未勾选项本轮跳过。": "This session: {total} channels; {done} complete, {remaining} remaining. Unchecked suggestions are skipped after applying.",
    "将处理 {count} / {total} 个剩余频道，自动分为 {batches} 批，每批最多 {size} 个。本轮已检查 {reviewed} 个。": "Process {count} of {total} remaining channels in {batches} batches, up to {size} each. Reviewed: {reviewed}.",
    "继续剩余 {count} 个频道": "Resume remaining {count} channels", "当前预览 {count} 个频道，已勾选 {selected} 个。": "Preview: {count} channels; {selected} selected.",
    "把握程度由模型自评，不是准确率。分类可编辑，用逗号分隔，最多 3 个。": "Confidence is the model's own assessment. Edit up to three comma-separated category names.",
    "应用 {channel} 的 AI 建议": "Apply AI suggestion for {channel}", "{channel} 的建议分类": "Suggested categories for {channel}",
    "模型把握：{certainty} · {reason}": "Model confidence: {certainty} · {reason}", "较高": "High", "一般": "Medium", "较低": "Low",
    "本批已等待 {seconds} 秒；已生成 {done} / {total} 个频道的建议。": "This batch: {seconds}s elapsed. Suggestions complete: {done} of {total}.",
    "AI 分类进度": "AI classification progress", "设置保存进度": "Settings save progress",
    "正在读取本地分类…": "Loading local categories…", "按分类筛选": "Filter by category", "频道列表": "Channel list",
    "搜索频道名称或 @handle": "Search channel names or @handles", "搜索频道": "Search channels", "频道分类": "Channel Groups", "显示全部": "Show all",
    "关闭分类面板": "Close channel panel", "频道分类面板": "Channel groups panel", "例如：AI、编程、音乐": "Example: AI, coding, music", "新分类名称": "New category name",
    "创建": "Create", "分类已创建": "Category created", "收集已加载频道": "Collect loaded channels", "频道已收集；继续滚动可发现更多": "Channels collected. Scroll to find more.",
    "加入当前频道": "Add current channel", "请先打开一个 YouTube 频道主页": "Open a YouTube channel page first", "当前频道已加入本地列表": "Current channel added locally",
    "选择分类备份": "Choose category backup", "备份过大，最多 4 MB": "Backup exceeds the 4 MB limit", "备份已合并，保留了现有分类": "Backup merged. Existing categories kept.",
    "让订阅各归其类": "A place for every channel", "手动分类 · 本机保存 · 一个频道可有多个分类": "Organize locally · Multiple categories per channel",
    "从你的订阅频道开始": "Start with your subscriptions", "打开订阅列表，滚动加载频道。扩展会收集已加载的频道；然后在下方勾选分类。": "Open your subscriptions and scroll to load channels. Collect them, then organize manually or with AI.",
    "YouTube 页面": "YouTube pages", "① 订阅频道列表 ↗": "① Subscribed channels ↗", "② 订阅视频 ↗": "② Subscription videos ↗", "我的分类": "My categories", "管理分类": "Manage categories",
    "导出备份": "Export", "合并备份": "Merge backup", "卸载前请备份": "Back up before uninstalling", "备份已生成": "Export ready", "导出格式": "Export format",
    "JSON 备份": "JSON backup", "CSV 表格": "CSV spreadsheet", "Markdown 笔记": "Markdown notes",
    "正在保存，请稍候": "Saving. Please wait.", "操作失败，请重试": "Operation failed. Try again.",
    "扩展连接已失效，请刷新 YouTube 页面后重试": "Extension disconnected. Refresh YouTube and try again.", "读取或保存失败": "Could not read or save data",
    "未分类": "Uncategorized", "全部": "All", "选择分类可查看频道；在“订阅视频”页面还会筛选已加载的视频。": "Choose a category to view channels. The subscriptions page also filters loaded videos.",
    "已加载视频：{visible} / {recognized}。仅筛选可识别的频道视频；Shorts 合集等未识别内容保留。{unknown}": "Loaded videos: {visible} of {recognized}. Unrecognized cards remain visible. {unknown}",
    "另有 {count} 个未识别卡片。": "Also {count} unrecognized cards.", "{name} · {count} 个视频": "{name} · {count} videos",
    "{count} 个频道": "{count} channels", "{count} 个频道 · 当前显示 {limit} 个": "{count} channels · Showing {limit}",
    "先在下方创建分类，再为频道勾选。": "Create a category below, then assign channels.", "这个分类或搜索没有匹配频道。": "No channels match this category or search.",
    "还没有频道。打开订阅频道列表并滚动加载，或在频道主页点击“加入当前频道”。": "No channels yet. Scroll through subscriptions or add a channel from its page.",
    "显示更多频道": "Show more channels", "重命名 {name}": "Rename {name}", "分类名称已保存": "Category name saved", "保存": "Save", "删除": "Delete", "删除 {name}": "Delete {name}",
    "删除“{name}”分类？频道仍会保留，其他分类不受影响。": "Delete category “{name}”? Channels and other categories will remain.", "分类已删除": "Category deleted", "分类已保存": "Categories saved",
    "请先打开订阅频道列表": "Open your subscriptions list first", "暂未识别到频道。请确认已登录，并等待列表加载或向下滚动": "No channels found yet. Check login, wait for loading, or scroll down.",
    "已收集 {count} 个频道；滚动列表可继续收集": "Collected {count} channels. Scroll to collect more.", "分类仅保存在这个浏览器配置文件中": "Categories are stored in this browser profile only", "请刷新页面以连接扩展": "Refresh the page to reconnect the extension",
    "分类应用方式无效": "Invalid apply mode", "没有可撤销的 AI 分类": "No AI application to undo",
    "分类已发生后续修改，无法安全撤销；请手动调整或恢复备份": "Later edits prevent a safe undo. Edit categories manually or restore a backup.",
    "频道或建议已失效，请重新预览": "Channel or suggestion is no longer valid. Generate a new preview.", "一次应用 1–10000 个频道建议": "Apply between 1 and 10000 channel suggestions",
    "备份格式或版本不支持": "Unsupported backup format or version", "分类重复": "Duplicate category", "最多支持 100 个分类、10000 个频道": "Limit: 100 categories and 10000 channels",
    "请选择 AI 接入方式": "Choose an AI provider", "请填写有效模型名称；本机模式可留空": "Enter a valid model name. Local mode can use the default.",
    "云端地址必须使用 HTTPS；HTTP 仅限本机地址": "Use HTTPS. HTTP is allowed only for localhost.", "密钥格式无效": "Invalid API key format", "分类要求最多 1000 字": "AI instructions are limited to 1000 characters",
    "频道列表已变化，请重新生成建议": "The channel list changed. Generate suggestions again.", "AI 返回内容过长": "AI response is too long", "AI 未返回有效 JSON，请重试或更换模型": "AI returned invalid JSON. Retry or choose another model",
    "AI 返回的频道数量不完整，请重试": "AI response is incomplete. Retry", "AI 返回了未知、重复或无效的频道建议": "AI returned unknown, duplicate, or invalid suggestions", "AI 返回的分类名称无效": "AI returned invalid category names", "AI 返回的建议说明无效": "AI returned invalid explanations",
    "AI 连接失败或超时；请检查服务地址、密钥和网络": "AI connection failed or timed out. Check the URL, key, and network",
    "AI 请求失败（HTTP {status}），请检查登录、额度或密钥": "AI request failed (HTTP {status}). Check login, credits, or API key",
    "AI 服务未返回有效 JSON": "AI service returned invalid JSON", "已有 AI 请求正在运行，请等待完成": "An AI request is already running. Wait for it to finish",
    "请先打开“AI 设置”选择 Codex、Claude 或云端 API": "Open AI settings and choose Codex, Claude, or an API first",
    "尚未授权 AI 服务地址，请在 AI 设置中保存并授权": "Allow the AI host in settings first", "本机 AI 等待超时，请稍后重试": "Local AI timed out. Try again later",
    "本机小助手未安装或不受当前浏览器支持，请打开 AI 设置": "Helper unavailable. Open AI settings",
    "无法连接本机小助手：{detail}。请在 AI 设置中检测安装，并确认扩展 ID 已授权。": "Cannot connect to the helper: {detail}. Check installation and extension ID in AI settings.",
    "分类名称无效": "Invalid category name", "分类已不存在": "Category no longer exists", "频道或分类已不存在": "Channel or category no longer exists",
    "请选择中文或 English": "Choose Chinese or English", "无效的导出格式": "Invalid export format",
    "频道格式无效": "Invalid channel format", "频道数据过长": "Channel data exceeds the limit", "频道地址无效": "Invalid channel URL", "频道地址重复": "Duplicate channel URL",
    "频道引用了不存在的分类": "Channel refers to a missing category", "频道列表无效": "Invalid channel list", "分类 ID无效": "Invalid category ID", "频道名称无效": "Invalid channel name",
    "不支持的操作": "Unsupported action", "请先授权 AI 服务地址": "Allow the AI host first", "AI 设置仅可在扩展设置页修改": "Edit AI settings on the extension settings page",
    "请使用撤销 AI 分类操作": "Use the undo AI application action", "每批选择 1–{count} 个频道": "Choose 1 to {count} channels per batch"
  };
  english["请输入有效 API 地址"] = "Enter a valid API URL";
  english["保存 {name}"] = "Save {name}";
  Object.assign(english, {
  "AI 连接": "AI connection",
  "显示密钥": "Show API key",
  "隐藏密钥": "Hide API key",
  "数据与隐私": "Data and privacy",
  "恢复收集已加载频道": "Resume collecting loaded channels",
  "跳到频道列表": "Skip to channel list",
  "频道翻页": "Channel pages",
  "上一页频道": "Previous channels",
  "下一页频道": "Next channels",
  "编辑频道分类": "Edit channel categories",
  "导出频道备份": "Export channel backup",
  "删除全部扩展数据…": "Delete all extension data…",
  "撤销可选连接权限": "Revoke optional connections",
  "删除全部扩展数据": "Delete all extension data",
  "确认删除全部数据": "Confirm deletion",
  "取消": "Cancel",
  "我理解将永久删除此浏览器中的全部分类和设置": "I understand that all categories and settings in this browser will be permanently deleted",
  "正在删除本机数据并撤销权限…": "Deleting local data and revoking permissions…",
  "本机数据已删除，自动收集已暂停": "Local data deleted. Automatic collection is paused.",
  "可选连接权限已撤销": "Optional connection permissions revoked",
  "部分权限未撤销，请重试": "Some permissions remain. Retry revocation.",
  "AI 配置已清除，部分权限未撤销，请重试撤销权限": "AI settings cleared. Some permissions remain. Retry revocation.",
  "AI 配置及密钥已清除，可选连接权限已撤销": "AI settings and key cleared. Optional connection permissions revoked.",
  "本机数据已删除，部分权限未撤销，请重试撤销权限": "Local data deleted. Some permissions remain. Retry revocation.",
  "数据已删除，旧操作已取消；请重新开始": "Data was deleted. The old operation was cancelled. Start again.",
  "AI 连接已取消；请重新开始": "The AI connection was cancelled. Start again.",
  "为记住暂停状态，仅保留一条不含频道或账号的删除标记。卸载扩展会移除此标记。": "Only a deletion marker remains to keep collection paused. It contains no channels or accounts. Uninstalling removes it.",
  "自动收集已暂停；点击收集按钮后恢复": "Automatic collection is paused. Use the collection button to resume.",
  "请先确认删除全部扩展数据": "Confirm deletion of all extension data first",
  "数据管理仅可在扩展设置页操作": "Manage data on the extension settings page",
  "频道查询无效": "Invalid channel search",
  "频道、分类、撤销记录及设置保留在此浏览器中，直到你删除。未应用的分类建议在同一标签页刷新后恢复，关闭标签页或浏览器后消失；精简分类方案刷新后消失。": "Channels, categories, undo records, and settings remain in this browser until deletion. Unapplied suggestions are restored after a reload of the same tab and disappear when the tab or browser closes. Category organization plans disappear on reload.",
  "删除将清除本机频道、分类、撤销记录、AI 配置和密钥、界面偏好，并撤销可选连接权限。自动收集会暂停，直到你主动恢复。": "Deletion clears channels, categories, undo records, AI settings, keys, and preferences. It revokes optional connections and pauses collection until you resume.",
  "已导出的文件、已发送到 AI 服务的记录和本机 CLI 账号不在此删除范围内。它们须在对应位置管理。": "Exported files, AI provider records, and local CLI accounts remain outside this deletion. Manage them in their respective locations.",
  "此操作不可撤销。先导出备份，再确认删除。不会取消 YouTube 订阅或退出 CLI 账号。": "Deletion cannot be undone. Export a backup before confirming. YouTube subscriptions and CLI accounts are unaffected."
});
  english["备份与数据"] = "Backup and data";
  english["方向键移动或调整；Shift 加快；Enter 或空格恢复默认；Esc 关闭或取消拖动。"] = "Use arrows to move or resize. Shift moves faster. Enter or Space resets the window. Escape closes it or cancels dragging.";
  english["查看视频：{channel}"] = "View videos: {channel}";
  english["建议分类"] = "Suggested categories";
  Object.assign(english, {
    "只允许 YouTube 主页面保存 AI 预览": "Only the main YouTube page can save AI previews",
    "AI 预览过大，刷新后无法恢复": "The AI preview is too large to restore after a reload",
    "显示 {visible} / {recognized} 个已加载视频": "Showing {visible} of {recognized} loaded videos",
    "显示 {visible} / {recognized} 个已加载视频 · {unknown} 个未识别卡片保留": "Showing {visible} of {recognized} loaded videos · {unknown} unrecognized cards kept",
    "只筛选能识别频道的已加载视频；Shorts 合集等未识别内容保留显示。": "Only loaded videos with a recognized channel are filtered; Shorts shelves and other unrecognized items stay visible.",
    "按分类筛选订阅视频 ↗": "Filter subscription videos by category ↗", "开始使用": "Get started", "打开订阅频道列表 ↗": "Open subscribed channels ↗",
    "打开订阅频道列表，点击“刷新订阅”加载全部频道。": "Open your subscribed channels list and click “Refresh subscriptions” to load every channel.",
    "在“管理分类”中创建分类并勾选频道，或展开“AI 分类助手”自动分类。": "Create categories in “Manage categories” and tick channels, or open the “AI assistant” to classify automatically.",
    "在“订阅视频”页面点击分类，筛选要看的视频。": "On the subscription videos page, click a category to filter videos.",
    "加载完整的订阅列表，收集全部频道，并找出已取消关注的频道": "Load the full subscription list, collect every channel, and find channels you unsubscribed from",
    "刷新订阅": "Refresh subscriptions", "停止刷新": "Stop refreshing", "已不在订阅列表中的频道": "Channels no longer in your subscriptions",
    "加载完整的订阅列表，找出已取消关注的频道": "Load the full subscription list and find channels you unsubscribed from",
    "正在打开订阅频道列表以刷新订阅…": "Opening the subscriptions list to refresh…",
    "订阅列表没有加载完整，无法判断哪些频道已取消关注。没有移除任何频道；可稍后再次刷新。": "The subscription list did not load completely, so unsubscribed channels cannot be determined. Nothing was removed; refresh again later.",
    "没有识别到订阅频道。请确认已登录 YouTube；没有移除任何频道。": "No subscribed channels were recognized. Check that you are signed in to YouTube; nothing was removed.",
    "有 {count} 个已保存的频道不在你当前的订阅列表中。勾选要从扩展中移除的频道；默认不勾选。": "{count} saved channels are not in your current subscriptions. Select the ones to remove from the extension; none are selected by default.",
    "属于 {count} 个分类": "In {count} categories",
    "可能与列表中的 {channel} 是同一频道（地址已变化），建议保留": "May be the same channel as {channel} in the list (its address changed); keeping it is recommended",
    "已刷新：扩展中的频道都仍在订阅列表中。": "Refreshed: every saved channel is still in your subscriptions.",
    "移除 {channel}": "Remove {channel}",
    "超过一半的已保存频道不在列表中。请确认已登录正确的 YouTube 账号。": "More than half of the saved channels are missing from the list. Check that you are signed in to the right YouTube account.",
    "通过“加入当前频道”添加、但从未订阅的频道也会出现在这里。移除会同时删除它们的分类归属。": "Channels added with “Add current channel” but never subscribed also appear here. Removing them also removes their category assignments.",
    "移除所选频道": "Remove selected channels", "全部保留": "Keep all", "请先勾选要移除的频道": "Select channels to remove first",
    "已从扩展中移除 {count} 个频道": "Removed {count} channels from the extension", "已保留全部频道": "All channels kept",
    "请选择要移除的频道": "Select channels to remove", "频道列表已变化，请重新刷新订阅": "The channel list changed. Refresh subscriptions again.",
    "只允许 YouTube 主页面执行此操作": "Only the main YouTube page can do this", "操作无效": "Invalid operation",
    "取消关注…": "Unsubscribe…", "取消关注：{channel}": "Unsubscribe: {channel}",
    "另一个取消关注操作尚未完成": "Another unsubscribe is still in progress",
    "这个频道不在当前页面，正在打开频道主页…": "This channel is not on the current page. Opening its channel page…",
    "YouTube 显示你没有订阅“{channel}”。只从扩展中移除这个频道？": "YouTube shows that you are not subscribed to “{channel}”. Remove it from the extension only?",
    "已从扩展中移除": "Removed from the extension",
    "未能识别 YouTube 的订阅按钮。请在 YouTube 中手动取消订阅；仅支持中文或英文的 YouTube 界面。": "The YouTube subscribe button was not recognized. Unsubscribe in YouTube manually; only Chinese or English YouTube interfaces are supported.",
    "正在打开 YouTube 的取消订阅确认框…": "Opening YouTube's unsubscribe confirmation…",
    "请在 YouTube 的确认框中确认取消订阅“{channel}”": "Confirm unsubscribing from “{channel}” in YouTube's dialog",
    "未检测到“{channel}”已取消关注，扩展中的记录保持不变。如果你已在 YouTube 中确认，请点击“刷新订阅”同步。": "Unsubscribing from “{channel}” was not detected, so the extension keeps it. If you confirmed in YouTube, use “Refresh subscriptions” to sync.",
    "已取消关注“{channel}”，并已从扩展中移除": "Unsubscribed from “{channel}” and removed it from the extension",
    "已在 YouTube 取消关注“{channel}”，但未能从扩展中移除：{error}": "Unsubscribed from “{channel}” in YouTube, but it could not be removed from the extension: {error}",
    "未能在频道主页找到“{channel}”的订阅按钮。请在 YouTube 中手动取消订阅。": "The subscribe button for “{channel}” was not found on its channel page. Unsubscribe in YouTube manually.",
    "未能打开 YouTube 的取消订阅菜单。请在 YouTube 中手动取消订阅。": "Could not open YouTube's unsubscribe menu. Unsubscribe in YouTube manually.",
    "频道已不存在": "The channel no longer exists",
    "自动加载全部订阅": "Load all subscriptions", "停止自动加载": "Stop loading", "正在停止…": "Stopping…",
    "自动滚动订阅频道列表，直到不再加载新频道": "Scroll the subscription list automatically until no new channels load",
    "正在自动加载订阅频道…": "Loading subscribed channels…",
    "正在自动加载订阅频道：已加载 {count} 个…": "Loading subscribed channels: {count} loaded…",
    "已到列表底部：已收集全部 {count} 个订阅频道。": "Reached the end of the list: all {count} subscribed channels collected.",
    "已停止自动加载：已加载 {count} 个频道，列表可能未完。": "Loading stopped: {count} channels loaded. The list may be incomplete.",
    "列表可能未完：已加载 {count} 个频道。可稍后再次自动加载。": "The list may be incomplete: {count} channels loaded. Try loading again later.",
    "已恢复刷新前未应用的 AI 预览：{count} 条建议，待处理 {remaining} 个频道。应用前请再次检查。": "Restored the unapplied AI preview from before the reload: {count} suggestions, {remaining} channels pending. Check it again before applying."
  });
  Object.assign(english, {
    "本机小助手返回错误": "The local helper returned an error", "连接中断": "Connection lost", "操作失败": "Operation failed",
    "请在 AI 设置页检测安装": "Check the installation on the AI settings page",
    "只允许 YouTube 主页面请求 AI 分类": "Only the main YouTube page can request AI classification",
    "只允许 YouTube 主页面同步主题": "Only the main YouTube page can sync the theme", "无效的 YouTube 主题": "Invalid YouTube theme"
  });
  let language = "zh-CN";
  const bindings = new WeakMap(), listeners = new Set();
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = Object.keys(english).filter(key => /\{\w+\}/.test(key)).sort((a, b) => b.length - a.length).map(key => {
    const fields = [];
    const expression = key.split(/(\{\w+\})/).map(part => {
      if (/^\{\w+\}$/.test(part)) { fields.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
      return escape(part);
    }).join("");
    return {expression: new RegExp("^" + expression + "$"), fields, target: english[key]};
  });
  function t(source) {
    if (language !== "en" || typeof source !== "string") return source;
    if (Object.hasOwn(english, source)) return english[source];
    for (const pattern of patterns) {
      const match = source.match(pattern.expression);
      if (!match) continue;
      const values = Object.fromEntries(pattern.fields.map((field, i) => [field, ["error", "certainty", "unknown", "providers", "detail"].includes(field) ? t(match[i + 1]) : match[i + 1]]));
      return pattern.target.replace(/\{(\w+)\}/g, (_, field) => values[field]);
    }
    return source;
  }
  function set(element, field, source) {
    if (!bindings.has(element)) bindings.set(element, {});
    bindings.get(element)[field] = source;
    if (field === "textContent") element.textContent = t(source);
    else element.setAttribute(field, t(source));
  }
  function refresh(root) {
    const elements = [...(root.nodeType === 1 ? [root] : []), ...root.querySelectorAll("*")];
    for (const element of elements) {
      for (const [field, source] of Object.entries(bindings.get(element) || {})) {
        if (field === "textContent") element.textContent = t(source);
        else element.setAttribute(field, t(source));
      }
    }
  }
  function register(root) {
    for (const element of root.querySelectorAll("*")) {
      if (!["SCRIPT", "STYLE", "CODE"].includes(element.tagName) && !element.children.length && element.textContent.trim()) set(element, "textContent", element.textContent);
      for (const attribute of ["placeholder", "aria-label", "title"]) if (element.hasAttribute(attribute)) set(element, attribute, element.getAttribute(attribute));
    }
  }
  function change(next) {
    if (!["zh-CN", "en"].includes(next)) throw new Error("请选择中文或 English");
    language = next; listeners.forEach(listener => listener(next));
  }
  // A saved choice wins; otherwise follow the browser's preferred language.
  function preferred(saved, browser = root.navigator?.language) {
    if (["zh-CN", "en"].includes(saved)) return saved;
    return /^zh\b/i.test(browser || "zh") ? "zh-CN" : "en";
  }
  const api = {t, set, refresh, register, change, preferred, get language() { return language; }, onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }};
  root.YCGI18n = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
