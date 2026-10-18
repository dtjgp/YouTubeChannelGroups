# 图标资产

最终主图：`artifacts/design/channel-groups-icon.png`。

运行资产：`extension/icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`。已用于扩展清单、工具栏、YouTube 入口和设置页。主图由内置 image_gen 生成；尺寸转换由 macOS sips 完成，没有使用外部图像 API 或用户密钥。

设计采用暖象牙底色、鼠尾草绿、雾蓝和浅薰衣草色。三张卡片表达分类整理，播放符号表达频道内容。使用简洁轮廓和轻微层次感，符合用户要求的 Apple 风格方向。没有使用 Apple 或 YouTube 官方标志。Apple 图标设计参考入口：[App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)。此处的配色与图形是本项目的设计选择。

最终生成提示词（内置图像工具的最终编辑轮次）：

> Deliver a clean OPAQUE square application icon, with no transparent pixels. Use this image as the visual reference for the three rounded cards and play symbol: preserve the sage green front card, pale blue middle card, lavender rear card, and ivory play triangle. Replace the entire backdrop with one perfectly uniform warm ivory color that extends to all four square canvas edges. Remove the outer rounded tile silhouette, its shadow, all ragged edges and all speckles. Only the centered three-card symbol and its very subtle contact shadow should be visible against the full-bleed ivory square. Flat front-facing composition, calm Apple-inspired minimalism, bold enough for a small browser toolbar. No words, logos, frame, border, device, mockup, watermark, or additional symbols. Exactly one square icon.

主图保存在项目中，浏览器安装包只包含所需小尺寸。颜色用于品牌图标；v0.4.1 的功能界面改为实时跟随 YouTube 主题。
