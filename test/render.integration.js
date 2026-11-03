import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { ALGORITHMS } from '../src/algorithms.js';
import { applyMoves, solvedStickers } from '../src/cube-state.js';
import { activityWindows } from '../src/activity.js';
import { createPlan } from '../src/plan.js';
import { openRenderer, renderGif, renderGifs, verifyRenderedState } from '../src/render.js';
import { CUBE_STAGES, YEARLY_CONTRIBUTION_THRESHOLDS } from '../src/config.js';

function fixture(size, tier) {
  return { version: 4, username: 'fixture', commits30d: [0, 10, 50, 120][tier], contributions365d: size === 2 ? 200 : 700,
    windows: activityWindows('2026-11-03T00:00:00Z'), scope: 'yearly-profile-contributions-and-recent-commits' };
}

for (const a of ALGORITHMS) test(`original WebGL engine follows oracle at EVERY turn: ${a.size}×${a.size} ${a.id}`, async () => {
  const plan = createPlan(fixture(a.size, a.tier), { width: 160 });
  const { browser, page } = await openRenderer(plan);
  try {
    let expected = solvedStickers(a.size);
    await verifyRenderedState(page, expected);
    const initial = await page.screenshot();
    let changed;
    for (const segment of plan.segments) {
      await page.evaluate(index => window.cubeRenderer.frame(index), segment.end);
      expected = applyMoves(expected, [segment], a.size);
      await verifyRenderedState(page, expected);
      if (segment === plan.segments.filter(s => s.pass === 0).at(-1)) changed = await page.screenshot();
    }
    await page.evaluate(index => window.cubeRenderer.frame(index), plan.frames);
    await verifyRenderedState(page, solvedStickers(a.size));
    assert.ok((await page.screenshot()).equals(initial), 'first and endpoint screenshots must match exactly');
    assert.ok(!changed.equals(initial), 'first pass must visibly change the cube');
  } finally { await browser.close(); }
});

test('encodes deterministic infinite GIFs with exact frame count/timing and seamless endpoints', async () => {
  await mkdir('test-output', { recursive: true });
  const plan = createPlan(fixture(2, 1), { width: 96, fps: 20 });
  const paths = ['test-output/first.gif', 'test-output/second.gif'];
  for (const output of paths) {
    const result = await renderGif(plan, { output });
    assert.equal(result.seamVerified, true);
    assert.equal(result.frames, plan.frames);
  }
  const first = await readFile(paths[0]);
  assert.ok(first.equals(await readFile(paths[1])), 'repeated GIFs must have identical bytes');
  assert.equal(first.subarray(0, 6).toString(), 'GIF89a');
  assert.ok(first.includes(Buffer.from('NETSCAPE2.0')));
  assert.equal(first.at(-1), 0x3b);
  // Read the GIF block structure rather than searching compressed image data.
  let offset = 13 + 3 * (2 ** ((first[10] & 7) + 1));
  let frames = 0, totalDelay = 0, loopCount;
  const skipBlocks = () => { while (first[offset] !== 0) offset += 1 + first[offset]; offset++; };
  while (first[offset] !== 0x3b) {
    const marker = first[offset++];
    if (marker === 0x21) {
      const label = first[offset++];
      if (label === 0xf9) totalDelay += first.readUInt16LE(offset + 2);
      if (label === 0xff && first.subarray(offset + 1, offset + 12).toString() === 'NETSCAPE2.0') loopCount = first.readUInt16LE(offset + 15);
      skipBlocks();
    } else if (marker === 0x2c) {
      frames++;
      const flags = first[offset + 8];
      offset += 9;
      if (flags & 128) offset += 3 * (2 ** ((flags & 7) + 1));
      offset++; // LZW minimum code size
      skipBlocks();
    } else throw new Error(`Unexpected GIF block ${marker}`);
  }
  assert.equal(frames, plan.frames);
  assert.equal(totalDelay, plan.frames * 100 / plan.fps);
  assert.equal(loopCount, 0);
});

for (const size of [2, 3]) test(`zero activity uses continuous, periodic whole-cube motion: ${size}×${size}`, async () => {
  const plan = createPlan(fixture(size, 0), { width: 96 });
  const { browser, page } = await openRenderer(plan);
  try {
    const initial = await page.screenshot();
    await page.evaluate(i => window.cubeRenderer.frame(i), plan.frames / 2);
    await verifyRenderedState(page, solvedStickers(size));
    assert.ok(!(await page.screenshot()).equals(initial));
    await page.evaluate(i => window.cubeRenderer.frame(i), plan.frames);
    assert.ok((await page.screenshot()).equals(initial));
  } finally { await browser.close(); }
});

test('larger 3×3 Y-perm has a pixel-identical GIF seam after real center rotations', async () => {
  const plan = createPlan(fixture(3, 3), { width: 320 });
  const result = await renderGif(plan, { output: 'test-output/y-perm-320.gif' });
  assert.equal(result.seamVerified, true);
});

test('paired GIFs share a verified loop and picture selects the correct decoded background', async () => {
  const plan = createPlan(fixture(2, 1), { width: 96, fps: 20 });
  const results = await renderGifs(plan, { output: 'test-output/themed.gif' });
  assert.deepEqual(results.map(r => r.theme), ['light', 'dark']);
  assert.ok(results.every(r => r.seamVerified && r.frames === plan.frames));
  const bytes = await Promise.all(results.map(r => readFile(r.output)));
  assert.ok(!bytes[0].equals(bytes[1]));
  const { browser } = await openRenderer(plan);
  try {
    const page = await browser.newPage();
    await page.route('https://git-cube.test/**', route => route.fulfill({
      contentType: 'image/gif', headers: { 'access-control-allow-origin': '*' },
      body: route.request().url().endsWith('-dark.gif') ? bytes[1] : bytes[0],
    }));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setContent('<picture><source media="(prefers-color-scheme: dark)" srcset="https://git-cube.test/cube-dark.gif"><img crossorigin="anonymous" src="https://git-cube.test/cube.gif"></picture>');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const url = `https://git-cube.test/cube${theme === 'dark' ? '-dark' : ''}.gif`;
      await page.waitForFunction(url => {
        const img = document.querySelector('img');
        return img.currentSrc === url && img.complete && img.naturalWidth === 96;
      }, url);
      const pixel = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(document.querySelector('img'), 0, 0);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      });
      assert.equal(pixel[3], 255);
      assert.ok(theme === 'dark' ? Math.max(...pixel.slice(0, 3)) < 32 : Math.min(...pixel.slice(0, 3)) > 180);
    }
  } finally { await browser.close(); }
});

for (const [index, stage] of CUBE_STAGES.entries()) {
  if (stage.variant !== 'mirror') continue;
  for (const tier of [1, 2, 3]) test(`${stage.id} complexity ${tier}: exact logical and solid-block identity after A²`, async () => {
    const snapshot = fixture(stage.size, tier);
    snapshot.contributions365d = Math.max(YEARLY_CONTRIBUTION_THRESHOLDS[index], snapshot.commits30d);
    const plan = createPlan(snapshot, { width: 160 });
    assert.equal(plan.stage.id, stage.id);
    const { browser, page } = await openRenderer(plan);
    try {
      await mkdir('test-output', { recursive: true });
      const initial = await page.evaluate(() => window.cubeRenderer.geometryState());
      const appearance = await page.evaluate(() => window.cubeRenderer.appearanceState());
      assert.equal(appearance.visibleStickers, 0);
      assert.equal(appearance.material, 'MeshStandardMaterial');
      assert.equal(appearance.metalness, 1);
      assert.equal(appearance.borderColor, 0x050505);
      assert.equal(appearance.metalFaces, stage.size * stage.size * 6);
      assert.equal(appearance.color, stage.finish === 'gold' ? 0xd9ae42 : 0xd4d8df);
      if (tier === 2) await page.screenshot({ path: `test-output/${stage.id}-solved.png` });
      let expected = solvedStickers(stage.size);
      const lastFirstPass = plan.segments.filter(segment => segment.pass === 0).at(-1);
      for (const segment of plan.segments) {
        await page.evaluate(i => window.cubeRenderer.frame(i), segment.end);
        expected = applyMoves(expected, [segment], stage.size);
        await verifyRenderedState(page, expected);
        if (segment === lastFirstPass) {
          assert.notDeepEqual(await page.evaluate(() => window.cubeRenderer.geometryState()), initial);
          if (tier === 2) await page.screenshot({ path: `test-output/${stage.id}-changed.png` });
        }
      }
      await page.evaluate(i => window.cubeRenderer.frame(i), plan.frames);
      assert.deepEqual(await page.evaluate(() => window.cubeRenderer.geometryState()), initial);
      await verifyRenderedState(page, solvedStickers(stage.size));
    } finally { await browser.close(); }
  });
}

for (const [size, yearly] of [[2, 90], [3, 700]]) test(`${size}×${size} classic materials and six colors are preserved`, async () => {
  const snapshot = fixture(size, 2);
  snapshot.contributions365d = yearly;
  const { browser, page } = await openRenderer(createPlan(snapshot, { width: 96 }));
  try {
    const appearance = await page.evaluate(() => window.cubeRenderer.appearanceState());
    assert.equal(appearance.visibleStickers, size * size * 6);
    assert.equal(appearance.material, 'MeshLambertMaterial');
    assert.deepEqual(appearance.faceColors, { L: 0x82ca38, R: 0x41aac8, D: 0xffef48, U: 0xfff7ff, B: 0xff8c0a, F: 0xef3923 });
  } finally { await browser.close(); }
});
