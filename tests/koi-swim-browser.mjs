import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.env.DSH_TEST_OUTPUT||'work/koi-swim');await mkdir(out,{recursive:true});
const source=(await Promise.all(['palette','scene','ambient','koi'].map(n=>readFile(new URL(`../src/${n}.js`,import.meta.url),'utf8')))).join('\n');
const browser=await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-30T03:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T03:00:01Z'));
 await page.setContent('<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>');
 await page.addScriptTag({content:source+`\nwindow.routeSpecs={};window.originalStep=stepKoiSwimmer;stepKoiSwimmer=(spec,...args)=>{routeSpecs[spec.kind]??=structuredClone(spec);if(window.goldOverride&&spec.kind==='gold')Object.assign(spec.motion,goldOverride);return originalStep(spec,...args);};window.scene=createKoiScene(document.querySelector('canvas'),{interactionRoot:document.body});`});
 await page.clock.runFor(100);
 const centre=()=>page.locator('canvas').evaluate(canvas=>{const{width:w,height:h}=canvas,data=canvas.getContext('2d').getImageData(0,0,w,h).data;let sum=0,count=0;for(let y=0;y<h*.5;y++)for(let x=w*.35|0;x<w;x++){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(r>105&&r>g*1.1&&b<g*.9){sum+=x;count++;}}return{count,x:sum/count};});
 const start=await centre();assert.ok(start.count>500);
 await page.screenshot({path:path.join(out,'swim-0.png')});
 await page.clock.runFor(8000);const end=await centre();
 assert.ok(start.x-end.x>100&&start.x-end.x<190,`Gold fish must make a gentle but visible advance: ${start.x-end.x}px`);
 await page.screenshot({path:path.join(out,'swim-8.png')});
 const paths=await page.evaluate(()=>{
  const results=[];window.edgeStates=[];
  for(const [width,height]of[[1280,820],[1920,1080],[390,844]])for(const initial of Object.values(routeSpecs)) {
   const spec=structuredClone(initial),at0=originalStep(spec,width,height,0,0,null,[],0);
   let previous=at0,wraps=0,maxStep=0,minAlignment=1,maxTurnRate=0,wholeExit=true,advance8=0;
   for(let i=1;i<=7200;i++){
    const t=i/30,oldState={...spec.motion},p=originalStep(spec,width,height,t,1/30,null,[],0),dx=p.x-previous.x,dy=p.y-previous.y;
    const turn=Math.atan2(Math.sin(p.angle-previous.angle),Math.cos(p.angle-previous.angle));maxTurnRate=Math.max(maxTurnRate,Math.abs(turn)*30);
    if(Math.abs(dx)>width/2||Math.abs(dy)>height/2){
      wraps++;
      const expectedX=previous.x+Math.cos(p.angle)*p.speed/30,expectedY=previous.y+Math.sin(p.angle)*p.speed/30,b=p.bounds;
      if(Math.abs(dx)>width/2)wholeExit&&=dx>0?expectedX+b.maxX< -1&&p.x+b.minX>width:expectedX+b.minX>width+1&&p.x+b.maxX<0;
      if(Math.abs(dy)>height/2)wholeExit&&=dy>0?expectedY+b.maxY< -1&&p.y+b.minY>height:expectedY+b.minY>height+1&&p.y+b.maxY<0;
      if(width===1280&&spec.kind==='gold'&&!edgeStates.length)edgeStates=[oldState,{...spec.motion}];
    }else{maxStep=Math.max(maxStep,Math.hypot(dx,dy));const distance=Math.hypot(dx,dy);minAlignment=Math.min(minAlignment,(dx*Math.cos(p.angle)+dy*Math.sin(p.angle))/distance);}
    if(i===240)advance8=Math.hypot(p.x-at0.x,p.y-at0.y);
    previous=p;
   }
   results.push({kind:spec.kind,width,height,speed:at0.speed,initialDegrees:at0.angle*180/Math.PI,advance8,wraps,wholeExit,maxStep,minAlignment,maxTurnRate});
  }
  // A fixed pointer just ahead must cause a wide, forward-moving turn, never
  // the backwards velocity and sudden heading reversal of positional repulsion.
  const spec=structuredClone(routeSpecs.gold),first=originalStep(spec,1280,820,0,0,null,[],0);
  const pointer={x:first.x+Math.cos(first.angle)*80,y:first.y+Math.sin(first.angle)*80,strength:1};
  let previous=first,maxTurn=0,minForward=1;
  for(let i=1;i<=720;i++){
    const p=originalStep(spec,1280,820,i/60,1/60,i<360?pointer:null,i===120?[pointer]:[],0);
    const dx=p.x-previous.x,dy=p.y-previous.y;
    minForward=Math.min(minForward,(dx*Math.cos(p.angle)+dy*Math.sin(p.angle))/Math.hypot(dx,dy));
    maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(p.angle-previous.angle),Math.cos(p.angle-previous.angle)))*60);previous=p;
  }
  return {routes:results,avoidance:{maxTurn,minForward}};
 });
 for(const p of paths.routes){assert.ok(p.wraps>=1&&p.wraps<=8,`${p.kind} must not ping-pong between edges: ${p.wraps}`);assert.equal(p.wholeExit,true,`${p.kind} must fully leave before wrapping at ${p.width}`);assert.ok(p.maxStep<1.1);assert.ok(p.minAlignment>.999);assert.ok(p.maxTurnRate<=.281);assert.ok(Math.abs(Math.sin(p.initialDegrees*Math.PI/180))>.25);if(p.width===1280){assert.ok(p.speed>=15&&p.speed<=23);assert.ok(p.advance8>120&&p.advance8<185);}}
 assert.ok(paths.avoidance.maxTurn<=.281);assert.ok(paths.avoidance.minForward>.999);
 for(const index of [0,1]){
  await page.evaluate(i=>{window.goldOverride=edgeStates[i];scene.update({motion:true,quiet:false});},index);
  assert.equal((await centre()).count,0,'The gold fish must be invisible on both sides of the wrap instant');
  await page.screenshot({path:path.join(out,`edge-${index}.png`)});
 }
 await page.evaluate(()=>{delete window.goldOverride;scene.update({motion:false,quiet:false});});
 const still=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.clock.runFor(1500);
 assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),still);
 await page.evaluate(()=>scene.dispose());assert.deepEqual(errors,[]);
 const result={goldPixelDisplacement8Seconds:Math.round((start.x-end.x)*10)/10,paths,staticMode:'passed',errors};
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
