import { chromium } from 'playwright';
import gifenc from 'gifenc';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { applyMoves, solvedStickers } from './cube-state.js';
import { THEMES, themeOutputs } from './themes.js';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const root = fileURLToPath(new URL('../', import.meta.url));

export async function openRenderer(plan) {
  const executablePath = process.env.GIT_CUBE_BROWSER;
  const browser = await chromium.launch({
    headless: true, ...(executablePath ? { executablePath } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: 1 });
    // Rendering is offline: no CDN, credentials, API responses or remote requests.
    await page.route('**/*', route => route.abort());
    await page.setContent('<style>*{margin:0}html,body,#stage{width:100%;height:100%;overflow:hidden}</style><div id="stage"></div>');
    await page.addScriptTag({ path: resolve(root, 'node_modules/three/build/three.min.js') });
    await page.addScriptTag({ content: 'class Animation { constructor() {} }' });
    for (const file of ['RoundedBoxGeometry', 'RoundedPlaneGeometry', 'World', 'Cube', 'Controls', 'Scrambler', 'Themes'])
      await page.addScriptTag({ path: resolve(root, `vendor/rubiks-cube-game/${file}.js`) });
    // The original game installs this geometry prototype in script.js.
    await page.addScriptTag({ content: 'RoundedBoxGeometry.prototype = Object.create(THREE.BufferGeometry.prototype); RoundedBoxGeometry.constructor = RoundedBoxGeometry;' });
    await page.addScriptTag({ path: resolve(root, 'src/browser-mirror.js') });
    await page.addScriptTag({ path: resolve(root, 'src/browser-renderer.js') });
    await page.evaluate(plan => window.initializeCube(plan), plan);
    return { browser, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

function sorted(stickers) {
  return [...stickers].sort((a, b) => a.id.localeCompare(b.id));
}

export async function verifyRenderedState(page, expected) {
  const actual = await page.evaluate(() => window.cubeRenderer.stickerState());
  if (JSON.stringify(actual) !== JSON.stringify(sorted(expected))) throw new Error('Rendered sticker state differs from the exact permutation oracle.');
}

export async function atomicWrite(path, bytes) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function createEncoding(firstPixels, background, mirror) {
  const samples = [firstPixels];
  const colors = mirror ? [0x050505, 0xd4d8df, 0xd9ae42, 0x43505e, 0xf9fbff, background]
    : [0xfff7ff, 0xffef48, 0xef3923, 0x41aac8, 0xff8c0a, 0x82ca38, 0x08101a, background];
  const shades = [];
  for (const hex of colors) for (let i = 0; i <= 80; i++) {
    const factor = 0.5 + i / 80 * 0.8;
    const rgb = [hex >> 16, (hex >> 8) & 255, hex & 255].map(c => Math.min(255, Math.round(c * factor)));
    for (let repeat = 0; repeat < 10; repeat++) shades.push(...rgb, 255);
  }
  samples.push(Buffer.from(shades));
  const palette = quantize(Buffer.concat(samples), 256, { format: 'rgb565' });
  return { encoder: GIFEncoder(), palette, firstIndexed: Buffer.from(applyPalette(firstPixels, palette, 'rgb565')) };
}

export async function renderGifs(plan, { output = 'output/git-cube.gif', theme = 'both', onProgress = () => {} } = {}) {
  const variants = themeOutputs(output, theme);
  const backgrounds = variants.map(v => THEMES[v.theme].background);
  const { browser, page } = await openRenderer(plan);
  try {
    const solved = solvedStickers(plan.size);
    await verifyRenderedState(page, solved);
    const geometry = plan.mirror ? await page.evaluate(() => window.cubeRenderer.geometryState()) : null;
    let expected = solved;
    const initial = await page.evaluate(backgrounds => backgrounds.map(bg => window.cubeRenderer.pixels(bg)), backgrounds);
    // Separate fixed palettes prevent flicker; geometry and the six sticker colors
    // are shared by both themes, evaluated on a single deterministic move timeline.
    const encodings = initial.map((base64, i) => createEncoding(Buffer.from(base64, 'base64'), backgrounds[i], plan.mirror));
    let checked = 0;
    for (let index = 0; index < plan.frames; index++) {
      const captures = await page.evaluate(({ index, backgrounds }) => {
        window.cubeRenderer.frame(index);
        return backgrounds.map(bg => window.cubeRenderer.pixels(bg));
      }, { index, backgrounds });
      while (checked < plan.segments.length && plan.segments[checked].end <= index) {
        expected = applyMoves(expected, [plan.segments[checked]], plan.size);
        checked++;
      }
      // Verify each completed move against the independent integer model.
      if (plan.segments.some(segment => segment.end === index)) await verifyRenderedState(page, expected);
      for (let i = 0; i < encodings.length; i++) {
        const { encoder, palette } = encodings[i];
        const indexed = applyPalette(Buffer.from(captures[i], 'base64'), palette, 'rgb565');
        encoder.writeFrame(indexed, plan.width, plan.height, {
          palette: index === 0 ? palette : undefined, delay: 1000 / plan.fps,
          repeat: 0, dispose: 1,
        });
      }
      if (index % plan.fps === 0) onProgress(index, plan.frames);
    }
    await page.evaluate(index => window.cubeRenderer.frame(index), plan.frames);
    await verifyRenderedState(page, solved);
    if (geometry && JSON.stringify(await page.evaluate(() => window.cubeRenderer.geometryState())) !== JSON.stringify(geometry))
      throw new Error('Mirror blocks did not return to their original geometry. Refusing an invalid loop.');
    const endpoints = await page.evaluate(backgrounds => backgrounds.map(bg => window.cubeRenderer.pixels(bg)), backgrounds);
    // Compare exactly what the GIF displays. A symmetric unmarked center can
    // rasterize one channel 1/255 differently after a real 180° center rotation;
    // the fixed GIF palette removes that sub-color rounding difference.
    const completed = encodings.map(({ encoder, palette, firstIndexed }, i) => {
      const endpointIndexed = Buffer.from(applyPalette(Buffer.from(endpoints[i], 'base64'), palette, 'rgb565'));
      if (!endpointIndexed.equals(firstIndexed)) throw new Error(`Loop endpoint differs in ${variants[i].theme} theme. Refusing a discontinuous GIF.`);
      encoder.finish();
      return Buffer.from(encoder.bytes());
    });
    // Finish and verify every theme before replacing any existing output.
    const results = [];
    for (let i = 0; i < variants.length; i++) {
      await atomicWrite(variants[i].output, completed[i]);
      results.push({ ...variants[i], bytes: completed[i].length, frames: plan.frames, durationSeconds: plan.frames / plan.fps, seamVerified: true });
    }
    return results;
  } finally {
    await browser.close();
  }
}

// Single-theme API retained for existing consumers and mathematical tests.
export async function renderGif(plan, options = {}) {
  const [result] = await renderGifs(plan, { ...options, theme: options.theme ?? 'light' });
  return result;
}
