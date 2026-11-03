// Exact, integer sticker permutations. This is a verification oracle, not a renderer.
const FACES = {
  R: { axis: 0, sign: 1 }, L: { axis: 0, sign: -1 },
  U: { axis: 1, sign: 1 }, D: { axis: 1, sign: -1 },
  F: { axis: 2, sign: 1 }, B: { axis: 2, sign: -1 },
};

export function parseAlgorithm(notation) {
  if (typeof notation !== 'string' || !notation.trim()) throw new Error('An algorithm must contain moves.');
  return notation.trim().split(/\s+/).map(token => {
    if (!/^[RLUDFB](2|')?$/.test(token)) throw new Error(`Unsupported move: ${token}`);
    const { axis, sign } = FACES[token[0]];
    return { token, axis, sign, turns: -sign * (token.endsWith('2') ? 2 : token.endsWith("'") ? -1 : 1) };
  });
}

export function solvedStickers(size) {
  if (![2, 3].includes(size)) throw new Error('Only 2×2 and 3×3 cubes are supported.');
  const limit = size - 1;
  const stickers = [];
  for (let x = -limit; x <= limit; x += 2)
    for (let y = -limit; y <= limit; y += 2)
      for (let z = -limit; z <= limit; z += 2)
        for (const [face, { axis, sign }] of Object.entries(FACES)) {
          const position = [x, y, z];
          if (position[axis] !== sign * limit) continue;
          const normal = [0, 0, 0];
          normal[axis] = sign;
          stickers.push({ id: `${x},${y},${z}:${face}`, face, position, normal });
        }
  return stickers;
}

function quarterRotate(vector, axis, sign) {
  const result = [...vector];
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  result[a] = -sign * vector[b];
  result[b] = sign * vector[a];
  return result.map(value => value === 0 ? 0 : value);
}

export function applyMoves(stickers, moves, size) {
  const state = structuredClone(stickers);
  for (const move of moves) {
    for (const sticker of state) {
      if (sticker.position[move.axis] !== move.sign * (size - 1)) continue;
      for (let turn = 0; turn < Math.abs(move.turns); turn++) {
        sticker.position = quarterRotate(sticker.position, move.axis, Math.sign(move.turns));
        sticker.normal = quarterRotate(sticker.normal, move.axis, Math.sign(move.turns));
      }
    }
  }
  return state;
}

export function stateKey(stickers) {
  return stickers.map(s => `${s.id}:${s.position.join(',')}:${s.normal.join(',')}`).join('|');
}

export function verifyInvolution(notation, size) {
  const moves = parseAlgorithm(notation);
  const solved = solvedStickers(size);
  const once = applyMoves(solved, moves, size);
  const twice = applyMoves(once, moves, size);
  if (stateKey(once) === stateKey(solved)) throw new Error('Algorithm is the identity after one execution.');
  if (stateKey(twice) !== stateKey(solved)) throw new Error(`Algorithm does not satisfy A² = Identity on ${size}×${size}.`);
  return { moves: moves.length, stickers: solved.length, order: 2 };
}
