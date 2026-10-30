import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const runtime=path.resolve(process.env.DSH_REACT_TEST_DIR||'node_modules');
const {build}=require(path.join(runtime,'esbuild'));
const {chromium}=require(process.env.DSH_PLAYWRIGHT_DIR||'playwright');
const output=path.resolve(process.env.DSH_TEST_OUTPUT||'work/switch-crash/stress');
await mkdir(output,{recursive:true});
const react=await build({stdin:{contents:'import * as React from "react";import {createRoot} from "react-dom/client";window.React=React;window.createRoot=createRoot;',resolveDir:path.dirname(runtime)},bundle:true,write:false,format:'iife',nodePaths:[runtime],define:{'process.env.NODE_ENV':'"production"'}});
const bundle=await readFile(process.env.DSH_TEST_BUNDLE||new URL('../client.js',import.meta.url),'utf8');
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1280,height:820},deviceScaleFactor:2}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crashed'));
await page.route('http://scene.test/**',r=>r.fulfill({contentType:'text/html',body:`<style>body{margin:0}#frame{position:relative;height:100vh;display:grid;grid-template-columns:280px 1fr 0}#sidebar{background:#222}#center{min-width:0}[data-conversation-content]{position:relative;height:100vh}[data-composer-card]{position:absolute;left:14%;right:14%;top:50%;height:116px;background:#222;border-radius:20px}[data-shell-overlay]{position:absolute;inset:0;pointer-events:none}#mount{position:relative;z-index:3}</style><div id="frame"><aside id="sidebar"><nav>工作区</nav><div role="tree">会话列表</div><div id="mount"></div></aside><main id="center"><div data-conversation-content data-content-phase="hero"><div data-conversation-scroll><div data-composer-card contenteditable></div></div></div></main><aside data-rightbar-col></aside><div data-shell-overlay></div></div>`}));
await page.goto('http://scene.test/');await page.addScriptTag({content:react.outputFiles[0].text});
await page.evaluate(()=>{
 window.components={};window.disposers=[];window.themeListeners=[];window.preference='light';window.transitionCalls=0;window.transitionActive=0;window.transitionPeak=0;
 const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=(...args)=>{transitionCalls++;transitionActive++;transitionPeak=Math.max(transitionPeak,transitionActive);const view=original(...args);view.finished.then(()=>transitionActive--,()=>transitionActive--);return view;};
 const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const animation=animate.call(this,frames,options);if(options?.pseudoElement==='::view-transition-new(root)'){window.lastReveal=animation;window.lastRevealFrames=frames;window.lastRevealOptions=options;}return animation;};
 window.__ModuleLoader__={load:({factory})=>{window.plugin=factory(name=>{if(name==='react')return React;throw Error(name)})}};
 const emit=()=>themeListeners.forEach(fn=>fn({preference}));
 window.context={theme:{getTheme:()=>({preference}),setTheme:v=>{preference=v;emit()},overrideTokens:(_,tokens)=>{for(const[k,v]of Object.entries(tokens))document.body.style.setProperty(k,v.dark);return()=>{for(const k of Object.keys(tokens))document.body.style.removeProperty(k)}}},on:(_,fn)=>{themeListeners.push(fn);return()=>themeListeners.splice(themeListeners.indexOf(fn),1)},slots:{inject:(_,fn)=>fn(),register:(entry,Component)=>{components[entry.name]=Component}},effect:fn=>disposers.push(fn())};
});
await page.addScriptTag({content:bundle});
await page.evaluate(()=>{plugin.apply(context);window.uiRoot=createRoot(document.querySelector('#mount'));uiRoot.render(React.createElement(components['sidebar.footer.action']));});
await page.getByRole('button',{name:'场景主题',exact:true}).waitFor();
const baseline=process.env.DSH_BASELINE==='1';
const restored=process.env.DSH_EXPECT_REVEAL!=='0';
if(!baseline)assert.equal(await page.locator('.ascii-thumb canvas').count(),0,'Closed picker must not keep hidden preview renderers');
if(restored){
 await page.getByRole('button',{name:'场景主题',exact:true}).click();
 await page.getByRole('button',{name:'蓝天 · 浮云',exact:true}).click();
 await page.waitForFunction(()=>window.lastReveal?.playState==='running');
 for(const time of[0,180,360,600]){
  await page.evaluate(t=>{lastReveal.pause();lastReveal.currentTime=t;},time);
  await page.screenshot({path:output+`/reveal-${time}ms.png`});
 }
 const options=await page.evaluate(()=>lastRevealOptions);assert.equal(options.duration,720);
 await page.evaluate(()=>lastReveal.finish());await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ascii-transition'));
 assert.equal(await page.evaluate(()=>document.getAnimations().length),0,'Completed reveal must release its animation');
 await page.getByRole('button',{name:'关闭主题选择',exact:true}).click();await page.waitForTimeout(80);
}
const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
const samples=[];
for(let round=0;round<20;round++){
 await page.getByRole('button',{name:'场景主题',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.ascii-thumb canvas').length===8);
 // Dispatch actual DOM click events in bursts, including selecting a theme before
 // the previous frame has painted. React hooks and preview effects are real.
 await page.evaluate(async()=>{const cards=[...document.querySelectorAll('.ascii-theme-card')];for(let i=0;i<18;i++){cards[(i+1)%9].click();await new Promise(r=>setTimeout(r,35));}});
 if(restored)await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ascii-transition')&&!document.body.hasAttribute('data-ascii-scene'));
 else await page.waitForTimeout(baseline?850:80);
 await page.getByRole('button',{name:'Claude · 暖夜',exact:true}).click();
 if(restored)await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ascii-transition')&&document.body.dataset.asciiScene==='claude-night');
 else await page.waitForTimeout(baseline?850:60);
 await page.getByRole('button',{name:'关闭主题选择',exact:true}).click();await page.waitForTimeout(80);
 assert.equal(await page.locator('.ascii-shell-scene').count(),1);
 assert.equal(await page.locator('.ascii-clawd').count(),1);
 if(!baseline)assert.equal(await page.locator('.ascii-thumb canvas').count(),0);
 if(round%4===0){await page.setViewportSize({width:round%8?960:1600,height:round%8?720:900});await page.waitForTimeout(100);}
 if(round%5===4){await cdp.send('HeapProfiler.collectGarbage');const metrics=(await cdp.send('Performance.getMetrics')).metrics;const dom=await cdp.send('Memory.getDOMCounters');samples.push({round:round+1,heap:metrics.find(m=>m.name==='JSHeapUsedSize').value,...dom,animations:await page.evaluate(()=>document.getAnimations().length)});}
}
const calls=await page.evaluate(()=>transitionCalls);
const concurrency=await page.evaluate(()=>({active:transitionActive,peak:transitionPeak}));
if(!baseline){if(restored){assert.ok(calls>0);assert.equal(concurrency.peak,1,'Snapshot transitions must never overlap');assert.equal(concurrency.active,0);}else assert.equal(calls,0,'No compositor snapshot transitions');assert.deepEqual(errors,[]);assert.ok(samples.at(-1).heap<samples[0].heap+8e6,'Heap must remain bounded after repeated switching');}
await page.screenshot({path:output+'/after-stress.png'});
if(restored){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'场景主题',exact:true}).click();
 const previous=await page.evaluate(()=>transitionCalls);
 await page.getByRole('button',{name:'夜空 · 月色',exact:true}).click();
 assert.equal(await page.evaluate(()=>transitionCalls),previous,'Reduced motion must bypass reveal');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'蓝天 · 浮云',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ascii-transition'));
 await page.evaluate(()=>[...document.querySelectorAll('.ascii-theme-card')].find(b=>b.textContent.includes('水面 · 纸船')).click());
}
await page.evaluate(()=>{uiRoot.unmount();disposers.reverse().forEach(fn=>fn?.());});await page.waitForTimeout(100);
assert.equal(await page.locator('.ascii-scene-layer,.ascii-clawd,canvas').count(),0);
if(restored){await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-ascii-transition')),false);assert.equal(await page.locator('.ascii-scene-layer,.ascii-clawd,canvas').count(),0);assert.deepEqual(errors,[]);}
const result={kind:'real React DOM in isolated Chromium; not native dsh',selectionActions:restored?381:380,pickerCycles:restored?21:20,dpr:2,viewportResize:true,transitionCalls:calls,concurrency,samples,errors,cleanup:'passed',extraChecks:restored?['reduced motion bypass','unload during reveal with pending selection']:[]};
await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
