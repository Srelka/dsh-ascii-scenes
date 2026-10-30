import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startDemo} from '../scripts/demo.mjs';

const out=path.resolve(process.env.DSH_TEST_OUTPUT||'work/motion-samples');
await mkdir(out,{recursive:true});
const source=(await Promise.all(['palette','scene','ambient','koi'].map(n=>readFile(new URL(`../src/${n}.js`,import.meta.url),'utf8')))).join('\n');
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const demo=await startDemo(),errors=[],result={renderers:[],transitions:[]};
const watch=page=>page.on('pageerror',e=>errors.push(e.message));
const shot=(page,name)=>page.screenshot({path:path.join(out,name+'.png')});
const pixels=page=>page.locator('canvas').first().evaluate(c=>c.toDataURL());
try {
  for(const name of ['createNightScene','createKoiScene']) {
    const page=await browser.newPage({viewport:{width:1280,height:820},deviceScaleFactor:2});watch(page);
    await page.clock.install({time:new Date('2026-10-30T01:00:00Z')});
    await page.clock.pauseAt(new Date('2026-10-30T01:00:01Z'));
    await page.setContent('<style>body{margin:0}#root{position:relative;width:100vw;height:100vh}canvas{width:100%;height:100%;display:block}textarea{position:absolute;left:40%;top:55%;width:25%}button{position:absolute;left:40%;top:65%}</style><div id="root"><canvas></canvas><textarea aria-label="输入">保留输入</textarea><button>原生按钮</button></div>');
    await page.addScriptTag({content:source+`\nwindow.scene=${name}(document.querySelector('canvas'),{interactionRoot:document.querySelector('#root')});`});
    await page.clock.runFor(100);
    const start=await pixels(page);
    await page.evaluate(()=>scene.update({motion:true,quiet:true}));
    assert.equal(await pixels(page),start,'Reading mode must not jump on the update frame');
    await page.clock.runFor(200);const middle=await pixels(page);
    await page.clock.runFor(1000);const end=await pixels(page);
    assert.notEqual(middle,start);assert.notEqual(end,middle);
    await shot(page,name+'-reading');
    await page.evaluate(()=>scene.update({motion:false,quiet:false}));
    const still=await pixels(page);assert.notEqual(still,end);
    await page.clock.runFor(1200);assert.equal(await pixels(page),still);
    await page.mouse.click(1080,200);await page.clock.runFor(400);
    assert.equal(await pixels(page),still,'Static scenes must ignore background clicks');
    await page.evaluate(()=>scene.update({motion:true,quiet:false}));
    const before=await pixels(page);await page.mouse.click(1080,200);
    assert.notEqual(await pixels(page),before,'Background clicks must still produce feedback');
    const beforeControl=await pixels(page);await page.getByRole('button').click();
    assert.equal(await pixels(page),beforeControl,'Native buttons must not produce background feedback');
    await page.evaluate(()=>window.probe=createScenePointer(document.querySelector('canvas'),document.querySelector('#root')));
    await page.mouse.move(1070,180);
    assert.ok(await page.evaluate(()=>{probe.step(.5,true);return probe.pointer.strength;})>.8);
    await page.getByRole('textbox').hover();
    assert.ok(await page.evaluate(()=>{probe.step(1,true);return probe.pointer.strength;})<.01,'Hover response must release over the editor');
    await page.evaluate(()=>probe.dispose());
    await page.mouse.move(1070,180);await page.clock.runFor(800);await shot(page,name+'-hover');
    for(const [width,height] of [[1920,1080],[960,720],[390,844]]) {
      await page.setViewportSize({width,height});await page.clock.runFor(500);
      if(name==='createKoiScene') {
        const size=await page.locator('canvas').evaluate(c=>({pixels:c.width*c.height,width:c.getBoundingClientRect().width}));
        assert.ok(size.pixels<=3010000,'Dense high-DPI scenery must keep its raster budget');
        assert.equal(size.width,width,'Raster budget must not change the logical layout');
      }
      await shot(page,`${name}-${width}`);
    }
    await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(50);
    const reduced=await pixels(page);await page.clock.runFor(1000);
    assert.equal(await pixels(page),reduced);
    const frames=await page.evaluate(()=>{scene.dispose();return scene.stats.frames;});
    await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>scene.stats.frames),frames);
    result.renderers.push({name,reading:'gradual',static:'passed',reducedMotion:'passed',inputIsolation:'passed',cleanup:'passed'});
    await page.close();
  }

  const page=await browser.newPage({viewport:{width:1280,height:820},deviceScaleFactor:2});watch(page);
  await page.clock.install({time:new Date('2026-10-30T02:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-30T02:00:01Z'));
  await page.goto(demo.url);await page.clock.runFor(100);
  await page.getByRole('button',{name:'场景主题',exact:true}).click();
  const choose=name=>page.getByRole('button',{name,exact:true}).click();
  const active=()=>page.locator('.ascii-transition').count();
  await choose('池塘 · 锦鲤');assert.equal(await active(),1);
  assert.equal(await page.locator('.ascii-shell-scene').count(),1);
  await page.getByRole('button',{name:'关闭主题选择',exact:true}).click();
  await page.getByRole('textbox').fill('换景时也能继续输入');
  await page.clock.runFor(280);await shot(page,'dissolve-280ms');
  await page.clock.runFor(250);await shot(page,'dissolve-530ms');
  await page.clock.runFor(500);assert.equal(await active(),0);
  assert.equal(await page.getByRole('textbox').inputValue(),'换景时也能继续输入');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'TEXTAREA');
  result.transitions.push('live editor during dissolve');
  await page.getByRole('button',{name:'场景主题',exact:true}).click();
  await page.evaluate(()=>{const cards=[...document.querySelectorAll('.ascii-theme-card')];for(let i=0;i<24;i++)cards.find(b=>b.textContent.includes(i%2?'锦鲤':'暖夜')).click();});
  assert.equal(await active(),1);await page.clock.runFor(1800);
  assert.equal(await active(),0);assert.equal(await page.locator('body').getAttribute('data-ascii-scene'),'koi-pond');
  result.transitions.push('24 rapid selections, last selection wins');
  await choose('Claude · 暖夜');await page.getByRole('switch',{name:'场景动画'}).click();
  assert.equal(await active(),0);assert.equal(await page.locator('html').getAttribute('data-ascii-transition'),null);
  await page.getByRole('switch',{name:'场景动画'}).click();
  await choose('池塘 · 锦鲤');await page.emulateMedia({reducedMotion:'reduce'});
  // Media-query notifications originate outside the controlled animation clock.
  await page.waitForTimeout(100);await page.clock.runFor(50);
  assert.equal(await active(),0);await choose('Claude · 暖夜');assert.equal(await active(),0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);await page.clock.runFor(50);
  await choose('池塘 · 锦鲤');await page.setViewportSize({width:960,height:720});await page.clock.runFor(50);
  assert.equal(await active(),0);result.transitions.push('motion off, reduced motion and resize cleanup');
  await choose('Claude · 暖夜');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await active(),0);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await choose('池塘 · 锦鲤');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.clock.runFor(1000);assert.equal(await page.locator('.ascii-scene-layer,.ascii-clawd').count(),0);
  assert.equal(await page.locator('html').getAttribute('data-ascii-transition'),null);
  result.transitions.push('hidden page and unload cleanup');
  assert.deepEqual(errors,[]);result.errors=errors;
  await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();await demo.close();}
