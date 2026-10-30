import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { startDemo } from './demo.mjs';

await mkdir('docs/media', { recursive: true });
await mkdir('.artifacts/demo-frames', { recursive: true });
const demo = await startDemo();
const browser = await chromium.launch({ channel: process.env.DSH_BROWSER_CHANNEL || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 850 }, deviceScaleFactor: 1 });
  const errors=[];page.on('pageerror', error=>errors.push(error.message));
  await page.goto(`${demo.url}/gallery`); await page.screenshot({ path: 'docs/media/scenes.png' });
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(demo.url);await page.getByRole('button',{name:'场景主题',exact:true}).waitFor();
  await page.screenshot({path:'.artifacts/preview.png'});
  await page.setViewportSize({ width: 960, height: 600 });
  let index=0;
  for(const theme of ['claude-night','cloud-drift','honu-lagoon','koi-pond','jellyfish','paper-boats','fireflies','moonlit']){
    await page.goto(`${demo.url}/?theme=${theme}`);
    await page.getByRole('button',{name:'场景主题',exact:true}).waitFor();
    for(let frame=0;frame<16;frame++){
      await page.screenshot({path:`.artifacts/demo-frames/${String(index++).padStart(4,'0')}.png`});
      await page.waitForTimeout(125);
    }
  }
  if(errors.length)throw new Error(errors.join('\n'));
  const result=spawnSync('ffmpeg',['-y','-loglevel','error','-framerate','8','-i','.artifacts/demo-frames/%04d.png','-filter_complex','split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0','docs/media/demo.gif'],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`FFmpeg failed: ${result.status}`);
  console.log('Captured 8 scenes, a demo workspace and an animated GIF. Only fictional data was used.');
} finally { await browser.close(); await demo.close(); }
