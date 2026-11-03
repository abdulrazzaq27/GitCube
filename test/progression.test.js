import test from 'node:test';
import assert from 'node:assert/strict';
import { CUBE_STAGES, YEARLY_CONTRIBUTION_THRESHOLDS, progressionThresholds, selectStage } from '../src/config.js';
import { createMirrorLayout } from '../src/mirror-layout.js';
import { createPlan } from '../src/plan.js';
import { activityWindows } from '../src/activity.js';

export const activitySnapshot = (recent, yearly) => ({ version: 4, username: 'test', commits30d: recent, contributions365d: yearly,
  windows: activityWindows('2026-11-03T00:00:00Z'), scope: 'yearly-profile-contributions-and-recent-commits' });

test('all six stages enter at their exact yearly thresholds in the requested order', () => {
  assert.deepEqual(CUBE_STAGES.map(s => s.id), ['rubiks-2', 'mirror-2-silver', 'mirror-2-gold', 'rubiks-3', 'mirror-3-silver', 'mirror-3-gold']);
  for (let i = 0; i < 6; i++) {
    assert.equal(selectStage(YEARLY_CONTRIBUTION_THRESHOLDS[i]).id, CUBE_STAGES[i].id);
    if (i > 0) assert.equal(selectStage(YEARLY_CONTRIBUTION_THRESHOLDS[i] - 1).id, CUBE_STAGES[i - 1].id);
  }
  assert.equal(selectStage(100000).id, 'mirror-3-gold');
  assert.throws(() => selectStage(-1));
});

test('progression is configurable and legacy 3x3 threshold scales every stage', () => {
  assert.deepEqual(progressionThresholds({ upgradeAt: 750 }), [0, 150, 375, 750, 1500, 3000]);
  const thresholds = [0, 10, 20, 30, 40, 50];
  assert.equal(createPlan(activitySnapshot(0, 40), { stageThresholds: thresholds }).stage.id, 'mirror-3-silver');
  for (const bad of [[1, 2, 3, 4, 5, 6], [0, 100], [0, 100, 100, 500, 1000, 2000], [0, 1, 2, 3, 4, NaN]])
    assert.throws(() => progressionThresholds({ stageThresholds: bad }));
  assert.throws(() => progressionThresholds({ stageThresholds: thresholds, upgradeAt: 500 }));
});

test('yearly appearance and rolling 30-day complexity select independently', () => {
  for (const yearly of [200, 350, 700, 1500, 2500]) {
    const plans = [10, 50, 120].map(recent => createPlan(activitySnapshot(recent, yearly)));
    assert.equal(new Set(plans.map(p => p.stage.id)).size, 1);
    assert.deepEqual(plans.map(p => p.algorithm.tier), [1, 2, 3]);
    assert.equal(createPlan(activitySnapshot(0, yearly)).segments.length, 0);
  }
});

for (const size of [2, 3]) test(`${size}×${size} mirror uses unequal solid blocks on the unchanged mechanical grid`, () => {
  const layout = createMirrorLayout(size);
  assert.equal(layout.pieces.length, size ** 3);
  for (const axis of [0, 1, 2]) {
    assert.ok(Math.abs(layout.cuts[axis].at(-1) - layout.cuts[axis][0] - size / 3) < 1e-12);
    for (let i = 1; i < size; i++) assert.ok(Math.abs(layout.cuts[axis][i] - (i - size / 2) / 3) < 1e-12);
  }
  assert.ok(new Set(layout.pieces.map(p => p.dimensions.map(v => v.toFixed(6)).join(','))).size > size ** 2);
  assert.ok(layout.pieces.some(p => p.dimensions[0] !== p.dimensions[1]));
  assert.ok(layout.pieces.every(p => p.dimensions.every(v => v > layout.gap)));
});
