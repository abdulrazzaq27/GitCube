#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectActivity, validateSnapshot } from '../src/activity.js';
import { createPlan } from '../src/plan.js';
import { githubToken } from '../src/auth.js';
import { themeOutputs } from '../src/themes.js';
import { YEARLY_CONTRIBUTION_THRESHOLDS, COMPLEXITY_THRESHOLDS } from '../src/config.js';

const help = `git-cube <github-username> [options]

Generate a cube from yearly profile contributions and recent commit activity.
Authentication: GH_TOKEN, GITHUB_TOKEN, or an existing gh login.

  --output <path>       GIF destination (default output/git-cube.gif)
  --snapshot <path>     Save collected aggregate activity for offline reproduction
  --from-snapshot <p>   Render a previously collected snapshot without a token
  --as-of <ISO time>    Shared endpoint for rolling 30/365-day activity windows
  --stage-thresholds   Six yearly minimums (default ${YEARLY_CONTRIBUTION_THRESHOLDS.join(',')})
  --upgrade-at <n>      Legacy: scale all six stages, with 3×3 starting at n
  --tiers <n,n>         30-day complexity boundaries (default ${COMPLEXITY_THRESHOLDS.join(',')})
  --width <pixels>      Square GIF size, 96–1024 (default 400)
  --fps <20|25|50>      Frame rate (default 25)
  --theme <mode>       both (default), light, or dark; both adds a -dark.gif file
  --collect-only       Collect activity without rendering; requires --snapshot
  --git-credential     Allow a stored github.com Git credential as a fallback
  --help               Show help
  --version            Show version

Examples:
  git-cube abdulrazzaq27 --snapshot output/activity.json
  git-cube --from-snapshot output/activity.json --output output/git-cube.gif
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', default: 'output/git-cube.gif' },
      snapshot: { type: 'string' }, 'from-snapshot': { type: 'string' },
      'as-of': { type: 'string' }, 'upgrade-at': { type: 'string' },
      'stage-thresholds': { type: 'string' },
      tiers: { type: 'string' }, width: { type: 'string', default: '400' },
      fps: { type: 'string', default: '25' }, 'collect-only': { type: 'boolean' },
      'git-credential': { type: 'boolean' },
      theme: { type: 'string', default: 'both' },
      help: { type: 'boolean' }, version: { type: 'boolean' },
    },
  });
  if (values.help) { console.log(help); process.exit(0); }
  if (values.version) { console.log('0.1.0'); process.exit(0); }
  if (positionals.length > 1) throw new Error('Provide one GitHub username.');
  if (values['from-snapshot'] && (positionals.length || values['as-of'])) throw new Error('Use --from-snapshot without a username or --as-of.');
  if (values['collect-only'] && !values.snapshot) throw new Error('--collect-only requires --snapshot.');
  if (!values['from-snapshot'] && !positionals[0]) throw new Error('A GitHub username is required. Use --help.');
  const outputs = themeOutputs(values.output, values.theme);
  if (values.snapshot && outputs.some(v => resolve(values.snapshot) === resolve(v.output))) throw new Error('Snapshot and GIF must use different output paths.');
  const snapshot = values['from-snapshot']
    ? validateSnapshot(JSON.parse(await readFile(values['from-snapshot'], 'utf8')))
    : await collectActivity(positionals[0], {
      token: await githubToken({ useGitCredential: values['git-credential'] }),
      asOf: values['as-of'] ? new Date(values['as-of']) : new Date(),
    });
  const plan = createPlan(snapshot, {
    upgradeAt: values['upgrade-at'] === undefined ? undefined : Number(values['upgrade-at']),
    stageThresholds: values['stage-thresholds']?.split(',').map(Number),
    tiers: values.tiers?.split(',').map(Number),
    width: Number(values.width), fps: Number(values.fps),
  });
  // Import Chromium and the encoder only after collection and argument validation.
  const { atomicWrite, renderGifs } = await import('../src/render.js');
  if (values.snapshot) await atomicWrite(values.snapshot, JSON.stringify(snapshot, null, 2) + '\n');
  console.error(`${snapshot.username}: ${snapshot.commits30d} commits / 30 days, ${snapshot.contributions365d} contributions / 365 days → stage ${plan.stage.tier}: ${plan.stage.name}, ${plan.algorithm?.name ?? 'gentle rotation'}`);
  if (!values['collect-only']) {
    const results = await renderGifs(plan, {
      output: values.output, theme: values.theme,
      onProgress: (frame, total) => { if (frame % (plan.fps * 4) === 0) console.error(`Rendering ${Math.round(frame / total * 100)}%`); },
    });
    console.log(JSON.stringify({ outputs: results, stage: plan.stage, algorithm: plan.algorithm?.id ?? null }));
  }
} catch (error) {
  console.error(`git-cube: ${error.message}`);
  process.exitCode = 1;
}
