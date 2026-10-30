import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/palette.js", import.meta.url), "utf8");
const api = vm.runInNewContext(`${source}\n({normalizeState,CLAWD_ROWS,WARM_TOKENS})`);
const themeSource = readFileSync(new URL('../src/themes.js',import.meta.url),'utf8');
const themeApi = vm.runInNewContext(`${source}\n${themeSource}\n({SCENES})`,{
  createNightScene(){},createCloudScene(){},createLagoonScene(){},createKoiScene(){},createJellyfishScene(){},createPaperScene(){},createFirefliesScene(){},createMoonScene(){},createClawd(){},
});
test("a corrupt or unknown saved theme falls back to native, preserving valid motion and restore preferences", () => {
  assert.equal(api.normalizeState(null).scene, "native");
  assert.equal(api.normalizeState({ scene: "missing", previous: "evil", motion: false }).previous, "system");
  const restored = api.normalizeState({ scene: "claude-night", previous: "light", motion: false });
  assert.equal(restored.scene, "claude-night"); assert.equal(restored.previous, "light"); assert.equal(restored.motion, false);
  assert.equal(api.normalizeState({scene:'cloud-drift'}).scene,'cloud-drift');
});
test('new scene palettes keep readable labels on all principal surfaces',()=>{
  for(const scene of themeApi.SCENES.filter(s=>s.id!=='claude-night')) {
    for(const surface of ['--dsw-alias-bg-base','--dsw-alias-bg-layer-1','--dsw-alias-bg-layer-2','--dsw-alias-bg-layer-3']) {
      for(const label of ['--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary']) {
        const a=luminance(scene.tokens[surface]),b=luminance(scene.tokens[label]);
        assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${scene.id}: ${label} on ${surface}`);
      }
    }
  }
});
function luminance(hex) { const rgb = hex.slice(1).match(/../g).map(s => parseInt(s,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; }
test("reading palette provides at least 4.5:1 contrast for normal and secondary text", () => {
  for (const bg of ["#171512", "#25201b", "#24201c"]) for (const key of ["--dsw-alias-label-primary", "--dsw-alias-label-secondary", "--dsw-alias-label-tertiary"]) {
    assert.ok((luminance(api.WARM_TOKENS[key])+.05)/(luminance(bg)+.05) >= 4.5, `${key} on ${bg}`);
  }
});
