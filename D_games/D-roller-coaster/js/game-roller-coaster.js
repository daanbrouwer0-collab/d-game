/* MERGE-BLOCK: game-roller-coaster.js */
const RollerCoasterGame = (() => {
  const THREE = window.THREE;
  let active = false;
  let paused = false;
  let container;
  let renderer, scene, camera;
  let clock;
  let animId;

  // Track state
  let trackPoints = []; // Array of {x, y, z}
  let trackMesh;
  
  // Builder state
  let placementState = 'idle';
  let dragStartMouseY = 0;
  let dragBaseY = 2;
  let currentHeight = 2; // remembers the last placed height
  let ghostPosition = new THREE.Vector3();
  let ghostValid = false;
  let ghostTrackMesh = null;
  let activeSegmentType = 'normal';

  // Camera state
  let cameraAngleX = Math.PI / 4;
  let cameraAngleY = Math.PI / 4;
  let cameraDistance = 40;
  let cameraTarget = new THREE.Vector3(0, 0, 0);
  let cameraPeekOffset = new THREE.Vector3(0, 0, 0);
  let isRotatingCamera = false;
  let isPanningCamera = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const keysDown = new Set();
  const CAMERA_MIN_DISTANCE = 10;
  const CAMERA_MAX_DISTANCE = 400;
  const CAMERA_PAN_SPEED = 36;
  const CAMERA_MAX_PEEK = 90;
  
  // Interaction
  let raycaster, mouse;
  let groundPlane;
  
  // Riding State
  let isRiding = false;
  let rideDistance = 0;
  let rideVelocity = 0;
  let rideLength = 0;
  const PHYSICS_GRAVITY = 28;
  const PHYSICS_ROLLING_FRICTION = 0.22;
  const PHYSICS_AIR_DRAG = 0.0035;
  const PHYSICS_MAX_SPEED = 55;
  const PHYSICS_DISPATCH_SPEED = 6;
  const PHYSICS_CHAIN_LIFT_SPEED = 7;
  const PHYSICS_MIN_SPEED = 0.04;
  const RIDE_LOOK_AHEAD_DISTANCE = 10;
  const RIDE_LOOK_BLEND = 0.65;
  const TIE_WIDTH = 1.2;
  const TIE_HEIGHT = 0.08;
  const TIE_DEPTH = 0.2;
  const TIE_RAIL_OFFSET = -0.05;
  const RAIL_HALF_WIDTH = 0.4;
  const LOOP_RADIUS = 9;
  const LOOP_POINT_COUNT = 18;
  const LOOP_EXIT_GAP = 6;
  const LOOP_EXIT_SIDE = 3.5;
  const TRACK_SEGMENT_TYPES = {
    normal: { label: 'Normaal' },
    chainLift: { label: 'Kettinglift' },
    loop: { label: 'Looping' }
  };
  let curve = null;
  let trackFrames = [];
  let controlArcLengths = [];
  let chainLiftRanges = [];
  let chainLiftLatchEnd = -1;
  let undoGroupStack = [];

  // UI buttons
  let btnAdd, btnUndo, btnClear, btnRide, btnStop, btnLoop, rcControls;
  let btnSaveTrack, btnLoadTrack, btnDeleteTrack, trackSelect;
  let segmentTypeSelect;
  let coasterLibraryList, coasterLibraryEmpty;

  function init() {
    container = document.getElementById('game-scene');
    rcControls = document.getElementById('roller-coaster-controls');
    btnAdd = document.getElementById('btn-rc-add');
    btnUndo = document.getElementById('btn-rc-undo');
    btnClear = document.getElementById('btn-rc-clear');
    btnRide = document.getElementById('btn-rc-ride');
    btnStop = document.getElementById('btn-rc-stop');
    btnLoop = document.getElementById('btn-rc-loop');
    btnSaveTrack = document.getElementById('btn-rc-save-track');
    btnLoadTrack = document.getElementById('btn-rc-load-track');
    btnDeleteTrack = document.getElementById('btn-rc-delete-track');
    trackSelect = document.getElementById('rc-track-select');
    segmentTypeSelect = document.getElementById('rc-segment-type');
    coasterLibraryList = document.getElementById('coaster-library-list');
    coasterLibraryEmpty = document.getElementById('coaster-library-empty');
    
    document.getElementById('btn-play-coaster')?.addEventListener('click', () => {
      Nav.switchTab('play');
      Menu.openStartScreen();
    });

    btnAdd?.addEventListener('click', () => {
      Toast.show('Klik op het gras om een punt toe te voegen!');
    });
    btnUndo?.addEventListener('click', () => undoPoint());
    btnClear?.addEventListener('click', () => clearTrack());
    btnRide?.addEventListener('click', () => startRide());
    btnStop?.addEventListener('click', () => stopRide({ manualBuildResume: true }));
    btnLoop?.addEventListener('click', () => insertLoop());
    btnSaveTrack?.addEventListener('click', () => saveTrack());
    btnLoadTrack?.addEventListener('click', () => loadSelectedTrack());
    btnDeleteTrack?.addEventListener('click', () => deleteSelectedTrack());
    segmentTypeSelect?.addEventListener('change', () => {
      activeSegmentType = normalizeSegmentType(segmentTypeSelect.value);
      segmentTypeSelect.value = activeSegmentType;
      Toast.show(`Baanstuk: ${TRACK_SEGMENT_TYPES[activeSegmentType].label}`);
    });

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 80, 400);

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    resetCamera();

    clock = new THREE.Clock();
    
    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    scene.add(dirLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('contextmenu', e => e.preventDefault());
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => keysDown.clear());
    window.addEventListener('resize', resize);
    window.addEventListener('tabchange', (event) => {
      if (event.detail?.tabId === 'items') {
        renderCoasterLibrary();
      }
    });

    syncTrackSelect();
    syncSegmentTypeSelect();
    renderCoasterLibrary();
  }

  function normalizeSegmentType(value) {
    return TRACK_SEGMENT_TYPES[value] ? value : 'normal';
  }

  function syncSegmentTypeSelect() {
    activeSegmentType = normalizeSegmentType(activeSegmentType);
    if (segmentTypeSelect) {
      // Loop is geen sleep-type; UI toont alleen normaal/kettinglift
      segmentTypeSelect.value = activeSegmentType === 'chainLift' ? 'chainLift' : 'normal';
      if (activeSegmentType === 'loop') {
        activeSegmentType = 'normal';
      }
    }
  }

  function updateMouseFromEvent(event) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function syncBuildFog() {
    if (!scene || isRiding) return;
    const near = Math.max(60, cameraDistance * 1.15);
    const far = Math.max(near + 120, cameraDistance * 4.5);
    if (!scene.fog) {
      scene.fog = new THREE.Fog(0x87ceeb, near, far);
    } else {
      scene.fog.near = near;
      scene.fog.far = far;
    }
  }

  function syncRideFog() {
    if (!scene) return;
    scene.fog = new THREE.Fog(0x87ceeb, 18, 110);
  }

  function getLastPostPosition() {
    if (trackPoints.length === 0) {
      return new THREE.Vector3(0, currentHeight, 0);
    }
    const last = trackPoints[trackPoints.length - 1];
    return new THREE.Vector3(last.x, last.y, last.z);
  }

  function clearCameraPeek() {
    cameraPeekOffset.set(0, 0, 0);
  }

  function clampCameraPeek() {
    if (cameraPeekOffset.lengthSq() > CAMERA_MAX_PEEK * CAMERA_MAX_PEEK) {
      cameraPeekOffset.setLength(CAMERA_MAX_PEEK);
    }
  }

  function applyOrbitTarget() {
    cameraTarget.copy(getLastPostPosition()).add(cameraPeekOffset);
    updateCameraPosition();
    syncBuildFog();
  }

  function setOrbitPivotToLastPost() {
    clearCameraPeek();
    applyOrbitTarget();
  }

  function getBuildForwardXZ() {
    return {
      x: -Math.cos(cameraAngleX),
      z: -Math.sin(cameraAngleX)
    };
  }

  function getBuildRightXZ() {
    return {
      x: -Math.sin(cameraAngleX),
      z: Math.cos(cameraAngleX)
    };
  }

  function updateCameraPosition() {
    if (isRiding) return;
    camera.position.x = cameraTarget.x + cameraDistance * Math.cos(cameraAngleX) * Math.sin(cameraAngleY);
    camera.position.z = cameraTarget.z + cameraDistance * Math.sin(cameraAngleX) * Math.sin(cameraAngleY);
    camera.position.y = cameraTarget.y + cameraDistance * Math.cos(cameraAngleY);
    camera.lookAt(cameraTarget);
    camera.up.set(0, 1, 0);
  }

  function resetCamera(focusPoint = null) {
    cameraAngleX = Math.PI / 4;
    cameraAngleY = Math.PI / 4;
    cameraDistance = 40;
    clearCameraPeek();
    if (focusPoint) {
      cameraTarget.copy(focusPoint);
    } else {
      cameraTarget.copy(getLastPostPosition());
    }
    updateCameraPosition();
    syncBuildFog();
  }

  function getTrackLength() {
    if (!curve) return 0;
    return rideLength > 0 ? rideLength : curve.getLength();
  }

  function orientFrameFromWorldUp(tangent, prevBinormal = null) {
    const worldUp = new THREE.Vector3(0, 1, 0);
    let binormal = new THREE.Vector3().crossVectors(tangent, worldUp);

    // Bij steile stukken (tangent ≈ world-up) wordt het kruisproduct onstabiel → flip.
    // Hergebruik vorige binormal geprojecteerd op het vlak loodrecht op de tangent.
    if (binormal.lengthSq() < 1e-6) {
      if (prevBinormal && prevBinormal.lengthSq() > 1e-8) {
        binormal.copy(prevBinormal);
        binormal.addScaledVector(tangent, -binormal.dot(tangent));
      }
      if (binormal.lengthSq() < 1e-8) binormal.set(1, 0, 0);
    }
    binormal.normalize();

    // Continuïteit: voorkom 180° sprongen tussen opeenvolgende frames
    if (prevBinormal && binormal.dot(prevBinormal) < 0) {
      binormal.negate();
    }

    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    return { normal, binormal };
  }

  function computeWorldUpFrames(sourceCurve, segments) {
    const frames = [];
    if (!sourceCurve || segments < 1) return frames;
    const lengths = sourceCurve.getLengths(segments);
    let prevBinormal = null;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pos = sourceCurve.getPointAt(t);
      const tangent = sourceCurve.getTangentAt(t).clone().normalize();
      const oriented = orientFrameFromWorldUp(tangent, prevBinormal);
      prevBinormal = oriented.binormal;

      frames.push({
        pos: pos.clone(),
        tangent: tangent.clone(),
        normal: oriented.normal,
        binormal: oriented.binormal.clone(),
        t,
        distance: lengths[i] ?? (t * (lengths[lengths.length - 1] || 0))
      });
    }

    return frames;
  }

  function toTrackVec3(point) {
    if (!point) return new THREE.Vector3();
    if (point.isVector3) return point.clone();
    return new THREE.Vector3(Number(point.x) || 0, Number(point.y) || 0, Number(point.z) || 0);
  }

  function findLoopRanges(segmentTypes = []) {
    const ranges = [];
    let start = -1;
    for (let i = 0; i < segmentTypes.length; i++) {
      if (normalizeSegmentType(segmentTypes[i]) === 'loop') {
        if (start < 0) start = Math.max(0, i - 1);
      } else if (start >= 0) {
        ranges.push({ start, end: i - 1 });
        start = -1;
      }
    }
    if (start >= 0) {
      ranges.push({ start, end: segmentTypes.length - 1 });
    }
    return ranges;
  }

  function getLoopPlaneBinormal(pointsArray, start, end) {
    const p0 = toTrackVec3(pointsArray[start]);
    let p1 = toTrackVec3(pointsArray[Math.min(start + 1, end)]);
    let horiz = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z);
    if (horiz.lengthSq() < 1e-6) {
      const mid = toTrackVec3(pointsArray[Math.floor((start + end) / 2)]);
      horiz.set(mid.x - p0.x, 0, mid.z - p0.z);
    }
    if (horiz.lengthSq() < 1e-6) horiz.set(1, 0, 0);
    horiz.normalize();
    const binormal = new THREE.Vector3().crossVectors(horiz, new THREE.Vector3(0, 1, 0));
    if (binormal.lengthSq() < 1e-8) binormal.set(0, 0, 1);
    return binormal.normalize();
  }

  function frameFromBinormal(tangent, preferredBinormal, preferUpright) {
    let binormal = preferredBinormal.clone();
    let normal = new THREE.Vector3().crossVectors(binormal, tangent);
    if (normal.lengthSq() < 1e-8) {
      normal.set(0, 1, 0);
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
    }
    normal.normalize();
    if (preferUpright && normal.y < 0) {
      normal.negate();
    }
    binormal.crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();
    return { normal, binormal };
  }

  // Verticale looping: vaste binormal (loodrecht op het loopvlak) zodat rails niet op de zijkant kantelen
  function computeHybridLoopFrames(sourceCurve, segments, segmentTypes = [], pointsArray = []) {
    const frames = [];
    if (!sourceCurve || segments < 1) return frames;

    const lengths = sourceCurve.getLengths(segments);
    const points = Array.isArray(pointsArray) ? pointsArray : [];
    const loopRanges = findLoopRanges(segmentTypes).map((range) => ({
      ...range,
      binormal: getLoopPlaneBinormal(points, range.start, range.end)
    }));

    const pointsData = points.map((point, index) => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      z: Number(point.z) || 0,
      segmentType: segmentTypes[index]
    }));

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pos = sourceCurve.getPointAt(t);
      const tangent = sourceCurve.getTangentAt(t).clone().normalize();

      const segIndex = getSegmentIndexAtRatio(t, pointsData);
      const pointIndex = segIndex < 0 ? 0 : segIndex + 1;
      const activeLoop = loopRanges.find((range) => pointIndex >= range.start && pointIndex <= range.end);

      let normal;
      let binormal;
      if (activeLoop) {
        const oriented = frameFromBinormal(tangent, activeLoop.binormal, false);
        normal = oriented.normal;
        binormal = oriented.binormal;
      } else {
        const prevBinormal = frames.length ? frames[frames.length - 1].binormal : null;
        const oriented = orientFrameFromWorldUp(tangent, prevBinormal);
        normal = oriented.normal;
        binormal = oriented.binormal;
      }

      frames.push({
        pos: pos.clone(),
        tangent: tangent.clone(),
        normal,
        binormal,
        t,
        distance: lengths[i] ?? (t * (lengths[lengths.length - 1] || 0))
      });
    }

    // Zorg dat de looping bij binnenkomst met normal omhoog begint (niet gespiegeld)
    for (const range of loopRanges) {
      let entryFrame = null;
      for (let i = 0; i < frames.length; i++) {
        const segIndex = getSegmentIndexAtRatio(frames[i].t, pointsData);
        const pointIndex = segIndex < 0 ? 0 : segIndex + 1;
        if (pointIndex >= range.start && pointIndex <= range.end) {
          entryFrame = frames[i];
          break;
        }
      }
      if (entryFrame && entryFrame.normal.y < 0) {
        for (let i = 0; i < frames.length; i++) {
          const segIndex = getSegmentIndexAtRatio(frames[i].t, pointsData);
          const pointIndex = segIndex < 0 ? 0 : segIndex + 1;
          if (pointIndex >= range.start && pointIndex <= range.end) {
            frames[i].normal.negate();
            frames[i].binormal.negate();
          }
        }
      }
    }

    return frames;
  }

  function trackNeedsLoopFrames(segmentTypes = []) {
    return Array.isArray(segmentTypes) && segmentTypes.some((type) => normalizeSegmentType(type) === 'loop');
  }

  function computeTrackFrames(sourceCurve, segments, segmentTypes = [], pointsArray = []) {
    if (trackNeedsLoopFrames(segmentTypes)) {
      return computeHybridLoopFrames(sourceCurve, segments, segmentTypes, pointsArray);
    }
    return computeWorldUpFrames(sourceCurve, segments);
  }

  function findClosestFrame(frames, point) {
    if (!frames.length) return null;
    let best = frames[0];
    let bestDist = Infinity;
    const target = point.isVector3 ? point : new THREE.Vector3(point.x, point.y, point.z);
    for (let i = 0; i < frames.length; i++) {
      const dist = frames[i].pos.distanceToSquared(target);
      if (dist < bestDist) {
        bestDist = dist;
        best = frames[i];
      }
    }
    return best;
  }

  function rebuildTrackFrames(sourceCurve = curve, segmentTypes = null) {
    trackFrames = [];
    if (!sourceCurve) return trackFrames;
    const length = sourceCurve.getLength();
    if (!Number.isFinite(length) || length <= 0) return trackFrames;
    const segments = Math.max(48, Math.floor(length * 2.5));
    const types = segmentTypes || trackPoints.map((p) => normalizeSegmentType(p.segmentType));
    const points = trackPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    trackFrames = computeTrackFrames(sourceCurve, segments, types, points);
    return trackFrames;
  }

  function getTrackSample(distance) {
    const length = getTrackLength();
    if (!curve || length <= 0) return null;

    const clampedDistance = THREE.MathUtils.clamp(distance, 0, length);

    if (trackFrames.length >= 2) {
      const lastFrame = trackFrames[trackFrames.length - 1];
      const total = lastFrame.distance || length;
      if (clampedDistance <= trackFrames[0].distance) {
        const f = trackFrames[0];
        return {
          pos: f.pos.clone(),
          tangent: f.tangent.clone(),
          normal: f.normal.clone(),
          progress: length > 0 ? clampedDistance / length : 0,
          distance: clampedDistance
        };
      }
      for (let i = 0; i < trackFrames.length - 1; i++) {
        const a = trackFrames[i];
        const b = trackFrames[i + 1];
        if (clampedDistance <= b.distance || i === trackFrames.length - 2) {
          const span = Math.max(1e-6, b.distance - a.distance);
          const alpha = THREE.MathUtils.clamp((clampedDistance - a.distance) / span, 0, 1);
          const pos = a.pos.clone().lerp(b.pos, alpha);
          const tangent = a.tangent.clone().lerp(b.tangent, alpha).normalize();
          // Slerp-achtig: voorkom dat lerp door nul gaat bij bijna-tegengestelde normals
          let normal;
          if (a.normal.dot(b.normal) < 0) {
            normal = (alpha < 0.5 ? a.normal : b.normal).clone();
          } else {
            normal = a.normal.clone().lerp(b.normal, alpha).normalize();
          }
          return {
            pos,
            tangent,
            normal,
            progress: length > 0 ? clampedDistance / length : 0,
            distance: clampedDistance
          };
        }
      }
    }

    const progress = length > 0 ? clampedDistance / length : 0;
    const pos = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let binormal = new THREE.Vector3().crossVectors(tangent, up);
    if (binormal.lengthSq() < 0.0001) binormal.set(1, 0, 0);
    binormal.normalize();
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    return { pos, tangent, normal, progress, distance: clampedDistance };
  }

  function updateRideCamera(sample) {
    if (!sample) return;

    const onChainLift = shouldUseChainLift(sample);
    // Op de kettinglift altijd "zit" omhoog houden — nooit omkeren
    const seatUp = sample.normal.clone();
    if (onChainLift && seatUp.y < 0) seatUp.negate();

    camera.position.copy(sample.pos);
    camera.position.addScaledVector(seatUp, 1.4);

    // Altijd een vaste afstand vooruit op de baan kijken (niet op tijd/snelheid)
    const travelSign = rideVelocity >= 0 ? 1 : -1;
    const aheadDistance = THREE.MathUtils.clamp(
      sample.distance + travelSign * RIDE_LOOK_AHEAD_DISTANCE,
      0,
      getTrackLength()
    );
    const ahead = getTrackSample(aheadDistance);

    if (ahead && ahead.distance !== sample.distance) {
      const localLook = sample.pos.clone().addScaledVector(sample.tangent, travelSign * 3);
      const aheadUp = ahead.normal.clone();
      if (onChainLift && aheadUp.y < 0) aheadUp.negate();
      const cornerLook = ahead.pos.clone().addScaledVector(aheadUp, 0.6);
      const lookTarget = localLook.lerp(cornerLook, RIDE_LOOK_BLEND);
      camera.lookAt(lookTarget);
      camera.up.copy(seatUp.clone().lerp(aheadUp, 0.25).normalize());
    } else {
      const target = camera.position.clone().addScaledVector(sample.tangent, travelSign);
      camera.lookAt(target);
      camera.up.copy(seatUp);
    }
  }

  function shouldUseChainLift(sample) {
    if (!sample || rideLength <= 0) return false;
    const d = sample.distance;

    // Eenmaal op de ketting: blijf vast tot voorbij het einde (voorkomt heen-en-weer)
    if (chainLiftLatchEnd >= 0) {
      if (d <= chainLiftLatchEnd) return true;
      chainLiftLatchEnd = -1;
    }

    for (let i = 0; i < chainLiftRanges.length; i++) {
      const range = chainLiftRanges[i];
      if (d >= range.start - 0.35 && d <= range.end + 0.15) {
        chainLiftLatchEnd = range.end + 0.15;
        return true;
      }
    }
    return false;
  }

  function getSegmentIndexAtRatio(ratio, pointsData = trackPoints) {
    if (!Array.isArray(pointsData) || pointsData.length < 2) return -1;

    const clampedRatio = THREE.MathUtils.clamp(ratio, 0, 0.999999);
    let totalLength = 0;
    const segmentLengths = [];

    for (let i = 0; i < pointsData.length - 1; i++) {
      const a = pointsData[i];
      const b = pointsData[i + 1];
      const length = new THREE.Vector3(a.x, a.y, a.z).distanceTo(new THREE.Vector3(b.x, b.y, b.z));
      segmentLengths.push(length);
      totalLength += length;
    }

    if (totalLength <= 0) return 0;

    const targetLength = clampedRatio * totalLength;
    let traversed = 0;
    for (let i = 0; i < segmentLengths.length; i++) {
      traversed += segmentLengths[i];
      if (targetLength <= traversed || i === segmentLengths.length - 1) {
        return i;
      }
    }

    return segmentLengths.length - 1;
  }

  function arcLengthAtCurveParameter(sourceCurve, t, divisions = 256) {
    if (!sourceCurve) return 0;
    const clampedT = THREE.MathUtils.clamp(t, 0, 1);
    if (clampedT <= 0) return 0;
    const lengths = sourceCurve.getLengths(divisions);
    const total = lengths[lengths.length - 1] || 0;
    if (clampedT >= 1) return total;
    const idx = clampedT * divisions;
    const i0 = Math.floor(idx);
    const i1 = Math.min(divisions, i0 + 1);
    const alpha = idx - i0;
    return THREE.MathUtils.lerp(lengths[i0], lengths[i1], alpha);
  }

  function rebuildControlArcLengths() {
    controlArcLengths = [0];
    if (!curve || trackPoints.length < 2) return;
    controlArcLengths = buildControlArcLengthsForCurve(curve, trackPoints.length);
  }

  function rebuildChainLiftRanges() {
    chainLiftRanges = [];
    if (trackPoints.length < 2) return;
    if (controlArcLengths.length < 2) rebuildControlArcLengths();
    if (controlArcLengths.length < 2) return;

    let runStart = null;
    for (let i = 0; i < trackPoints.length - 1; i++) {
      const type = normalizeSegmentType(trackPoints[i + 1]?.segmentType);
      const segStart = controlArcLengths[i];
      if (type === 'chainLift') {
        if (runStart === null) runStart = segStart;
      } else if (runStart !== null) {
        chainLiftRanges.push({
          start: runStart,
          end: Math.max(runStart + 0.05, controlArcLengths[i])
        });
        runStart = null;
      }
    }

    if (runStart !== null) {
      chainLiftRanges.push({
        start: runStart,
        end: controlArcLengths[controlArcLengths.length - 1]
      });
    }
  }

  function getSegmentTypeAtArcFraction(u) {
    if (!curve || trackPoints.length < 2) return 'normal';
    const total = curve.getLength() || 1;
    return getSegmentTypeAtDistance(THREE.MathUtils.clamp(u, 0, 0.999999) * total);
  }

  function getSegmentIndexAtDistance(distance) {
    if (controlArcLengths.length >= 2) {
      const clamped = Math.max(0, distance);
      for (let i = 0; i < controlArcLengths.length - 1; i++) {
        if (clamped < controlArcLengths[i + 1]) return i;
      }
      return controlArcLengths.length - 2;
    }

    const length = getTrackLength();
    return getSegmentIndexAtRatio(length > 0 ? distance / length : 0, trackPoints);
  }

  function getSegmentTypeAtDistance(distance) {
    const index = getSegmentIndexAtDistance(distance);
    if (index < 0) return 'normal';
    return normalizeSegmentType(trackPoints[index + 1]?.segmentType);
  }

  function getSegmentTypeAtProgress(progress) {
    const length = getTrackLength();
    return getSegmentTypeAtDistance((Number(progress) || 0) * length);
  }

  function getSegmentIndexAtProgress(progress) {
    const length = getTrackLength();
    return getSegmentIndexAtDistance((Number(progress) || 0) * length);
  }

  function setBuildFocusFromPoint(point) {
    if (!point) return;
    currentHeight = Math.max(0, point.y);
    ghostPosition.set(point.x, currentHeight, point.z);
    setOrbitPivotToLastPost();
  }

  function truncateTrackToRidePosition(sample) {
    if (!sample || trackPoints.length < 2) return false;

    const segmentIndex = getSegmentIndexAtProgress(sample.progress);
    if (segmentIndex < 0) return false;

    const nextTrackPoints = cloneTrackPoints(trackPoints.slice(0, segmentIndex + 1));
    const samplePoint = {
      x: sample.pos.x,
      y: Math.max(0, sample.pos.y),
      z: sample.pos.z,
      segmentType: getSegmentTypeAtProgress(sample.progress)
    };

    const last = nextTrackPoints[nextTrackPoints.length - 1];
    const lastDistance = last
      ? new THREE.Vector3(last.x, last.y, last.z).distanceTo(sample.pos)
      : Infinity;

    if (nextTrackPoints.length === 0 || nextTrackPoints.length === 1 || lastDistance > 0.75) {
      nextTrackPoints.push(samplePoint);
    } else {
      nextTrackPoints[nextTrackPoints.length - 1] = samplePoint;
    }

    trackPoints = nextTrackPoints;
    activeSegmentType = normalizeSegmentType(samplePoint.segmentType);
    undoGroupStack = [];
    syncSegmentTypeSelect();
    rebuildTrack();
    setBuildFocusFromPoint(sample.pos);
    return true;
  }

  function onWheel(event) {
    if (!active || paused || isRiding) return;
    event.preventDefault();
    cameraDistance += event.deltaY * 0.05;
    cameraDistance = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, cameraDistance));
    updateCameraPosition();
    syncBuildFog();
  }

  function onKeyDown(event) {
    if (!active || paused || isRiding) return;
    if (event.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(event.target.tagName)) return;
    keysDown.add(event.code);
  }

  function onKeyUp(event) {
    keysDown.delete(event.code);
  }

  function updateBuildCameraPeek(dt) {
    if (!active || paused || isRiding) return;

    let moveX = 0;
    let moveZ = 0;
    if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) moveZ -= 1;
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) moveZ += 1;
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) moveX -= 1;
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) moveX += 1;
    if (moveX === 0 && moveZ === 0) return;

    const len = Math.hypot(moveX, moveZ) || 1;
    moveX /= len;
    moveZ /= len;

    const forward = getBuildForwardXZ();
    const right = getBuildRightXZ();
    const speed = CAMERA_PAN_SPEED * Math.max(0.55, cameraDistance / 40) * dt;

    // W = vooruit kijken (target de kijkrichting op), A/D = zijwaarts
    cameraPeekOffset.x += (forward.x * (-moveZ) + right.x * moveX) * speed;
    cameraPeekOffset.z += (forward.z * (-moveZ) + right.z * moveX) * speed;
    clampCameraPeek();
    applyOrbitTarget();
  }

  function updateGhost() {
    clearMesh(ghostTrackMesh);
    ghostTrackMesh = null;

    if (placementState === 'idle') {
      raycaster.setFromCamera(mouse, camera);
      const mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(mathPlane, target)) {
        ghostPosition.copy(target);
      }
      ghostPosition.y = currentHeight;
    }

    ghostValid = true;
    if (trackPoints.length >= 1) {
      const last = trackPoints[trackPoints.length - 1];
      const lastVec = new THREE.Vector3(last.x, last.y, last.z);
      const dist = lastVec.distanceTo(ghostPosition);
      if (dist < 4.0 || dist > 60.0) ghostValid = false;

      if (trackPoints.length >= 2) {
        const prev = trackPoints[trackPoints.length - 2];
        const v1 = new THREE.Vector3(last.x - prev.x, last.y - prev.y, last.z - prev.z).normalize();
        const v2 = new THREE.Vector3(ghostPosition.x - last.x, ghostPosition.y - last.y, ghostPosition.z - last.z).normalize();
        
        if (v1.dot(v2) < 0.3) {
          ghostValid = false;
        }
      }
    }

    const ghostPoints = [];
    const ghostSegmentTypes = [];
    if (trackPoints.length === 0) {
      ghostPoints.push(ghostPosition.clone());
      ghostSegmentTypes.push('normal');
    } else if (trackPoints.length === 1) {
      ghostPoints.push(
        new THREE.Vector3(trackPoints[0].x, trackPoints[0].y, trackPoints[0].z),
        ghostPosition.clone()
      );
      ghostSegmentTypes.push(
        normalizeSegmentType(trackPoints[0].segmentType),
        normalizeSegmentType(activeSegmentType)
      );
    } else {
      const p1 = trackPoints[trackPoints.length - 2];
      const p2 = trackPoints[trackPoints.length - 1];
      ghostPoints.push(
        new THREE.Vector3(p1.x, p1.y, p1.z),
        new THREE.Vector3(p2.x, p2.y, p2.z),
        ghostPosition.clone()
      );
      ghostSegmentTypes.push(
        normalizeSegmentType(p1.segmentType),
        normalizeSegmentType(p2.segmentType),
        normalizeSegmentType(activeSegmentType)
      );
    }

    ghostTrackMesh = generateTrackMeshes(ghostPoints, true, ghostValid, ghostSegmentTypes);
    scene.add(ghostTrackMesh);
  }

  function onPointerMove(event) {
    if (!active || paused || isRiding) return;
    
    if (isPanningCamera) {
      const dx = event.clientX - lastMouseX;
      const dy = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;

      const panScale = cameraDistance * 0.0028;
      const right = getBuildRightXZ();
      const forward = getBuildForwardXZ();
      cameraPeekOffset.x -= (right.x * dx + forward.x * dy) * panScale;
      cameraPeekOffset.z -= (right.z * dx + forward.z * dy) * panScale;
      clampCameraPeek();
      applyOrbitTarget();
      return;
    }

    if (isRotatingCamera) {
      const dx = event.clientX - lastMouseX;
      const dy = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;

      cameraAngleX -= dx * 0.01;
      cameraAngleY -= dy * 0.01;
      
      cameraAngleY = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraAngleY));
      updateCameraPosition();
      return;
    }

    updateMouseFromEvent(event);
    
    if (placementState === 'dragging') {
      const dy = (mouse.y - dragStartMouseY) * 30.0;
      ghostPosition.y = Math.max(0, dragBaseY + dy);
    }
    
    updateGhost();
  }

  function onPointerDown(event) {
    if (!active || paused || isRiding) return;

    // Middelste muisknop, of Shift+rechtermuisknop = tijdelijke peek-pan
    if (event.button === 1 || (event.button === 2 && event.shiftKey)) {
      event.preventDefault();
      isPanningCamera = true;
      isRotatingCamera = false;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      return;
    }
    
    if (event.button === 2) { // Right click = orbit om laatste paal
      isRotatingCamera = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      return;
    }

    if (event.button !== 0 && event.pointerType === 'mouse') return;

    if (placementState === 'idle') {
      updateMouseFromEvent(event);
      raycaster.setFromCamera(mouse, camera);
      const mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(mathPlane, target)) {
        placementState = 'dragging';
        dragStartMouseY = mouse.y;
        dragBaseY = currentHeight;
        
        ghostPosition.copy(target);
        ghostPosition.y = dragBaseY;
        updateGhost();
      }
    }
  }

  function onPointerUp(event) {
    if (!active || paused || isRiding) return;

    if (event.button === 1 || event.button === 2) {
      isPanningCamera = false;
      isRotatingCamera = false;
      return;
    }

    if (placementState === 'dragging') {
      if (ghostValid) {
        addPoint(ghostPosition.x, ghostPosition.y, ghostPosition.z);
        currentHeight = ghostPosition.y; 
      } else {
        Toast.show('Ongeldige positie! Bocht te scherp of afstand verkeerd.');
      }
      placementState = 'idle';
      updateGhost();
    }
  }

  function addPoint(x, y, z) {
    trackPoints.push({
      x,
      y,
      z,
      segmentType: trackPoints.length === 0 ? 'normal' : normalizeSegmentType(activeSegmentType)
    });
    undoGroupStack.push(1);
    rebuildTrack();
    setOrbitPivotToLastPost();
    updateGhost();
  }

  function undoPoint() {
    if (trackPoints.length === 0) return;

    const removeCount = Math.min(
      undoGroupStack.length ? undoGroupStack.pop() : 1,
      trackPoints.length
    );
    trackPoints.splice(trackPoints.length - removeCount, removeCount);
    if (trackPoints.length) {
      currentHeight = trackPoints[trackPoints.length - 1].y;
    } else {
      currentHeight = 2;
    }
    rebuildTrack();
    setOrbitPivotToLastPost();
    updateGhost();
  }

  function clearTrack() {
    trackPoints = [];
    undoGroupStack = [];
    currentHeight = 2;
    rebuildTrack();
    setOrbitPivotToLastPost();
    updateGhost();
  }

  function getBuildForwardDirection() {
    if (trackPoints.length >= 2) {
      const last = trackPoints[trackPoints.length - 1];
      const prev = trackPoints[trackPoints.length - 2];
      const forward = new THREE.Vector3(last.x - prev.x, last.y - prev.y, last.z - prev.z);
      if (forward.lengthSq() > 1e-6) return forward.normalize();
    }
    const forward = new THREE.Vector3(-Math.cos(cameraAngleX), 0, -Math.sin(cameraAngleX));
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    return forward.normalize();
  }

  function insertLoop() {
    if (isRiding) return;
    if (trackPoints.length < 1) {
      Toast.show('Plaats eerst minstens één punt voordat je een looping bouwt.');
      return;
    }

    const last = trackPoints[trackPoints.length - 1];
    if (last.y < 1.5) {
      Toast.show('Maak de laatste paal wat hoger (min. ~1.5) voor een looping.');
      return;
    }

    const forward = getBuildForwardDirection();
    const horiz = new THREE.Vector3(forward.x, 0, forward.z);
    if (horiz.lengthSq() < 1e-4) horiz.set(1, 0, 0);
    horiz.normalize();

    const start = new THREE.Vector3(last.x, last.y, last.z);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, horiz).normalize();
    const radius = LOOP_RADIUS;
    const added = [];

    // Korte horizontale aanloop in het loopvlak (voorkomt helix door CatmullRom)
    const entry = start.clone().addScaledVector(horiz, 2.5);
    entry.y = start.y;
    added.push({
      x: entry.x,
      y: entry.y,
      z: entry.z,
      segmentType: 'loop'
    });

    const center = entry.clone().addScaledVector(up, radius);
    // Open cirkel: niet helemaal dichtdraaien; einde geleidelijk naar rechts naast de ingang
    const maxTheta = Math.PI * 2 * 0.88;
    for (let i = 1; i <= LOOP_POINT_COUNT; i++) {
      const theta = (i / LOOP_POINT_COUNT) * maxTheta;
      const endBlend = THREE.MathUtils.smoothstep(0.55, 1, i / LOOP_POINT_COUNT);
      const pos = center.clone()
        .addScaledVector(horiz, Math.sin(theta) * radius)
        .addScaledVector(up, -Math.cos(theta) * radius)
        .addScaledVector(right, LOOP_EXIT_SIDE * endBlend);
      added.push({
        x: pos.x,
        y: Math.max(0.35, pos.y),
        z: pos.z,
        segmentType: 'loop'
      });
    }

    // Uitgang voorbij én rechts naast de beginrail
    for (const gap of [LOOP_EXIT_GAP, LOOP_EXIT_GAP + 4]) {
      added.push({
        x: entry.x + horiz.x * gap + right.x * LOOP_EXIT_SIDE,
        y: entry.y,
        z: entry.z + horiz.z * gap + right.z * LOOP_EXIT_SIDE,
        segmentType: 'loop'
      });
    }

    trackPoints.push(...added);
    undoGroupStack.push(added.length);
    currentHeight = trackPoints[trackPoints.length - 1].y;
    activeSegmentType = 'normal';
    syncSegmentTypeSelect();
    rebuildTrack();
    setOrbitPivotToLastPost();
    updateGhost();
    Toast.show('Looping geplaatst! Undo verwijdert de hele looping.');
  }

  function cloneTrackPoints(points) {
    if (!Array.isArray(points)) return [];
    return points
      .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && Number.isFinite(Number(p.z)))
      .map((p, index) => ({
        x: Number(p.x),
        y: Math.max(0, Number(p.y)),
        z: Number(p.z),
        segmentType: index === 0 ? 'normal' : normalizeSegmentType(p.segmentType)
      }));
  }

  function createTrackState() {
    return {
      trackPoints: cloneTrackPoints(trackPoints),
      activeSegmentType: normalizeSegmentType(activeSegmentType)
    };
  }

  function getTrackSaves() {
    return Storage.readSaves()
      .map((entry) => ({
        ...entry,
        updatedAt: Number(entry.updatedAt) || 0,
        pointCount: Number(entry.pointCount) || entry.save?.trackPoints?.length || 0
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function syncTrackSelect(selectedId = null) {
    if (!trackSelect) return;

    const saves = getTrackSaves();
    const fallbackId = selectedId || trackSelect.value;
    trackSelect.innerHTML = '';

    if (!saves.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Geen opgeslagen banen';
      option.selected = true;
      trackSelect.appendChild(option);
      trackSelect.disabled = true;
      btnLoadTrack?.setAttribute('disabled', 'disabled');
      btnDeleteTrack?.setAttribute('disabled', 'disabled');
      renderCoasterLibrary();
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Kies een opgeslagen baan';
    trackSelect.appendChild(placeholder);

    let selectedValue = '';
    saves.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = `${entry.name} (${entry.pointCount} punten)`;
      if (entry.id === fallbackId) {
        option.selected = true;
        selectedValue = entry.id;
      }
      trackSelect.appendChild(option);
    });

    if (!selectedValue) {
      trackSelect.value = '';
    }

    trackSelect.disabled = false;
    btnLoadTrack?.removeAttribute('disabled');
    btnDeleteTrack?.toggleAttribute('disabled', !trackSelect.value);
    trackSelect.onchange = () => {
      btnDeleteTrack?.toggleAttribute('disabled', !trackSelect.value);
      renderCoasterLibrary();
    };
    renderCoasterLibrary();
  }

  function createCoasterMeta(entry) {
    const pointCount = Number(entry.pointCount) || entry.save?.trackPoints?.length || 0;
    const updatedAt = entry.updatedAt ? Storage.formatTimestamp(entry.updatedAt) : 'Onbekend';
    return `${pointCount} punten · ${updatedAt}`;
  }

  function loadTrackSaveById(saveId, options = {}) {
    const { switchToPlay = true } = options;
    const entry = getTrackSaves().find((save) => save.id === saveId);
    if (!entry) {
      Toast.show('Baan niet gevonden.');
      syncTrackSelect();
      return false;
    }

    importState(entry.save);
    syncTrackSelect(entry.id);

    if (switchToPlay) {
      Nav.switchTab('play');
      if (!active) {
        start();
      } else if (paused) {
        resume();
      }
    }

    Toast.show(`Baan "${entry.name}" geladen`);
    return true;
  }

  function renderCoasterLibrary() {
    if (!coasterLibraryList) return;

    const saves = getTrackSaves();
    coasterLibraryList.innerHTML = '';
    coasterLibraryEmpty?.classList.toggle('hidden', saves.length > 0);

    saves.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'mode-library-row coaster-library-row';
      if (entry.id === trackSelect?.value) {
        row.classList.add('active');
      }

      const info = document.createElement('div');
      info.className = 'info';

      const title = document.createElement('strong');
      title.textContent = entry.name;

      const meta = document.createElement('span');
      meta.textContent = createCoasterMeta(entry);

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'coaster-library-actions';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn success';
      loadBtn.type = 'button';
      loadBtn.textContent = 'Laad';
      loadBtn.addEventListener('click', () => loadTrackSaveById(entry.id));

      const selectBtn = document.createElement('button');
      selectBtn.className = 'btn alt';
      selectBtn.type = 'button';
      selectBtn.textContent = 'Kies';
      selectBtn.addEventListener('click', () => {
        syncTrackSelect(entry.id);
        Toast.show(`Baan "${entry.name}" geselecteerd`);
      });

      actions.appendChild(loadBtn);
      actions.appendChild(selectBtn);
      row.appendChild(info);
      row.appendChild(actions);
      coasterLibraryList.appendChild(row);
    });
  }

  function saveTrack() {
    if (trackPoints.length < 2) {
      Toast.show('Bouw eerst een baan met minstens 2 punten.');
      return;
    }

    const currentName = (() => {
      const selectedSave = getTrackSaves().find((entry) => entry.id === trackSelect?.value);
      return selectedSave?.name || `Baan ${getTrackSaves().length + 1}`;
    })();
    const inputName = window.prompt('Geef je baan een naam:', currentName);
    if (inputName == null) return;

    const name = String(inputName).trim().slice(0, 32);
    if (!name) {
      Toast.show('Geef de baan eerst een naam.');
      return;
    }

    const saves = getTrackSaves();
    const existing = saves.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.id !== trackSelect?.value) {
      const ok = window.confirm(`De baan "${existing.name}" bestaat al. Overschrijven?`);
      if (!ok) return;
    }

    const now = Date.now();
    const entryId = existing?.id || `track-${now}`;
    const nextEntry = {
      id: entryId,
      name,
      save: createTrackState(),
      updatedAt: now,
      pointCount: trackPoints.length
    };
    const nextList = saves.filter((entry) => entry.id !== entryId);
    nextList.unshift(nextEntry);
    Storage.writeSaves(nextList);
    syncTrackSelect(entryId);
    renderCoasterLibrary();
    Toast.show(`Baan "${name}" opgeslagen`);
  }

  function loadSelectedTrack() {
    const selectedId = trackSelect?.value;
    if (!selectedId) {
      Toast.show('Kies eerst een opgeslagen baan.');
      return;
    }

    loadTrackSaveById(selectedId, { switchToPlay: false });
  }

  function deleteSelectedTrack() {
    const selectedId = trackSelect?.value;
    if (!selectedId) {
      Toast.show('Kies eerst een baan om te verwijderen.');
      return;
    }

    const entry = getTrackSaves().find((save) => save.id === selectedId);
    if (!entry) {
      Toast.show('Baan niet gevonden.');
      syncTrackSelect();
      return;
    }

    const ok = window.confirm(`Baan "${entry.name}" verwijderen?`);
    if (!ok) return;

    const nextList = getTrackSaves().filter((save) => save.id !== selectedId);
    Storage.writeSaves(nextList);
    syncTrackSelect();
    renderCoasterLibrary();
    Toast.show(`Baan "${entry.name}" verwijderd`);
  }

  function clearMesh(mesh) {
    if (!mesh) return;
    scene.remove(mesh);
    const geometries = new Set();
    const materials = new Set();
    mesh.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => materials.add(mat));
        } else {
          materials.add(child.material);
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  function generateTrackMeshes(pointsArray, isGhost, isValid, segmentTypes = []) {
    const group = new THREE.Group();
    
    const railColor = isGhost ? (isValid ? 0x00ff00 : 0xff0000) : 0xcccccc;
    const tieColor = isGhost ? (isValid ? 0x00aa00 : 0xaa0000) : 0x5c4033;
    const opacity = isGhost ? 0.6 : 1.0;
    const pillarMat = new THREE.MeshLambertMaterial({ color: railColor, transparent: isGhost, opacity });
    const tieMat = new THREE.MeshLambertMaterial({ color: tieColor, transparent: isGhost, opacity });
    const tieGeo = new THREE.BoxGeometry(TIE_WIDTH, TIE_HEIGHT, TIE_DEPTH);
    const dummy = new THREE.Object3D();

    function orientTieDummy(frame) {
      dummy.position.copy(frame.pos).addScaledVector(frame.normal, TIE_RAIL_OFFSET);
      dummy.up.copy(frame.normal);
      dummy.lookAt(dummy.position.clone().add(frame.tangent));
      dummy.updateMatrix();
    }

    function addSupportAtFrame(frame, allowPillar, controlPoint = null) {
      orientTieDummy(frame);
      const supportTie = new THREE.Mesh(tieGeo, tieMat);
      supportTie.matrix.copy(dummy.matrix);
      supportTie.matrixAutoUpdate = false;
      supportTie.castShadow = !isGhost;
      group.add(supportTie);

      if (!allowPillar) return;
      // Alleen overslaan als de baan echt omgekeerd/steil op de zijkant staat
      if (frame.normal.y < 0.2) return;

      const refY = controlPoint && Number.isFinite(controlPoint.y) ? controlPoint.y : frame.pos.y;
      const undersideY = refY + TIE_RAIL_OFFSET - TIE_HEIGHT * 0.5;
      if (undersideY <= 0.12) return;

      const pillarGeo = new THREE.CylinderGeometry(0.18, 0.22, undersideY, 8);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(frame.pos.x, undersideY / 2, frame.pos.z);
      pillar.castShadow = !isGhost;
      group.add(pillar);
    }

    if (pointsArray.length < 2) {
      if (pointsArray.length === 1) {
        const p = pointsArray[0];
        const fakeFrame = {
          pos: p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z),
          tangent: new THREE.Vector3(0, 0, 1),
          normal: new THREE.Vector3(0, 1, 0),
          binormal: new THREE.Vector3(1, 0, 0)
        };
        addSupportAtFrame(fakeFrame, true, p);
      }
      return group;
    }

    const curveLocal = new THREE.CatmullRomCurve3(pointsArray, false, 'centripetal', 0.5);
    const segments = Math.max(16, (pointsArray.length - 1) * 15);
    const frames = computeTrackFrames(curveLocal, segments, segmentTypes, pointsArray);
    if (!frames.length) return group;
    const meshArcLengths = buildControlArcLengthsForCurve(curveLocal, pointsArray.length);

    const leftPoints = [];
    const rightPoints = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      leftPoints.push(f.pos.clone().addScaledVector(f.binormal, -RAIL_HALF_WIDTH));
      rightPoints.push(f.pos.clone().addScaledVector(f.binormal, RAIL_HALF_WIDTH));
    }

    const leftCurve = new THREE.CatmullRomCurve3(leftPoints);
    const rightCurve = new THREE.CatmullRomCurve3(rightPoints);
    const railGeo1 = new THREE.TubeGeometry(leftCurve, segments, 0.08, 6, false);
    const railGeo2 = new THREE.TubeGeometry(rightCurve, segments, 0.08, 6, false);
    const railMat = new THREE.MeshLambertMaterial({ color: railColor, transparent: isGhost, opacity });
    
    const rail1 = new THREE.Mesh(railGeo1, railMat);
    rail1.castShadow = !isGhost;
    const rail2 = new THREE.Mesh(railGeo2, railMat);
    rail2.castShadow = !isGhost;
    group.add(rail1);
    group.add(rail2);

    const numTies = Math.floor(segments / 4) + 1;
    const tieInstanced = new THREE.InstancedMesh(tieGeo, tieMat, numTies);
    tieInstanced.castShadow = !isGhost;
    const chainLiftMat = new THREE.MeshLambertMaterial({
      color: isGhost ? railColor : 0xf59e0b,
      transparent: isGhost,
      opacity
    });
    const chainTroughMat = new THREE.MeshLambertMaterial({
      color: isGhost ? railColor : 0xb45309,
      transparent: isGhost,
      opacity
    });
    const chainLiftGroup = new THREE.Group();

    // Verzamel aaneengesloten kettinglift-stukken → één lange ketting per run
    const chainRuns = [];
    let currentRun = null;
    for (let i = 0; i < frames.length; i++) {
      const onChain = getSegmentTypeAtDistanceWithArcLengths(
        frames[i].distance,
        meshArcLengths,
        segmentTypes
      ) === 'chainLift';
      if (onChain) {
        if (!currentRun) currentRun = [];
        currentRun.push(frames[i]);
      } else if (currentRun) {
        if (currentRun.length >= 2) chainRuns.push(currentRun);
        currentRun = null;
      }
    }
    if (currentRun && currentRun.length >= 2) chainRuns.push(currentRun);

    chainRuns.forEach((run) => {
      const troughPts = run.map((f) => f.pos.clone().addScaledVector(f.normal, 0.05));
      const chainPts = run.map((f) => f.pos.clone().addScaledVector(f.normal, 0.14));
      const tubularSegments = Math.max(12, (run.length - 1) * 3);

      const troughCurve = new THREE.CatmullRomCurve3(troughPts, false, 'centripetal', 0.5);
      const trough = new THREE.Mesh(
        new THREE.TubeGeometry(troughCurve, tubularSegments, 0.12, 6, false),
        chainTroughMat
      );
      trough.castShadow = !isGhost;
      chainLiftGroup.add(trough);

      const chainCurve = new THREE.CatmullRomCurve3(chainPts, false, 'centripetal', 0.5);
      const chain = new THREE.Mesh(
        new THREE.TubeGeometry(chainCurve, tubularSegments, 0.065, 6, false),
        chainLiftMat
      );
      chain.castShadow = !isGhost;
      chainLiftGroup.add(chain);
    });
    
    let tieIndex = 0;
    for (let i = 0; i <= segments; i += 4) {
      if (tieIndex >= numTies) break;
      const f = frames[i] || frames[frames.length - 1];
      orientTieDummy(f);
      tieInstanced.setMatrixAt(tieIndex++, dummy.matrix);
    }
    tieInstanced.count = tieIndex;
    tieInstanced.instanceMatrix.needsUpdate = true;
    group.add(tieInstanced);

    // Steunpalen + dwarsbalk precies op knooppunten
    pointsArray.forEach((p, index) => {
      if (isGhost && index < pointsArray.length - 1) return;
      const pointType = normalizeSegmentType(segmentTypes[index] || p.segmentType);
      const frame = findClosestFrame(frames, p);
      if (!frame) return;
      const allowPillar = pointType !== 'loop' && (p.y > 0.15);
      addSupportAtFrame(frame, allowPillar, p);
    });

    if (chainLiftGroup.children.length > 0) {
      group.add(chainLiftGroup);
    }
    return group;
  }

  function buildControlArcLengthsForCurve(sourceCurve, pointCount) {
    const lengths = [0];
    if (!sourceCurve || pointCount < 2) return lengths;
    const divisions = Math.max(128, (pointCount - 1) * 32);
    for (let i = 1; i < pointCount; i++) {
      lengths.push(arcLengthAtCurveParameter(sourceCurve, i / (pointCount - 1), divisions));
    }
    lengths[lengths.length - 1] = sourceCurve.getLength();
    return lengths;
  }

  function getSegmentTypeAtDistanceWithArcLengths(distance, arcLengths, segmentTypes) {
    if (!Array.isArray(segmentTypes) || segmentTypes.length <= 1) return 'normal';
    if (!Array.isArray(arcLengths) || arcLengths.length < 2) return 'normal';
    const clamped = Math.max(0, distance);
    let segIndex = arcLengths.length - 2;
    for (let i = 0; i < arcLengths.length - 1; i++) {
      if (clamped < arcLengths[i + 1]) {
        segIndex = i;
        break;
      }
    }
    return normalizeSegmentType(segmentTypes[segIndex + 1]);
  }

  function getSegmentTypeForArrayProgress(progress, pointsArray, segmentTypes) {
    if (!Array.isArray(segmentTypes) || segmentTypes.length <= 1) return 'normal';
    if (!Array.isArray(pointsArray) || pointsArray.length < 2) return 'normal';

    const tempPoints = pointsArray.map((p) => (
      p.isVector3 ? p.clone() : new THREE.Vector3(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0)
    ));
    const tempCurve = new THREE.CatmullRomCurve3(tempPoints, false, 'centripetal', 0.5);
    const arcLengths = buildControlArcLengthsForCurve(tempCurve, tempPoints.length);
    const total = arcLengths[arcLengths.length - 1] || 1;
    const distance = THREE.MathUtils.clamp(progress, 0, 0.999999) * total;
    return getSegmentTypeAtDistanceWithArcLengths(distance, arcLengths, segmentTypes);
  }

  function rebuildTrack() {
    clearMesh(trackMesh);
    trackMesh = null;
    curve = null;
    rideLength = 0;
    trackFrames = [];
    controlArcLengths = [];
    chainLiftRanges = [];

    if (trackPoints.length === 0) return;

    const points = trackPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const segmentTypes = trackPoints.map((p) => normalizeSegmentType(p.segmentType));
    trackMesh = generateTrackMeshes(points, false, true, segmentTypes);
    scene.add(trackMesh);

    if (points.length >= 2) {
      curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
      rebuildTrackFrames(curve, segmentTypes);
      rebuildControlArcLengths();
      rebuildChainLiftRanges();
      rideLength = curve.getLength();
    }
  }

  function startRide() {
    if (trackPoints.length < 2 || !curve) {
      Toast.show('Plaats tenminste 2 punten om te rijden!');
      return;
    }

    rideLength = curve.getLength();
    if (!Number.isFinite(rideLength) || rideLength <= 0) {
      Toast.show('Deze baan is nog niet klaar voor een rit.');
      return;
    }

    isRiding = true;
    rideDistance = 0;
    rideVelocity = PHYSICS_DISPATCH_SPEED;
    chainLiftLatchEnd = -1;
    keysDown.clear();
    isPanningCamera = false;
    isRotatingCamera = false;
    syncRideFog();
    btnRide?.classList.add('hidden');
    btnAdd?.classList.add('hidden');
    btnUndo?.classList.add('hidden');
    btnClear?.classList.add('hidden');
    btnLoop?.classList.add('hidden');
    segmentTypeSelect?.classList.add('hidden');
    btnStop?.classList.remove('hidden');
    document.getElementById('game-scene-hint')?.classList.add('hidden');
    
    clearMesh(ghostTrackMesh);
    ghostTrackMesh = null;
    placementState = 'idle';

    updateRideCamera(getTrackSample(0));

    const startSegmentType = getSegmentTypeAtProgress(0);
    if (startSegmentType === 'chainLift') {
      Toast.show('Rit gestart op een kettingliftstuk.');
    }
  }

  function stopRide(options = {}) {
    const { manualBuildResume = false } = options;
    const rideSample = isRiding ? getTrackSample(rideDistance) : null;
    const shouldResumeBuildHere = manualBuildResume && !!rideSample;

    if (shouldResumeBuildHere) {
      truncateTrackToRidePosition(rideSample);
    }

    isRiding = false;
    rideDistance = 0;
    rideVelocity = 0;
    chainLiftLatchEnd = -1;
    rideLength = curve ? curve.getLength() : 0;
    placementState = 'idle';
    isRotatingCamera = false;
    isPanningCamera = false;
    keysDown.clear();
    btnRide?.classList.remove('hidden');
    btnAdd?.classList.remove('hidden');
    btnUndo?.classList.remove('hidden');
    btnClear?.classList.remove('hidden');
    btnLoop?.classList.remove('hidden');
    segmentTypeSelect?.classList.remove('hidden');
    btnStop?.classList.add('hidden');
    document.getElementById('game-scene-hint')?.classList.remove('hidden');
    if (!shouldResumeBuildHere) {
      resetCamera();
    } else {
      setOrbitPivotToLastPost();
    }
    syncBuildFog();
    updateGhost();

    if (shouldResumeBuildHere) {
      Toast.show('Rit gestopt. Je kunt vanaf hier verder bouwen.');
    }
  }

  function update() {
    if (!active || paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    if (!isRiding) {
      updateBuildCameraPeek(dt);
    }

    if (isRiding && curve) {
      const sample = getTrackSample(rideDistance);
      if (!sample) {
        stopRide();
      } else {
        if (shouldUseChainLift(sample)) {
          // Geen physics op de kettingbaan: alleen vaste voorwaartse snelheid
          rideVelocity = PHYSICS_CHAIN_LIFT_SPEED;
          rideDistance += PHYSICS_CHAIN_LIFT_SPEED * dt;
        } else {
          const slopeAcceleration = -PHYSICS_GRAVITY * sample.tangent.y;
          const resistanceDirection = Math.abs(rideVelocity) > PHYSICS_MIN_SPEED
            ? Math.sign(rideVelocity)
            : (Math.abs(slopeAcceleration) > PHYSICS_MIN_SPEED ? Math.sign(slopeAcceleration) : 0);
          const rollingResistance = PHYSICS_ROLLING_FRICTION * resistanceDirection;
          const airResistance = PHYSICS_AIR_DRAG * rideVelocity * Math.abs(rideVelocity);
          const netAcceleration = slopeAcceleration - rollingResistance - airResistance;

          rideVelocity += netAcceleration * dt;
          if (Math.abs(rideVelocity) < PHYSICS_MIN_SPEED && Math.abs(slopeAcceleration) < PHYSICS_ROLLING_FRICTION) {
            rideVelocity = 0;
          }
          rideVelocity = THREE.MathUtils.clamp(rideVelocity, -PHYSICS_MAX_SPEED, PHYSICS_MAX_SPEED);
          rideDistance += rideVelocity * dt;
        }

        if (rideDistance >= rideLength) {
          stopRide();
        } else {
          if (rideDistance <= 0) {
            rideDistance = 0;
            if (rideVelocity < 0) {
              rideVelocity = 0;
            }
          }

          const cameraSample = getTrackSample(rideDistance);
          if (cameraSample) {
            updateRideCamera(cameraSample);
          }
        }
      }
    }

    renderer.render(scene, camera);
    animId = requestAnimationFrame(update);
  }

  function start() {
    container.classList.remove('hidden');
    rcControls?.classList.remove('hidden');
    document.getElementById('game-scene-hint')?.classList.remove('hidden');
    document.getElementById('play-dashboard')?.classList.add('hidden');
    
    active = true;
    paused = false;
    setOrbitPivotToLastPost();
    syncBuildFog();
    clock.start();
    resize();
    update();
    return true;
  }

  function stop() {
    active = false;
    paused = false;
    isRiding = false;
    placementState = 'idle';
    isPanningCamera = false;
    isRotatingCamera = false;
    keysDown.clear();
    clearMesh(ghostTrackMesh);
    ghostTrackMesh = null;
    cancelAnimationFrame(animId);
    syncSegmentTypeSelect();
    container.classList.add('hidden');
    rcControls?.classList.add('hidden');
    document.getElementById('game-scene-hint')?.classList.add('hidden');
    document.getElementById('play-dashboard')?.classList.remove('hidden');
  }

  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
    clock.getDelta(); // reset delta
  }

  function isActive() {
    return active;
  }

  function setSessionMeta(meta) {
    // Optionally log or store session metadata
    console.log("Session loaded:", meta);
  }

  function stopGame() {
    stop();
  }

  function onTabHidden() {}
  function onTabVisible() {}
  function setBodyColors(colors) {}
  function resetBodyColors() {}
  function getBodyColors() {
    return { head: '#5ef0ff', body: '#00e5ff', legs: '#0097b2' };
  }
  function getPlayerBodyParts(args) {
    return {
      head: { x: 0, y: 0, w: args.w, h: 10 },
      body: { x: 0, y: 10, w: args.w, h: 10 },
      legs: { x: 0, y: 20, w: args.w, h: 10 }
    };
  }

  function exportState() {
    return createTrackState();
  }

  function importState(saveData) {
    trackPoints = cloneTrackPoints(saveData?.trackPoints);
    currentHeight = trackPoints.length ? trackPoints[trackPoints.length - 1].y : 2;
    activeSegmentType = normalizeSegmentType(saveData?.activeSegmentType);
    undoGroupStack = [];
    syncSegmentTypeSelect();
    rebuildTrack();
    stopRide();
    setOrbitPivotToLastPost();
  }

  function resize() {
    if (!renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  return { init, start, stop, stopGame, pause, resume, isActive, setSessionMeta, exportState, importState, resize, onTabHidden, onTabVisible, setBodyColors, resetBodyColors, getBodyColors, getPlayerBodyParts };
})();
/* END-MERGE-BLOCK */
