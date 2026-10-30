import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const bundle=(await readFile(new URL('../client.js',import.meta.url),'utf8')).replace('return { inject: ["theme", "slots"], apply };','return {scenes:SCENES};');
try {
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas id="scene"></canvas><button id="control">原生控件</button>');
  await page.evaluate(()=>{
    let now=1000,nextId=0,hidden=false;
    const frames=new Map(),rasters=[],observers=new Set(),listeners=new Set();
    const create=document.createElement.bind(document);
    document.createElement=(name,...args)=>{const node=create(name,...args);if(name==='canvas')rasters.push(node);return node;};
    const Offscreen=window.OffscreenCanvas;
    window.OffscreenCanvas=new Proxy(Offscreen,{construct(Target,args){const canvas=new Target(...args);rasters.push(canvas);return canvas;}});
    Object.defineProperty(document,'hidden',{get:()=>hidden});
    const media={matches:false,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
    window.matchMedia=()=>media;performance.now=()=>now;
    window.requestAnimationFrame=fn=>{frames.set(++nextId,fn);return nextId;};
    window.cancelAnimationFrame=id=>frames.delete(id);
    window.ResizeObserver=class {
      constructor(callback){this.callback=callback;this.kind='resize';}
      observe(){observers.add(this);}disconnect(){observers.delete(this);}
    };
    window.IntersectionObserver=class extends ResizeObserver {constructor(callback){super(callback);this.kind='intersection';}};
    window.__ModuleLoader__={load:({factory})=>window.scenes=factory(()=>({})).scenes};
    window.probe={
      start(id,preview=false,motion=true){
        now=1000;hidden=false;media.matches=false;document.querySelector('#scene').removeAttribute('style');
        window.scene=scenes.find(s=>s.id===id).renderer(document.querySelector('#scene'),{motion,preview,interactionRoot:document.body,seed:17});
      },
      advance(count){for(let i=0;i<count;i++){now+=1000/60;const queue=[...frames.values()];frames.clear();for(const fn of queue)fn(now);}},
      click(after=0,target='scene'){now+=after;const before=scene.stats.frames;for(const type of ['pointerdown','pointerup'])document.getElementById(target).dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:800,clientY:240}));return scene.stats.frames-before;},
      hidden(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'));},
      reduce(value){media.matches=value;for(const fn of listeners)fn();},
      intersect(value){for(const observer of observers)if(observer.kind==='intersection')observer.callback([{isIntersecting:value}]);},
      rasterCount(){return rasters.length;},
      resize(width,height){
        const old=rasters.filter(c=>c.width*c.height>1),canvas=document.querySelector('#scene');
        canvas.style.width=width+'px';canvas.style.height=height+'px';
        for(const observer of observers)if(observer.kind==='resize')observer.callback([{target:canvas}]);
        probe.advance(1);return {oldReleased:old.every(c=>c.width*c.height===1),width:canvas.width,height:canvas.height,cachePixels:scene.stats.backgroundPixels||0};
      },
      state(){return {queued:frames.size,observers:observers.size,listeners:listeners.size,cachePixels:scene.stats.backgroundPixels||0,largeRasters:rasters.filter(c=>c.width*c.height>1).length};},
    };
  });
  await page.addScriptTag({content:bundle});
  const results=[];
  for(const id of await page.evaluate(()=>scenes.map(s=>s.id))){
    const result=await page.evaluate(id=>{
      probe.start(id);probe.advance(2);
      const running=probe.state(),frame=scene.stats.frames,rasters=probe.rasterCount();
      probe.advance(30);const animated=scene.stats.frames-frame,reused=probe.rasterCount()===rasters;
      const resized=probe.resize(640,480);
      probe.intersect(false);const offscreen=probe.state(),offscreenFrames=scene.stats.frames;
      probe.advance(30);const offscreenSleeping=scene.stats.frames===offscreenFrames;probe.intersect(true);
      scene.update({motion:false,quiet:false});const pausedFrame=scene.stats.frames,paused=probe.state();
      const pixels=document.querySelector('#scene').toDataURL();probe.advance(30);
      const frozen=scene.stats.frames===pausedFrame&&pixels===document.querySelector('#scene').toDataURL();
      scene.update({motion:true,quiet:false});probe.hidden(true);const hidden=probe.state(),hiddenFrames=scene.stats.frames;
      probe.advance(30);const sleeping=hiddenFrames===scene.stats.frames;
      probe.hidden(false);probe.reduce(true);const reduced=probe.state();
      probe.reduce(false);scene.dispose();probe.advance(30);const disposed=probe.state();
      probe.start(id,true,false);const preview=probe.state();scene.dispose();
      return {id,running,animated,reused,resized,offscreen,offscreenSleeping,paused,frozen,hidden,sleeping,reduced,disposed,preview,previewDisposed:probe.state()};
    },id);
    assert.equal(result.running.queued,1,id);assert.equal(result.animated,30,id);
    assert.ok(result.reused,`${id}: steady frames must reuse existing bitmaps`);
    const cached=!['claude-night','paper-boats'].includes(id);
    assert.equal(result.running.cachePixels,cached?1920*1440:0,id);
    assert.deepEqual(result.resized,{oldReleased:true,width:1280,height:960,cachePixels:cached?1280*960:0},id);
    assert.equal(result.offscreen.queued,0,id);assert.equal(result.offscreen.cachePixels,0,id);assert.ok(result.offscreenSleeping,id);
    assert.equal(result.paused.queued,0,id);assert.equal(result.paused.cachePixels,0,id);assert.ok(result.frozen,id);
    assert.equal(result.hidden.queued,0,id);assert.equal(result.hidden.cachePixels,0,id);assert.ok(result.sleeping,id);
    assert.equal(result.reduced.queued,0,id);assert.equal(result.reduced.cachePixels,0,id);
    assert.deepEqual(result.disposed,{queued:0,observers:0,listeners:0,cachePixels:0,largeRasters:0},id);
    assert.equal(result.preview.cachePixels,0,id);assert.equal(result.preview.queued,0,id);
    assert.deepEqual(result.previewDisposed,result.disposed,id);
    results.push(result);
  }
  const throttling=await page.evaluate(()=>{
    probe.start('koi-pond');const first=probe.click(),burst=[];
    for(let i=0;i<100;i++)burst.push(probe.click());
    const early=probe.click(499),boundary=probe.click(1),control=probe.click(500,'control');
    const next=probe.click();scene.update({motion:false,quiet:false});const paused=probe.click(500);
    scene.dispose();return {first,burst,early,boundary,control,next,paused};
  });
  assert.equal(throttling.first,1);assert.ok(throttling.burst.every(n=>n===0));assert.equal(throttling.early,0);
  assert.equal(throttling.boundary,1);assert.equal(throttling.control,0);assert.equal(throttling.next,1);assert.equal(throttling.paused,0);
  const fractional=await page.evaluate(()=>{
    probe.start('cloud-drift');const partial=probe.resize(960.25,720.25),aligned=probe.resize(640,480);
    scene.dispose();return {partial,aligned,disposed:probe.state()};
  });
  assert.equal(fractional.partial.cachePixels,0,'A partial device pixel must preserve original edge compositing');
  assert.ok(fractional.partial.oldReleased);assert.equal(fractional.aligned.cachePixels,1280*960);
  assert.equal(fractional.disposed.largeRasters,0);
  assert.deepEqual(errors,[]);
  await mkdir('work/performance-audit',{recursive:true});
  await writeFile('work/performance-audit/resources.json',JSON.stringify({results,throttling,fractional,errors},null,2));
  console.log('Eight scenes: bitmap reuse, resize release, offscreen/hidden/reduced pause, static previews and complete disposal passed. Koi: immediate first response, 500 ms boundary and burst rejection passed. Fractional raster fallback passed.');
}finally{await browser.close();}
