# Contributing

Use Node.js 22 or newer. Run `npm ci`, `npx playwright install chromium`,
`npm test`, `npm run verify`, and `npm run test:render`.
Linux may require `npx playwright install --with-deps chromium`.

Preserve the original cube design. Add algorithms only with an exact
nontrivial order-two permutation proof for each supported size. A new
algorithm must pass the WebGL/oracle check at every completed move and the
pixel-identical loop endpoint check. Do not substitute the inverse algorithm
for the required second execution of the same sequence.

Never commit credentials, personal snapshots, or private repository details.
Demo fixtures must be labeled synthetic. Dependency updates that affect the
legacy Three.js API require visual and mathematical verification.
