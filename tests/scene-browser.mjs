// Run against an installed Playwright package: DSH_PLAYWRIGHT_DIR=<node_modules/playwright>.
// This is a renderer/lifecycle test. Desktop acceptance is recorded separately.
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DSH_PLAYWRIGHT_DIR || "playwright");
const root = new URL("../", import.meta.url);
const out = path.resolve(process.env.DSH_TEST_OUTPUT || "work/scene-browser");
await mkdir(out, { recursive: true });
const code = (await Promise.all(["palette.js", "scene.js"].map(name => readFile(new URL(`src/${name}`, root), "utf8")))).join("\n");
const browser = await chromium.launch({ channel: process.env.DSH_BROWSER_CHANNEL || undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.setContent('<style>html,body{margin:0;width:100%;height:100%;background:#171512}canvas{display:block;width:100%;height:100%}#text{position:absolute;inset:30% 25% auto;color:#eee9e1;font:16px sans-serif;pointer-events:none}</style><canvas id="scene"></canvas><div id="text"></div>');
await page.addScriptTag({ content: `${code}\nwindow.controller=createNightScene(document.querySelector('canvas'));` });
const sizes = [];
for (const [width, height] of [[1280,820],[1440,900],[1920,1080],[960,720]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(200);
  const actual = await page.locator("canvas").evaluate(c => ({ width: c.width, height: c.height }));
  assert.deepEqual(actual, { width, height }); sizes.push(actual);
}
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(300);
const perf = await page.evaluate(async () => {
  const times = [], cost = [];
  let prev = performance.now(), count = 0;
  return new Promise(resolve => {
    const stream = setInterval(() => { const el=document.querySelector('#text'); el.textContent += '夜间阅读测试。'; if(el.textContent.length>3000)el.textContent=''; }, 20);
    function tick(now) {
      times.push(now-prev); prev=now; cost.push(controller.stats.drawMs); count++;
      if(count<240)requestAnimationFrame(tick);
      else {clearInterval(stream);times.shift();times.sort((a,b)=>a-b);resolve({fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),p95FrameMs:times[Math.floor(times.length*.95)],renderer:controller.stats,meanDrawMs:cost.reduce((a,b)=>a+b,0)/cost.length});}
    }requestAnimationFrame(tick);
  });
});
assert.ok(perf.fps > 40, `Renderer too slow: ${perf.fps}`);
await page.evaluate(() => { document.querySelector('#text').textContent=''; controller.update({motion:false,quiet:false}); });
await page.waitForTimeout(100);
const stillA = await page.locator("canvas").evaluate(c=>c.toDataURL());
await page.waitForTimeout(400);
const stillB = await page.locator("canvas").evaluate(c=>c.toDataURL());
assert.equal(stillA,stillB,"Static setting must freeze every character and particle");
await page.screenshot({ path:path.join(out,"renderer-1920.png") });
await page.evaluate(()=>controller.update({motion:true,quiet:false}));
await page.waitForTimeout(150);
await page.emulateMedia({ reducedMotion:"reduce" });
await page.waitForTimeout(150);
const reducedA=await page.locator("canvas").evaluate(c=>c.toDataURL());
await page.waitForTimeout(300);
assert.equal(reducedA,await page.locator("canvas").evaluate(c=>c.toDataURL()),"Reduced motion must stop the renderer");
const frames=await page.evaluate(()=>{controller.dispose();return controller.stats.frames});
await page.waitForTimeout(200);
assert.equal(frames,await page.evaluate(()=>controller.stats.frames),"Disposed renderer must stop scheduling frames");
assert.deepEqual(errors,[]);
const result={sizes,performance:perf,staticMode:"passed",reducedMotion:"passed",dispose:"passed",pageErrors:errors};
await writeFile(path.join(out,"result.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
