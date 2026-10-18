const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const {spawn, execFileSync} = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {once} = require("node:events");

const binary = path.resolve(__dirname, "../../artifacts/native/ycg-native-host");
const id = "a".repeat(32), origin = `chrome-extension://${id}/`;
let temporary, config, fake, mode, log;
const payload = provider => ({action: "classify", provider, model: "test-model", data: {groups: [], instructions: "用中文分类", channels: [{id: "/@one", title: "One", description: "音乐教学"}]}});
const frame = value => { const body = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length); return Buffer.concat([header, body]); };

function client(allowedOrigin = origin) {
  const child = spawn(binary, [allowedOrigin], {env: {...process.env, YCG_NATIVE_CONFIG: config}});
  let buffer = Buffer.alloc(0), pending = [], replies = [], stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdout.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
      const length = buffer.readUInt32LE(0), value = JSON.parse(buffer.subarray(4, length + 4).toString());
      buffer = buffer.subarray(length + 4);
      const resolve = pending.shift(); if (resolve) resolve(value); else replies.push(value);
    }
  });
  return {child, stderr: () => stderr, next: () => replies.length ? Promise.resolve(replies.shift()) : new Promise(resolve => pending.push(resolve)), send: value => child.stdin.write(frame(value))};
}
before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), "ycg-native-test-"));
  config = path.join(temporary, "config.json"); fake = path.join(temporary, "fake-cli"); mode = path.join(temporary, "mode"); log = path.join(temporary, "calls");
  await fs.writeFile(mode, "valid");
  const program = `#!${process.execPath}\nconst fs=require('node:fs'); const args=process.argv.slice(2); const input=fs.readFileSync(0,'utf8'); const mode=fs.readFileSync(${JSON.stringify(mode)},'utf8'); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,args,input})+'\\n'); if(mode==='slow') {setInterval(()=>{},1000);} else {const data=JSON.parse(input.slice(input.indexOf('\\n\\n待分类 JSON：\\n')+15)); const result={suggestions:data.channels.map(channel=>({channelId:channel.id,groups:['音乐'],reason:'模拟分类',certainty:'medium'}))}; const content=mode==='invalid'?'invalid-json':JSON.stringify(result); if(args.includes('--output-last-message'))fs.writeFileSync(args[args.indexOf('--output-last-message')+1],content);else console.log(JSON.stringify({structured_output:result}));}\n`;
  // Parse the JSON suffix using the first object delimiter, independent of wording.
  await fs.writeFile(fake, program.replace("input.slice(input.indexOf('\\n\\n待分类 JSON：\\n')+15)", "input.slice(input.indexOf('{'))"), {mode: 0o755});
  await fs.writeFile(config, JSON.stringify({origins: [origin], executables: {codex: fake, claude: fake}}));
});
after(async () => { await fs.rm(temporary, {recursive: true, force: true}); });

test("native framing handles multiple messages and status never invokes a model", async () => {
  const connection = client(); connection.send({action: "status"}); connection.send({action: "status"});
  for (let n = 0; n < 2; n++) {
    const result = await connection.next(); assert.equal(result.ok, true); assert.equal(result.version, "0.3.0"); assert.deepEqual(result.providers, ["codex", "claude"]);
  }
  connection.child.stdin.end(); await once(connection.child, "close");
  await assert.rejects(fs.access(log));
});
test("unauthorized origins and oversized frames are rejected before model execution", async () => {
  const wrong = client(`chrome-extension://${"b".repeat(32)}/`);
  wrong.child.stdin.end(frame({action: "status"}));
  assert.equal((await once(wrong.child, "close"))[0], 1);
  const large = client(), header = Buffer.alloc(4); header.writeUInt32LE(100001); large.child.stdin.end(header);
  assert.equal((await once(large.child, "close"))[0], 1);
});
test("only bounded classification operations reach fixed CLI adapters", async () => {
  const connection = client();
  connection.send({action: "shell", command: "arbitrary"}); assert.equal((await connection.next()).ok, false);
  connection.send({...payload("codex"), model: "--bad-flag"}); assert.equal((await connection.next()).ok, false);
  for (const provider of ["codex", "claude"]) {
    connection.send(payload(provider)); const response = await connection.next(); assert.equal(response.ok, true, response.error); assert.equal(response.result.suggestions[0].groups[0], "音乐");
  }
  connection.child.stdin.end(); await once(connection.child, "close");
  const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls[0].args.includes("--ignore-user-config")); assert.ok(calls[0].args.includes("shell_tool"));
  assert.ok(calls[1].args.includes("--restricted")); assert.equal(calls[1].args[calls[1].args.indexOf("--tools") + 1], "");
});
test("disconnect kills an active CLI process group", async () => {
  const previousCalls = (await fs.readFile(log, "utf8")).trim().split("\n").length;
  await fs.writeFile(mode, "slow"); const connection = client(); connection.send(payload("codex"));
  let pid;
  for (let n = 0; n < 100; n++) {
    const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    if (calls.length > previousCalls) { pid = calls.at(-1).pid; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(pid); connection.child.stdin.end(); await once(connection.child, "close");
  for (let n = 0; n < 100; n++) {
    try { process.kill(pid, 0); } catch { pid = null; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(pid, null); await fs.writeFile(mode, "valid");
});
test("timeout kills a slow CLI and leaves the native protocol usable", async () => {
  await fs.writeFile(mode, "slow");
  await fs.writeFile(config, JSON.stringify({origins: [origin], executables: {codex: fake, claude: fake}, requestTimeoutSeconds: 0.2}));
  const connection = client(); connection.send(payload("codex"));
  const response = await connection.next(); assert.equal(response.ok, false); assert.match(response.error, /超时/);
  connection.send({action: "status"}); assert.equal((await connection.next()).ok, true);
  connection.child.stdin.end(); await once(connection.child, "close");
  const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  assert.throws(() => process.kill(calls.at(-1).pid, 0));
  await fs.writeFile(mode, "valid");
  await fs.writeFile(config, JSON.stringify({origins: [origin], executables: {codex: fake, claude: fake}}));
});
test("one-time installation registers exact extension IDs and is repeatable", async () => {
  const home = path.join(temporary, "home");
  const args = ["--install", "--extension-ids", id, "--browsers", "chrome,edge,brave", "--home", home];
  const output = JSON.parse(execFileSync(binary, args, {encoding: "utf8"})); assert.equal(output.registered.length, 3);
  for (const registered of output.registered) {
    assert.ok(registered.startsWith(home)); const manifest = JSON.parse(await fs.readFile(registered, "utf8"));
    assert.deepEqual(manifest.allowed_origins, [origin]); assert.equal(manifest.type, "stdio"); await fs.access(manifest.path, 1);
  }
  execFileSync(binary, args); const before = await fs.readFile(output.registered[0], "utf8");
  assert.throws(() => execFileSync(binary, ["--install", "--extension-ids", "bad", "--home", home], {stdio: "pipe"}));
  assert.equal(await fs.readFile(output.registered[0], "utf8"), before);
});
