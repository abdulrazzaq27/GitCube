import { ALGORITHMS } from '../src/algorithms.js';
for (const a of ALGORITHMS) console.log(`${a.size}×${a.size} ${a.name}: ${a.verification.moves} moves, A ≠ I, A² = I`);
