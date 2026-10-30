// Compare two real Canvas renderers with the same clock, seed and pointer events.
// DSH_BASELINE_BUNDLE must point to a preserved, known-good client.js.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.DSH_PLAYWRIGHT_DIR||'playwright');
assert.ok(process.env.DSH_BASELINE_BUNDLE,'Set DSH_BASELINE_BUNDLE to the preserved baseline');
const bundles=await Promise.all([process.env.DSH_BASELINE_BUNDLE,process.env.DSH_TEST_BUNDLE||new URL('../client.js',import.meta.url)].map(file=>readFile(file,'utf8')));
const output=path.resolve(process.env.DSH_TEST_OUTPUT||'work/visual-equivalence');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const results=[],errors=[];
try {
  for(const dpr of process.env.DSH_VISUAL_EXTRA?[1.25,2]:[1,2]) {
    const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:dpr});
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<iframe id="before" srcdoc=""></iframe><iframe id="after" srcdoc=""></iframe>');
    const frames=await Promise.all(['before','after'].map(async id=>(await page.$('#'+id)).contentFrame()));
    for(let index=0;index<frames.length;index++) {
      await frames[index].evaluate(()=>{
        // Repeated readback otherwise switches one Canvas from GPU to CPU in
        // the middle of the comparison. Keep both raster backends deterministic.
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,options){return getContext.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);};
        document.body.innerHTML='<style>body{margin:0}#surface{position:relative;width:100vw;height:100vh}canvas{width:100%;height:100%;display:block}button{position:absolute;left:10px;top:10px}</style><div id="surface"><canvas></canvas><button>原生按钮</button><span id="text">可选择的文字</span></div>';
        let now=1000,id=0,seed=17;
        const callbacks=new Map(),listeners=new Set(),observers=new Set();
        const media={matches:false,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
        Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
        performance.now=()=>now;
        window.matchMedia=()=>media;
        window.requestAnimationFrame=fn=>{callbacks.set(++id,fn);return id;};
        window.cancelAnimationFrame=id=>callbacks.delete(id);
        window.ResizeObserver=window.IntersectionObserver=class {
          observe(){observers.add(this);}
          disconnect(){observers.delete(this);}
        };
        window.__ModuleLoader__={load:({factory})=>window.api=factory(()=>({}))};
        window.check={
          start(scene,preview=false){
            now=1000;seed=17;media.matches=false;
            window.renderer=api.scenes.find(item=>item.id===scene).renderer(document.querySelector('canvas'),{motion:true,preview,interactionRoot:document.querySelector('#surface')});
          },
          advance(count){for(let i=0;i<count;i++){now+=1000/60;const queued=[...callbacks.values()];callbacks.clear();for(const fn of queued)fn(now);}},
          gesture({target='surface',endTarget=target,button=0,endButton=button,pointerId=1,endId=pointerId,hold=0,dx=0,selected=false,x=innerWidth*.5,y=innerHeight*.48}={}){
            now=Math.round(now); // Keep exact millisecond boundaries independent of RAF rounding.
            const selection=getSelection();
            if(selected)selection.selectAllChildren(document.querySelector('#text'));
            const count=renderer.stats.frames;
            document.getElementById(target).dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button,pointerId,clientX:x,clientY:y}));
            now+=hold;
            document.getElementById(endTarget).dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:endButton,pointerId:endId,clientX:x+dx,clientY:y}));
            selection.removeAllRanges();
            return renderer.stats.frames-count;
          },
          reduced(value){media.matches=value;for(const fn of listeners)fn();},
          stop(){renderer.dispose();return {frames:callbacks.size,listeners:listeners.size,observers:observers.size,width:document.querySelector('canvas').width,height:document.querySelector('canvas').height};},
        };
      });
      const entry='return { inject: ["theme", "slots"], apply };';
      assert.ok(bundles[index].includes(entry),'Expected generated plugin entry');
      await frames[index].addScriptTag({content:bundles[index].replace(entry,'return { scenes:SCENES };')});
    }
    const scenes=(await frames[0].evaluate(()=>api.scenes.map(scene=>scene.id))).filter(id=>!process.env.DSH_VISUAL_SCENE||id===process.env.DSH_VISUAL_SCENE);
    async function both(fn,arg){for(const frame of frames)await frame.evaluate(fn,arg);}
    async function compare(result,label){
      const diff=await page.evaluate(()=>{
        const canvases=[...document.querySelectorAll('iframe')].map(frame=>frame.contentDocument.querySelector('canvas'));
        const images=canvases.map(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
        if(images[0].length!==images[1].length)return {sizeMismatch:true};
        let differentChannels=0,maxDelta=0,totalDelta=0;
        for(let i=0;i<images[0].length;i++){
          const delta=Math.abs(images[0][i]-images[1][i]);
          if(delta)differentChannels++;maxDelta=Math.max(maxDelta,delta);totalDelta+=delta;
        }
        return {differentChannels,maxDelta,meanDelta:totalDelta/images[0].length,width:canvases[0].width,height:canvases[0].height};
      });
      result.frames.push({label,...diff});
      if(diff.differentChannels!==0) {
        for(let i=0;i<frames.length;i++) {
          const png=await frames[i].evaluate(()=>document.querySelector('canvas').toDataURL().split(',')[1]);
          await writeFile(path.join(output,`${result.scene}-${dpr}-${label}-${i}.png`),Buffer.from(png,'base64'));
        }
      }
      assert.equal(diff.differentChannels,0,`${result.scene}, ${dpr}x, ${label}: ${JSON.stringify(diff)}`);
    }
    async function stop(){for(const frame of frames)assert.deepEqual(await frame.evaluate(()=>check.stop()),{frames:0,listeners:0,observers:0,width:1,height:1});}
    const sizes=process.env.DSH_VISUAL_EXTRA?(dpr===1.25?[[1279,819,false]]:[[1920,1080,false]]):dpr===1?[[1280,820,false],[1600,852,false],[960,720,false],[320,180,true],[1,1,true]]:[[960,720,false]];
    for(const [width,height,preview] of sizes) {
      await page.evaluate(({width,height})=>{for(const frame of document.querySelectorAll('iframe'))frame.style.cssText=`position:absolute;left:0;top:0;border:0;width:${width}px;height:${height}px`;},{width,height});
      for(const scene of scenes) {
        const result={scene,dpr,width,height,preview,frames:[],gestures:[]};results.push(result);
        await both(({scene,preview})=>check.start(scene,preview),{scene,preview});
        await compare(result,'initial');
        if(width===1280||dpr!==1) {
          const invalid=[{button:2},{endButton:2},{endId:2},{hold:651},{dx:6.01},{selected:true},{target:'text',selected:true}];
          for(const event of invalid)for(const frame of frames)assert.equal(await frame.evaluate(event=>check.gesture(event),event),0);
          // Controls and drags must not produce background feedback.
          await both(()=>document.querySelector('button').id='control');
          for(const event of [{target:'control'},{endTarget:'control'}])for(const frame of frames)assert.equal(await frame.evaluate(event=>check.gesture(event),event),0);
          result.gestures.push('right button','changed button','changed pointer','long press','drag','selection','native control');
          await both(()=>check.advance(1));
          // The inclusive 6px / 650ms boundaries are part of the original behavior.
          for(const frame of frames)assert.equal(await frame.evaluate(()=>check.gesture({dx:6,hold:650})),1);
          await compare(result,'click-start');
          // Compare every 60 Hz frame, including the complete 3.8-second water
          // fade after the second click. The intentional burst throttle is tested
          // separately; both versions receive the same accepted gestures here.
          const targets=process.env.DSH_VISUAL_EXTRA?[1,2,15,60]:Array.from({length:396},(_,i)=>i+1);
          // Advance both realms and compare in one browser call. Avoid thousands
          // of protocol round trips while still reading every individual frame.
          const sequence=await page.evaluate(targets=>{
            const windows=[...document.querySelectorAll('iframe')].map(frame=>frame.contentWindow);
            const canvases=windows.map(win=>win.document.querySelector('canvas'));
            const frames=[];let previous=0;
            for(const target of targets){
              for(const win of windows)win.check.advance(target-previous);previous=target;
              if(target===166)for(const win of windows)win.check.gesture({x:win.innerWidth*.35});
              const images=canvases.map(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
              let differentChannels=0,maxDelta=0,totalDelta=0;
              for(let i=0;i<images[0].length;i++)if(images[0][i]!==images[1][i]){
                const delta=Math.abs(images[0][i]-images[1][i]);differentChannels++;maxDelta=Math.max(maxDelta,delta);totalDelta+=delta;
              }
              const diff={label:'frame-'+target,differentChannels,maxDelta,meanDelta:totalDelta/images[0].length,width:canvases[0].width,height:canvases[0].height};
              frames.push(diff);
              if(differentChannels)return {frames,failure:diff,pngs:canvases.map(c=>c.toDataURL().split(',')[1])};
            }
            return {frames};
          },targets);
          result.frames.push(...sequence.frames);
          if(sequence.failure){
            for(let i=0;i<sequence.pngs.length;i++)await writeFile(path.join(output,`${scene}-${dpr}-${sequence.failure.label}-${i}.png`),Buffer.from(sequence.pngs[i],'base64'));
          }
          assert.equal(sequence.failure,undefined,`${scene}, ${dpr}x: ${JSON.stringify(sequence.failure)}`);
        }
        await both(()=>renderer.update({motion:false,quiet:true}));
        await both(()=>check.advance(30));
        await compare(result,'paused-reading');
        for(const frame of frames)assert.equal(await frame.evaluate(()=>check.gesture()),0);
        await both(()=>{check.reduced(true);renderer.update({motion:true,quiet:false});check.advance(30);});
        await compare(result,'reduced-motion');
        for(const frame of frames)assert.equal(await frame.evaluate(()=>check.gesture()),0);
        await stop();
        console.log(`Identical: ${scene} ${width}x${height} @${dpr} (${result.frames.length} frames)`);
      }
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  const report={browser:browser.version(),baselineSHA256:createHash('sha256').update(bundles[0]).digest('hex'),candidateSHA256:createHash('sha256').update(bundles[1]).digest('hex'),kind:'isolated browser, real Canvas; fixed software raster for repeated readback, deterministic clock/seed and observer stubs',comparisons:results.reduce((sum,result)=>sum+result.frames.length,0),differentChannels:0,results,pageErrors:errors};
  await writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`All ${report.comparisons} frame comparisons are pixel-identical.`);
} finally { await browser.close(); }
