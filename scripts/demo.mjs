import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
export async function startDemo(port = 0) {
  const react = await build({
    stdin: { contents: 'import * as React from "react"; import {createRoot} from "react-dom/client"; window.React=React; window.createRoot=createRoot;', resolveDir: fileURLToPath(root) },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
  });
  const sources = ['palette', 'scene', 'companion', 'ambient', 'cloud', 'lagoon', 'koi', 'jellyfish', 'paper', 'fireflies', 'moon', 'themes'];
  const scenes = (await Promise.all(sources.map(n => readFile(new URL(`src/${n}.js`, root), 'utf8')))).join('\n') + '\nwindow.ASCII_SCENES=SCENES;';
  const routes = new Map([
    ['/', ['text/html', await readFile(new URL('demo/index.html', root))]],
    ['/demo.js', ['text/javascript', await readFile(new URL('demo/demo.js', root))]],
    ['/gallery', ['text/html', await readFile(new URL('demo/gallery.html', root))]],
    ['/react.js', ['text/javascript', react.outputFiles[0].text]],
    ['/scenes.js', ['text/javascript', scenes]],
    ['/client.js', ['text/javascript', await readFile(new URL('client.js', root))]],
  ]);
  const server = createServer((req, res) => {
    const entry = routes.get(new URL(req.url, 'http://localhost').pathname);
    if (!entry) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${entry[0]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(entry[1]);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = await startDemo(Number(process.env.PORT || 4173));
  console.log(`ASCII Scenes demo: ${demo.url}\nGallery: ${demo.url}/gallery\nAll conversation content is fictional. Ctrl+C to stop.`);
}
