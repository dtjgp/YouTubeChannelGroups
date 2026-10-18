/* Shadow-scoped components. Shared roles and layer order live in design.js.
   Shared-page cursor overrides are limited to layout.js; preferences have the final layer. */
globalThis.YCGStyles = globalThis.YCGDesign.tokens + `
@layer ycg.base {
:host { all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; font-family: var(--ycg-font); color-scheme: light; --bg: #fff; --card: #fff; --ink: #0f0f0f; --muted: #606060; --line: #ccc; --accent: #065fd4; --soft: #f2f2f2; --hover: #e5e5e5; --selected: #0f0f0f; --onSelected: #fff; --danger: #c00; --focus: #065fd4; color: var(--text); font-size: var(--ycg-type); line-height: 1.5; }
:where(button, input, select, textarea, section, header, footer, div, p, ul, li, details, summary, label, nav, a) { box-sizing: border-box; }
ul { list-style: none; padding: 0; margin: 0; }
[hidden] { display: none !important; }
button, input, select, textarea, a { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; color: var(--raised-text); background: var(--raised); min-block-size: var(--ycg-target); min-inline-size: 24px; border: 1px solid var(--raised-line); border-radius: var(--ycg-radius); padding: 8px 12px; line-height: 1.35; }
button:hover:not(:disabled) { border-color: var(--control-line); background: var(--raised); }
button:disabled { color: var(--raised-muted); cursor: not-allowed; border-style: dashed; }
:where(button, a, input, select, textarea, summary, [tabindex]):focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 3px; box-shadow: 0 0 0 3px var(--surface); }
}
@layer ycg.components {
.dock { position: fixed; bottom: 16px; right: 16px; z-index: calc(var(--ytd-z-index-miniplayer, 2016) - 11); display: flex; gap: 6px; max-width: calc(100vw - 40px); }
.launcher { background: var(--raised); border-color: var(--raised-line); color: var(--raised-text); padding: 8px 10px; min-height: 40px; box-shadow: 0 4px 18px #0002; border-radius: 16px; font-weight: 600; display: inline-flex; align-items: center; gap: 7px; font-size: var(--ycg-small); }
.launcher img { border-radius: 6px; flex-shrink: 0; }
.launcher:hover { background: var(--raised); color: var(--raised-text); }
.dock[data-minimized] { right: var(--ycg-launcher-right, 12px); bottom: var(--ycg-launcher-bottom, 16px); }
.dock[data-minimized] .launcher { width: 44px; height: 44px; padding: 8px; justify-content: center; border-radius: 50%; touch-action: none; user-select: none; cursor: grab; }
.dock[data-dragging] .launcher { cursor: grabbing; }
.panel { contain: layout style; position: fixed; right: var(--ycg-panel-right, 12px); bottom: var(--ycg-panel-bottom, 16px); z-index: calc(var(--ytd-z-index-miniplayer, 2016) - 10); width: var(--ycg-panel-width, 360px); height: var(--ycg-panel-height, calc(100dvh - 96px)); max-width: calc(100vw - 24px); max-height: calc(100dvh - 96px); display: flex; flex-direction: column; background: var(--surface); padding: 6px; border: 1px solid var(--control-line); border-radius: 24px; box-shadow: 0 16px 48px #0003, inset 0 1px 0 #ffffffb3; overflow: hidden; }
.head { background: var(--surface); border-radius: 18px 18px 0 0; padding: 15px 20px 13px; flex-shrink: 0; display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--control-line); align-items: flex-start; cursor: grab; user-select: none; touch-action: none; }
.head:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -5px; }
.head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.resize-edge { position: absolute; z-index: 4; min-block-size: 0; min-inline-size: 0; padding: 0; border: 0; border-radius: 0; background: transparent; touch-action: none; user-select: none; }
.resize-edge:hover { background: color-mix(in srgb, var(--accent-text) 15%, transparent); }
.resize-edge:focus-visible { outline-offset: -4px; }
.resize-edge[data-edge="n"], .resize-edge[data-edge="s"] { left: 20px; right: 20px; height: 6px; }
.resize-edge[data-edge="n"] { top: 0; cursor: n-resize; }
.resize-edge[data-edge="s"] { bottom: 0; cursor: s-resize; }
.resize-edge[data-edge="w"], .resize-edge[data-edge="e"] { top: 20px; bottom: 20px; width: 6px; }
.resize-edge[data-edge="w"] { left: 0; cursor: w-resize; }
.resize-edge[data-edge="e"] { right: 0; cursor: e-resize; }
.resize-edge[data-edge="nw"], .resize-edge[data-edge="ne"], .resize-edge[data-edge="sw"], .resize-edge[data-edge="se"] { min-width: 24px; min-height: 24px; }
.resize-edge[data-edge="nw"] { left: 0; top: 0; cursor: nw-resize; }
.resize-edge[data-edge="ne"] { right: 0; top: 0; cursor: ne-resize; }
.resize-edge[data-edge="sw"] { left: 0; bottom: 0; cursor: sw-resize; }
.resize-edge[data-edge="se"] { right: 0; bottom: 0; cursor: se-resize; }
.panel[data-resizing] { -webkit-backdrop-filter: none; backdrop-filter: none; }
.panel[data-resizing], .panel[data-resizing] * { cursor: var(--ycg-resize-cursor) !important; user-select: none !important; }
.eyebrow { font-size: var(--ycg-small); font-weight: 500; color: var(--text); margin-bottom: 5px; }
h2 { font-size: var(--ycg-title); line-height: 1.25; margin: 0 0 6px; font-weight: 650; letter-spacing: -.6px; }
p { margin: 0; }
:where(h2, h3, p, label, button, summary, a) { overflow-wrap: anywhere; }
.sr-only { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
.skip-link { display: block; padding: 6px 10px; background: var(--surface); }
.skip-link:not(:focus) { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; }
.channel-pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--ycg-gap); margin-block: 10px; }
.channel-memberships { margin-block: 8px; padding-block: 0; border: 0; }
.muted { color: var(--muted-text); font-size: var(--ycg-small); }
.close, .window-control { color: var(--raised-text); border: none; padding: 3px 7px; min-width: 30px; min-height: 30px; display: grid; place-items: center; background: var(--raised); border-radius: 50%; }
.body { background: var(--surface); overflow: auto; overscroll-behavior: contain; flex: 1; min-height: 0; scroll-padding-block: 12px; padding: 15px 16px; }
.links { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 12px; }
a { color: var(--accent-text); text-underline-offset: 3px; }
.links a { color: var(--raised-accent); border: 1px solid var(--control-line); padding: 7px 10px; border-radius: 8px; background: var(--raised); text-decoration: none; font-size: var(--ycg-small); }
.intro { background: var(--surface); padding: 13px 20px; border-radius: 11px; font-size: var(--ycg-small); margin-bottom: 15px; }
.intro strong { display: block; font-size: var(--ycg-small); margin-bottom: 4px; }
.intro.compact { padding: 8px 12px; }
.intro.compact > p, .intro.compact > strong { display: none; }
.intro.compact .links { margin: 0; }
.tools, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tools { margin-bottom: 18px; }
.tools button { font-size: var(--ycg-small); }
.section-label { font-size: var(--ycg-small); letter-spacing: 1px; color: var(--muted-text); font-weight: 600; margin: 16px 0 9px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border-radius: 20px; font-size: var(--ycg-small); padding: 7px 11px; overflow-wrap: anywhere; max-width: 100%; }
.chip[aria-pressed="true"] { color: var(--selection-text); border-color: var(--selection); background: var(--selection); }
.feed-status { color: var(--muted-text); font-size: var(--ycg-small); margin: 10px 0 18px; }
input[type="search"], input[type="text"] { min-width: 0; padding: 10px 11px; border: 1px solid var(--control-line); border-radius: 9px; color: var(--text); background: var(--surface); font-size: var(--ycg-small); }
input[type="search"] { width: 100%; margin-bottom: 12px; }
.channel { border-bottom: 1px solid var(--control-line); padding: 13px 0; }
.channel-identity { display: flex; align-items: center; gap: 10px; margin-block-end: 9px; min-width: 0; }
.channel-name { flex: 1; min-width: 0; }
.channel-avatar { position: relative; display: inline-grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; overflow: hidden; border-radius: 50%; background: var(--raised); color: var(--raised-text); font-size: var(--ycg-small); font-weight: 600; }
.channel-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.channel-identity .channel-path { margin-bottom: 0; }
.channel-title { display: block; font-size: var(--ycg-type); color: var(--text); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
.channel-path { font-size: var(--ycg-small); color: var(--muted-text); margin: 3px 0 9px; overflow-wrap: anywhere; }
.channel-videos { color: var(--raised-accent); display: inline-block; font-size: var(--ycg-small); padding: 5px 9px; border: 1px solid var(--control-line); border-radius: 8px; margin: 0 0 9px; text-decoration: none; background: var(--raised); }
.channel-videos:hover { background: var(--raised); }
.memberships { display: flex; flex-wrap: wrap; gap: 6px; }
.membership { display: inline-flex; align-items: center; gap: 5px; font-size: var(--ycg-small); border: 1px solid var(--control-line); border-radius: 6px; padding: 5px 7px; min-height: 28px; cursor: pointer; max-width: 100%; overflow-wrap: anywhere; }
.membership:has(input:checked) { background: var(--selection); border-color: var(--selection); color: var(--selection-text); }
input[type="checkbox"] { accent-color: var(--selection); margin: 0; flex-shrink: 0; width: 14px; height: 14px; }
.empty { padding: 22px 10px; border: 1px dashed var(--control-line); border-radius: 10px; color: var(--muted-text); font-size: var(--ycg-small); text-align: center; }
.count { font-size: var(--ycg-small); color: var(--muted-text); margin: 2px 0 3px; }
details { margin-top: 20px; border-top: 1px solid var(--control-line); padding-top: 14px; }
summary { cursor: pointer; font-weight: 600; font-size: var(--ycg-small); min-height: 24px; margin-bottom: 12px; }
.group-form { display: flex; gap: 6px; margin-bottom: 8px; }
.group-form input { flex: 1; width: 120px; }
.group-form button { font-size: var(--ycg-small); padding: 8px; }
.danger { color: var(--raised-danger); }
.primary { background: var(--selection); color: var(--selection-text); border-color: var(--selection); }
.primary:hover { background: var(--selection); color: var(--selection-text); text-decoration: underline; }
.primary:disabled { color: var(--selection-text); }
.footer { border-radius: 0 0 18px 18px; flex-shrink: 0; border-top: 1px solid var(--control-line); padding: 10px 20px; background: var(--surface); }
.footer-menu { margin: 0; padding: 0; border: 0; }
.footer-menu > summary { margin-block-end: 4px; }
.footer .tools { margin: 0 0 8px; }
.status { background: var(--surface); font-size: var(--ycg-small); color: var(--accent-text); min-height: 18px; overflow-wrap: anywhere; }
.status.error { color: var(--danger-text); }
.more { width: 100%; margin-top: 10px; }
.ai-assistant { color: var(--text); border: 1px solid var(--control-line); border-radius: 16px; padding: 12px; margin: 0 0 17px; background: var(--surface); }
.ai-assistant summary { margin: 0; color: var(--text); }
.ai-assistant[open] summary { margin-bottom: 10px; }
.ai-assistant select, .ai-assistant textarea { width: 100%; font: inherit; color: var(--text); border: 1px solid var(--control-line); background: var(--surface); border-radius: 8px; padding: 9px; margin: 6px 0; font-size: var(--ycg-small); }
.ai-assistant .tools { margin: 8px 0; }
.ai-assistant .muted { margin: 7px 0; }
.ai-progress, .organization-progress { font-size: var(--ycg-small); overflow-wrap: anywhere; }
.ai-suggestion { margin: 10px 0; border-top: 1px solid var(--control-line); padding-top: 12px; }
.ai-suggestion input[type="text"] { width: 100%; margin: 8px 0 3px; }
.ai-suggestion strong { overflow-wrap: anywhere; font-size: var(--ycg-small); }
.organization-plan { margin: 12px 0; padding: 10px; border: 1px solid var(--control-line); border-radius: 12px; }
.plan-category { margin: 10px 0; }
.plan-category input { width: 100%; margin: 0 0 4px; }
.assignment-edit { margin: 5px 0; padding-top: 6px; }
.assignment-edit summary { margin-bottom: 6px; font-size: var(--ycg-small); overflow-wrap: anywhere; }
.control-label { display: block; font-size: var(--ycg-small); font-weight: 600; margin-top: 8px; }
.ai-actions { position: sticky; top: -15px; z-index: 2; padding: 8px 0; background: var(--surface); border-bottom: 1px solid var(--control-line); }
progress { display: block; width: 100%; height: 7px; margin: 10px 0; accent-color: var(--accent-text); }
.footer select { min-width: 0; max-width: 145px; border: 1px solid var(--control-line); background: var(--surface); color: var(--text); border-radius: 8px; padding: 7px; font: inherit; font-size: var(--ycg-small); }
.ai-preview { max-height: 480px; overflow: auto; overscroll-behavior: contain; }
select:focus-visible, textarea:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 3px; }
.category-tools { display: grid; gap: 8px; justify-items: start; }
.layout-label { margin-top: 4px; font-size: var(--ycg-small); }
.review-pane { background: var(--surface); flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; padding: 0 12px 10px; }
.review-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0; padding: 9px 0; font-size: var(--ycg-small); }
.review-heading h3 { font-size: var(--ycg-small); margin: 0; }
.review-heading h3:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.review-heading button { font-size: var(--ycg-small); padding: 6px 8px; }
.panel[data-review] .head { padding: 10px 20px; align-items: center; }
.panel[data-review] .head .eyebrow, .panel[data-review] .head .layout-label { display: none; }
.panel[data-review] h2 { font-size: max(16px, var(--ycg-type)); margin: 0; }
.review-board { display: none; }
.ai-assistant[data-review] { margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; display: flex; flex-direction: column; flex: 1; min-height: min(420px, 100%); }
.ai-assistant[data-review] > summary, .ai-assistant[data-review] > .assistant-info, .ai-assistant[data-review] > .assistant-settings, .ai-assistant[data-review] > .assistant-purpose, .ai-assistant[data-review] .ai-configuration, .ai-assistant[data-review] .review-entry { display: none !important; }
.ai-assistant[data-review] .review-secondary { flex-shrink: 0; margin: 4px 0; }
.ai-assistant[data-review] .standard-assistant, .ai-assistant[data-review] .organizer { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.ai-assistant[data-review] .ai-actions { position: static; flex-shrink: 0; padding: 0 0 6px; background: transparent; }
.ai-assistant[data-review] .ai-actions .tools { margin: 3px 0; }
.ai-assistant[data-review] .ai-actions button { font-size: var(--ycg-small); padding: 7px 9px; }
.ai-assistant[data-review] .ai-progress, .ai-assistant[data-review] .organization-progress { font-size: var(--ycg-small); }
.ai-assistant[data-review] .muted { margin: 3px 0; font-size: var(--ycg-small); }
.ai-assistant[data-review] .review-home { display: flex; flex: 1; min-height: 0; }
.ai-assistant[data-review] .review-board { display: flex; flex: 1; flex-direction: column; min-height: 140px; }
.review-toolbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 8px; flex-shrink: 0; padding: 8px 0; }
.review-toolbar input[type="search"], .review-toolbar select { margin: 0; padding: 8px; font-size: var(--ycg-small); width: 100%; min-width: 0; }
.review-targets { display: flex; flex-wrap: wrap; gap: 5px; flex-shrink: 0; max-height: 120px; overflow: auto; padding: 5px 0; }
.review-target { white-space: normal; text-align: start; padding: 6px 9px; font-size: var(--ycg-small); max-inline-size: 100%; overflow-wrap: anywhere; border-style: dashed; }
.review-target[data-over] { background: var(--selection); color: var(--selection-text); border-style: solid; }
.review-count, .review-notice { flex-shrink: 0; }
.ai-assistant[data-review] .review-list { flex: 1; min-height: 120px; max-height: none; overflow: auto; padding: 3px; overscroll-behavior: contain; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); align-content: start; gap: 8px; }
.review-card { color: var(--text); margin: 0 0 8px; padding: 9px 10px; border: 1px solid var(--control-line); border-radius: 12px; background: var(--surface); cursor: grab; }
.review-card[data-dragging] { opacity: .5; }
.review-list > .empty { grid-column: 1 / -1; }
.review-drag-label { display: block; font-size: var(--ycg-small); color: var(--muted-text); margin-bottom: 4px; }
.review-card .assignment-edit { margin: 4px 0; padding-top: 3px; border: 0; }
.review-pagination { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0; padding-top: 7px; border-top: 1px solid var(--control-line); }
.review-pagination button { padding: 6px 9px; font-size: var(--ycg-small); }
.ai-assistant[data-review] > .shared-tools { flex-shrink: 0; padding-top: 6px; margin-bottom: 0; }
.ai-assistant[data-review] > .shared-tools button { font-size: var(--ycg-small); padding: 5px 8px; }
}
@layer ycg.preferences {
@media (pointer: coarse) {
  button, input:not([type="checkbox"]), select, summary, .membership, .links a, .channel-videos { min-height: 48px; }
  input:not([type="checkbox"]), select, textarea { font-size: 16px !important; }
  .resize-edge { min-height: 24px; min-width: 24px; }
  .dock[data-minimized] .launcher, .close, .window-control { min-width: 48px; }
  .head, .body, .footer, .review-pane { padding-inline: 24px; }
}
}
@layer ycg.states {
:host([data-ycg-suppressed]) { display: none !important; }
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .panel { background: color-mix(in srgb, var(--surface) 86%, transparent); -webkit-backdrop-filter: blur(22px) saturate(125%); backdrop-filter: blur(22px) saturate(125%); }
  .launcher { background: var(--raised); -webkit-backdrop-filter: blur(18px) saturate(120%); backdrop-filter: blur(18px) saturate(120%); }
  .head, .footer { background: var(--surface); }
  .ai-assistant { background: var(--surface); }
}
:host([data-ycg-theme="dark"]) .panel { box-shadow: 0 20px 56px #0007, inset 0 1px 0 #ffffff1f; }
button, input, select, textarea { transition: box-shadow 120ms ease; }
}
@layer ycg.preferences {
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .panel, .head, .footer, .ai-assistant { background: var(--surface); -webkit-backdrop-filter: none; backdrop-filter: none; }
  .launcher { background: var(--raised); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
@media (forced-colors: active) { .panel, .launcher, .head, .footer, .ai-assistant { background: Canvas; color: CanvasText; -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none; } }
@media (max-height: 600px) { .head { padding-block: 8px; align-items: center; } .head .eyebrow, .head .layout-label { display: none; } .head h2 { font-size: max(16px, var(--ycg-type)); margin: 0; } .footer { max-block-size: 35%; overflow: auto; padding-block: 6px; } .body { min-block-size: 60px; } }
@media (max-height: 480px) { .panel { max-height: calc(100dvh - 24px); } }
@media (max-width: 520px) and (pointer: fine) { .dock:not([data-minimized]) { right: 12px; bottom: 12px; } .head { padding: 13px 20px; } .body { padding: 13px 20px; } }
}
`;
