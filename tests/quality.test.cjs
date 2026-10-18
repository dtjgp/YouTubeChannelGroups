const {test} = require('node:test');
const assert = require('node:assert/strict');
const Design = require('../extension/design.js');
const Theme = require('../extension/theme.js');
const Privacy = require('../extension/privacy.js');
const Core = require('../extension/core.js');
const Work = require('../extension/work.js');

test('derived colors meet AA for light, dark and low-contrast custom YouTube themes without changing the source', () => {
  const themes = [Theme.fallback(), Theme.fallback(true)];
  for (let n = 0; n < 256; n += 7) themes.push({mode: n < 128 ? 'dark' : 'light', colors: Object.fromEntries(Object.keys(Theme.fallback().colors).map(k => [k, `rgb(${n}, ${255-n}, ${n})`]))});
  for (const theme of themes) {
    const original = structuredClone(theme), v = Design.surfaces(theme);
    for (const key of ['text','muted-text','accent-text','danger-text']) assert.ok(Design.ratio(Design.parse(v[key]), Design.parse(v.surface)) >= 4.5, key + ' ' + JSON.stringify(v));
    for (const key of ['raised-text','raised-muted','raised-accent','raised-danger']) assert.ok(Design.ratio(Design.parse(v[key]), Design.parse(v.raised)) >= 4.5, key);
    for (const key of ['control-line','focus-ring']) assert.ok(Design.ratio(Design.parse(v[key]), Design.parse(v.surface)) >= 3);
    assert.ok(Design.ratio(Design.parse(v.selection), Design.parse(v['selection-text'])) >= 4.5);
    assert.deepEqual(theme, original);
  }
  assert.deepEqual(Design.parse('#fff8'), [255,255,255,136/255]);
  assert.deepEqual(Design.parse('hsl(0 100% 50%)'), [255,0,0,1]);
});

test('delete removes channels, secrets, undo, theme and preferences, keeps only the paused tombstone, and revokes optional hosts', async () => {
  const values = {'ycg.state.v1': {channels: ['fixture']}, 'ycg.ai.settings.v1': {secret: 'fake'}, 'ycg.ai.undo.v1': {before: 'fixture'}, 'ycg.theme.v1': {}, 'ycg.preferences.v1': {}, 'ycg.panel-size.v1': {}, 'ycg.launcher-position.v1': {right: 100, bottom: 80}};
  const storage = {async get() {return structuredClone(values);}, async set(data) {Object.assign(values,data);}, async remove(keys) {keys.forEach(k=>delete values[k]);}};
  let origins = ['https://www.youtube.com/*','https://model.example/*'];
  const permissions = {async getAll() {return {origins};}, async remove(data) {origins = origins.filter(o=>!data.origins.includes(o)); return true;}};
  const result = await Privacy.erase(storage,permissions,{content_scripts:[{matches:['https://www.youtube.com/*']}]},'new-epoch');
  assert.deepEqual(Object.keys(values),[Privacy.KEY]);
  assert.deepEqual(values[Privacy.KEY],{epoch:'new-epoch',collectionPaused:true});
  assert.deepEqual(origins,['https://www.youtube.com/*']); assert.equal(result.revoked,1); assert.deepEqual(result.remaining,[]);
  assert.throws(()=>Privacy.assertCurrent(result.privacy,null),/旧操作/);
  assert.doesNotThrow(()=>Privacy.assertCurrent(result.privacy,'new-epoch'));
});

test('a denied permission removal is reported accurately and cannot prevent local data erasure', async () => {
  const values = {secret:'fake'};
  const result = await Privacy.erase({async get(){return {...values};},async set(v){Object.assign(values,v);},async remove(keys){keys.forEach(k=>delete values[k]);}}, {async getAll(){return {origins:['https://model.example/*']};},async remove(){throw Error('denied');}}, {}, 'next');
  assert.deepEqual(Object.keys(values),[Privacy.KEY]); assert.notEqual(result.remaining.length,0);
});

test('background browsing pages a full 10000-channel collection with exact category counts and bounded results', () => {
  const state={version:1,groups:[{id:'g',name:'分类'}],channels:Array.from({length:10000},(_,n)=>({id:`/@c${n}`,title:`频道 ${String(n).padStart(5,'0')}`,aliases:[`/@c${n}`],groupIds:n%2?['g']:[]}))};
  const page=Core.browse(state,{filter:'g',page:249});
  assert.equal(page.total,5000); assert.equal(page.counts.g,5000); assert.equal(page.unassigned,5000); assert.equal(page.channels.length,20); assert.equal(page.page,249);
  const query=Core.browse(state,{query:'09999'}); assert.equal(query.total,1); assert.equal(query.channels[0].id,'/@c9999');
  assert.throws(()=>Core.browse(state,{query:'a'.repeat(201)}),/查询/);
});

test('indexed collection still merges alias bridges in original order and preserves all memberships', () => {
  const state={version:1,groups:[{id:'a',name:'A'},{id:'b',name:'B'}],channels:[{id:'/@first',title:'First',aliases:['/@first'],groupIds:['a']},{id:'/channel/UCSecond',title:'Second',aliases:['/channel/UCSecond'],groupIds:['b']}]};
  const result=Core.reduce(state,{type:'collect',channels:[{id:'/@first',title:'Joined',aliases:['/@first','/channel/UCSecond']} ]});
  assert.equal(result.channels.length,1); assert.equal(result.channels[0].id,'/@first'); assert.deepEqual(result.channels[0].groupIds,['a','b']);
});

test('cancelled chunked work does not append stale results after yielding', async () => {
  let active=true, visited=[];
  const promise=Work.each([1,2,3],item=>{visited.push(item); if(item===1)active=false;},()=>active,0);
  assert.equal(await promise,false); assert.deepEqual(visited,[1]);
});
