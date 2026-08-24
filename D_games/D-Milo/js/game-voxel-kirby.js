/* MERGE-BLOCK: game-voxel-kirby.js — Kirby in voxelwereld (Three.js, geen modules) */
const VoxelKirbyGame = (() => {
  const THREE = window.THREE;
  if (!THREE) {
    return {
      init() {},
      start() { return false; },
      stop() {},
      pause() {},
      resume() {},
      isActive() { return false; },
      getStars() { return 0; },
      resize() {}
    };
  }

  const BLOCK = 1;
  const WORLD = 192;
  const WORLD_HALF = WORLD / 2;
  const GRAVITY = 28;
  const MOVE_SPEED = 7;
  const JUMP = 18;
  const INHALE_RANGE = 5.5;
  const INHALE_FORCE = 20;
  const INHALE_CONE_DOT = 0.62;
  const BREAK_TIME = 0.5;
  const BREAK_RANGE = 4;
  const FALL_LIMIT = -18;
  const TOUCH_LOOK_SPEED = 1.65;
  const KEY_LOOK_SPEED = 2.0;
  const ARROW_LOOK_SPEED = 2.0;
  const CAMERA_DIST = 6.8;
  const CAMERA_HEIGHT = 1.6;
  const CAMERA_PITCH = 0.32;
  const KIRBY_HALF_W = 0.28;
  const KIRBY_FEET = 0.52;
  const KIRBY_HEAD = 0.55;
  const STEP_HEIGHT = 0.6;
  const COLLISION_EPS = 0.001;

  let spawnPoint = { x: 0, y: 2, z: 0 };
  let cameraYaw = 0;
  let cameraYawTarget = 0;
  let cameraLookPoint = null;
  let isMoving = false;
  let isTouchMode = false;

  let container;
  let renderer;
  let scene;
  let camera;
  let clock;
  let animId = null;
  let active = false;
  let paused = false;

  let kirby;
  let kirbyVel = new THREE.Vector3();
  let kirbyOnGround = false;
  let facingYaw = 0;

  let blocks = [];
  let blockGrid = new Map();
  let suckables = [];
  let animals = [];
  let inhaling = false;
  let inhaleMesh;
  let stars = 0;
  let breakTarget = null;
  let breakProgress = 0;
  let touchHack = false;

  const keys = {};
  const touchState = {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    leftPointerId: null,
    rightPointerId: null,
    leftCenter: null,
    rightCenter: null,
    leftMax: 0,
    rightMax: 0,
    jumpQueued: false
  };
  let touchInhale = false;

  const blockMats = {
    grass: new THREE.MeshLambertMaterial({ color: 0x5cb85c }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x8b6914 }),
    stone: new THREE.MeshLambertMaterial({ color: 0x888899 }),
    sand: new THREE.MeshLambertMaterial({ color: 0xe8d5a3 }),
    wood: new THREE.MeshLambertMaterial({ color: 0xa0522d }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x2d8a4e }),
    brick: new THREE.MeshLambertMaterial({ color: 0xb85c5c }),
    water: new THREE.MeshLambertMaterial({
      color: 0x38adff,
      transparent: true,
      opacity: 0.7
    })
  };

  const geo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const tmpBlockMatrix = new THREE.Matrix4();
  const hideBlockMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  function blockKey(gx, gy, gz) {
    return `${gx},${gy},${gz}`;
  }

  function registerBlockEntry(entry) {
    const { gx, gy, gz } = entry.userData;
    blockGrid.set(blockKey(gx, gy, gz), entry);
    blocks.push(entry);
  }

  function unregisterBlockEntry(entry) {
    const { gx, gy, gz } = entry.userData;
    blockGrid.delete(blockKey(gx, gy, gz));
    const idx = blocks.indexOf(entry);
    if (idx >= 0) blocks.splice(idx, 1);
  }

  function forEachBlocksInBox(minX, maxX, minY, maxY, minZ, maxZ, fn) {
    for (let gx = Math.floor(minX); gx <= Math.floor(maxX); gx += 1) {
      for (let gy = Math.floor(minY); gy <= Math.floor(maxY); gy += 1) {
        for (let gz = Math.floor(minZ); gz <= Math.floor(maxZ); gz += 1) {
          const entry = findBlockAt(gx, gy, gz);
          if (entry) fn(entry);
        }
      }
    }
  }

  function heightAt(x, z) {
    const nx = x * 0.028;
    const nz = z * 0.023;
    return Math.max(1, Math.round(
      3
      + Math.sin(nx) * 2
      + Math.cos(nz * 1.15) * 1.4
      + Math.sin(nx * 0.45 + nz * 0.55) * 0.9
    ));
  }

  function terrainXMin() {
    return -WORLD_HALF;
  }

  function terrainXMax() {
    return WORLD_HALF - 1;
  }

  function terrainZMin() {
    return -WORLD_HALF;
  }

  function terrainZMax() {
    return WORLD_HALF - 1;
  }

  function clampToWorld(x, z) {
    const margin = 3;
    return {
      x: Math.max(terrainXMin() + margin, Math.min(terrainXMax() - margin, x)),
      z: Math.max(terrainZMin() + margin, Math.min(terrainZMax() - margin, z))
    };
  }

  function randomWorldXZ() {
    const margin = 4;
    const span = WORLD_HALF - margin;
    return {
      x: (Math.random() * 2 - 1) * span,
      z: (Math.random() * 2 - 1) * span
    };
  }

  function addBlock(x, y, z, mat, opts = {}) {
    const existing = findBlockAt(x, y, z);
    if (existing) removeBlock(existing);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = !opts.water;
    mesh.receiveShadow = true;
    const entry = {
      instanced: false,
      mesh,
      userData: {
        solid: opts.solid !== false && !opts.water,
        water: !!opts.water,
        border: !!opts.border,
        breakable: opts.breakable !== false && !opts.border && !opts.water,
        gx: x,
        gy: y,
        gz: z
      }
    };
    scene.add(mesh);
    registerBlockEntry(entry);
    return entry;
  }

  function addInstancedBucket(positions, mat) {
    if (!positions.length) return;
    const im = new THREE.InstancedMesh(geo, mat, positions.length);
    im.castShadow = true;
    im.receiveShadow = true;
    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      tmpBlockMatrix.makeTranslation(p.x + 0.5, p.y + 0.5, p.z + 0.5);
      im.setMatrixAt(i, tmpBlockMatrix);
      registerBlockEntry({
        instanced: true,
        instanceMesh: im,
        instanceId: i,
        userData: {
          solid: true,
          water: false,
          border: false,
          breakable: true,
          gx: p.x,
          gy: p.y,
          gz: p.z
        }
      });
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }

  function addWater(x, y, z) {
    return addBlock(x, y, z, blockMats.water, { water: true, solid: false });
  }

  function removeBlock(entry) {
    if (!entry) return;
    unregisterBlockEntry(entry);
    if (entry.instanced) {
      entry.instanceMesh.setMatrixAt(entry.instanceId, hideBlockMatrix);
      entry.instanceMesh.instanceMatrix.needsUpdate = true;
    } else {
      scene.remove(entry.mesh);
    }
  }

  function findBlockAt(gx, gy, gz) {
    return blockGrid.get(blockKey(gx, gy, gz)) || null;
  }

  function isLakeAt(gx, gz) {
    const lakes = [
      [12, 10, 8], [-15, 8, 10], [-8, 18, 7], [4, -14, 6],
      [45, 35, 12], [-55, -40, 11], [70, -60, 14], [-75, 55, 10],
      [0, 80, 12], [-90, -25, 9], [85, 30, 11], [-35, -70, 13],
      [60, -85, 10], [-65, 80, 12], [25, -90, 9], [-95, 5, 11],
      [50, 70, 10], [-40, 90, 8], [88, -15, 9], [-20, -55, 11]
    ];
    return lakes.some(([lx, lz, r]) => Math.hypot(gx - lx, gz - lz) < r);
  }

  function buildRuins() {
    const ruins = [
      [8, 0, 6, 5, 4, 4, blockMats.brick],
      [-12, 0, -10, 4, 3, 5, blockMats.sand],
      [-4, 0, 14, 3, 6, 3, blockMats.stone],
      [14, 0, -6, 4, 2, 4, blockMats.brick],
      [-16, 0, 8, 3, 5, 3, blockMats.sand],
      [0, 0, -16, 6, 3, 3, blockMats.brick],
      [50, 0, 40, 5, 4, 5, blockMats.brick],
      [-60, 0, 55, 4, 5, 4, blockMats.stone],
      [70, 0, -50, 6, 3, 6, blockMats.sand],
      [-75, 0, -65, 5, 4, 4, blockMats.brick],
      [40, 0, -80, 4, 6, 3, blockMats.stone],
      [-45, 0, 85, 6, 3, 5, blockMats.sand],
      [85, 0, 20, 4, 4, 4, blockMats.brick],
      [-90, 0, -20, 5, 3, 5, blockMats.stone],
      [0, 0, 75, 7, 4, 4, blockMats.brick],
      [-30, 0, -75, 4, 5, 4, blockMats.sand]
    ];

    ruins.forEach(([bx, by, bz, w, ht, d, mat]) => {
      const doorX = Math.floor((w - 1) / 2);
      const doorW = w >= 5 ? 2 : 1;
      for (let x = 0; x < w; x += 1) {
        for (let y = 0; y < ht; y += 1) {
          for (let z = 0; z < d; z += 1) {
            const isPerimeter = x === 0 || x === w - 1 || z === 0 || z === d - 1;
            const isDoor = z === 0 && y < 2 && x >= doorX && x < doorX + doorW;
            if (!isPerimeter || isDoor) continue;
            const gx = bx + x;
            const gz = bz + z;
            const base = heightAt(gx, gz);
            addBlock(gx, base + by + y, gz, mat);
          }
        }
      }
    });
  }

  function buildTrees() {
    for (let i = 0; i < 64; i += 1) {
      const spot = randomWorldXZ();
      const tx = Math.round(spot.x);
      const tz = Math.round(spot.z);
      const th = heightAt(tx, tz);
      addBlock(tx, th, tz, blockMats.wood);
      addBlock(tx, th + 1, tz, blockMats.wood);
      addBlock(tx - 1, th + 2, tz, blockMats.leaf, { solid: false });
      addBlock(tx + 1, th + 2, tz, blockMats.leaf, { solid: false });
      addBlock(tx, th + 2, tz - 1, blockMats.leaf, { solid: false });
      addBlock(tx, th + 2, tz + 1, blockMats.leaf, { solid: false });
      addBlock(tx, th + 3, tz, blockMats.leaf, { solid: false });
    }
  }

  function yieldFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function setLoadingMessage(msg) {
    if (!container) return;
    let el = document.getElementById('game-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'game-loading';
      el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;background:rgba(7,17,31,0.88);color:#fff;font:600 1.05rem/1.4 system-ui,sans-serif;text-align:center;padding:24px;';
      container.appendChild(el);
    }
    el.textContent = msg;
  }

  function hideLoadingMessage() {
    document.getElementById('game-loading')?.remove();
  }

  async function buildWorldAsync(onProgress) {
    blocks = [];
    blockGrid = new Map();
    suckables = [];

    const buckets = { grass: [], dirt: [], stone: [] };
    let row = 0;

    while (row < WORLD) {
      for (let z = 0; z < WORLD; z += 1) {
        const wx = row - WORLD / 2;
        const wz = z - WORLD / 2;
        const h = heightAt(wx, wz);
        for (let y = 0; y < h; y += 1) {
          let key = 'dirt';
          if (y === h - 1) key = 'grass';
          if (y < h - 3) key = 'stone';
          buckets[key].push({ x: wx, y, z: wz });
        }
      }
      row += 1;
      if (row % 6 === 0) {
        onProgress?.(row / WORLD * 0.55);
        await yieldFrame();
      }
    }

    onProgress?.(0.58);
    await yieldFrame();
    addInstancedBucket(buckets.stone, blockMats.stone);
    addInstancedBucket(buckets.dirt, blockMats.dirt);
    addInstancedBucket(buckets.grass, blockMats.grass);

    onProgress?.(0.65);
    await yieldFrame();
    buildRuins();

    onProgress?.(0.72);
    await yieldFrame();

    let lakeRow = -WORLD_HALF + 2;
    while (lakeRow < WORLD_HALF - 2) {
      for (let z = -WORLD_HALF + 2; z < WORLD_HALF - 2; z += 1) {
        const x = lakeRow;
        const h = heightAt(x, z);
        const lake = isLakeAt(x, z) || h <= 2;
        if (!lake) continue;

        const surfaceBlockY = h - 1;
        const lakeDepth = isLakeAt(x, z) ? 3 : 2;
        const bottomY = Math.max(0, surfaceBlockY - lakeDepth + 1);

        for (let y = surfaceBlockY; y >= bottomY; y -= 1) {
          const existing = findBlockAt(x, y, z);
          if (existing) removeBlock(existing);
          addWater(x, y, z);
        }

        const sandY = bottomY - 1;
        if (sandY >= 0) {
          const existing = findBlockAt(x, sandY, z);
          if (existing && !existing.userData.water) {
            removeBlock(existing);
            addBlock(x, sandY, z, blockMats.sand);
          }
        }
      }
      lakeRow += 1;
      if (lakeRow % 8 === 0) {
        const lakeProgress = (lakeRow + WORLD_HALF) / WORLD;
        onProgress?.(0.72 + lakeProgress * 0.18);
        await yieldFrame();
      }
    }

    onProgress?.(0.92);
    await yieldFrame();
    buildTrees();

    const colors = [0xffd93d, 0xff6b9d, 0x6bcbff, 0xffa94d, 0xc084fc];
    for (let i = 0; i < 168; i += 1) {
      spawnSuckable(colors[i % colors.length]);
      if (i % 24 === 0) await yieldFrame();
    }

    spawnAnimals();

    spawnPoint = {
      x: 0,
      y: heightAt(0, 0) + KIRBY_FEET,
      z: 0
    };

    onProgress?.(1);
  }

  function buildWorld() {
    return buildWorldAsync();
  }

  function spawnSuckable(color) {
    const size = 0.45 + Math.random() * 0.2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 })
    );
    const spot = randomWorldXZ();
    const x = spot.x;
    const z = spot.z;
    const y = heightAt(x, z) + 1.2 + Math.random() * 0.5;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData = {
      suckable: true,
      vel: new THREE.Vector3(),
      spin: (Math.random() - 0.5) * 3,
      baseY: y
    };
    scene.add(mesh);
    suckables.push(mesh);
    return mesh;
  }

  function spawnOneAnimal() {
    const types = ['schaap', 'eend', 'waddle'];
    const type = types[Math.floor(Math.random() * types.length)];
    let x = 0;
    let z = 0;
    for (let tryN = 0; tryN < 12; tryN += 1) {
      const spot = randomWorldXZ();
      x = spot.x;
      z = spot.z;
      if (!isLakeAt(Math.round(x), Math.round(z))) break;
    }
    const y = heightAt(x, z) + 0.55;
    const group = new THREE.Group();
    if (type === 'schaap') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
      body.position.y = 0.2;
      group.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
      head.position.set(0, 0.35, 0.55);
      group.add(head);
    } else if (type === 'eend') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.75), new THREE.MeshLambertMaterial({ color: 0xffd54f }));
      body.position.y = 0.15;
      group.add(body);
    } else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshLambertMaterial({ color: 0xff9f45 }));
      body.position.y = 0.25;
      group.add(body);
    }
    group.position.set(x, y, z);
    group.userData = {
      animal: true, type, vel: new THREE.Vector3(),
      wanderT: Math.random() * 4, wanderDir: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.8
    };
    scene.add(group);
    animals.push(group);
  }

  function spawnAnimals() {
    animals.forEach((a) => scene.remove(a));
    animals = [];
    for (let i = 0; i < 56; i += 1) spawnOneAnimal();
  }

  function collectThing(points = 1) {
    stars += points;
    updateHud();
    window.dispatchEvent(new CustomEvent('kirby-collect', { detail: { stars } }));
  }

  function isNearWaterSurface(waterY) {
    if (waterY < -50 || !isKirbyInWater()) return false;
    return getKirbyFeetY() <= waterY + 0.45;
  }

  function isSubmergedInWater(waterY) {
    if (waterY < -50 || !isKirbyInWater()) return false;
    return getKirbyFeetY() < waterY + 0.1;
  }

  function isKirbyInWater() {
    const p = kirby.position;
    const gx = Math.floor(p.x);
    const gz = Math.floor(p.z);
    for (let gy = Math.floor(p.y - 0.2); gy <= Math.floor(p.y + 1.1); gy += 1) {
      const block = findBlockAt(gx, gy, gz);
      if (block?.userData.water) return true;
    }
    return false;
  }

  function getWaterSurfaceY(x, z) {
    let top = -999;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    for (let gy = 0; gy < 32; gy += 1) {
      const block = findBlockAt(gx, gy, gz);
      if (!block?.userData.water) continue;
      top = Math.max(top, gy + 1);
    }
    return top;
  }

  function pickBlockInFront() {
    const origin = kirby.position.clone();
    origin.y += 0.35;
    const dir = new THREE.Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
    let best = null;
    let bestDist = BREAK_RANGE;

    for (let step = 0.4; step <= BREAK_RANGE; step += 0.35) {
      const p = origin.clone().add(dir.clone().multiplyScalar(step));
      const gx = Math.floor(p.x);
      const gy = Math.floor(p.y);
      const gz = Math.floor(p.z);
      const block = findBlockAt(gx, gy, gz);
      if (block && block.userData.solid && block.userData.breakable) {
        best = block;
        bestDist = step;
        break;
      }
      const blockUp = findBlockAt(gx, gy + 1, gz);
      if (blockUp && blockUp.userData.solid && blockUp.userData.breakable) {
        best = blockUp;
        break;
      }
    }
    return best;
  }

  function resetBlockVisual(block) {
    if (!block || block.userData.water || block.instanced || !block.mesh) return;
    block.mesh.material.transparent = false;
    block.mesh.material.opacity = 1;
  }

  function updateBreaking(dt) {
    const hacking = keys.KeyF || touchHack;
    if (!hacking) {
      if (breakTarget) resetBlockVisual(breakTarget);
      breakTarget = null;
      breakProgress = 0;
      return;
    }

    const target = pickBlockInFront();
    if (!target) {
      if (breakTarget) resetBlockVisual(breakTarget);
      breakTarget = null;
      breakProgress = 0;
      return;
    }

    if (breakTarget !== target) {
      if (breakTarget) resetBlockVisual(breakTarget);
      breakTarget = target;
      breakProgress = 0;
    }

    breakProgress += dt;
    if (!target.instanced && target.mesh) {
      target.mesh.material.opacity = target.userData.water ? 0.7 : 0.55 + Math.sin(clock.elapsedTime * 18) * 0.15;
      if (target.mesh.material.transparent !== true && !target.userData.water) {
        target.mesh.material.transparent = true;
      }
    }

    if (breakProgress >= BREAK_TIME) {
      removeBlock(target);
      breakTarget = null;
      breakProgress = 0;
      collectThing(1);
    }
  }

  function updateAnimals(dt) {
    animals.slice().forEach((animal) => {
      const ud = animal.userData;
      ud.wanderT -= dt;
      if (ud.wanderT <= 0) {
        ud.wanderT = 1.5 + Math.random() * 3;
        ud.wanderDir = Math.random() * Math.PI * 2;
      }

      if (inhaling && isInInhaleCone(animal.position)) {
        const toKirby = kirby.position.clone().sub(animal.position);
        const dist = toKirby.length();
        if (dist < INHALE_RANGE + 1) {
          toKirby.normalize();
          ud.vel.add(toKirby.multiplyScalar(INHALE_FORCE * 0.7 * dt));
        }
      } else if (!inhaling) {
        ud.vel.x += Math.sin(ud.wanderDir) * ud.speed * dt * 0.6;
        ud.vel.z += Math.cos(ud.wanderDir) * ud.speed * dt * 0.6;
      }

      ud.vel.multiplyScalar(0.92);
      let nx = animal.position.x + ud.vel.x * dt;
      let nz = animal.position.z + ud.vel.z * dt;
      const clamped = clampToWorld(nx, nz);
      nx = clamped.x;
      nz = clamped.z;
      const gy = heightAt(nx, nz) + 0.55;
      animal.position.set(nx, gy, nz);
      animal.rotation.y = Math.atan2(ud.vel.x, ud.vel.z);

      if (inhaling && animal.position.distanceTo(kirby.position) < 0.85) {
        scene.remove(animal);
        const idx = animals.indexOf(animal);
        if (idx >= 0) animals.splice(idx, 1);
        collectThing(3);
        if (animals.length < 72) {
          setTimeout(() => spawnOneAnimal(), 6000 + Math.random() * 4000);
        }
      }
    });
  }

  function buildKirby() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 20),
      new THREE.MeshLambertMaterial({ color: 0xff9ec4, emissive: 0xff6ba8, emissiveIntensity: 0.08 })
    );
    body.castShadow = true;
    group.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, 0.12, 0.42);
    group.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.18;
    group.add(eyeR);

    const cheekGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff5a8a, transparent: true, opacity: 0.7 });
    const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
    cheekL.position.set(-0.32, -0.02, 0.36);
    group.add(cheekL);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.32;
    group.add(cheekR);

    const footGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const footMat = new THREE.MeshLambertMaterial({ color: 0xff4a88 });
    const footL = new THREE.Mesh(footGeo, footMat);
    footL.position.set(-0.22, -0.52, 0.08);
    footL.scale.set(1.1, 0.65, 1.3);
    group.add(footL);
    const footR = footL.clone();
    footR.position.x = 0.22;
    group.add(footR);

    group.userData.body = body;
    group.userData.feet = [footL, footR];
    return group;
  }

  function buildInhaleVisual() {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb8d8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = 1.1;
    cone.visible = false;
    kirby.add(cone);
    inhaleMesh = cone;
  }

  function getKirbyFeetY(pos = kirby.position) {
    return pos.y - KIRBY_FEET;
  }

  function getGroundY(x, z, feetY, maxStep = STEP_HEIGHT) {
    let top = -999;
    const minX = Math.floor(x - KIRBY_HALF_W);
    const maxX = Math.floor(x + KIRBY_HALF_W);
    const minZ = Math.floor(z - KIRBY_HALF_W);
    const maxZ = Math.floor(z + KIRBY_HALF_W);
    const maxY = Math.floor(feetY + maxStep);

    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gz = minZ; gz <= maxZ; gz += 1) {
        for (let gy = 0; gy <= maxY; gy += 1) {
          const b = findBlockAt(gx, gy, gz);
          if (!b?.userData.solid) continue;
          const blockTop = gy + 1;
          if (blockTop <= feetY + maxStep && blockTop > top) {
            top = blockTop;
          }
        }
      }
    }
    return top;
  }

  function resolveKirbyCollision(axis) {
    const hw = KIRBY_HALF_W;
    let minX = kirby.position.x - hw;
    let maxX = kirby.position.x + hw;
    let minY = kirby.position.y - KIRBY_FEET;
    let maxY = kirby.position.y + KIRBY_HEAD;
    let minZ = kirby.position.z - hw;
    let maxZ = kirby.position.z + hw;

    forEachBlocksInBox(minX, maxX, minY, maxY, minZ, maxZ, (b) => {
      if (!b.userData.solid) return;
      const gx = b.userData.gx;
      const gy = b.userData.gy;
      const gz = b.userData.gz;
      const bMinX = gx;
      const bMaxX = gx + 1;
      const bMinY = gy;
      const bMaxY = gy + 1;
      const bMinZ = gz;
      const bMaxZ = gz + 1;

      const overlaps = minX < bMaxX && maxX > bMinX
        && minY < bMaxY && maxY > bMinY
        && minZ < bMaxZ && maxZ > bMinZ;
      if (!overlaps) return;

      if (axis === 'x') {
        if (kirbyVel.x > 0) kirby.position.x = bMinX - hw - COLLISION_EPS;
        else if (kirbyVel.x < 0) kirby.position.x = bMaxX + hw + COLLISION_EPS;
        kirbyVel.x = 0;
        minX = kirby.position.x - hw;
        maxX = kirby.position.x + hw;
      } else if (axis === 'z') {
        if (kirbyVel.z > 0) kirby.position.z = bMinZ - hw - COLLISION_EPS;
        else if (kirbyVel.z < 0) kirby.position.z = bMaxZ + hw + COLLISION_EPS;
        kirbyVel.z = 0;
        minZ = kirby.position.z - hw;
        maxZ = kirby.position.z + hw;
      } else if (axis === 'y') {
        if (kirbyVel.y > 0) {
          kirby.position.y = bMinY - KIRBY_HEAD - COLLISION_EPS;
          kirbyVel.y = 0;
        } else if (kirbyVel.y < 0) {
          kirby.position.y = bMaxY + KIRBY_FEET + COLLISION_EPS;
          kirbyVel.y = 0;
          kirbyOnGround = true;
        }
        minY = kirby.position.y - KIRBY_FEET;
        maxY = kirby.position.y + KIRBY_HEAD;
      }
    });
  }

  function moveKirbyWithCollision(dt) {
    kirbyOnGround = false;

    kirby.position.x += kirbyVel.x * dt;
    resolveKirbyCollision('x');

    kirby.position.z += kirbyVel.z * dt;
    resolveKirbyCollision('z');

    kirby.position.y += kirbyVel.y * dt;
    resolveKirbyCollision('y');
  }

  function snapKirbyToGround(submerged, waterY) {
    const feetY = getKirbyFeetY();
    const groundTop = getGroundY(kirby.position.x, kirby.position.z, feetY);
    if (groundTop < -50) return;

    const floorCenterY = groundTop + KIRBY_FEET;
    if (submerged && waterY > -100) {
      const buoyY = Math.min(waterY - 0.15 + KIRBY_FEET, floorCenterY + 0.2);
      if (kirby.position.y < buoyY && kirbyVel.y <= 0.5) {
        kirby.position.y = buoyY;
        kirbyVel.y = 0;
      }
      return;
    }

    if (kirbyOnGround && kirby.position.y < floorCenterY) {
      kirby.position.y = floorCenterY;
      kirbyVel.y = 0;
    }
  }

  function collides(x, y, z) {
    const hw = KIRBY_HALF_W;
    const minX = x - hw;
    const maxX = x + hw;
    const minY = y - KIRBY_FEET;
    const maxY = y + KIRBY_HEAD;
    const minZ = z - hw;
    const maxZ = z + hw;
    let hit = false;

    forEachBlocksInBox(minX, maxX, minY, maxY, minZ, maxZ, (b) => {
      if (!b.userData.solid) return;
      const { gx, gy, gz } = b.userData;
      if (minX < gx + 1 && maxX > gx
        && minY < gy + 1 && maxY > gy
        && minZ < gz + 1 && maxZ > gz) {
        hit = true;
      }
    });
    return hit;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function applyDeadzone(v, dz = 0.12) {
    const a = Math.abs(v);
    if (a < dz) return 0;
    return Math.sign(v) * (a - dz) / (1 - dz);
  }

  function shouldUseTouchControls() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('touch')) return true;
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const hasTouch = maxTouchPoints > 0 || ('ontouchstart' in window);
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const smallScreen = window.matchMedia?.('(max-width: 900px)')?.matches;
    return hasTouch || coarse || smallScreen;
  }

  function updateTouchUI() {
    isTouchMode = shouldUseTouchControls() && active;
    document.body.classList.toggle('touch', isTouchMode);
    const el = document.getElementById('touch-controls');
    if (el) el.setAttribute('aria-hidden', isTouchMode ? 'false' : 'true');
  }

  function resetTouchAxes() {
    touchState.moveX = 0;
    touchState.moveZ = 0;
    touchState.lookX = 0;
    touchState.lookY = 0;
    touchState.leftPointerId = null;
    touchState.rightPointerId = null;
    touchState.leftCenter = null;
    touchState.rightCenter = null;
    touchState.jumpQueued = false;
    touchInhale = false;
    touchHack = false;
    const knobL = document.getElementById('touch-knob-left');
    const knobR = document.getElementById('touch-knob-right');
    knobL?.style.setProperty('--dx', '0px');
    knobL?.style.setProperty('--dy', '0px');
    knobR?.style.setProperty('--dx', '0px');
    knobR?.style.setProperty('--dy', '0px');
    document.getElementById('btn-inhale')?.classList.remove('pressed');
    document.getElementById('btn-hack')?.classList.remove('pressed');
  }

  function setupJoystick(el, knobEl, side) {
    if (!el || !knobEl) return;

    let tapStartTime = 0;
    let tapStartX = 0;
    let tapStartY = 0;
    let tapMoved = false;

    const updateFromPoint = (clientX, clientY) => {
      const center = side === 'left' ? touchState.leftCenter : touchState.rightCenter;
      const max = side === 'left' ? touchState.leftMax : touchState.rightMax;
      if (!center) return;

      const dx = clientX - center.x;
      const dy = clientY - center.y;
      let nx = clamp(dx / max, -1, 1);
      let ny = clamp(dy / max, -1, 1);
      const len = Math.hypot(nx, ny);
      if (len > 1e-6 && len > 1) {
        nx /= len;
        ny /= len;
      }

      nx = applyDeadzone(nx);
      ny = applyDeadzone(ny);

      knobEl.style.setProperty('--dx', `${nx * max}px`);
      knobEl.style.setProperty('--dy', `${ny * max}px`);

      if (side === 'left') {
        touchState.moveX = -nx;
        touchState.moveZ = -ny;
      } else {
        touchState.lookX = nx;
        touchState.lookY = ny;
      }
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (side === 'left' && touchState.leftPointerId !== null) return;
      if (side === 'right' && touchState.rightPointerId !== null) return;

      if (side === 'left') touchState.leftPointerId = e.pointerId;
      else touchState.rightPointerId = e.pointerId;

      tapStartTime = performance.now();
      tapStartX = e.clientX;
      tapStartY = e.clientY;
      tapMoved = false;

      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      if (side === 'left') {
        touchState.leftCenter = center;
        touchState.leftMax = rect.width * 0.3;
      } else {
        touchState.rightCenter = center;
        touchState.rightMax = rect.width * 0.3;
      }
      updateFromPoint(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      const pid = side === 'left' ? touchState.leftPointerId : touchState.rightPointerId;
      if (e.pointerId !== pid) return;
      const dx = e.clientX - tapStartX;
      const dy = e.clientY - tapStartY;
      if ((dx * dx + dy * dy) > 144) tapMoved = true;
      updateFromPoint(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    };

    const onUp = (e) => {
      const pid = side === 'left' ? touchState.leftPointerId : touchState.rightPointerId;
      if (e.pointerId !== pid) return;

      const tapMs = performance.now() - tapStartTime;
      const lookMag = Math.hypot(touchState.lookX, touchState.lookY);
      if (side === 'right' && e.pointerType === 'touch' && !tapMoved && tapMs < 240 && lookMag < 0.35) {
        touchState.jumpQueued = true;
      }

      if (side === 'left') {
        touchState.leftPointerId = null;
        touchState.leftCenter = null;
        touchState.moveX = 0;
        touchState.moveZ = 0;
      } else {
        touchState.rightPointerId = null;
        touchState.rightCenter = null;
        touchState.lookX = 0;
        touchState.lookY = 0;
      }

      knobEl.style.setProperty('--dx', '0px');
      knobEl.style.setProperty('--dy', '0px');
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onUp, { passive: false });
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyF'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    setupJoystick(
      document.getElementById('touch-joystick-left'),
      document.getElementById('touch-knob-left'),
      'left'
    );
    setupJoystick(
      document.getElementById('touch-joystick-right'),
      document.getElementById('touch-knob-right'),
      'right'
    );

    const inhaleBtn = document.getElementById('btn-inhale');
    if (inhaleBtn) {
      const down = (e) => {
        e.preventDefault();
        touchInhale = true;
        inhaleBtn.classList.add('pressed');
      };
      const up = () => {
        touchInhale = false;
        inhaleBtn.classList.remove('pressed');
      };
      inhaleBtn.addEventListener('pointerdown', down, { passive: false });
      inhaleBtn.addEventListener('pointerup', up);
      inhaleBtn.addEventListener('pointerleave', up);
      inhaleBtn.addEventListener('pointercancel', up);
    }

    const hackBtn = document.getElementById('btn-hack');
    if (hackBtn) {
      const down = (e) => {
        e.preventDefault();
        touchHack = true;
        hackBtn.classList.add('pressed');
      };
      const up = () => {
        touchHack = false;
        hackBtn.classList.remove('pressed');
      };
      hackBtn.addEventListener('pointerdown', down, { passive: false });
      hackBtn.addEventListener('pointerup', up);
      hackBtn.addEventListener('pointerleave', up);
      hackBtn.addEventListener('pointercancel', up);
    }
  }

  function readMoveInput() {
    let moveX = 0;
    let moveZ = 0;

    if (keys.KeyW || keys.ArrowUp) moveZ += 1;
    if (keys.KeyS || keys.ArrowDown) moveZ -= 1;
    if (keys.KeyD) moveX -= 1;
    if (keys.KeyA) moveX += 1;

    if (isTouchMode) {
      moveX += touchState.moveX;
      moveZ += touchState.moveZ;
    } else if (Math.abs(touchState.moveX) > 0.01 || Math.abs(touchState.moveZ) > 0.01) {
      moveX += touchState.moveX;
      moveZ += touchState.moveZ;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    return { moveX, moveZ };
  }

  function lerpAngle(current, target, t) {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, Math.max(0, t));
  }

  function dampAngle(current, target, lambda, dt) {
    return lerpAngle(current, target, 1 - Math.exp(-lambda * dt));
  }

  function isManualLook() {
    return Math.abs(touchState.lookX) > 0.05
      || keys.KeyQ || keys.KeyE
      || keys.ArrowLeft || keys.ArrowRight;
  }

  function getLookYaw() {
    return cameraYaw;
  }

  function applyLookInput(dt) {
    const turnQe = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
    const turnArrows = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    if (turnQe !== 0) {
      cameraYawTarget += turnQe * KEY_LOOK_SPEED * dt;
    }
    if (turnArrows !== 0) {
      cameraYawTarget += turnArrows * ARROW_LOOK_SPEED * dt;
    }
    if (Math.abs(touchState.lookX) > 0.01) {
      cameraYawTarget += touchState.lookX * TOUCH_LOOK_SPEED * dt;
    }
  }

  function updateCameraAngles(dt) {
    if (isMoving && !isManualLook()) {
      cameraYawTarget = dampAngle(cameraYawTarget, facingYaw, 5.5, dt);
    }

    cameraYaw = dampAngle(cameraYaw, cameraYawTarget, 12, dt);
  }

  function getCameraForward() {
    const yaw = getLookYaw();
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  function getCameraRight(forward) {
    return new THREE.Vector3(forward.z, 0, -forward.x);
  }

  function respawnKirby(message = 'Terug op het begin!') {
    kirby.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    kirbyVel.set(0, 0, 0);
    kirbyOnGround = true;
    cameraYaw = facingYaw;
    cameraYawTarget = facingYaw;
    const hp = document.getElementById('hud-hp');
    if (hp) hp.textContent = message;
  }

  function updateKirby(dt) {
    applyLookInput(dt);

    const { moveX, moveZ } = readMoveInput();
    const wantInhale = keys.ShiftLeft || keys.ShiftRight || touchInhale;
    const wantJump = keys.Space || touchState.jumpQueued;
    touchState.jumpQueued = false;

    const forward = getCameraForward();
    const right = getCameraRight(forward);
    const moveDir = new THREE.Vector3(0, 0, 0);
    moveDir.addScaledVector(forward, moveZ);
    moveDir.addScaledVector(right, moveX);

    const moving = moveDir.lengthSq() > 0.001;
    isMoving = moving;
    const waterY = getWaterSurfaceY(kirby.position.x, kirby.position.z);
    const inWater = isKirbyInWater();
    const submerged = isSubmergedInWater(waterY);
    const nearWaterSurface = isNearWaterSurface(waterY);
    let speed = wantInhale ? MOVE_SPEED * 0.55 : MOVE_SPEED;
    if (submerged) speed *= 0.7;
    const manualLook = isManualLook();

    if (moving) {
      moveDir.normalize();
      const movingBackward = moveDir.dot(forward) < -0.2;
      const mostlyStrafe = Math.abs(moveZ) < 0.35 && Math.abs(moveX) > 0.2;
      if (movingBackward || mostlyStrafe) {
        facingYaw = getLookYaw();
      } else {
        facingYaw = Math.atan2(moveDir.x, moveDir.z);
      }
      const speedMul = movingBackward ? 0.8 : 1;
      kirbyVel.x = moveDir.x * speed * speedMul;
      kirbyVel.z = moveDir.z * speed * speedMul;
    } else {
      kirbyVel.x *= 0.82;
      kirbyVel.z *= 0.82;
      if (manualLook) {
        facingYaw = dampAngle(facingYaw, cameraYawTarget, 9, dt);
      }
    }

    updateCameraAngles(dt);

    if (wantJump && (kirbyOnGround || nearWaterSurface)) {
      kirbyVel.y = JUMP;
      kirbyOnGround = false;
    }

    kirbyVel.y -= GRAVITY * dt;
    if (submerged && kirbyVel.y < 6) {
      kirbyVel.y += 16 * dt;
      if (kirbyVel.y < 3) kirbyVel.y *= 0.92;
    }

    moveKirbyWithCollision(dt);

    if (kirby.position.y < FALL_LIMIT) {
      respawnKirby('Je bent gevallen!');
      return;
    }

    snapKirbyToGround(submerged, waterY);

    kirby.rotation.y = dampAngle(kirby.rotation.y, facingYaw, 14, dt);
    inhaling = wantInhale;
    inhaleMesh.visible = inhaling;

    if (inhaling) {
      kirby.userData.body.scale.setScalar(1 + Math.sin(clock.elapsedTime * 12) * 0.04);
      inhaleMesh.material.opacity = 0.25 + Math.sin(clock.elapsedTime * 16) * 0.12;
    } else {
      kirby.userData.body.scale.setScalar(1);
    }

    const t = clock.elapsedTime * 10;
    kirby.userData.feet.forEach((foot, i) => {
      foot.position.y = -0.52 + (Math.abs(kirbyVel.x) + Math.abs(kirbyVel.z) > 0.5
        ? Math.sin(t + i * Math.PI) * 0.06
        : 0);
    });
  }

  function getKirbyForward() {
    return new THREE.Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
  }

  function isInInhaleCone(worldPos) {
    const forward = getKirbyForward();
    const toTarget = worldPos.clone().sub(kirby.position);
    toTarget.y = 0;
    if (toTarget.lengthSq() < 0.01) return true;
    toTarget.normalize();
    return toTarget.dot(forward) >= INHALE_CONE_DOT;
  }

  function updateInhale(dt) {
    if (!inhaling) return;

    const forward = getKirbyForward();
    const mouth = kirby.position.clone().add(forward.clone().multiplyScalar(0.5));

    suckables.slice().forEach((obj) => {
      if (!isInInhaleCone(obj.position)) return;

      const toKirby = mouth.clone().sub(obj.position);
      const dist = toKirby.length();
      if (dist > INHALE_RANGE) return;

      const dir = toKirby.normalize();

      obj.userData.vel.add(dir.multiplyScalar(INHALE_FORCE * dt * (1 + (INHALE_RANGE - dist) / INHALE_RANGE)));
      obj.position.add(obj.userData.vel.clone().multiplyScalar(dt));
      obj.userData.vel.multiplyScalar(0.92);
      obj.rotation.x += obj.userData.spin * dt;
      obj.rotation.y += obj.userData.spin * dt;

      if (obj.position.distanceTo(kirby.position) < 0.75) {
        scene.remove(obj);
        const idx = suckables.indexOf(obj);
        if (idx >= 0) suckables.splice(idx, 1);
        collectThing(1);
        const colors = [0xffd93d, 0xff6b9d, 0x6bcbff, 0xffa94d, 0xc084fc];
        spawnSuckable(colors[stars % colors.length]);
      }
    });
  }

  function updateSuckablesIdle(dt) {
    suckables.forEach((obj) => {
      if (inhaling) return;
      obj.position.y = obj.userData.baseY + Math.sin(clock.elapsedTime * 2 + obj.position.x) * 0.08;
      obj.rotation.y += dt * 0.6;
    });
  }

  function updateCamera(dt) {
    if (!kirby || !camera) return;

    const focus = kirby.position.clone().add(new THREE.Vector3(0, 0.95, 0));
    const horizDist = CAMERA_DIST * Math.cos(CAMERA_PITCH);
    const lift = CAMERA_HEIGHT + CAMERA_DIST * Math.sin(CAMERA_PITCH);

    const idealPos = new THREE.Vector3(
      focus.x - Math.sin(cameraYaw) * horizDist,
      focus.y + lift,
      focus.z - Math.cos(cameraYaw) * horizDist
    );

    const followSpeed = isManualLook() ? 14 : 10;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, idealPos.x, followSpeed, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, idealPos.y, followSpeed, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, idealPos.z, followSpeed, dt);

    if (!cameraLookPoint) cameraLookPoint = focus.clone();
    cameraLookPoint.lerp(focus, 1 - Math.exp(-14 * dt));
    camera.lookAt(cameraLookPoint);
  }

  function updateHud() {
    const el = document.getElementById('hud-coins');
    if (el) el.textContent = `Sterren: ${stars}`;
    const hp = document.getElementById('hud-hp');
    if (!hp) return;
    if (inhaling) hp.textContent = 'Zuigt!';
    else if (keys.KeyF || touchHack) hp.textContent = 'Hakt...';
    else if (isKirbyInWater()) hp.textContent = 'Zwemt';
    else if (getGroundY(kirby.position.x, kirby.position.z, getKirbyFeetY(), 0.2) < -50 && kirbyVel.y < -0.5) {
      hp.textContent = 'Valt!';
    }
    else hp.textContent = 'Kirby';
  }

  function tick() {
    if (!active) return;
    animId = requestAnimationFrame(tick);
    if (paused) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    updateKirby(dt);
    updateBreaking(dt);
    updateInhale(dt);
    updateAnimals(dt);
    updateSuckablesIdle(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  let resizeObserver = null;

  function getSceneSize() {
    if (!container) return { w: 0, h: 0 };
    let w = container.clientWidth;
    let h = container.clientHeight;
    if (w < 1 || h < 1) {
      const parent = container.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || (window.innerHeight - 120);
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function resize() {
    if (!container || !renderer || !camera) return;
    const { w, h } = getSceneSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  async function mountScene() {
    container = document.getElementById('game-scene');
    if (!container) return false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 70, 420);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
    camera.position.set(0, 8, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b8e4e, 0.85);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5d0, 1.1);
    sun.position.set(12, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    scene.add(sun);

    try {
      setLoadingMessage('Wereld bouwen... 0%');
      await buildWorldAsync((progress) => {
        setLoadingMessage(`Wereld bouwen... ${Math.round(progress * 100)}%`);
      });
    } catch (err) {
      console.error('buildWorld failed', err);
      hideLoadingMessage();
      return false;
    }

    hideLoadingMessage();

    kirby = buildKirby();
    kirby.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    scene.add(kirby);
    buildInhaleVisual();

    camera.position.set(
      spawnPoint.x - Math.sin(cameraYaw) * CAMERA_DIST * Math.cos(CAMERA_PITCH),
      spawnPoint.y + CAMERA_HEIGHT + CAMERA_DIST * Math.sin(CAMERA_PITCH) + 0.95,
      spawnPoint.z - Math.cos(cameraYaw) * CAMERA_DIST * Math.cos(CAMERA_PITCH)
    );
    camera.lookAt(spawnPoint.x, spawnPoint.y + 0.95, spawnPoint.z);

    kirbyVel.set(0, 0, 0);
    cameraYaw = 0;
    cameraYawTarget = 0;
    cameraLookPoint = null;
    facingYaw = 0;
    stars = 0;
    updateHud();

    clock = new THREE.Clock(false);
    return true;
  }

  function bindResizeObserver() {
    if (!container || resizeObserver) return;
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);
  }

  function unbindResizeObserver() {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  function showSceneUI(show) {
    document.getElementById('play-dashboard')?.classList.toggle('hidden', show);
    document.getElementById('game-scene')?.classList.toggle('hidden', !show);
    document.getElementById('game-scene-hint')?.classList.toggle('hidden', !show);
    const touchEl = document.getElementById('touch-controls');
    if (touchEl) touchEl.classList.toggle('hidden', !show);
    document.body.classList.toggle('game-active', show);
    updateTouchUI();
  }

  async function start() {
    if (active) {
      resize();
      return true;
    }

    showSceneUI(true);

    const mounted = await mountScene();
    if (!mounted) {
      showSceneUI(false);
      return false;
    }

    active = true;
    paused = false;
    bindResizeObserver();
    clock.start();
    window.addEventListener('resize', resize);

    requestAnimationFrame(() => {
      resize();
      updateCamera(0.016);
      if (renderer && scene && camera) renderer.render(scene, camera);
    });

    tick();
    return true;
  }

  function stop() {
    active = false;
    paused = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    window.removeEventListener('resize', resize);
    unbindResizeObserver();
    hideLoadingMessage();
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    kirby = null;
    cameraLookPoint = null;
    blocks = [];
    blockGrid = new Map();
    resetTouchAxes();
    showSceneUI(false);
  }

  function pause() {
    paused = true;
  }

  function resume() {
    if (!active) return start();
    paused = false;
    clock.start();
    tick();
  }

  function isActive() {
    return active;
  }

  function getStars() {
    return stars;
  }

  function init() {
    bindInput();
    window.addEventListener('resize', resize);
  }

  return { init, start, stop, pause, resume, isActive, getStars, resize };
})();

window.VoxelKirbyGame = VoxelKirbyGame;
/* END-MERGE-BLOCK */
