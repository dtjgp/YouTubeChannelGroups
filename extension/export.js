(function (root) {
  "use strict";
  const Core = root.YCGCore || (typeof require === "function" ? require("./core.js") : null);
  const csvCell = value => {
    let text = String(value);
    if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const markdown = value => String(value).replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()#+.!|<>-]/g, "\\$&");
  function document(value, format = "json") {
    const state = Core.validate(value), groups = new Map(state.groups.map(group => [group.id, group.name]));
    if (format === "json") return {text: JSON.stringify(state, null, 2), type: "application/json", extension: "json"};
    if (format === "csv") {
      const rows = [["Channel", "URL", "Categories", "Description"], ...state.channels.map(channel => [channel.title, `https://www.youtube.com${channel.id}`, channel.groupIds.map(id => groups.get(id)).join(" | "), channel.description || ""])];
      return {text: "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"), type: "text/csv;charset=utf-8", extension: "csv"};
    }
    if (format === "markdown") {
      const lines = ["# YouTube channels", "", "| Channel | Categories |", "| --- | --- |", ...state.channels.map(channel => `| [${markdown(channel.title)}](https://www.youtube.com${encodeURI(channel.id)}) | ${channel.groupIds.map(id => markdown(groups.get(id))).join(" · ") || "—"} |`)];
      return {text: lines.join("\n") + "\n", type: "text/markdown;charset=utf-8", extension: "md"};
    }
    throw new Error("无效的导出格式");
  }
  root.YCGExport = {document};
  if (typeof module !== "undefined") module.exports = root.YCGExport;
})(globalThis);
