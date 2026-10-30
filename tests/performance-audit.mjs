// Alternating runtime comparison; keeps browser, load, clock and viewport shared.
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
assert.ok(process.env.DSH_BASELINE_BUNDLE,'Set DSH_BASELINE_BUNDLE to the original client.js');
const bundles=await Promise.all([process.env.DSH_BASELINE_BUNDLE,'client.js'].map(file=>readFile(file,'utf8')));
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const runs=[],comparisons=[],errors=[];
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<style>body{margin:0}iframe{position:absolute;inset:0;width:1920px;height:1080px;border:0}</style><iframe id="before"></iframe><iframe id="after"></iframe>');
  const frames=await Promise.all(['before','after'].map(async id=>(await page.$('#'+id)).contentFrame()));
  for(let i=0;i<frames.length;i++){
    await frames[i].setContent('<style>html,body{margin:0;width:100%;height:100%}canvas{width:100%;height:100%;display:block}</style><canvas></canvas>');
    let code=bundles[i].replace('return { inject: ["theme", "slots"], apply };','return {scenes:SCENES};');
    code=code.replace('const elapsed=performance.now()-started;','const elapsed=performance.now()-started; window.drawCosts?.push(elapsed);').replace('const cost = performance.now() - start;','const cost = performance.now() - start; window.drawCosts?.push(cost);');
    await frames[i].addScriptTag({content:'window.__ModuleLoader__={load:({factory})=>window.scenes=factory(()=>({})).scenes};\n'+code});
  }
  const cdp=await page.context().newCDPSession(page);
  const ids=await frames[0].evaluate(()=>scenes.map(s=>s.id));
  const cases=[...ids.map(scene=>({scene,rate:1,clicks:0})),...ids.map(scene=>({scene,rate:4,clicks:0})),...['koi-pond','paper-boats','honu-lagoon'].map(scene=>({scene,rate:4,clicks:10})),{scene:'koi-pond',rate:1,clicks:10}];
  for(const spec of cases.filter(spec=>!process.env.DSH_PERF_SCENE||spec.scene===process.env.DSH_PERF_SCENE)){
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:spec.rate});
    const pair=[];
    for(const variant of [0,1,1,0]){
      const frame=frames[variant];
      await page.evaluate(variant=>{document.getElementById(variant?'after':'before').style.zIndex='1';document.getElementById(variant?'before':'after').style.zIndex='0';},variant);
      await frame.evaluate(spec=>{window.drawCosts=null;window.scene=scenes.find(s=>s.id===spec.scene).renderer(document.querySelector('canvas'),{interactionRoot:document.body,seed:17});},spec);
      await page.waitForTimeout(700);
      const result=await frame.evaluate(async spec=>{
        const intervals=[];window.drawCosts=[];let previous=0,presses=0,accepted=0;
        const start=performance.now(),initial=scene.stats.frames;
        const timer=spec.clicks?setInterval(()=>{
          const x=innerWidth*(.1+((presses*37)%80)/100),y=innerHeight*(.1+((presses*29)%80)/100),before=scene.stats.frames;
          for(const type of ['pointerdown','pointerup'])document.body.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:x,clientY:y}));
          presses++;if(scene.stats.frames>before)accepted++;
        },1000/spec.clicks):0;
        await new Promise(resolve=>{function tick(now){if(previous)intervals.push(now-previous);previous=now;if(performance.now()-start<2000)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
        clearInterval(timer);const costs=window.drawCosts;window.drawCosts=null;
        costs.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);
        const result={...spec,durationMs:performance.now()-start,presses,accepted,draws:scene.stats.frames-initial,cachePixels:scene.stats.backgroundPixels||0,
          fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),frameP95:intervals[Math.floor(intervals.length*.95)],drawP50:costs[Math.floor(costs.length*.5)],drawP95:costs[Math.floor(costs.length*.95)],meanDrawMs:costs.reduce((a,b)=>a+b,0)/costs.length};
        scene.dispose();return result;
      },spec);
      assert.ok(result.draws>0&&['fps','frameP95','drawP50','drawP95','meanDrawMs'].every(key=>Number.isFinite(result[key])),`${spec.scene}: missing or invalid performance samples`);
      result.variant=variant?'after':'before';pair.push(result);runs.push(result);
    }
    const summary={...spec};
    for(const variant of ['before','after']){
      const selected=pair.filter(r=>r.variant===variant);summary[variant]={};
      for(const key of ['fps','frameP95','drawP50','drawP95','meanDrawMs','cachePixels'])summary[variant][key]=selected.reduce((sum,r)=>sum+r[key],0)/selected.length;
    }
    comparisons.push(summary);console.log(JSON.stringify(summary));
  }
  assert.deepEqual(errors,[],'The performance run must not contain page errors');
  await mkdir('work/performance-audit',{recursive:true});
  await writeFile(`work/performance-audit/${process.env.DSH_PERF_SCENE?'paired-'+process.env.DSH_PERF_SCENE:'paired'}.json`,JSON.stringify({browser:browser.version(),viewport:'1920x1080@1',order:'before, after, after, before per scenario; 700 ms warmup and 2 seconds per run',bundleSHA256:bundles.map(s=>createHash('sha256').update(s).digest('hex')),comparisons,runs},null,2));
}finally{await browser.close();}
