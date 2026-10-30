import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.DSH_PLAYWRIGHT_DIR||'playwright');
const common=['palette.js','scene.js','companion.js','ambient.js'];
const names=[...common,...(await readdir(new URL('../src/',import.meta.url))).filter(n=>n.endsWith('.js')&&!common.includes(n)&&!['client.js','themes.js'].includes(n)).sort(),'themes.js'];
const sceneId=process.env.DSH_TEST_SCENE||'cloud-drift';
const source=(await Promise.all(names.map(n=>readFile(new URL('../src/'+n,import.meta.url),'utf8')))).join('\n');
const out=path.resolve(process.env.DSH_TEST_OUTPUT||'work/ambient-tests');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-10-30T01:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T01:00:01Z'));
await page.setContent('<style>body{margin:0}#region{position:relative;width:100vw;height:100vh}canvas{position:absolute;inset:0;width:100%;height:100%}button{position:absolute;left:40%;top:50%}</style><div id="region"><canvas></canvas><button>原生按钮</button></div>');
await page.addScriptTag({content:source+`\nwindow.scenes=SCENES;window.sceneId=${JSON.stringify(sceneId)};window.scene=getScene(window.sceneId).renderer(document.querySelector("canvas"),{interactionRoot:document.querySelector("#region")});`});
await page.clock.runFor(100);await page.screenshot({path:path.join(out,'scene-0.png')});
const subjectCentre=()=>page.locator('canvas').evaluate(c=>{
 const ctx=c.getContext('2d'),{width:w,height:h}=c,bytes=ctx.getImageData(0,0,w,h).data;
 let count=0,sum=0;
 const cloud=window.sceneId==='cloud-drift';
 for(let y=Math.floor(h*.08);y<h*(cloud?.31:.5);y++)for(let x=Math.floor(w*(cloud?.22:.4));x<w*(cloud?.5:.95);x++){
  const i=(y*w+x)*4;
  if(cloud?bytes[i]>239&&bytes[i+1]>242&&bytes[i+2]>236:bytes[i]>125&&bytes[i+1]>110&&bytes[i+2]<105){sum+=x;count++;}
 }return sum/count;
});
const start=await subjectCentre();await page.clock.runFor(2000);const end=await subjectCentre();
assert.ok(end-start>5,'The main subject must visibly translate, not only change brightness');
await page.screenshot({path:path.join(out,'scene-2.png')});
const background=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.mouse.click(1000,620);
assert.notEqual(background,await page.locator('canvas').evaluate(c=>c.toDataURL()));
const beforeButton=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.getByRole('button').click();
assert.equal(beforeButton,await page.locator('canvas').evaluate(c=>c.toDataURL()));
const sizes=[];
for(const[width,height]of[[1600,852],[1280,820],[960,720],[800,650]]){
 await page.setViewportSize({width,height});await page.clock.runFor(500);await page.screenshot({path:path.join(out,`scene-${width}.png`)});sizes.push({width,height});
}
await page.evaluate(()=>scene.update({motion:false,quiet:false}));const frozen=await page.locator('canvas').evaluate(c=>c.toDataURL());
await page.clock.runFor(500);assert.equal(frozen,await page.locator('canvas').evaluate(c=>c.toDataURL()));
await page.evaluate(()=>scene.update({motion:true,quiet:true}));await page.clock.runFor(1000);await page.screenshot({path:path.join(out,'scene-reading.png')});
const stats=await page.evaluate(()=>scene.stats);await page.evaluate(()=>scene.dispose());assert.deepEqual(errors,[]);
const result={theme:sceneId,translationPixelsOverTwoSeconds:Math.round((end-start)*10)/10,backgroundClick:'passed',nativeControl:'passed',sizes,staticMode:'passed',readingMode:'rendered',renderedFrames:stats.frames,pageErrors:errors};
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
