import { selectAlgorithm } from './algorithms.js';
import { parseAlgorithm, verifyInvolution } from './cube-state.js';
import { validateSnapshot } from './activity.js';
import { COMPLEXITY_THRESHOLDS, progressionThresholds, selectStage } from './config.js';
import { createMirrorLayout } from './mirror-layout.js';

export function createPlan(snapshot, { upgradeAt, stageThresholds, tiers = COMPLEXITY_THRESHOLDS, width = 400, fps = 25 } = {}) {
  validateSnapshot(snapshot);
  const thresholds = progressionThresholds({ stageThresholds, upgradeAt });
  if (tiers.length !== 2 || tiers.some(n => !Number.isSafeInteger(n) || n < 2) || tiers[0] >= tiers[1])
    throw new Error('Tiers must be two increasing integer boundaries (at least 2).');
  if (!Number.isInteger(width) || width < 96 || width > 1024) throw new Error('Width must be 96–1024 pixels.');
  if (![20, 25, 50].includes(fps)) throw new Error('FPS must be 20, 25, or 50 (exact GIF centisecond timing).');
  const stage = selectStage(snapshot.contributions365d, thresholds);
  const size = stage.size;
  const algorithm = selectAlgorithm(size, snapshot.commits30d, tiers);
  if (algorithm) verifyInvolution(algorithm.notation, size);
  const moves = algorithm ? parseAlgorithm(algorithm.notation) : [];
  // Half turns take longer; every move has zero-velocity endpoints and a short hold.
  const framesPerQuarter = Math.round(fps * 0.32);
  const hold = Math.max(1, Math.round(fps * 0.08));
  const pause = Math.round(fps * 0.48);
  const segments = [];
  let cursor = pause;
  if (algorithm) {
    for (let pass = 0; pass < 2; pass++) {
      for (const move of moves) {
        const duration = Math.round(framesPerQuarter * (Math.abs(move.turns) === 2 ? 1.5 : 1));
        segments.push({ ...move, start: cursor, end: cursor + duration, pass });
        cursor += duration + hold;
      }
      cursor += pause;
    }
  }
  return {
    version: 2, size, stage, mirror: stage.variant === 'mirror' ? createMirrorLayout(size) : null,
    algorithm, width, height: width, fps,
    frames: algorithm ? cursor : fps * 8,
    segments, pause, stageThresholds: thresholds, tiers: [...tiers],
    motion: algorithm ? 'paired-algorithm' : 'gentle-rotation',
  };
}
