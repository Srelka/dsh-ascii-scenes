import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.DSH_PLAYWRIGHT_DIR || 'playwright');
const source = (await Promise.all(['palette.js','scene.js','companion.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const out = path.resolve(process.env.DSH_TEST_OUTPUT || 'work/walk-tests');
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const page = await browser.newPage({viewport:{width:1280,height:820}}), errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.clock.install({time:new Date('2026-10-29T01:00:00Z')});
await page.clock.pauseAt(new Date('2026-10-29T01:00:01Z'));
await page.setContent(`<style>${css}body{margin:0;background:#1d1916;color:#eee9e1;font:14px sans-serif}#region{position:relative;margin:80px 0 0 280px;width:calc(100vw - 280px);height:calc(100vh - 80px);overflow:hidden}#card{position:absolute;left:14%;width:72%;top:46%;height:116px;border-radius:22px;background:#191511;border:1px solid #554235;z-index:1}#editor{position:absolute;inset:14px 12px 42px;outline:none}#preset{position:absolute;left:15%;top:calc(46% - 35px);width:190px;height:24px;background:transparent;color:inherit;border:0;z-index:1}#native{position:absolute;right:16%;top:calc(46% + 76px);z-index:2}</style><div id="region" data-conversation-content data-content-phase="hero"><div class="ascii-scene-layer"><canvas id="bg"></canvas></div><button id="preset" data-slot="conversation.hero.agentPreset">工作区 · 标准模式</button><div id="card" data-composer-card><div id="editor" contenteditable="true">保留这段输入</div></div><button id="native">原生按钮</button><div id="pet" class="ascii-clawd-stage"></div></div>`);
await page.evaluate(() => {
  let seed = 17;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const arrow = document.createElement('button'); arrow.id = 'preset-arrow'; arrow.textContent = '⌄';
  arrow.style.cssText = 'position:absolute;left:calc(15% + 190px);top:calc(46% - 35px);width:20px;height:24px';
  document.querySelector('#region').append(arrow);
});
await page.addScriptTag({content:`${source}\nwindow.pet=createClawd(document.querySelector('#pet'),document.querySelector('#card'),true);window.backdrop=createNightScene(document.querySelector('#bg'),{motion:false,interactionRoot:document.querySelector('#region')});document.querySelector('#native').onclick=()=>window.nativeClicks=(window.nativeClicks||0)+1;`});
await page.clock.runFor(100);
const initialPet = await page.locator('.ascii-clawd-hit').boundingBox();
const initialCard = await page.locator('#card').boundingBox();
assert.ok(initialPet.y + initialPet.height <= initialCard.y + 1,'Default perch must stay above the composer');
assert.ok(initialPet.x + initialPet.width / 2 > initialCard.x + initialCard.width / 2,'Default perch must be on the right half');
assert.ok(initialPet.x + initialPet.width / 2 > initialCard.x + initialCard.width * .62,'1280px home must move visibly right of the old central perch');
const uniformGrid = await page.locator('.ascii-clawd').evaluate(canvas => {
  const ctx = canvas.getContext('2d');
  const pixels = ctx.getImageData(18,10,72,1).data;
  return Array.from({length:72},(_,x)=>pixels[x*4+3]).every((alpha,x)=>alpha===(x%6===5?0:255));
});
assert.equal(uniformGrid,true,'Every body tile must be 5 pixels wide with exactly one pixel between tiles');
await page.evaluate(() => {
  window.samples = [];
  function sample() {
    const canvas = document.querySelector('.ascii-clawd');
    if (!canvas || !document.querySelector('#pet')) return;
    const rect = canvas.getBoundingClientRect();
    const pixels = canvas.getContext('2d').getImageData(0,26,108,28).data;
    let bodyHash = 0;
    for (const byte of pixels) bodyHash = (bodyHash * 31 + byte) | 0;
    samples.push({time:performance.now(),x:rect.x,y:rect.y,bodyHash,action:document.querySelector('#pet').dataset.clawdAction});
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
});
await page.clock.runFor(90000);
const samples = await page.evaluate(() => samples);
const homeX = samples[0].x;
assert.equal(homeX,Math.max(...samples.map(s=>s.x)),'Default perch must be at the right end');
const awayRuns=[];
for (const sample of samples) {
  if (sample.x < homeX - 1) {
    if (!awayRuns.at(-1) || awayRuns.at(-1).returned) awayRuns.push({start:sample.time,returned:false});
    awayRuns.at(-1).end=sample.time;
  } else if (awayRuns.length) awayRuns.at(-1).returned=true;
}
assert.ok(awayRuns.some(run=>run.returned),'At least one complete outing must return to the original right perch');
assert.ok(awayRuns.filter(run=>run.returned).every(run=>run.end-run.start<8000),'Return must follow the short outing, not another random idle interval');
const presetArrow = await page.locator('#preset-arrow').boundingBox();
assert.ok(Math.min(...samples.map(s=>s.x)) + 10 >= presetArrow.x + presetArrow.width + 14,'Walking must also avoid the dropdown arrow outside the preset slot');
const walkSamples = samples.filter(item => item.action === 'walk');
assert.ok(walkSamples.length > 60, 'Must occasionally walk');
const walkFraction = walkSamples.length / samples.length;
assert.ok(walkFraction < .3, 'Most of the time must be spent resting');
const travelRange = Math.max(...samples.map(s=>s.x)) - Math.min(...samples.map(s=>s.x));
assert.ok(travelRange > 15 && travelRange <= 80, 'Walks must stay within a small local range');
assert.equal(new Set(samples.map(s=>s.y)).size, 1, 'Walking baseline must not bob or jump');
const deltas = samples.slice(1).map((s,i)=>s.x-samples[i].x);
assert.ok(deltas.some(n=>n>0) && deltas.some(n=>n<0), 'Must turn and return');
assert.ok(Math.max(...deltas.map(Math.abs)) <= 1, 'No position jump between 60 fps frames');
assert.equal(new Set(walkSamples.map(s=>s.bodyHash)).size, 1, 'Torso pixels must remain identical through walking');
assert.deepEqual([...new Set(samples.map(s=>s.action))].sort(), ['rest','walk']);
await page.screenshot({path:path.join(out,'walking.png')});
await page.locator('#editor').focus();
await page.locator('.ascii-clawd-hit').click({force:true});
assert.equal(await page.locator('#pet').getAttribute('data-clawd-action'),'reply');
assert.equal(await page.evaluate(()=>document.activeElement.id),'editor','Click must preserve typing focus');
await page.clock.runFor(100);await page.screenshot({path:path.join(out,'click-reply.png')});
await page.mouse.move(300,100);await page.clock.runFor(800);
assert.notEqual(await page.locator('#pet').getAttribute('data-clawd-action'),'reply');
assert.equal(await page.locator('#editor').textContent(),'保留这段输入');
await page.locator('.ascii-clawd-hit').focus();await page.keyboard.press('Enter');
assert.equal(await page.locator('#pet').getAttribute('data-clawd-action'),'reply');
await page.clock.runFor(700);await page.locator('.ascii-clawd-hit').evaluate(e=>e.blur());
await page.evaluate(()=>backdrop.update({motion:true,quiet:false}));
const background = await page.locator('#bg').evaluate(c=>c.toDataURL());
await page.mouse.click(360,650);
assert.notEqual(background,await page.locator('#bg').evaluate(c=>c.toDataURL()));
const beforeButton = await page.locator('#bg').evaluate(c=>c.toDataURL());
await page.locator('#native').click();
assert.equal(await page.evaluate(()=>nativeClicks),1);
assert.equal(beforeButton,await page.locator('#bg').evaluate(c=>c.toDataURL()));
const sizes=[];
for(const [width,height] of [[1600,852],[1280,820],[960,720],[800,650]]) {
  await page.setViewportSize({width,height});await page.clock.runFor(1500);await page.evaluate(()=>pet.update(false));
  const overlaps = await page.evaluate(() => {
    const region=document.querySelector('#region').getBoundingClientRect(), b=document.querySelector('.ascii-clawd').getBoundingClientRect();
    if(!b.width)return false;
    const cell=clamp(region.height/63,9,17),cx=region.width-15*cell-clamp(region.width*.025,18,52),cy=15*cell+clamp(region.height*.025,12,32);
    const ink=[];
    for(let r=0;r<9;r++)for(let c=0;c<16;c++)if(CLAWD_ROWS[r][c]==='#')ink.push({x:b.x-region.x+6+c*6,y:b.y-region.y+8+r*6-(r===8?2:0),h:r===8?7:5});
    // Check the unchanged renderer's occupied tiles over multiple rotations,
    // independently of the placement envelope used by the companion.
    for(let t=0;t<180;t+=.25)for(let r=-11;r<=11;r++)for(let c=-15;c<=15;c++)if(starCoverage(c,r*STAR_CELL_ASPECT,t)>0){
      const x=Math.round(cx+(c-.5)*cell),y=Math.round(cy+(r-.5)*cell*STAR_CELL_ASPECT);
      if(ink.some(p=>p.x<x+cell&&p.x+5>x&&p.y<y+cell*STAR_CELL_ASPECT&&p.y+p.h>y))return true;
    }
    return false;
  });
  assert.equal(overlaps,false,`Sun overlap at ${width}`);
  await page.screenshot({path:path.join(out,`size-${width}.png`)});sizes.push({width,height});
}
await page.setViewportSize({width:1280,height:820});
await page.evaluate(()=>{document.querySelector('#region').dataset.contentPhase='active';document.querySelector('#card').style.top='82%';pet.layout(true);});
await page.clock.runFor(2500);
const activePet=await page.locator('.ascii-clawd-hit').boundingBox(), activeCard=await page.locator('#card').boundingBox();
assert.ok(activePet.x + activePet.width <= activeCard.x + activeCard.width + 1, 'Active perch must remain on the composer edge');
assert.ok(activePet.x > activeCard.x + activeCard.width / 2, 'Active perch must stay on the right half');
assert.ok(activePet.y + activePet.height <= activeCard.y + 1, 'Active perch must remain above the composer');
await page.evaluate(()=>{pet.dispose();const stage=document.createElement('div');stage.className='ascii-clawd-stage';document.querySelector('#region').append(stage);window.pet=createClawd(stage,document.querySelector('#card'),false);});
const still=await page.locator('.ascii-clawd').evaluate(c=>c.toDataURL());
await page.clock.runFor(1000);assert.equal(still,await page.locator('.ascii-clawd').evaluate(c=>c.toDataURL()));
await page.locator('.ascii-clawd-hit').click();await page.clock.runFor(350);
assert.equal(still,await page.locator('.ascii-clawd').evaluate(c=>c.toDataURL()),'Static click must settle');
await page.evaluate(()=>{pet.dispose();backdrop.dispose()});
assert.equal(await page.locator('.ascii-clawd,.ascii-clawd-hit').count(),0);assert.deepEqual(errors,[]);
const result={sampleDurationSeconds:90,rightHome:'passed',homeCenterX:initialPet.x+initialPet.width/2,composerRight:initialCard.x+initialCard.width,sunCoverageSamplingSeconds:180,completedReturnTrips:awayRuns.filter(run=>run.returned).length,walkFrameCount:walkSamples.length,restPercent:Math.round((1-walkFraction)*1000)/10,travelRange,baselineVariation:0,maximumStepAt60fps:Math.max(...deltas.map(Math.abs)),torsoPixelHashes:1,uniformGrid:'5px tiles with 1px gaps',actions:['walk','rest','reply'],clickAndKeyboard:'passed',inputFocus:'preserved',backgroundFeedback:'passed',sizes,activeTextAvoidance:'passed',staticMode:'passed',cleanup:'passed',pageErrors:errors};
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
await writeFile(path.join(out,'motion-samples.json'),JSON.stringify(samples));
console.log(JSON.stringify(result,null,2));await browser.close();
