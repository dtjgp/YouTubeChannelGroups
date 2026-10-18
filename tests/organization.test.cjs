const {test} = require("node:test");
const assert = require("node:assert/strict");
const AI = require("../extension/ai.js"), Core = require("../extension/core.js");
const state = {version: 1, groups: [{id: "old", name: "旧分类"}], channels: Array.from({length: 134}, (_, i) => ({id: `/@channel${i}`, title: `频道${i}`, aliases: [`/@channel${i}`], description: "简介".repeat(300), groupIds: ["old"]}))};
const planAnswer = count => ({suggestions: Array.from({length: 20}, (_, i) => ({channelId: `/ycg-category/${i + 1}`, groups: i < count ? [`分类${i + 1}`] : [], reason: "范围说明", certainty: "high"}))});

test("natural category counts accept exact numbers, bounds and ranges without confusing per-channel limits", () => {
  for (const text of ["合并成 6 大类", "分为六个分类", "Use 6 categories", "目前20类，合并成6类，每个频道最多3类"]) assert.deepEqual(AI.countRule(text), {min: 6, max: 6});
  assert.deepEqual(AI.countRule("控制在4–6类"), {min: 4, max: 6});
  assert.deepEqual(AI.countRule("between 4 and 6 categories"), {min: 4, max: 6});
  assert.deepEqual(AI.countRule("最多八类"), {min: 1, max: 8});
  assert.deepEqual(AI.countRule("at most 8 categories"), {min: 1, max: 8});
  assert.deepEqual(AI.countRule("至少3类"), {min: 3, max: 20});
  assert.deepEqual(AI.countRule("尽量精简，保留音乐"), {min: 1, max: 20});
  for (const text of ["0类", "21类", "6–4类"]) assert.throws(() => AI.countRule(text));
});

test("bounded planning uses representative samples and rejects count violations and duplicate categories", () => {
  const data = AI.planData(state, "合并成3类" + "。".repeat(690));
  assert.equal(data.channels.length, 20); assert.ok(data.instructions.length <= 1000);
  assert.ok(data.channels.every(channel => channel.description.length <= 600 && channel.title.length <= 200));
  assert.ok(!JSON.stringify(data).includes('"aliases"'));
  assert.deepEqual(AI.parsePlan({suggestions: planAnswer(3).suggestions.reverse()}, "3类").map(item => item.name), ["分类1", "分类2", "分类3"]);
  assert.throws(() => AI.parsePlan(planAnswer(4), "3类"), /数量/);
  const duplicate = planAnswer(3); duplicate.suggestions[1].groups = ["分类1"];
  assert.throws(() => AI.parsePlan(duplicate, "3类"), /重复/);
  const multiple = planAnswer(3); multiple.suggestions[0].groups.push("另一个");
  assert.throws(() => AI.parsePlan(multiple, "3类"), /只能/);
  assert.throws(() => AI.planData(state, "")); assert.throws(() => AI.planData(Core.empty(), "3类"));
});

test("fixed taxonomy blocks category growth across batches and preserves canonical names", () => {
  const value = {suggestions: [{channelId: "/@channel0", groups: ["ai"], reason: "主题", certainty: "high"}]};
  assert.deepEqual(AI.parseFixed(value, ["/@channel0"], ["AI", "音乐"])[0].groups, ["AI"]);
  value.suggestions[0].groups = ["新分类"];
  assert.throws(() => AI.parseFixed(value, ["/@channel0"], ["AI", "音乐"]), /方案以外/);
  assert.throws(() => AI.taxonomyNames(["AI", "ai"]), /重复/);
});

test("organization atomically replaces the entire taxonomy, covers all channels and rejects stale or invalid plans", () => {
  const suggestions = state.channels.map((channel, i) => ({channelId: channel.id, groups: i ? ["科技"] : []}));
  const action = {type: "applyOrganization", base: state, names: ["科技", "生活"], suggestions};
  let sequence = 0;
  const after = Core.reduce(state, action, () => `new${++sequence}`);
  assert.deepEqual(after.groups, [{id: "new1", name: "科技"}, {id: "new2", name: "生活"}]);
  assert.deepEqual(after.channels[0].groupIds, []);
  assert.ok(after.channels.slice(1).every(channel => channel.groupIds.join() === "new1"));
  assert.equal(after.channels[0].description, state.channels[0].description);
  assert.deepEqual(state.channels[0].groupIds, ["old"]);
  const snapshot = JSON.stringify(state);
  for (const invalid of [
    {...action, suggestions: suggestions.slice(1)},
    {...action, suggestions: [suggestions[0], ...suggestions.slice(0, -1)]},
    {...action, suggestions: [{channelId: "/@missing", groups: ["科技"]}, ...suggestions.slice(1)]},
    {...action, names: ["科技", "科技"]},
    {...action, suggestions: [{channelId: state.channels[0].id, groups: ["越界分类"]}, ...suggestions.slice(1)]}
  ]) assert.throws(() => Core.reduce(state, invalid, () => `new${++sequence}`));
  const edited = Core.reduce(state, {type: "renameGroup", id: "old", name: "手工修改"});
  assert.throws(() => Core.reduce(edited, action), /已变更/);
  assert.equal(JSON.stringify(state), snapshot);
});
