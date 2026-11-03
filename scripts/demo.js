import { createPlan } from '../src/plan.js';
import { activityWindows } from '../src/activity.js';
import { renderGifs } from '../src/render.js';

// Deliberately synthetic previews, never presented as a user's activity.
for (const [name, recent, yearly] of [
  ['hero', 120, 700], ['demo-2x2', 50, 90], ['demo-3x3', 50, 700], ['demo-idle', 0, 0],
]) {
  const snapshot = { version: 4, username: 'demo', commits30d: recent, contributions365d: yearly,
    windows: activityWindows('2026-11-03T00:00:00Z'), scope: 'yearly-profile-contributions-and-recent-commits' };
  const plan = createPlan(snapshot, { width: name === 'hero' ? 400 : 320 });
  console.log(`Rendering synthetic preview ${name} (${plan.frames} frames)`);
  const results = await renderGifs(plan, { output: `docs/${name}.gif`, onProgress: (i, n) => {
    if (i % 100 === 0) console.log(`${name}: ${Math.round(i / n * 100)}%`);
  } });
  console.log(results);
}
