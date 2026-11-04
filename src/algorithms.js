import { verifyInvolution } from './cube-state.js';

const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
const Y = "F R U' R' U' R U R' F' R U R' U' R' F R F'";
const NA = "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'";

export const ALGORITHMS = Object.freeze([
  { id: 'ortega-diagonal', name: 'Ortega PBL · diagonal / diagonal', size: 2, tier: 1,
    notation: 'R2 F2 R2' },
  { id: 'ortega-adjacent', name: 'Ortega PBL · adjacent / adjacent', size: 2, tier: 2,
    notation: "R2 U' R2 U2 F2 U' R2" },
  { id: 'pocket-t', name: 'T-perm · adjacent corners', size: 2, tier: 3,
    notation: T },
  { id: 'checkerboard', name: 'Checkerboard', size: 3, tier: 1,
    notation: 'R2 L2 U2 D2 F2 B2' },
  { id: 't-perm', name: 'T-perm', size: 3, tier: 2,
    notation: T },
  // A tier can hold several cases partitioned by an exclusive commit ceiling.
  { id: 'na-perm', name: 'Na-perm', size: 3, tier: 3, untilCommits30d: 150,
    notation: NA },
  { id: 'y-perm', name: 'Y-perm', size: 3, tier: 3,
    notation: Y },
].map(algorithm => Object.freeze({ ...algorithm, verification: verifyInvolution(algorithm.notation, algorithm.size) })));

export function selectAlgorithm(size, commits30d, tiers = [30, 100]) {
  if (!Number.isSafeInteger(commits30d) || commits30d < 0) throw new Error('Commit counts must be nonnegative integers.');
  if (![2, 3].includes(size)) throw new Error('Unsupported cube size.');
  if (commits30d === 0) return null;
  const tier = commits30d < tiers[0] ? 1 : commits30d < tiers[1] ? 2 : 3;
  return ALGORITHMS.find(a => a.size === size && a.tier === tier
    && (a.untilCommits30d === undefined || commits30d < a.untilCommits30d));
}
