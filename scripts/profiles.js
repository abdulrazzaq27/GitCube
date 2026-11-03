import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { collectActivity, validateSnapshot } from '../src/activity.js';
import { githubToken } from '../src/auth.js';
import { createPlan } from '../src/plan.js';
import { atomicWrite, renderGifs } from '../src/render.js';

const usernames = ['abdulrazzaq27', 'osman-bin-nasir'];

try {
  const { values } = parseArgs({ options: {
    'collect-only': { type: 'boolean' }, 'render-only': { type: 'boolean' },
    'git-credential': { type: 'boolean' }, 'as-of': { type: 'string' },
  } });
  if (values['collect-only'] && values['render-only']) throw new Error('Choose collection or rendering, not both.');
  const asOf = values['as-of'] ? new Date(values['as-of']) : new Date();
  const token = values['render-only'] ? undefined : await githubToken({ useGitCredential: values['git-credential'] });
  const snapshots = [];
  for (const username of usernames) {
    const path = `output/profiles/${username}.json`;
    const snapshot = values['render-only']
      ? validateSnapshot(JSON.parse(await readFile(path, 'utf8')))
      : await collectActivity(username, { token, asOf });
    if (snapshot.username.toLowerCase() !== username) throw new Error(`Snapshot account mismatch for ${username}.`);
    if (!values['render-only']) await atomicWrite(path, JSON.stringify(snapshot, null, 2) + '\n');
    snapshots.push(snapshot);
    const plan = createPlan(snapshot);
    console.log(`${username}: ${snapshot.commits30d} commits / 30 days; ${snapshot.contributions365d} contributions / 365 days; stage ${plan.stage.tier}: ${plan.stage.name}; ${plan.algorithm?.name ?? 'gentle rotation'}`);
  }
  if (!snapshots.every(s => JSON.stringify(s.windows) === JSON.stringify(snapshots[0].windows)))
    throw new Error('All profile snapshots must share the same rolling windows.');
  if (!values['collect-only']) {
    const rows = [];
    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i], snapshot = snapshots[i], plan = createPlan(snapshot);
      const output = `assets/${username}.gif`;
      const results = await renderGifs(plan, { output, onProgress: (frame, frames) => {
        if (frame % 100 === 0) console.log(`${username}: rendering ${Math.round(frame / frames * 100)}%`);
      } });
      rows.push(`| [${username}](https://github.com/${username}) | ${snapshot.commits30d} | ${snapshot.contributions365d} | ${plan.stage.tier} · ${plan.stage.name} | ${plan.algorithm?.name ?? 'Gentle rotation'} |`);
      console.log(JSON.stringify({ username, outputs: results }));
    }
    // Use the primary profile for the single-image README embed.
    await atomicWrite('assets/git-cube.gif', await readFile(`assets/${usernames[0]}.gif`));
    await atomicWrite('assets/git-cube-dark.gif', await readFile(`assets/${usernames[0]}-dark.gif`));
    const windows = snapshots[0].windows;
    const gallery = `# Git Cube profiles\n\nCube stages use all profile contributions in the rolling last 365 days, including private activity totals visible on GitHub. Algorithm complexity uses commit contributions visible to the authenticated token in the rolling last 30 days.\n\nShared endpoint (UTC): ${windows.to}.\n30-day start: ${windows.from30}. 365-day start: ${windows.from365}.\nThese explicit rolling windows may differ from the default profile graph's date range.\n\n| Account | Commits / 30 days | Contributions / 365 days | Stage | Algorithm |\n| --- | ---: | ---: | --- | --- |\n${rows.join('\n')}\n\n${usernames.map(username => `## ${username}\n\n<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="../assets/${username}-dark.gif">\n  <img src="../assets/${username}.gif" width="400" alt="${username}'s Git Cube">\n</picture>\n`).join('\n')}\nGenerated with \`npm run profiles\`. Yearly totals include all contribution types and visible private activity; they are not commit-only counts. Private commits in the 30-day complexity count require suitable token access.\n`;
    await atomicWrite('docs/profiles.md', gallery);
  }
} catch (error) {
  console.error(`git-cube profiles: ${error.message}`);
  process.exitCode = 1;
}
