import test from 'node:test';
import assert from 'node:assert/strict';
import { ALGORITHMS } from '../src/algorithms.js';
import { applyMoves, parseAlgorithm, solvedStickers, stateKey, verifyInvolution } from '../src/cube-state.js';
import { createPlan } from '../src/plan.js';
import { activityWindows } from '../src/activity.js';

const snapshot = (recent, yearly) => ({ version: 4, username: 'test', commits30d: recent, contributions365d: yearly,
  windows: activityWindows('2026-11-03T00:00:00Z'), scope: 'yearly-profile-contributions-and-recent-commits' });

for (const algorithm of ALGORITHMS) test(`${algorithm.size}×${algorithm.size} ${algorithm.name} is a nontrivial involution`, () => {
  assert.equal(verifyInvolution(algorithm.notation, algorithm.size).order, 2);
  // An exact permutation identity holds for arbitrary reachable states too.
  const scrambled = applyMoves(solvedStickers(algorithm.size), parseAlgorithm("R U F2 L' D B"), algorithm.size);
  const a = parseAlgorithm(algorithm.notation);
  assert.equal(stateKey(applyMoves(applyMoves(scrambled, a, algorithm.size), a, algorithm.size)), stateKey(scrambled));
});

test('rejects non-involutions, no-ops and unsupported notation', () => {
  for (const size of [2, 3]) {
    assert.throws(() => verifyInvolution("R U R' U R U2 R'", size), /does not satisfy/);
    assert.throws(() => verifyInvolution("R R'", size), /identity after one/);
  }
  for (const notation of ['', 'Rw', 'M2', 'R3', 'x']) assert.throws(() => parseAlgorithm(notation));
});

test('standard notation uses clockwise turns when looking at each face', () => {
  const solved = solvedStickers(3);
  const r = applyMoves(solved, parseAlgorithm('R'), 3);
  const corner = r.find(s => s.id === '2,2,2:U');
  assert.deepEqual(corner.position, [2, 2, -2]);
  assert.deepEqual(corner.normal, [0, 0, -1]);
  assert.equal(stateKey(applyMoves(solved, parseAlgorithm('R R R R'), 3)), stateKey(solved));
});

test('size and complexity vary independently at exact thresholds', () => {
  for (const [count, tier] of [[1, 1], [29, 1], [30, 2], [99, 2], [100, 3]]) {
    for (const [year, size] of [[499, 2], [500, 3]]) {
      const p = createPlan(snapshot(count, year));
      assert.equal(p.size, size);
      assert.equal(p.algorithm.tier, tier);
      assert.equal(p.segments.length, p.algorithm.verification.moves * 2);
      const first = p.segments.filter(s => s.pass === 0).map(s => s.token);
      const second = p.segments.filter(s => s.pass === 1).map(s => s.token);
      assert.deepEqual(first, second);
    }
  }
  for (const yearly of [0, 600]) {
    const p = createPlan(snapshot(0, yearly));
    assert.equal(p.algorithm, null);
    assert.equal(p.segments.length, 0);
    assert.equal(p.motion, 'gentle-rotation');
  }
});

test('plans reproduce and GIF frame timing is exact', () => {
  const s = snapshot(120, 600);
  assert.deepEqual(createPlan(s), createPlan(s));
  for (const fps of [20, 25, 50]) assert.equal((100 / fps) % 1, 0);
  assert.throws(() => createPlan(s, { fps: 24 }), /FPS/);
  assert.throws(() => createPlan(s, { tiers: [100, 30] }), /Tiers/);
});
