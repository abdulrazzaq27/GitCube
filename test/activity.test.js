import test from 'node:test';
import assert from 'node:assert/strict';
import { activityWindows, collectActivity, validateSnapshot } from '../src/activity.js';
import { createPlan } from '../src/plan.js';

test('30 and 365 days roll across year/month/leap boundaries with one endpoint', () => {
  const w = activityWindows('2024-03-15T12:34:56Z');
  assert.equal(w.from30, '2024-02-14T12:34:56.000Z');
  assert.equal(w.from365, '2023-03-16T12:34:56.000Z');
  assert.equal(w.to, '2024-03-15T12:34:56.000Z');
});

test('yearly profile totals include private activity without double counting; recent complexity stays commit-only', async () => {
  let request;
  const result = await collectActivity('abdulrazzaq27', {
    token: 'fake-test-token', asOf: new Date('2026-11-03T00:00:00Z'),
    fetchImpl: async (url, options) => {
      request = JSON.parse(options.body);
      assert.equal(url, 'https://api.github.com/graphql');
      return { ok: true, json: async () => ({ data: { user: {
        login: 'abdulrazzaq27',
        recent: { contributionCalendar: { totalContributions: 91 }, totalCommitContributions: 50, restrictedContributionsCount: 17 },
        yearly: { contributionCalendar: { totalContributions: 817 }, totalCommitContributions: 359, restrictedContributionsCount: 380 },
      } } }) };
    },
  });
  assert.equal(result.commits30d, 50);
  assert.equal(result.contributions365d, 817);
  assert.equal(result.version, 4);
  assert.match(request.query, /recent:[\s\S]*?\{ totalCommitContributions \}/);
  assert.match(request.query, /yearly:[\s\S]*?contributionCalendar \{ totalContributions \}/);
  assert.doesNotMatch(request.query, /restrictedContributionsCount/);
  const plan = createPlan(result);
  assert.equal(plan.stage.id, 'rubiks-3');
  assert.equal(plan.algorithm.tier, 2);
  assert.equal(request.variables.from30, '2026-10-04T00:00:00.000Z');
});

test('requires version-4 mixed-metric snapshots and never reuses old yearly commit counts', async () => {
  for (const version of [1, 2, 3]) assert.throws(() => validateSnapshot({ version }), /obsolete/i);
  await assert.rejects(collectActivity('valid', { token: 'fake', fetchImpl: async () => ({
    ok: true, json: async () => ({ data: { user: { login: 'valid', recent: {}, yearly: {} } } }),
  }) }), /Invalid commits30d/);
  await assert.rejects(collectActivity('valid', { token: 'fake', fetchImpl: async () => ({
    ok: true, json: async () => ({ data: { user: { login: 'valid', recent: { totalCommitContributions: 10 }, yearly: { totalCommitContributions: 817 } } } }),
  }) }), /Invalid contributions365d/);
});

test('fails closed for missing tokens, GraphQL errors, missing users and rate limits', async () => {
  await assert.rejects(collectActivity('valid', { token: '' }), /Set GH_TOKEN/);
  for (const [response, message] of [
    [{ ok: false, status: 403 }, /HTTP 403/],
    [{ ok: true, json: async () => ({ errors: [{ message: 'private details' }] }) }, /rejected/],
    [{ ok: true, json: async () => ({ data: { user: null } }) }, /not found/],
  ]) await assert.rejects(collectActivity('valid', { token: 'fake', fetchImpl: async () => response }), message);
});

test('rejects impossible counts and malformed snapshot windows', () => {
  const s = { version: 4, username: 'valid', commits30d: 4, contributions365d: 3,
    windows: activityWindows('2026-11-03'), scope: 'yearly-profile-contributions-and-recent-commits' };
  assert.throws(() => validateSnapshot(s), /exceed/);
  assert.throws(() => validateSnapshot({ ...s, contributions365d: 100, windows: { to: 'bad' } }), /Invalid/);
});
