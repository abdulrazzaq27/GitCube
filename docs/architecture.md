# Architecture

`GitHub → aggregate snapshot → deterministic plan → original cube engine → GIF`

## Source reuse

The original game is vendored rather than replaced. Model generation still
uses its rounded box geometry, extruded sticker geometry, piece dimensions,
face assignment and exact colors. The original World class supplies the
renderer, perspective camera and lights. Controls supplies the layer pivot,
selection and world/local reparenting. Scrambler supplies notation conversion.
The interactive game UI, score storage, random scrambling, confetti and timers
are not needed in a headless CLI.

An adapter supplies the minimal game object expected by these classes. The
realtime animation base is disabled; each frame is driven by its integer index.
The WebGL drawing buffer is preserved for capture. The upstream geometry
prototype initialization is carried over from its original startup script.

## Six-stage progression and mirror geometry

`src/config.js` defines six ordered stage descriptors and their yearly contribution
minimums: 0, 100, 250, 500, 1000 and 2000. Selection returns an explicit stage
ID, tier, cube size, geometry variant and finish. Complexity is selected
separately from rolling 30-day commits. CLI and Action inputs can override the
thresholds without changing their order. The legacy upgrade threshold scales
the six stage minimums around the 3×3 entry point.

Classic stages run the unchanged model generator and color palette. Mirror
stages retain the same cubie objects, discrete lattice positions, notation
converter, face selectors and rotating layer groups. The original rounded-box
builder creates the solid block shells. Their dimensions and local offsets
come from `src/mirror-layout.js`; visible colored stickers are disabled while
the original sticker objects remain an invisible permutation ledger.

The outer envelope is offset relative to the mechanical core. Interior cut
planes stay at the original shared coordinates: zero for 2×2 and ±1/6 for 3×3.
Independently changing interior spacing would create intersecting blocks and
rectangular center orientation problems. Common interior planes keep a rotating
layer separated from stationary blocks. The offset envelope creates unequal
cuboids and visible protrusions in changed states. Face-center blocks remain
square in their tangential axes, so unmarked center spins preserve their shape.

Silver and gold finishes use inset metallic outer faces on matte black block
shells. The inset is measured in cube units so rims keep a consistent thickness
across unequal block sizes. Face geometry is merged into one surface mesh per
block, preserving the existing cubie pivots and move engine.

A deterministic procedural environment samples softbox bands in direction
space, keeping reflections continuous across cube-map seams. Mirror-only key,
fill and rim lights, gamma-correct color handling and tone mapping retain
highlight detail. Classic rendering is untouched. No textures are fetched.
The old renderer's environment-map uniforms are warmed before frame zero.
Each mirror loop checks the transformed bounding corners of both the shells
and metallic surfaces, as well as verifying the logical permutation.

## Mathematics

The independent oracle uses coordinates `-(N-1), -(N-3), …, N-1`. An exact
quarter turn permutes two coordinates with a sign change. Sticker normals
undergo the same transform; no floating point trigonometry is used in this
model. Every sticker has a persistent identity, so matching the solved state
checks a complete permutation, not just six uniform face colors.

Clockwise means clockwise when looking directly at the named face. The
adapter uses the upstream move converter and layer selectors. Rendering is
checked independently against the oracle, including the sign convention.

An admitted algorithm must change the state once and restore all sticker
identities, positions and normals on its second execution. A transformation
that fixes all uniquely labeled stickers is the identity permutation, so its
square also fixes any reachable starting state. Tests exercise scrambled
states as an additional regression check. Unmarked center-sticker spin is
visually irrelevant, as on a standard cube; picture-cube center orientation
is outside this project’s scope.

## Algorithm catalog

`src/algorithms.js` is the animation list. Each entry declares a case name, a
cube size, a complexity tier and a notation string, and every entry is proven
to be an involution at import time. Complexity is the rolling 30-day commit
count: 1–29 selects tier 1, 30–99 selects tier 2, and 100 or more selects
tier 3. Zero commits selects no algorithm at all, so the cube only turns
gently.

| Size | Tier 1 (fewer than 30) | Tier 2 (30–99) | Tier 3 (100 and up) |
| --- | --- | --- | --- |
| 2×2 | Ortega PBL, diagonal / diagonal (3) | Ortega PBL, adjacent / adjacent (7) | T-perm, adjacent corners (14) |
| 3×3 | Checkerboard (6) | T-perm (14) | Na-perm, 100–149 (21) · Y-perm, 150 and up (17) |

`selectAlgorithm` maps the stage's cube size and the computed tier onto
`ALGORITHMS.find(...)`. An entry may declare an exclusive `untilCommits30d`
ceiling, and the predicate skips entries whose ceiling the count has reached.
A tier can therefore carry several cases in disjoint commit ranges, with
catalog order breaking ties inside a shared range. For 3×3 tier 3, Na-perm
(21 moves, three corner/edge pairs) animates 100–149 recent commits and
Y-perm animates 150 and up. The 2×2 does not split its advanced tier, so
`pocket-t` covers every count from 100 upward. Splitting a tier changes only
which verified case plays; the plan, renderer and loop checks are unchanged.

## Frame schedule and loop

Each loop consists of an initial solved pause, all moves of A, a pause at the
changed state, the same moves of A, and a solved pause. Quarter turns take
about 320 ms; half turns take 1.5 times as long. Every face turn follows quintic
smoothstep, with zero velocity and acceleration at its endpoints, followed by
a short hold. A selected layer rotates rigidly about the cube’s true center.

Only completed transforms are snapped to the exact cubie lattice and cubic
rotation group, to prevent accumulated floating point drift. No piece is
reset to its initial state and no sticker material is swapped.

Whole-cube motion is a cosine-periodic angular excursion. Its orientation,
angular velocity and acceleration agree at the loop seam. With zero recent
commits it is the only motion. With an algorithm it remains subtle.

Frames are sampled at `0 … frameCount-1`. A separate check evaluates
`frameCount` and compares its fixed-palette GIF pixels exactly to frame zero.
The sticker permutation check remains exact and independent of quantization.
This comparison handles sub-color GPU rounding on symmetric unmarked centers
without relaxing the equality of displayed GIF pixels. Adding a duplicate
terminal frame would lengthen the seam pause, so it is intentionally excluded.

A global 256-color palette for each theme includes samples of the original colors under the
fixed lights. Full opaque frames use exact GIF centisecond delays and an
infinite loop extension. Encoding is deterministic for a fixed snapshot,
settings and browser/runtime. The finished GIF is written to a temporary file
and atomically renamed only after all checks pass. Light and dark variants
share one move timeline and appearance; only the clear background and its
palette samples differ. Classic cubes retain the six sticker colors; mirror
stages use the same metal finish in both themes. Both variants' loop endpoints are
verified before either file is replaced. README picture elements select the
matching variant with prefers-color-scheme and provide a light fallback.

## Data and privacy

Only two aggregate activity counts, username, shared endpoint, window
starts, scope and schema version enter the snapshot. Collection uses one
GraphQL query with two independent contributionsCollection aliases. Yearly
progression reads contributionCalendar.totalContributions, including all
qualifying contribution types and private activity totals exposed by GitHub.
Restricted activity is already included in that calendar total and is never
added again. Recent complexity reads totalCommitContributions for 30 days.
No repository names or private commit details are requested. Private commits
in the recent count require suitable authenticated access; seeing a profile's
private activity total does not identify those events as commits.
Auth errors fail the run, never silently substitute zero activity or synthetic
data. Earlier snapshots are rejected with a recollection message. Version 4
explicitly stores contributions365d and commits30d for their separate purposes.

The optional Git credential fallback is noninteractive and host-specific.
Rendering loads local scripts into an isolated headless page with all network
requests blocked. The token is never inserted into page content or arguments.
Snapshots are ignored by Git by default because they can reveal aggregate
private activity. The profile workflow commits GIFs and an aggregate
gallery; it does not commit raw snapshots. All snapshots share identical
window endpoints and starts. The single-profile composite Action remains
available for a profile repository's workflow.

The README’s first image is a synthetic 3×3 advanced Y-perm showcase. It is
generated by the demo script and is independent of profile activity. The
profile generation workflow never replaces this showcase with a user cube.
