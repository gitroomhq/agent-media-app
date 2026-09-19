// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
await build({
  entryPoints: [new URL('../src/uploads/panel.browser.ts', import.meta.url).pathname],
  outfile: new URL('../dist/upload-panel.js', import.meta.url).pathname,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
});
const template = await readFile(new URL('../src/uploads/panel.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/uploads/panel.css', import.meta.url), 'utf8');
const script = (
  await readFile(new URL('../dist/upload-panel.js', import.meta.url), 'utf8')
).replace(/<\/script/gi, '<\\/script');
await writeFile(
  new URL('../dist/upload-panel.html', import.meta.url),
  template.replace('__UPLOAD_STYLES__', styles).replace('__UPLOAD_SCRIPT__', () => script),
);
