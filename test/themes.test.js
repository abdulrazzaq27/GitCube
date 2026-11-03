import test from 'node:test';
import assert from 'node:assert/strict';
import { themeOutputs, THEMES } from '../src/themes.js';

test('theme paths preserve the light embed and pair it with a dark GIF', () => {
  assert.deepEqual(themeOutputs('assets/my-cube.gif'), [
    { theme: 'light', output: 'assets/my-cube.gif' },
    { theme: 'dark', output: 'assets/my-cube-dark.gif' },
  ]);
  assert.deepEqual(themeOutputs('custom.GIF', 'dark'), [{ theme: 'dark', output: 'custom.GIF' }]);
  assert.deepEqual(themeOutputs('custom.gif', 'light'), [{ theme: 'light', output: 'custom.gif' }]);
  assert.notEqual(THEMES.light.background, THEMES.dark.background);
});

test('invalid themes and non-GIF destinations fail before browser launch', () => {
  assert.throws(() => themeOutputs('cube.gif', 'automatic'), /Theme/);
  assert.throws(() => themeOutputs('cube.png'), /\.gif/);
});
