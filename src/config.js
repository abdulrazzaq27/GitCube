// Minimum rolling 365-day profile contribution total for each stage.
export const YEARLY_CONTRIBUTION_THRESHOLDS = Object.freeze([0, 100, 250, 500, 1000, 2000]);
// Retain the former export name for existing configuration imports.
export const YEARLY_COMMIT_THRESHOLDS = YEARLY_CONTRIBUTION_THRESHOLDS;
export const COMPLEXITY_THRESHOLDS = Object.freeze([30, 100]);

export const CUBE_STAGES = Object.freeze([
  { id: 'rubiks-2', name: '2×2 Rubik’s Cube', size: 2, variant: 'rubiks', finish: 'classic' },
  { id: 'mirror-2-silver', name: '2×2 Silver Mirror Cube', size: 2, variant: 'mirror', finish: 'silver' },
  { id: 'mirror-2-gold', name: '2×2 Golden Mirror Cube', size: 2, variant: 'mirror', finish: 'gold' },
  { id: 'rubiks-3', name: '3×3 Rubik’s Cube', size: 3, variant: 'rubiks', finish: 'classic' },
  { id: 'mirror-3-silver', name: '3×3 Silver Mirror Cube', size: 3, variant: 'mirror', finish: 'silver' },
  { id: 'mirror-3-gold', name: '3×3 Golden Mirror Cube', size: 3, variant: 'mirror', finish: 'gold' },
].map(Object.freeze));

export const MIRROR_OFFSETS = Object.freeze({
  2: Object.freeze([0.11, -0.07, 0.15]),
  3: Object.freeze([0.12, -0.08, 0.04]),
});

export function progressionThresholds({ stageThresholds, upgradeAt } = {}) {
  if (stageThresholds !== undefined && upgradeAt !== undefined)
    throw new Error('Use stageThresholds or the legacy upgradeAt option, not both.');
  if (upgradeAt !== undefined && (!Number.isSafeInteger(upgradeAt) || upgradeAt < 3))
    throw new Error('upgradeAt must be an integer of at least 3 for six stages.');
  const thresholds = stageThresholds ?? (upgradeAt === undefined ? YEARLY_CONTRIBUTION_THRESHOLDS
    : [0, Math.round(upgradeAt * 0.2), Math.round(upgradeAt * 0.5), upgradeAt, upgradeAt * 2, upgradeAt * 4]);
  if (!Array.isArray(thresholds) || thresholds.length !== 6 || thresholds[0] !== 0
    || thresholds.some((value, i) => !Number.isSafeInteger(value) || value < 0 || (i > 0 && value <= thresholds[i - 1])))
    throw new Error('Stage thresholds must be six strictly increasing integers starting at 0.');
  return [...thresholds];
}

export function selectStage(contributions365d, thresholds = YEARLY_CONTRIBUTION_THRESHOLDS) {
  if (!Number.isSafeInteger(contributions365d) || contributions365d < 0) throw new Error('Yearly contributions must be a nonnegative integer.');
  const configured = progressionThresholds({ stageThresholds: thresholds });
  let index = 0;
  for (let i = 1; i < configured.length; i++) if (contributions365d >= configured[i]) index = i;
  return { ...CUBE_STAGES[index], tier: index + 1, minContributions: configured[index] };
}
