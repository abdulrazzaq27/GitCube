/* global THREE, RoundedBoxGeometry, RoundedPlaneGeometry */
window.applyMirrorAppearance = function applyMirrorAppearance(game, plan) {
  if (!plan.mirror) return;
  const directions = [
    (u, v) => [1, -v, -u], (u, v) => [-1, -v, u],
    (u, v) => [u, 1, v], (u, v) => [u, -1, -v],
    (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1],
  ];
  const images = Array.from({ length: 6 }, (_, face) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(256, 256);
    // Direction-space softboxes stay continuous across cube-map seams. Their
    // narrow bright bands make the polished metal reflect a visible studio.
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      let [dx, dy, dz] = directions[face]((x + 0.5) / 128 - 1, (y + 0.5) / 128 - 1);
      const length = Math.hypot(dx, dy, dz);
      dx /= length; dy /= length; dz /= length;
      const strip = Math.exp(-Math.pow((Math.abs(dx) - Math.abs(dz) - 0.012) / 0.026, 2));
      const fill = Math.exp(-Math.pow((Math.abs(dy) - Math.abs(dz) + 0.065) / 0.065, 2));
      const light = Math.min(1, 0.24 + 0.12 * (dy + 1) + 0.6 * strip + 0.12 * fill);
      const index = (y * 256 + x) * 4;
      pixels.data[index] = Math.round(light * 248);
      pixels.data[index + 1] = Math.round(light * 252);
      pixels.data[index + 2] = Math.round(light * 255);
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  });
  const environment = new THREE.CubeTexture(images);
  environment.encoding = THREE.sRGBEncoding;
  environment.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: plan.stage.finish === 'gold' ? 0xd9ae42 : 0xd4d8df,
    metalness: 1, roughness: 0.18, envMap: environment, envMapIntensity: 1.2,
  });
  material.userData.displayColor = material.color.getHex();
  material.color.convertGammaToLinear(2.2);
  game.world.renderer.toneMapping = THREE.ReinhardToneMapping;
  game.world.renderer.toneMappingExposure = 1.65;
  game.world.renderer.gammaOutput = true;
  game.world.renderer.gammaFactor = 2.2;
  // Mirror-only studio lights: broad highlights and readable side faces.
  for (const [position, intensity] of [
    [[-4, 6, -3], 0.6], [[-4, -3, 6], 0.2], [[6, -3, -4], 0.3],
  ]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(...position);
    game.world.lights.holder.add(light);
  }
  const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });
  borderMaterial.userData.displayColor = 0x050505;
  borderMaterial.color.convertGammaToLinear(2.2);
  const border = 0.012;
  const faceGeometry = new THREE.Geometry().fromBufferGeometry(RoundedPlaneGeometry(1 / 3, 0.06, 0.0012));
  // Reuse the original rounded-box builder, cubie objects and layer pivots.
  const geometry = new RoundedBoxGeometry(1 / 3, 0.035, 3);
  geometry.computeBoundingBox();
  game.cube.pieces.forEach((piece, i) => {
    const layout = plan.mirror.pieces[i];
    const body = piece.userData.cube;
    body.geometry = geometry;
    body.material = borderMaterial;
    body.scale.set(...layout.dimensions.map(d => (d - plan.mirror.gap) * 3));
    body.position.set(...layout.center.map((center, axis) => center - layout.logical[axis]));
    // Merge the reflective outer faces into one mesh per block. The exposed
    // black shell forms real, consistently thick rims rather than wire lines.
    const merged = new THREE.Geometry();
    let faceCount = 0;
    for (const edge of piece.children.filter(node => piece.userData.edges.includes(node.name))) {
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(edge.rotation).round();
      const horizontal = new THREE.Vector3(1, 0, 0).applyEuler(edge.rotation).round();
      const vertical = new THREE.Vector3(0, 1, 0).applyEuler(edge.rotation).round();
      const axisOf = vector => ['x', 'y', 'z'].findIndex(axis => Math.abs(vector[axis]) === 1);
      const normalAxis = axisOf(normal), widthAxis = axisOf(horizontal), heightAxis = axisOf(vertical);
      const dimensions = layout.dimensions.map(d => d - plan.mirror.gap);
      const position = body.position.clone().addScaledVector(normal, dimensions[normalAxis] / 2 + 0.0003);
      const scale = new THREE.Vector3((dimensions[widthAxis] - border * 2) * 3, (dimensions[heightAxis] - border * 2) * 3, 1);
      const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(edge.rotation), scale);
      merged.merge(faceGeometry, matrix);
      faceCount++;
    }
    if (faceCount) {
      const surface = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(merged), material);
      surface.geometry.computeBoundingBox();
      piece.add(surface);
      piece.userData.mirrorSurface = surface;
    }
    piece.userData.mirrorFaceCount = faceCount;
  });
  // The original sticker objects remain as an invisible logical-state ledger.
  game.cube.edges.forEach(edge => { edge.visible = false; });
  game.cube.animator.position.set(...plan.mirror.offset.map(value => -value * game.cube.scale));
};
