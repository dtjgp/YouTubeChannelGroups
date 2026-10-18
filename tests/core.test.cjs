const {test} = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../extension/core.js");

test("avatars accept only bounded HTTPS YouTube image origins", () => {
  for (const host of ["yt3.ggpht.com", "yt3.googleusercontent.com"]) assert.equal(Core.avatar(`https://${host}/channel=s88-c#fragment`), `https://${host}/channel=s88-c`);
  for (const value of [null, "", "/local.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "http://yt3.ggpht.com/x", "https://yt3.ggpht.com.evil.test/x", "https://evil.test/x", "https://yt3.ggpht.com:444/x", "https://user:secret@yt3.ggpht.com/x", "https://i.ytimg.com/thumbnail.jpg", "https://yt3.ggpht.com/" + "x".repeat(2048)]) assert.equal(Core.avatar(value), null);
});

test("avatar updates and alias merges preserve memberships, existing photos and legacy backups", () => {
  const url = "https://yt3.googleusercontent.com/one=s88-c", newer = "https://yt3.ggpht.com/new=s88-c";
  const legacy = {version: 1, groups: [{id: "g", name: "AI"}], channels: [{id: "/@one", title: "One", aliases: ["/@one"], groupIds: ["g"]}]};
  assert.deepEqual(Core.validate(legacy), legacy);
  let state = Core.reduce(legacy, {type: "collect", channels: [{id: "/@one", avatarUrl: url}]});
  assert.equal(state.channels[0].avatarUrl, url);
  for (const avatarUrl of [undefined, "https://evil.test/x"]) state = Core.reduce(state, {type: "collect", channels: [{id: "/@one", avatarUrl}]});
  assert.equal(state.channels[0].avatarUrl, url);
  state = Core.reduce(state, {type: "merge", state: {...legacy, channels: [{...legacy.channels[0], avatarUrl: newer}]}});
  assert.equal(state.channels[0].avatarUrl, newer); assert.deepEqual(state.channels[0].groupIds, ["g"]);
  const bridge = {...legacy, channels: [...legacy.channels, {id: "/channel/UCTwo", title: "Two", aliases: ["/channel/UCTwo"], groupIds: [], avatarUrl: url}]};
  const joined = Core.reduce(bridge, {type: "collect", channels: [{id: "/@one", aliases: ["/channel/UCTwo"]}]});
  assert.equal(joined.channels.length, 1); assert.equal(joined.channels[0].avatarUrl, url);
  assert.equal(Core.validate({...legacy, channels: [{...legacy.channels[0], avatarUrl: "https://evil.test/x"}]}).channels[0].avatarUrl, undefined);
});

test("channel identities normalize handles and reject unsafe origins", () => {
  assert.equal(Core.path("https://www.youtube.com/@Example/videos?view=0"), "/@example");
  assert.equal(Core.path("/@%E6%B5%8B%E8%AF%95"), "/@测试");
  assert.equal(Core.path("/channel/UCAbc123"), "/channel/UCAbc123");
  for (const value of ["javascript:alert(1)", "https://evil.test/@foo", "//evil.test/@foo", "https://youtube.com:444/@foo", "/watch?v=x", "/feed/channels", "/@bad%2Fpath", "/@%ZZ"]) {
    assert.equal(Core.path(value), null, value);
  }
});

test("a channel belongs to several groups; deleting one preserves the others", () => {
  let state = Core.reduce(Core.empty(), {type: "createGroup", name: "AI"}, () => "g1");
  state = Core.reduce(state, {type: "createGroup", name: "编程"}, () => "g2");
  state = Core.reduce(state, {type: "collect", channels: [{id: "/@one", title: "One"}]});
  for (const groupId of ["g1", "g2"]) state = Core.reduce(state, {type: "membership", channelId: "/@one", groupId, checked: true});
  assert.deepEqual(state.channels[0].groupIds, ["g1", "g2"]);
  assert.ok(Core.matches(state.channels[0], "g1"));
  assert.ok(!Core.matches(state.channels[0], "unassigned"));
  state = Core.reduce(state, {type: "deleteGroup", id: "g1"});
  assert.deepEqual(state.channels[0].groupIds, ["g2"]);
  assert.ok(Core.matches(undefined, "unassigned"));
  assert.ok(!Core.matches(undefined, "g2"));
});

test("collecting existing channels preserves memberships and joins known aliases", () => {
  let state = {version: 1, groups: [{id: "g", name: "AI"}], channels: [
    {id: "/@one", title: "One", aliases: ["/@one"], groupIds: ["g"]},
    {id: "/channel/UCOne", title: "One duplicate", aliases: ["/channel/UCOne"], groupIds: []}
  ]};
  state = Core.reduce(state, {type: "collect", channels: [{id: "/@one", title: "One Updated", aliases: ["/channel/UCOne"]}]});
  assert.equal(state.channels.length, 1);
  assert.deepEqual(state.channels[0].groupIds, ["g"]);
  assert.ok(state.channels[0].aliases.includes("/channel/UCOne"));
  assert.equal(state.channels[0].title, "One Updated");
});

test("invalid backup and duplicate group names do not mutate the original state", () => {
  const state = Core.reduce(Core.empty(), {type: "createGroup", name: "AI"}, () => "g");
  const before = structuredClone(state);
  assert.throws(() => Core.reduce(state, {type: "createGroup", name: "ai"}, () => "g2"), /重复/);
  assert.throws(() => Core.reduce(state, {type: "createGroup", name: " "}), /无效/);
  assert.throws(() => Core.validate({version: 2, groups: [], channels: []}), /版本/);
  assert.throws(() => Core.validate({version: 1, groups: [], channels: [{id: "/@one", title: "One", aliases: [], groupIds: ["missing"]}]}), /不存在/);
  assert.throws(() => Core.validate({version: 1, groups: [], channels: [{id: "/@one", title: "One", aliases: ["https://evil.test/@one"], groupIds: []}]}), /地址无效/);
  assert.deepEqual(state, before);
});

test("backup merge preserves existing data and is idempotent", () => {
  let state = {version: 1, groups: [{id: "old", name: "AI"}], channels: [{id: "/@one", title: "One", aliases: ["/@one"], groupIds: ["old"]}]};
  const incoming = {version: 1, groups: [{id: "other", name: "ai"}, {id: "new", name: "音乐"}], channels: [
    {id: "/@one", title: "One", aliases: ["/@one", "/channel/UCOne"], groupIds: ["new"]},
    {id: "/@two", title: "Two", aliases: ["/@two"], groupIds: ["other"]}
  ]};
  state = Core.reduce(state, {type: "merge", state: incoming}, () => "music");
  assert.equal(state.groups.length, 2);
  assert.equal(state.channels.length, 2);
  assert.deepEqual(state.channels[0].groupIds, ["old", "music"]);
  assert.deepEqual(state.channels[1].groupIds, ["old"]);
  assert.deepEqual(Core.reduce(state, {type: "merge", state: incoming}), state);
});

test("group limits and unknown operations fail without data loss", () => {
  const state = {version: 1, groups: Array.from({length: 100}, (_, n) => ({id: `g${n}`, name: `G${n}`})), channels: []};
  assert.throws(() => Core.reduce(state, {type: "createGroup", name: "overflow"}), /100/);
  assert.throws(() => Core.reduce(state, {type: "erase"}), /不支持/);
  assert.equal(state.groups.length, 100);
});
