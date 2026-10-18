const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
// Explicit opt-in: this fixture keeps one disposable native window open for a real screen-reader walkthrough.
test('manual accessibility: temporary VoiceOver walkthrough',async()=>{
 test.skip(!process.env.YCG_VOICEOVER,'Run explicitly for the native screen-reader walkthrough'); test.setTimeout(600000);
 const out=path.resolve(__dirname,'../../artifacts/quality-v0100/voiceover'); await fs.mkdir(out,{recursive:true});
 const done=path.join(out,'finished');await fs.rm(done,{force:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ycg-voiceover-'));
 let context;try{
  let executablePath=process.env.YCG_CHROMIUM;
  for(const build of ['1243','1234','1228']){const p=path.join(os.homedir(),`Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);try{await fs.access(p);executablePath ||=p;}catch{}}
  const extension=path.resolve(__dirname,'../../extension');
  context=await chromium.launchPersistentContext(profile,{executablePath,channel:'chromium',headless:false,viewport:{width:1400,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({'ycg.state.v1':{version:1,groups:[{id:'learn',name:'学习'}],channels:[{id:'/@demo',title:'示例学习频道',aliases:['/@demo'],groupIds:[]}]}}));
  const page=await context.newPage();await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>YCG · VoiceOver 验证 · 临时示例数据</title><style>body{background:white;color:#111;font:16px system-ui}ytd-app{display:block}</style><body><ytd-app><h1>无障碍验证：临时示例数据</h1><p>此页面没有真实订阅或 AI 连接。</p></ytd-app></body></html>'}));
  await page.goto('https://www.youtube.com/feed/subscriptions');await page.getByRole('button',{name:'频道分类',exact:true}).click();await page.getByRole('checkbox',{name:'示例学习频道：学习',exact:true}).focus();await page.bringToFront();
  await fs.writeFile(path.join(out,'ready.json'),JSON.stringify({title:await page.title(),extensionId:new URL(worker.url()).host}));console.log('Temporary VoiceOver fixture ready');
  const deadline=Date.now()+540000;while(Date.now()<deadline){try{await fs.access(done);break;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
  await fs.writeFile(path.join(out,'final-aria.txt'),await page.locator('#ycg-root').ariaSnapshot());
  await page.screenshot({path:path.join(out,'final.png')});
  await fs.writeFile(path.join(out,'final-state.json'),JSON.stringify(await worker.evaluate(()=>chrome.storage.local.get(null)),null,2));
  const manual=JSON.parse(await fs.readFile(path.join(out,'walkthrough.json'),'utf8'));test.skip(manual.status!=='passed',manual.reason||'Native screen-reader walkthrough not completed');
  expect(await page.locator('#ycg-root').count()).toBe(1);
 }finally{await context?.close();await fs.rm(profile,{recursive:true,force:true});}
});
