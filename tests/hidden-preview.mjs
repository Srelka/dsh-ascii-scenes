import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.DSH_PLAYWRIGHT_DIR||'playwright');
const files=['palette.js','scene.js','companion.js','ambient.js','cloud.js','lagoon.js','koi.js','jellyfish.js','paper.js','fireflies.js','moon.js','themes.js'];
const source=(await Promise.all(files.map(f=>readFile(new URL('../src/'+f,import.meta.url),'utf8')))).join('\n');
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="hidden" style="display:none"></div>');
await page.addScriptTag({content:source+'\nwindow.registry=SCENES;'});
const results=await page.evaluate(()=>registry.map(scene=>{
 const canvas=document.createElement('canvas');document.querySelector('#hidden').append(canvas);
 const renderer=scene.renderer(canvas,{motion:false,preview:true});
 const result={id:scene.id,width:canvas.width,height:canvas.height,drawMs:renderer.stats.drawMs};
 renderer.dispose();canvas.remove();return result;
}));
assert.equal(results.length,8);assert.ok(results.every(r=>r.width===1&&r.height===1&&Number.isFinite(r.drawMs)));assert.deepEqual(errors,[]);
await mkdir('work/parallel-themes/hidden-preview',{recursive:true});await writeFile('work/parallel-themes/hidden-preview/result.json',JSON.stringify({results,pageErrors:errors},null,2));console.log('All 8 hidden previews render safely at 1x1.');await browser.close();
