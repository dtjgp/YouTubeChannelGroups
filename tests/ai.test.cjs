const {test} = require("node:test");
const assert = require("node:assert/strict");
const AI = require("../extension/ai.js"), Core = require("../extension/core.js");
const state = {version: 1, groups: [{id: "manual", name: "手动分类"}], channels: [
  {id: "/@one", title: "One", aliases: ["/@one"], groupIds: ["manual"], description: "视频制作教程"},
  {id: "/@two", title: "Two", aliases: ["/@two"], groupIds: []}
]};
const suggestion = (channelId = "/@one", groups = ["视频制作"]) => ({channelId, groups, reason: "简介提供了主题", certainty: "medium"});

test("native settings migrate legacy bridge data and cloud settings hide secrets", () => {
  const config = AI.settings({provider: "codex", endpoint: "http://127.0.0.1:8765", secret: "fixture"});
  assert.equal(config.model, "");
  assert.equal(AI.publicSettings(config).secret, undefined);
  assert.equal(AI.publicSettings(config).secretConfigured, false);
  assert.equal(config.endpoint, "");
  assert.equal(config.secret, "");
  assert.equal(AI.settings({provider: "claude"}).provider, "claude");
  assert.equal(AI.settings({provider: "api", endpoint: "https://provider.example/v1/", model: "test-model"}).endpoint, "https://provider.example/v1");
  for (const endpoint of ["http://external.test/v1", "https://user:secret@external.test/v1", "https://external.test/v1?key=secret"]) {
    assert.throws(() => AI.settings({provider: "api", endpoint, model: "m"}));
  }
  assert.equal(AI.settings({provider: "codex", endpoint: "https://external.test", secret: "old-secret"}).endpoint, "");
  assert.throws(() => AI.settings({provider: "claude", endpoint: "http://localhost:8765", model: "--bad"}));
});

test("AI input contains only the chosen channels and bounded metadata", () => {
  const data = AI.requestData({...state, channels: state.channels.map(channel => ({...channel, avatarUrl: "https://yt3.ggpht.com/test=s88-c"}))}, ["/@one"], "用中文分类");
  assert.deepEqual(data.channels, [{id: "/@one", title: "One", description: "视频制作教程"}]);
  assert.ok(!JSON.stringify(data).includes("aliases"));
  assert.ok(!JSON.stringify(data).includes("manual"));
  assert.ok(!JSON.stringify(data).includes("avatar"));
  assert.ok(!JSON.stringify(data).includes("ggpht"));
  assert.throws(() => AI.requestData(state, ["/@missing"]));
  assert.throws(() => AI.requestData(state, ["/@one", "/@one"]));
  assert.throws(() => AI.requestData(state, Array.from({length: 21}, (_, i) => `/${i}`)));
});

test("model output must cover each requested channel exactly once", () => {
  assert.equal(AI.parse("```json\n" + JSON.stringify({suggestions: [suggestion()]}) + "\n```", ["/@one"])[0].groups[0], "视频制作");
  assert.throws(() => AI.parse({suggestions: [suggestion("/@unknown")]}, ["/@one"]));
  assert.throws(() => AI.parse({suggestions: [suggestion(), suggestion()]}, ["/@one", "/@two"]));
  assert.throws(() => AI.parse({suggestions: []}, ["/@one"]));
  assert.throws(() => AI.parse({suggestions: [suggestion("/@one", ["1", "2", "3", "4"])]}, ["/@one"]));
  assert.throws(() => AI.parse("not json", ["/@one"]));
  assert.deepEqual(AI.parse({suggestions: [{...suggestion(), groups: [], certainty: "low"}]}, ["/@one"])[0].groups, []);
});

test("applying suggestions is atomic, preserves manual categories and reuses names", () => {
  let sequence = 0;
  const after = Core.reduce(state, {type: "applySuggestions", suggestions: [suggestion("/@one"), suggestion("/@two", ["视频制作", "手动分类"])]}, () => `generated${++sequence}`);
  assert.equal(after.groups.length, 2);
  assert.deepEqual(after.channels[0].groupIds, ["manual", "generated1"]);
  assert.deepEqual(after.channels[1].groupIds, ["generated1", "manual"]);
  assert.equal(state.groups.length, 1);
  assert.deepEqual(Core.reduce(after, {type: "applySuggestions", suggestions: [suggestion()]}), after);
  assert.throws(() => Core.reduce(state, {type: "applySuggestions", suggestions: [suggestion(), suggestion("/@missing")]}));
  assert.equal(state.groups.length, 1);
  assert.deepEqual(state.channels[0].groupIds, ["manual"]);
});

test("all 134 suggestions apply atomically with bounded, unique channel entries", () => {
  const many = {version: 1, groups: [{id: "manual", name: "手动分类"}], channels: Array.from({length: 134}, (_, i) => ({id: `/@bulk${i}`, title: `频道 ${i}`, aliases: [`/@bulk${i}`], groupIds: ["manual"]}))};
  const suggestions = many.channels.map(channel => suggestion(channel.id));
  const before = JSON.stringify(many);
  const after = Core.reduce(many, {type: "applySuggestions", suggestions}, () => "generated");
  assert.equal(after.groups.length, 2);
  assert.ok(after.channels.every(channel => channel.groupIds.join() === "manual,generated"));
  for (const invalid of [
    [...suggestions.slice(0, -1), suggestion("/@missing")],
    [...suggestions, suggestions[0]],
    [...suggestions.slice(0, -1), null],
    Array(10001).fill(suggestions[0])
  ]) assert.throws(() => Core.reduce(many, {type: "applySuggestions", suggestions: invalid}, () => "generated"));
  assert.equal(JSON.stringify(many), before);
});

test("channel descriptions survive collection and backup without replacing richer metadata", () => {
  const updated = Core.reduce(state, {type: "collect", channels: [{id: "/@one", title: "One"}]});
  assert.equal(updated.channels[0].description, "视频制作教程");
  assert.equal(Core.validate(JSON.parse(JSON.stringify(updated))).channels[0].description, "视频制作教程");
});

test("reclassification replaces only selected memberships and supports conflict-safe undo", () => {
  const replaced = Core.reduce(state, {type: "applySuggestions", mode: "replace", suggestions: [suggestion()]}, () => "new");
  assert.deepEqual(replaced.channels[0].groupIds, ["new"]);
  assert.deepEqual(replaced.channels[1], state.channels[1]);
  const entries = [{channelId: "/@one", before: ["manual"], after: ["new"]}];
  const restored = Core.reduce(replaced, {type: "restoreSuggestions", entries});
  assert.deepEqual(restored.channels[0].groupIds, ["manual"]);
  const edited = Core.reduce(replaced, {type: "membership", channelId: "/@one", groupId: "manual", checked: true});
  const snapshot = JSON.stringify(edited);
  assert.throws(() => Core.reduce(edited, {type: "restoreSuggestions", entries}), /后续修改/);
  assert.equal(JSON.stringify(edited), snapshot);
  assert.throws(() => Core.reduce(state, {type: "applySuggestions", mode: "invalid", suggestions: [suggestion()]}));
});
