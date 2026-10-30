import { spawnSync } from 'node:child_process';

const suites = ['plugin-browser', 'hidden-preview', 'scene-browser', 'interaction-browser', 'ambient-browser', 'switch-stress'];
for (const suite of suites) {
  console.log(`\nRunning ${suite}`);
  const result = spawnSync(process.execPath, [`tests/${suite}.mjs`], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
