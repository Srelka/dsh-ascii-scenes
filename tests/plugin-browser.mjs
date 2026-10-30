import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DSH_PLAYWRIGHT_DIR || "playwright");
const bundle = await readFile(process.env.DSH_TEST_BUNDLE || new URL("../client.js", import.meta.url), "utf8");
const out = path.resolve(process.env.DSH_TEST_OUTPUT || "work/plugin-browser");
await mkdir(out,{recursive:true});
const browser = await chromium.launch({channel:process.env.DSH_BROWSER_CHANNEL||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1280,height:820}}), errors=[];
page.on("pageerror",e=>errors.push(e.message));
await page.route("http://scene.test/**",route=>route.fulfill({contentType:"text/html",body:`<style>body{margin:0}[data-conversation-content]{position:relative;width:100vw;height:100vh}[data-composer-card]{position:absolute;left:20%;right:20%;bottom:40px;height:80px}button{position:relative;z-index:10}</style><div id="root"><div id="loading">Loading plugins</div></div>`}));
await page.goto("http://scene.test/");
await page.evaluate(()=>{
  localStorage.setItem("dsh-ascii-scenes:v1",JSON.stringify({scene:"native",motion:true,previous:"light"}));
  window.disposers=[];window.components={};window.preference="light";window.themeListeners=[];
  const React={Fragment:"fragment",createElement:(type,props,...children)=>typeof type==="function"?type(props||{}):({type,props:props||{},children:children.flat(Infinity)}),useState:init=>[typeof init==="function"?init():init,()=>{}],useEffect:()=>{},useRef:()=>({current:null})};
  window.__ModuleLoader__={load:({factory})=>{window.plugin=factory(name=>{if(name!=="react")throw Error(name);return React})}};
  const emit=()=>themeListeners.slice().forEach(f=>f({preference}));
  window.context={
    theme:{getTheme:()=>({preference}),setTheme:id=>{preference=id;emit()},overrideTokens:(_id,tokens)=>{for(const[k,v]of Object.entries(tokens))document.body.style.setProperty(k,v.dark);emit();return()=>{for(const k of Object.keys(tokens))document.body.style.removeProperty(k);emit()}}},
    on:(_event,cb)=>{themeListeners.push(cb);return()=>themeListeners.splice(themeListeners.indexOf(cb),1)},
    slots:{inject:(_name,fn)=>fn(),register:(entry,component)=>{components[entry.name]=component;return()=>{}}},
    effect:fn=>{const cleanup=fn();if(typeof cleanup==="function")disposers.push(cleanup)},
  };
  window.findAction=name=>{
    function find(node){if(!node||typeof node!=="object")return null;if(node.type==="button"&&JSON.stringify(node.children).includes(name))return node;for(const child of node.children||[]){const result=find(child);if(result)return result}return null}
    const node=find(components["settings.general.item"]());if(!node)throw Error("Missing button: "+name);return node.props.onClick;
  };
});
await page.addScriptTag({content:bundle});
await page.evaluate(()=>plugin.apply(context));
assert.equal(await page.locator(".ascii-scene-layer").count(),0);
await page.evaluate(()=>findAction("Claude · 暖夜")({clientX:1000,clientY:700}));
await page.waitForTimeout(1000);
assert.equal(await page.locator('.ascii-scene-layer').count(),0,'Do not touch the host loading container before the shell exists');
assert.equal(await page.locator('#root').evaluate(e=>e.firstElementChild.id),'loading');
await page.evaluate(()=>{document.querySelector('#root').innerHTML='<div id="frame" style="position:relative;height:100vh"><div data-conversation-content data-content-phase="hero"><div data-conversation-scroll></div><div data-composer-card contenteditable></div></div><div data-shell-overlay></div></div>';});
await page.waitForTimeout(150);
assert.equal(await page.locator('.ascii-scene-layer').count(),1);
assert.equal(await page.locator(".ascii-clawd").count(),1);
assert.equal(await page.evaluate(()=>preference),"dark");
assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-ascii-transition')),false);
await page.evaluate(()=>findAction('蓝天 · 浮云')({clientX:800,clientY:500}));
await page.waitForTimeout(900);
assert.equal(await page.locator('.ascii-clawd').count(),0,'Cloud theme must not inherit Claude\'s companion');
assert.equal(await page.locator('.ascii-scene-layer').count(),1);
assert.equal(await page.evaluate(()=>preference),'light');
assert.equal(await page.evaluate(()=>document.body.dataset.asciiScene),'cloud-drift');
for(const [id,label] of [['honu-lagoon','海龟 · 潟湖'],['koi-pond','池塘 · 锦鲤'],['jellyfish','深海 · 水母'],['paper-boats','水面 · 纸船'],['fireflies','夏夜 · 萤火'],['moonlit','夜空 · 月色']]) {
  await page.evaluate(label=>findAction(label)({clientX:800,clientY:500}),label);
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>document.body.dataset.asciiScene),id);
  assert.equal(await page.locator('.ascii-scene-layer').count(),1);
  assert.equal(await page.locator('.ascii-clawd').count(),0);
}
await page.evaluate(()=>findAction('Claude · 暖夜')({clientX:600,clientY:500}));
await page.waitForTimeout(900);
assert.equal(await page.locator('.ascii-clawd').count(),1);
assert.equal(await page.evaluate(()=>preference),'dark');
for(let i=0;i<25;i++) {
  await page.evaluate(()=>{
    const old=document.querySelector('[data-conversation-content]');
    const next=document.createElement('div');next.setAttribute('data-conversation-content','');next.setAttribute('data-content-phase','active');next.innerHTML='<div data-conversation-scroll></div><div data-composer-card contenteditable></div>';old.replaceWith(next);
  });
}
assert.equal(await page.locator(".ascii-scene-layer").count(),1);
assert.equal(await page.locator(".ascii-clawd").count(),1);
await page.evaluate(()=>findAction("原生外观")({clientX:350,clientY:500}));
await page.waitForTimeout(1000);
assert.equal(await page.locator(".ascii-scene-layer,.ascii-clawd").count(),0);
assert.equal(await page.evaluate(()=>preference),"light");
assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--dsw-alias-bg-base')),'');
await page.evaluate(()=>findAction("Claude · 暖夜")({clientX:600,clientY:500}));
await page.waitForTimeout(1000);
await page.evaluate(()=>{disposers.splice(0).reverse().forEach(f=>f());plugin.apply(context)});
await page.waitForTimeout(150);
assert.equal(await page.locator(".ascii-scene-layer").count(),1);
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh-ascii-scenes:v1')).previous),'light');
await page.evaluate(()=>disposers.splice(0).reverse().forEach(f=>f()));
await page.waitForTimeout(100);
assert.equal(await page.locator('.ascii-scene-layer,.ascii-clawd,style[data-plugin="dsh-ascii-scenes"]').count(),0);
assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-ascii-scene')),false);
assert.equal(await page.evaluate(()=>themeListeners.length),0);
assert.equal(await page.evaluate(()=>preference),'light','Unloading must restore the native appearance selected before the scene');
assert.deepEqual(errors,[]);
const result={enable:"passed",startupPlaceholderPreserved:"passed",sceneSwitchCount:8,companionIsolation:"passed",sessionRemounts:25,nativeRestore:"passed",preferenceRestore:"passed",unloadCleanup:"passed",pageErrors:errors};
await writeFile(path.join(out,'plugin-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();

