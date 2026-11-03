/* global THREE, Cube, Controls, Scrambler, Themes, World */
// Loaded only inside an isolated headless page, after the original cube classes.
window.initializeCube = function initializeCube(plan) {
  const game = { dom: { game: document.querySelector('#stage') } };
  // World's original camera, lights, renderer and resize logic. Only its realtime
  // Animation base is disabled by the host: frames are advanced explicitly.
  const OriginalRenderer = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function(options) {
    return new OriginalRenderer({ ...options, preserveDrawingBuffer: true });
  };
  try { game.world = new World(game); }
  finally { THREE.WebGLRenderer = OriginalRenderer; }
  game.world.renderer.setClearColor(0xd1d5db, 1);
  game.world.renderer.setPixelRatio(1);
  game.cube = new Cube(game);
  // Reuse the original controls' layer selection, pivot and reparenting mechanics
  // without constructing mouse/touch handlers or the game's UI.
  game.controls = Object.create(Controls.prototype);
  game.controls.game = game;
  game.controls.group = new THREE.Object3D();
  game.controls.edges = new THREE.Object3D();
  game.themes = new Themes(game);
  game.themes.theme = 'cube';
  game.cube.size = plan.size;
  game.cube.init();
  window.applyMirrorAppearance(game, plan);
  game.scrambler = new Scrambler(game);
  let completed = 0;
  let active = null;
  let lastFrame = -1;

  function select(segment) {
    const move = game.scrambler.convertMove(segment.token);
    game.controls.flipAxis = new THREE.Vector3();
    game.controls.flipAxis[move.axis] = 1;
    const layer = game.controls.getLayer(move.position);
    const expected = plan.size * plan.size;
    if (layer.length !== expected) throw new Error(`Invalid layer: ${layer.length} pieces, expected ${expected}.`);
    game.controls.selectLayer(layer);
    active = { segment, angle: segment.turns * Math.PI / 2 };
  }

  function finish() {
    game.controls.group.rotation.set(0, 0, 0);
    game.controls.group.rotateOnAxis(game.controls.flipAxis, active.angle);
    game.controls.deselectLayer(game.controls.flipLayer);
    // Snap to the exact cubic lattice. Never reset stickers or change colors.
    for (const piece of game.cube.pieces) {
      piece.position.multiplyScalar(6).round().divideScalar(6);
      const rotation = new THREE.Matrix4().makeRotationFromQuaternion(piece.quaternion);
      const e = rotation.elements;
      for (let i = 0; i < e.length; i++) e[i] = Math.round(e[i]);
      piece.quaternion.setFromRotationMatrix(rotation).normalize();
      piece.updateMatrix();
    }
    active = null;
  }

  function frame(index) {
    if (index < lastFrame || index > plan.frames) throw new Error('Frames must advance monotonically within the loop.');
    lastFrame = index;
    while (completed < plan.segments.length && plan.segments[completed].end <= index) {
      if (!active) select(plan.segments[completed]);
      finish();
      completed++;
    }
    const segment = plan.segments[completed];
    if (segment && index >= segment.start) {
      if (!active) select(segment);
      const t = (index - segment.start) / (segment.end - segment.start);
      // Quintic smoothstep: continuous velocity and acceleration at each endpoint.
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      game.controls.group.rotation.set(0, 0, 0);
      game.controls.group.rotateOnAxis(game.controls.flipAxis, active.angle * eased);
    }
    const phase = 2 * Math.PI * index / plan.frames;
    // Periodic, zero-velocity motion at the seam; no orientation teleport.
    const amount = plan.algorithm ? 0.07 : 0.28;
    game.cube.holder.rotation.set(0.035 * (1 - Math.cos(phase)), amount * (1 - Math.cos(phase)), 0);
    game.world.update();
  }

  function stickerState() {
    game.world.scene.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().getInverse(game.cube.object.matrixWorld);
    return game.cube.edges.map(edge => {
      const piece = edge.parent;
      const relative = new THREE.Matrix4().multiplyMatrices(inverse, piece.matrixWorld);
      const position = new THREE.Vector3().setFromMatrixPosition(relative).multiplyScalar(6);
      const normal = edge.position.clone().normalize().transformDirection(relative);
      const initial = piece.userData.start.position.clone().multiplyScalar(6).round();
      const xyz = [initial.x, initial.y, initial.z].map(Math.round);
      return {
        id: `${xyz.join(',')}:${edge.name}`, face: edge.name,
        position: [position.x, position.y, position.z].map(v => Math.round(v) || 0),
        normal: [normal.x, normal.y, normal.z].map(v => Math.round(v) || 0),
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }

  function pixels(background) {
    if (background !== undefined) {
      game.world.renderer.setClearColor(background, 1);
      game.world.update();
    }
    const buffer = new Uint8Array(plan.width * plan.height * 4);
    const gl = game.world.renderer.getContext();
    gl.readPixels(0, 0, plan.width, plan.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    // WebGL's origin is bottom-left; GIF expects top-left.
    const row = plan.width * 4;
    const flipped = new Uint8Array(buffer.length);
    for (let y = 0; y < plan.height; y++) flipped.set(buffer.subarray(y * row, (y + 1) * row), (plan.height - 1 - y) * row);
    let binary = '';
    for (let i = 0; i < flipped.length; i += 16384) binary += String.fromCharCode(...flipped.subarray(i, i + 16384));
    return btoa(binary);
  }

  function geometryState() {
    game.world.scene.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().getInverse(game.cube.object.matrixWorld);
    function cornersOf(body) {
      if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
      const bounds = body.geometry.boundingBox;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, body.matrixWorld);
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
          corners.push([p.x, p.y, p.z].map(v => Math.round(v * 1e7) || 0).join(','));
        }
      return corners.sort();
    }
    return game.cube.pieces.map(piece => ({
      id: piece.name, corners: cornersOf(piece.userData.cube),
      surfaceCorners: piece.userData.mirrorSurface ? cornersOf(piece.userData.mirrorSurface) : [],
    }));
  }

  function appearanceState() {
    const first = game.cube.pieces[0];
    const material = (first.userData.mirrorSurface ?? first.userData.cube).material;
    return {
      visibleStickers: game.cube.edges.filter(edge => edge.visible).length,
      material: material.type, metalness: material.metalness ?? 0,
      color: material.userData.displayColor ?? material.color.getHex(),
      borderColor: plan.mirror ? first.userData.cube.material.userData.displayColor : null,
      metalFaces: game.cube.pieces.reduce((count, piece) => count + (piece.userData.mirrorFaceCount ?? 0), 0),
      faceColors: Object.fromEntries(game.cube.edges.map(edge => [edge.name, edge.material.color.getHex()])),
    };
  }

  window.cubeRenderer = { frame, stickerState, pixels, geometryState, appearanceState };
  frame(0);
  // r95 populates environment-map mip uniforms on the first draw. Warm that
  // resource before capturing frame zero, so reflections never change on load.
  if (plan.mirror) { game.world.update(); game.world.update(); }
};
