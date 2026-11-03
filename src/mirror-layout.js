import { MIRROR_OFFSETS } from './config.js';

export function createMirrorLayout(size) {
  if (![2, 3].includes(size)) throw new Error('Mirror cubes support only sizes 2 and 3.');
  const offset = [...MIRROR_OFFSETS[size]];
  // Keep the mechanical cut planes shared across all axes. Moving those planes
  // independently would cause collisions and rectangular center orientation bugs.
  // Only the outer envelope is offset: the eight corner blocks become unequal.
  const cuts = offset.map(shift => Array.from({ length: size + 1 }, (_, i) =>
    (i - size / 2) / 3 + (i === 0 || i === size ? shift : 0)));
  const pieces = [];
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) {
    const indices = [x, y, z];
    const logical = indices.map(i => (i - (size - 1) / 2) / 3);
    const center = indices.map((i, axis) => (cuts[axis][i] + cuts[axis][i + 1]) / 2);
    const dimensions = indices.map((i, axis) => cuts[axis][i + 1] - cuts[axis][i]);
    if (dimensions.some(d => d <= 0.02)) throw new Error('Mirror offset leaves insufficient block clearance.');
    pieces.push({ id: pieces.length, logical, center, dimensions });
  }
  return { offset, cuts, pieces, gap: 0.009 };
}
