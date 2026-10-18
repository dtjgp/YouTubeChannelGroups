const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const watchGeometry=()=>{
 const box=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 return {appWidth:document.querySelector('ytd-app')?.getBoundingClientRect().width,player:box('#movie_player'),scrollX,scrollY};
};
test('real web: isolated anonymous YouTube performance comparison',async()=>{
 test.skip(!process.env.YCG_REAL_WEB,'Run explicitly: no live network in the normal regression suite'); test.setTimeout(180000);
 const out=path.resolve(__dirname,'../../artifacts/quality-v0100/real-web'); await fs.mkdir(out,{recursive:true});
 let executablePath=process.env.YCG_CHROMIUM;
 for(const build of ['1243','1234','1228']){const p=path.join(os.homedir(),`Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);try{await fs.access(p);executablePath ||=p;}catch{}}
 const extension=path.resolve(__dirname,'../../extension'),url='https://www.youtube.com/watch?v=c3XRTFcEBLE&autoplay=0'; const reports=[];
 for(const enabled of [false,true]){
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'ycg-real-web-')); let context,step='launch';
  try{
   context=await chromium.launchPersistentContext(temporary,{executablePath,channel:'chromium',headless:true,viewport:{width:1400,height:1050},args:enabled?[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]:['--disable-extensions']});
   const page=await context.newPage(),cdp=await context.newCDPSession(page); page.setDefaultTimeout(5000); await page.bringToFront(); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.addInitScript(()=>{window.qualityReal={tasks:[],cls:0,lcp:null};new PerformanceObserver(l=>window.qualityReal.tasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.qualityReal.cls+=e.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{window.qualityReal.lcp=l.getEntries().at(-1)?.startTime;}).observe({type:'largest-contentful-paint',buffered:true});});
   step='navigation';let navigationError=null; try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForLoadState('load',{timeout:15000});}catch(error){navigationError=error.message.split('\n')[0];}
   step='metadata';let metadataReady=true;try{await page.locator('ytd-watch-metadata h1').waitFor({state:'visible',timeout:10000});}catch{metadataReady=false;}
   let snapshot=await page.locator('body').ariaSnapshot(); await fs.writeFile(path.join(out,enabled?'enabled.aria.txt':'baseline.aria.txt'),snapshot);
   const reject=page.getByRole('button',{name:/^(Reject all|Reject the use of cookies and other data for the purposes described|Rifiuta tutto|全部拒绝|拒绝全部)$/i});
   const consentRejected=await reject.count()===1;
   if(consentRejected){await reject.click();await expect(reject).toBeHidden();await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});snapshot=await page.locator('body').ariaSnapshot();await fs.writeFile(path.join(out,enabled?'enabled-after-consent.aria.txt':'baseline-after-consent.aria.txt'),snapshot);}
   await page.screenshot({path:path.join(out,enabled?'enabled.png':'baseline.png')});
   const realPlayer=await page.locator('#movie_player').count();
   const data=await page.evaluate(()=>({title:document.title,url:location.href,...window.qualityReal,resources:performance.getEntriesByType('resource').length,navigation:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,load:e.loadEventEnd,transferSize:e.transferSize}))}));
   let panelActions=false;const layoutChecks=[];
   if(enabled&&realPlayer&&await page.getByRole('button',{name:'频道分类',exact:true}).count()===1){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const baseline=await page.evaluate(watchGeometry);
    const verify=async phase=>{await expect.poll(()=>page.evaluate(watchGeometry)).toEqual(baseline);layoutChecks.push({phase,geometry:await page.evaluate(watchGeometry)});};
    layoutChecks.push({phase:'before',geometry:baseline});
    step='open panel';await page.getByRole('button',{name:'频道分类',exact:true}).click();await expect(page.locator('#ycg-root .panel')).toBeVisible();await verify('open');
    step='drag panel';const head=page.locator('#ycg-root .head'),box=await head.boundingBox();await page.mouse.move(box.x+60,box.y+20);await page.mouse.down();await page.mouse.move(box.x+10,box.y+50,{steps:10});await page.mouse.up();
    await verify('move');await page.screenshot({path:path.join(out,'panel-real-page.png')});await head.press('Enter');await verify('reset');
    await expect.poll(async()=>(await page.locator('#ycg-root .panel').boundingBox()).x).toBe(1028);
    const beforeMinimize=await page.locator('#ycg-root .panel').boundingBox();
    step='minimize panel';await page.getByRole('button',{name:'最小化分类窗口',exact:true}).click();await verify('minimize');
    const restore=page.getByRole('button',{name:'恢复频道分类窗口',exact:true}),iconBox=await restore.boundingBox();
    await page.mouse.move(iconBox.x+22,iconBox.y+22);await page.mouse.down();await page.mouse.move(iconBox.x-378,iconBox.y-378,{steps:8});await page.mouse.up();
    await expect(page.locator('#ycg-root .panel')).toBeHidden();await expect.poll(()=>restore.boundingBox()).toEqual({x:iconBox.x-400,y:iconBox.y-400,width:44,height:44});await verify('icon-move');
    await page.screenshot({path:path.join(out,'minimized-real-page.png')});
    await page.getByRole('button',{name:'恢复频道分类窗口',exact:true}).click();await verify('restore');expect(await page.locator('#ycg-root .panel').boundingBox()).toEqual(beforeMinimize);
    step='close panel';await page.getByRole('button',{name:'关闭分类面板',exact:true}).click();await verify('close');panelActions=true;
   }
   step='scroll frames';
   const frameGaps=await page.evaluate(async()=>{const gaps=[];let last=performance.now();for(let i=0;i<30;i++){window.scrollBy(0,i<15?35:-35);await Promise.race([new Promise(requestAnimationFrame),new Promise(resolve=>setTimeout(resolve,150))]);const now=performance.now();gaps.push(now-last);last=now;}return gaps;});
   let channelAvatar;
   if(enabled){
    step='public channel avatar';await page.goto('https://www.youtube.com/@YouTube',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('ytd-page-header-renderer h1, yt-page-header-renderer h1').first().waitFor({state:'visible',timeout:15000});
    await fs.writeFile(path.join(out,'public-channel-dom.json'),JSON.stringify(await page.evaluate(()=>({headings:[...document.querySelectorAll('h1')].map(e=>({text:e.textContent,label:e.getAttribute('aria-label'),html:e.outerHTML})),metadata:[...document.querySelectorAll('meta[property^="og:"]')].map(e=>({property:e.getAttribute('property'),content:e.content}))})),null,2));
    await page.getByRole('button',{name:'频道分类',exact:true}).click();await page.getByRole('button',{name:'加入当前频道',exact:true}).click();
    const card=page.locator('#ycg-root .channel');await expect(card).toHaveCount(1);await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.channel-title')).toHaveText('YouTube');
    const image=card.locator('.channel-avatar img');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    channelAvatar=await image.evaluate(img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight,referrerPolicy:img.referrerPolicy}));
    await page.screenshot({path:path.join(out,'public-channel-avatar.png')});
   }
   reports.push({enabled,navigationError,metadataReady,consentRejected,panelActions,layoutChecks,channelAvatar,realPlayer:Boolean(realPlayer),cpuThrottle:4,frameGaps,...data});
   await fs.writeFile(path.join(out,enabled?'enabled.json':'baseline.json'),JSON.stringify(reports.at(-1),null,2));
  }catch(error){reports.push({enabled,step,error:error.message});}
  finally{await context?.close();await fs.rm(temporary,{recursive:true,force:true});}
 }
 await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify({url,scope:'Two independent anonymous profiles; one navigation per mode; lab evidence, not field Core Web Vitals',reports},null,2));
 expect(reports).toHaveLength(2);
 for(const report of reports){expect(report.error).toBeUndefined();expect(report.navigationError).toBeNull();expect(report.realPlayer).toBe(true);expect(report.metadataReady).toBe(true);}
 expect(reports.find(report=>report.enabled).panelActions).toBe(true);
 expect(reports.find(report=>report.enabled).channelAvatar.width).toBeGreaterThan(0);
});
