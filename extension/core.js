/* Shared pure state operations. No network or browser APIs. */
(function (root) {
  "use strict";
  const KEY = "ycg.state.v1";
  const MAX_BYTES = 4 * 1024 * 1024;
  const empty = () => ({version: 1, groups: [], channels: []});
  const fail = (message) => { throw new Error(message); };
  const string = (value, max, label) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) fail(`${label}无效`);
    return value.trim();
  };

  function path(value) {
    try {
      if (typeof value !== "string" || value.length > 2048) return null;
      const url = new URL(value, "https://www.youtube.com");
      if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (parts[0]?.startsWith("@") && /^@[\p{L}\p{N}_.·-]{1,100}$/u.test(parts[0])) {
        return "/" + parts[0].toLowerCase();
      }
      if (["channel", "c", "user"].includes(parts[0]) && /^[\p{L}\p{N}_.-]{1,160}$/u.test(parts[1] || "")) {
        return `/${parts[0]}/${parts[1]}`;
      }
      return null;
    } catch { return null; }
  }

  function avatar(value) {
    try {
      if (typeof value !== "string" || value.length > 2048) return null;
      const url = new URL(value);
      if (url.protocol !== "https:" || !["yt3.ggpht.com", "yt3.googleusercontent.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
      url.hash = "";
      return url.href;
    } catch { return null; }
  }

  function validate(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.channels)) fail("备份格式或版本不支持");
    if (value.groups.length > 100 || value.channels.length > 10000) fail("最多支持 100 个分类、10000 个频道");
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) fail("备份过大，最多 4 MB");
    const groupIds = new Set(), groupNames = new Set(), identities = new Set();
    const groups = value.groups.map(group => {
      const id = string(group?.id, 200, "分类 ID"), name = string(group?.name, 40, "分类名称");
      if (groupIds.has(id) || groupNames.has(name.toLowerCase())) fail("分类重复");
      groupIds.add(id); groupNames.add(name.toLowerCase());
      return {id, name};
    });
    const channels = value.channels.map(channel => {
      const id = path(channel?.id), title = string(channel?.title, 200, "频道名称");
      if (!id || id !== channel.id || !Array.isArray(channel.aliases) || !Array.isArray(channel.groupIds)) fail("频道格式无效");
      if (channel.aliases.length > 20 || channel.groupIds.length > 100) fail("频道数据过长");
      const aliases = [...new Set([id, ...channel.aliases.map(alias => {
        const normalized = path(alias);
        if (!normalized) fail("频道地址无效");
        return normalized;
      })])];
      for (const alias of aliases) {
        if (identities.has(alias)) fail("频道地址重复");
        identities.add(alias);
      }
      const memberships = [...new Set(channel.groupIds)];
      if (memberships.some(id => !groupIds.has(id))) fail("频道引用了不存在的分类");
      const description = typeof channel.description === "string" ? channel.description.trim().slice(0, 600) : "";
      const avatarUrl = avatar(channel.avatarUrl);
      return {id, title, aliases, groupIds: memberships, ...(description ? {description} : {}), ...(avatarUrl ? {avatarUrl} : {})};
    });
    return {version: 1, groups, channels};
  }

  function upsert(state, candidates) {
    if (!Array.isArray(candidates) || candidates.length > 10000) fail("频道列表无效");
    const owners = new Map(), rank = new Map(), removed = new Set();
    state.channels.forEach((channel, i) => { rank.set(channel, i); channel.aliases.forEach(alias => owners.set(alias, channel)); });
    for (const item of candidates) {
      const id = path(item?.id);
      if (!id) continue;
      const aliases = [...new Set([id, ...(Array.isArray(item.aliases) ? item.aliases : []).map(path).filter(Boolean)])].slice(0, 20);
      const matches = [...new Set(aliases.map(alias => owners.get(alias)).filter(Boolean))].sort((a, b) => rank.get(a) - rank.get(b));
      const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 200) : id;
      let keep = matches[0];
      if (!keep) {
        keep = {id, title, aliases, groupIds: []}; rank.set(keep, state.channels.length); state.channels.push(keep);
      } else {
        matches.forEach(channel => channel.aliases.forEach(alias => { if (owners.get(alias) === channel) owners.delete(alias); }));
        keep.aliases = [...new Set([...aliases, ...matches.flatMap(channel => channel.aliases)])].slice(0, 20);
        if (!keep.aliases.includes(keep.id)) keep.aliases[19] = keep.id;
        keep.groupIds = [...new Set(matches.flatMap(channel => channel.groupIds))];
        if (title !== id) keep.title = title;
        matches.slice(1).forEach(channel => removed.add(channel));
      }
      if (typeof item.description === "string" && item.description.trim()) keep.description = item.description.trim().slice(0, 600);
      const avatarUrl = avatar(item.avatarUrl) || keep.avatarUrl || matches.find(channel => channel.avatarUrl)?.avatarUrl;
      if (avatarUrl) keep.avatarUrl = avatarUrl;
      keep.aliases.forEach(alias => owners.set(alias, keep));
    }
    if (removed.size) state.channels = state.channels.filter(channel => !removed.has(channel));
    return state;
  }

  function reduce(value, action, makeId = () => root.crypto.randomUUID()) {
    const state = validate(value);
    switch (action?.type) {
      case "collect": upsert(state, action.channels); break;
      case "createGroup": {
        const name = string(action.name, 40, "分类名称");
        state.groups.push({id: makeId(), name});
        break;
      }
      case "renameGroup": {
        const group = state.groups.find(group => group.id === action.id);
        if (!group) fail("分类已不存在");
        group.name = string(action.name, 40, "分类名称");
        break;
      }
      case "removeChannel": {
        const count = state.channels.length;
        state.channels = state.channels.filter(channel => channel.id !== action.channelId);
        if (state.channels.length === count) fail("频道已不存在");
        break;
      }
      case "deleteGroup":
        state.groups = state.groups.filter(group => group.id !== action.id);
        state.channels.forEach(channel => { channel.groupIds = channel.groupIds.filter(id => id !== action.id); });
        break;
      case "membership": {
        const channel = state.channels.find(channel => channel.id === action.channelId);
        if (!channel || !state.groups.some(group => group.id === action.groupId) || typeof action.checked !== "boolean") fail("频道或分类已不存在");
        channel.groupIds = channel.groupIds.filter(id => id !== action.groupId);
        if (action.checked) channel.groupIds.push(action.groupId);
        break;
      }
      case "applySuggestions": {
        const mode = action.mode ?? "add";
        if (!["add", "replace"].includes(mode)) fail("分类应用方式无效");
        if (!Array.isArray(action.suggestions) || !action.suggestions.length || action.suggestions.length > 10000) fail("一次应用 1–10000 个频道建议");
        const channels = new Map(state.channels.map(channel => [channel.id, channel])), seen = new Set();
        for (const suggestion of action.suggestions) {
          const channel = channels.get(suggestion?.channelId);
          if (!channel || seen.has(channel.id) || !Array.isArray(suggestion.groups) || !suggestion.groups.length || suggestion.groups.length > 3) fail("频道或建议已失效，请重新预览");
          seen.add(channel.id);
          if (mode === "replace") channel.groupIds = [];
          for (const value of suggestion.groups) {
            const name = string(value, 40, "分类名称");
            let group = state.groups.find(item => item.name.toLowerCase() === name.toLowerCase());
            if (!group) { group = {id: makeId(), name}; state.groups.push(group); }
            if (!channel.groupIds.includes(group.id)) channel.groupIds.push(group.id);
          }
        }
        break;
      }
      case "applyOrganization": {
        if (JSON.stringify(state) !== JSON.stringify(validate(action.base))) fail("频道或分类已变更，请重新生成精简方案");
        if (!Array.isArray(action.names) || !action.names.length || action.names.length > 20) fail("精简方案需要 1–20 个分类");
        const oldGroups = state.groups;
        state.groups = action.names.map(value => {
          const name = string(value, 40, "分类名称");
          return {id: oldGroups.find(group => group.name.toLowerCase() === name.toLowerCase())?.id || makeId(), name};
        });
        if (new Set(state.groups.map(group => group.name.toLowerCase())).size !== state.groups.length) fail("精简方案包含重复分类");
        if (!Array.isArray(action.suggestions) || action.suggestions.length !== state.channels.length || !state.channels.length) fail("精简分类必须覆盖全部已收集频道");
        const assignments = new Map(), channelIds = new Set(state.channels.map(channel => channel.id));
        for (const item of action.suggestions) {
          if (!item || assignments.has(item.channelId) || !channelIds.has(item.channelId) || !Array.isArray(item.groups) || item.groups.length > 3) fail("频道或建议已失效，请重新预览");
          const ids = item.groups.map(name => {
            const group = state.groups.find(group => group.name === name);
            if (!group) fail("AI 使用了方案以外的分类，本批未接受");
            return group.id;
          });
          assignments.set(item.channelId, [...new Set(ids)]);
        }
        state.channels.forEach(channel => { channel.groupIds = assignments.get(channel.id); });
        break;
      }
      case "restoreSuggestions": {
        if (!Array.isArray(action.entries) || !action.entries.length || action.entries.length > 10000) fail("没有可撤销的 AI 分类");
        const seen = new Set();
        for (const entry of action.entries) {
          const channel = state.channels.find(channel => channel.id === entry?.channelId);
          if (!channel || seen.has(channel.id) || !Array.isArray(entry.before) || !Array.isArray(entry.after)
              || entry.before.length > 100 || entry.after.length > 100
              || entry.before.some(id => !state.groups.some(group => group.id === id))
              || channel.groupIds.length !== entry.after.length || channel.groupIds.some(id => !entry.after.includes(id))) {
            fail("分类已发生后续修改，无法安全撤销；请手动调整或恢复备份");
          }
          seen.add(channel.id); channel.groupIds = [...new Set(entry.before)];
        }
        break;
      }
      case "merge": {
        const incoming = validate(action.state), map = new Map();
        for (const group of incoming.groups) {
          let existing = state.groups.find(item => item.name.toLowerCase() === group.name.toLowerCase());
          if (!existing) {
            existing = {id: makeId(), name: group.name};
            state.groups.push(existing);
          }
          map.set(group.id, existing.id);
        }
        upsert(state, incoming.channels);
        const owners = new Map(state.channels.flatMap(channel => channel.aliases.map(alias => [alias, channel])));
        for (const channel of incoming.channels) {
          const target = owners.get(channel.id);
          if (target) target.groupIds = [...new Set([...target.groupIds, ...channel.groupIds.map(id => map.get(id))])];
        }
        break;
      }
      default: fail("不支持的操作");
    }
    return validate(state);
  }

  function matches(channel, filter) {
    return filter === "all" || (filter === "unassigned" ? !channel?.groupIds.length : !!channel?.groupIds.includes(filter));
  }

  function browse(state, {filter = "all", query = "", page = 0, language = "zh-CN"} = {}) {
    if (typeof query !== "string" || query.length > 200 || !Number.isInteger(page) || page < 0 || page > 10000) fail("频道查询无效");
    if (!["all", "unassigned", ...state.groups.map(group => group.id)].includes(filter)) filter = "all";
    const counts = Object.fromEntries(state.groups.map(group => [group.id, 0]));
    let unassigned = 0;
    for (const channel of state.channels) { if (!channel.groupIds.length) unassigned++; channel.groupIds.forEach(id => { counts[id]++; }); }
    const needle = query.trim().toLowerCase(), collator = new Intl.Collator(language === "en" ? "en" : "zh-CN");
    const matchesQuery = state.channels.filter(channel => matches(channel, filter) && (!needle || `${channel.title} ${channel.aliases.join(" ")}`.toLowerCase().includes(needle))).sort((a, b) => collator.compare(a.title, b.title));
    const pages = Math.max(1, Math.ceil(matchesQuery.length / 20)); page = Math.min(page, pages - 1);
    return {counts, unassigned, total: matchesQuery.length, pages, page, channels: matchesQuery.slice(page * 20, page * 20 + 20)};
  }
  const indexes = new WeakMap();
  function channelMap(state) { if (!indexes.has(state)) indexes.set(state, new Map(state.channels.map(channel => [channel.id, channel]))); return indexes.get(state); }
  // Versions before 0.12.0 read YouTube's hidden tooltip too and saved "Name Name".
  // A real name such as "Duran Duran" would also shrink here; the next collection restores it.
  function repairDoubledNames(state) {
    let repaired = 0;
    const channels = state.channels.map(channel => {
      const match = /^(.+) \1$/u.exec(channel.title);
      if (!match) return channel;
      repaired++;
      return {...channel, title: match[1]};
    });
    return {state: repaired ? {...state, channels} : state, repaired};
  }
  const api = {channelMap, KEY, MAX_BYTES, empty, path, avatar, validate, reduce, matches, browse, repairDoubledNames};
  root.YCGCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
