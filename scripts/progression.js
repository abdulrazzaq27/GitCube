import { parseArgs } from 'node:util';
import { CUBE_STAGES, YEARLY_CONTRIBUTION_THRESHOLDS } from '../src/config.js';
import { createPlan } from '../src/plan.js';
import { activityWindows } from '../src/activity.js';
import { atomicWrite, renderGifs } from '../src/render.js';

const { values } = parseArgs({ options: { stage: { type: 'string' } } });
if (values.stage && !CUBE_STAGES.some(s => s.id === values.stage)) throw new Error('Unknown progression stage.');
for (const [index, stage] of CUBE_STAGES.entries()) {
  if (values.stage && stage.id !== values.stage) continue;
  const snapshot = {
    version: 4, username: 'demo', commits30d: 10, contributions365d: Math.max(90, YEARLY_CONTRIBUTION_THRESHOLDS[index]),
    windows: activityWindows('2026-11-03T00:00:00Z'), scope: 'yearly-profile-contributions-and-recent-commits',
  };
  const plan = createPlan(snapshot, { width: 240, fps: 20 });
  console.log(`Stage ${index + 1}: ${stage.name}`);
  console.log(await renderGifs(plan, { output: `docs/stages/${stage.id}.gif`, onProgress: (frame, count) => {
    if (frame % 100 === 0) console.log(`${stage.id}: ${Math.round(frame / count * 100)}%`);
  } }));
}
const rows = CUBE_STAGES.map((s, i) => `| ${i + 1} | ${YEARLY_CONTRIBUTION_THRESHOLDS[i]}${i === 5 ? '+' : `–${YEARLY_CONTRIBUTION_THRESHOLDS[i + 1] - 1}`} | ${s.name} |`);
const cards = CUBE_STAGES.map(s => `<picture><source media="(prefers-color-scheme: dark)" srcset="stages/${s.id}-dark.gif"><img src="stages/${s.id}.gif" width="240" alt="${s.name}"></picture>`);
await atomicWrite('docs/progression.md', `# Six-stage progression\n\nSynthetic examples, with identical low recent activity so appearance can be compared independently of complexity. Each loop executes the same verified order-2 sequence twice.\n\n| Stage | Yearly contributions | Cube |\n| --- | ---: | --- |\n${rows.join('\n')}\n\n| 2×2 Rubik’s | 2×2 silver mirror | 2×2 golden mirror |\n| --- | --- | --- |\n| ${cards.slice(0, 3).join(' | ')} |\n\n| 3×3 Rubik’s | 3×3 silver mirror | 3×3 golden mirror |\n| --- | --- | --- |\n| ${cards.slice(3).join(' | ')} |\n\nThresholds and mirror offsets are configured in [src/config.js](../src/config.js). The mechanical grid and the original layer-turn engine are shared across all stages. Mirror blocks have unequal extents, a metallic environment-mapped finish, and no visible colored stickers.\n`);
