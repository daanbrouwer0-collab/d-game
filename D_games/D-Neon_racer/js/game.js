/* MERGE-BLOCK: game.js */
// THREE wordt globaal geladen via build/three.min.js (klassiek script), zodat dit
// als gewoon <script src> werkt — ook bij openen via file:// (dubbelklik).

let scene, camera, renderer, gridMesh, hemiLight;
let car, carGroup, carShadow;
let wheels = [];
let clock = null;
let isInited = false;
let isPlaying = false;

const instructionsEl = document.getElementById('instructions');
const touchControlsEl = document.getElementById('touch-controls');
const btnDrive = document.getElementById('btn-drive');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const gameWrapEl = document.getElementById('game-wrap');

const speedEl = document.getElementById('speedometer');
const topSpeedEl = document.getElementById('top-speed');
const gateCountEl = document.getElementById('gate-count');
const gateTotalEl = document.getElementById('gate-total');
const timerEl = document.getElementById('timer');
const timerBox = document.getElementById('timer-box');
const levelNumEl = document.getElementById('level-num');
const finishDistEl = document.getElementById('finish-dist');
const gameOverEl = document.getElementById('game-over');
const goTitleEl = document.getElementById('go-title');
const finalLevelEl = document.getElementById('final-level');
const finalTimeEl = document.getElementById('final-time');
const finalRecordEl = document.getElementById('final-record');
const finalRecordDeltaEl = document.getElementById('final-record-delta');
const finalGatesEl = document.getElementById('final-gates');
const finalTopSpeedEl = document.getElementById('final-topspeed');
const btnGoMenu = document.getElementById('btn-go-menu');
const btnGoNext = document.getElementById('btn-go-next');
const btnGoRestart = document.getElementById('btn-go-restart');
const countdownOverlay = document.getElementById('countdown-overlay');
const finishFadeEl = document.getElementById('finish-fade');

// Physics Variables
let speed = 0;
let rotation = 0;
let maxSpeed = 3.4;
let steeringSpeed = 0.04;
const REVERSE_SPEED = 0.55;
const DRIVE_ACCEL = 0.028;
const DRIVE_COAST = 0.014;
const OFF_ROAD_SPEED_DECAY = 0.85;
const OFF_ROAD_RESTART_DIST = 128;
let isDriving = false;
let maxTopSpeed = 0;
let gatesPassed = 0;
let gatesTotal = 0;
let lastPassedGateIdx = -1;
let elapsedTime = 0;
let isGameOver = false;
let timerStarted = false;
let levelFixedLength = false;
let finishPointIdx = -1;
let finishGroup = null;
let levelSeed = 1;
let currentLevel = 1;
let bestTimes = {};
let currentRunSplits = [];
let levelBuildingChanceMul = 1;
let sessionMeta = { sessionName: '', characterName: 'Karakter', difficulty: 'normal', vip: false };
let pausedByOverlay = false;
let wasPlayingBeforePause = false;
let pendingNextLevel = false;
let midRunRestore = null;
let gameUiBound = false;
let finishSequence = null;
let worldTour = null;

const keys = { a: false, d: false, left: false, right: false, space: false };
const trackSettings = {
    curviness: 1.9
};
const controlSettings = {
    steerSensitivity: 0.55
};

const trackWidth = 28;
let trackGroup, buildingsGroup, roadMesh, edgeUnderlayMeshL, edgeUnderlayMeshR, centerStripeMesh, centerStripeMesh2, terrainMesh, terrainGridMesh, savePointsGroup;
let roadRenderDirty = false;
let mainNodes = [];
let nodeStartId = 0;
let trackPoints = [];
let sectorRenderLanes = [];
let sectorAltStrips = [];
let sectorRoadGroup = null;
let trackStartIndex = 0;
let lastClosestIndex = 0;
let heading = 0;
let turnVel = 0;
let lateralOffset = 0;
let lateralVel = 0;
let buildingRecords = [];
let terrainRoll = { vel: 0 };
let activeTheme = null;
let carVerticalVel = 0;
let carBaseHeight = 0.4;
const ROAD_SURFACE = {
    roadLift: 0.02,
    stripeLift: 0.038,
    borderLift: 0.024,
    shoulderInnerDrop: -0.22,
    shoulderOuterDrop: -1.15
};
const TERRAIN_VIS = {
    innerDrop: ROAD_SURFACE.roadLift - 0.03,
    outerDrop: ROAD_SURFACE.shoulderOuterDrop
};
const ROAD_SURFACE_LIFT = ROAD_SURFACE.roadLift;
const EDGE_UNDERLAY_EXTRA = 0.9;
const EDGE_UNDERLAY_LIFT_DELTA = 0.014;
const LEVEL_EDGE_NEON_COLORS = [
    0x00ffff,
    0x00ff66,
    0xffea00,
    0xff2bd6,
    0x8b00ff,
    0xff0055,
    0xff9900,
    0x00ff00,
    0x00c3ff,
    0xff4400
];
const GRAVITY = 0.022;
const SLOPE_LAUNCH = 0.22;
const MAX_VERTICAL_VEL = 3.2;
const ROAD_STYLE = {
    roadColor: 0xb0003f,
    roadEmissive: 0x5a001f,
    roadEmissiveIntensity: 0.75
};
const START_LEAD_POINTS = 5;
const START_LEAD_LENGTH = 42;
const START_SPAWN_POINT_IDX = START_LEAD_POINTS - 1;
const FINISH_LEAD_POINTS = 72;
const FINISH_LEAD_LENGTH = 1040;
const FINISH_BEND_AMPLITUDE = 34;
const FINISH_FADE_DELAY = 0.65;
const FINISH_FADE_DURATION = 0.85;

const TRACK_CFG = {
    segmentLength: 22,
    keepAheadSegments: 250,
    keepBehindSegments: 140,
    rebuildAheadPadding: 120,
    closestScanSegments: 90,
    globalRescanDistFactor: 0.75,
    buildingChancePerSide: 0.2,
    buildingMinSideOffset: 2,
    buildingMaxSideOffset: 120,
    buildingMinHeight: 25,
    buildingMaxHeight: 140,
    buildingMinSize: 20,
    buildingMaxSize: 50,
    biomePeriod: 120,
    colorPeriod: 85,
    biomeTypes: ['CITY', 'SUBURB', 'FOREST'],
    neonPalettes: [
        [0xff00ff, 0x00ffff], // Magenta/Cyan
        [0xffff00, 0x00ff00], // Yellow/Green
        [0xff6600, 0x0088ff], // Orange/Blue
        [0xff0000, 0x5500ff]  // Red/Purple
    ]
};

const TERRAIN_CFG = {
    outerExtra: 185,
    gridStep: 6,
    gridLongStep: 18
};

const MAIN_CURVE_CFG = {
    maxOffset: 220,
    wobbleAmp: 70,
    maxNodeOffset: 360,
    lateralStep: 90,
    lateralDamp: 0.9,
    lateralVelRand: 1.8,
    lateralVelDamp: 0.62,
    lateralVelClamp: 1.35
};


let frameDt = 1 / 60;
let CAM_OFFSET, CAM_TARGET, CAM_LOOK, CAM_LOOK_AHEAD;

function initMathScratch() {
    if (CAM_OFFSET || typeof THREE === 'undefined') return;
    CAM_OFFSET = new THREE.Vector3();
    CAM_TARGET = new THREE.Vector3();
    CAM_LOOK = new THREE.Vector3();
    CAM_LOOK_AHEAD = new THREE.Vector3();
}

function isTouchGameDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function getRendererPixelRatio(vpWidth) {
    const dpr = window.devicePixelRatio || 1;
    if (shouldUseMobileRenderer(vpWidth)) return Math.min(dpr, 2);
    return dpr;
}

function shouldUseMobileRenderer(vpWidth) {
    if (!isTouchGameDevice()) return false;
    const small = Math.min(window.innerWidth, window.innerHeight) < 720;
    return vpWidth < 960 || small;
}

const SAVE_CFG = {
    interval: 800,
    outerRadius: (trackWidth / 2) + 8,
    innerRadius: (trackWidth / 2) + 4,
    fillRadius: (trackWidth / 2) + 2,
    color: 0xffdd33,
    emissive: 0xffaa00
};

let savePoints = [];
let activeSaveStepSegments = Math.max(10, Math.round(SAVE_CFG.interval / TRACK_CFG.segmentLength));

function applyGateInterval(interval) {
    const v = clamp(Number(interval) || SAVE_CFG.interval, 200, 2400);
    SAVE_CFG.interval = v;
    activeSaveStepSegments = Math.max(10, Math.round(v / TRACK_CFG.segmentLength));
}

const CAR_STYLES = [
    { id: 'slim', name: 'Slim', front: 0x00ffff, back: 0x0088ff, ring: 0x00ffff, under: 0x00ffff, underAccent: 0x0088ff, steerSens: 0.75 },
    { id: 'balanced', name: 'Balanced', front: 0xff00ff, back: 0xaa00aa, ring: 0xff00ff, under: 0xff00ff, underAccent: 0xaa00aa, steerSens: 0.60 },
    { id: 'heavy', name: 'Heavy', front: 0xffaa00, back: 0xff4400, ring: 0xffaa00, under: 0xff4400, underAccent: 0xffaa00, steerSens: 0.45 }
];

const CAR_THEME_PRESETS = [
    { name: 'Cyber', front: 0x00ffff, back: 0x0088ff, ring: 0x00ffff, under: 0x00ffff, underAccent: 0x0088ff, rearLight: 0xff0044 },
    { name: 'Synth', front: 0xff00ff, back: 0xaa00aa, ring: 0xff00ff, under: 0xff00ff, underAccent: 0x8800ff, rearLight: 0xff0066 },
    { name: 'Solar', front: 0xffff00, back: 0xff8800, ring: 0xffcc00, under: 0xffcc00, underAccent: 0xff6600, rearLight: 0xff2200 },
    { name: 'Matrix', front: 0xff6600, back: 0x0088ff, ring: 0x00ccff, under: 0x00ccff, underAccent: 0xff6600, rearLight: 0xff3300 },
    { name: 'Wild', front: 0xff4488, back: 0x44ffaa, ring: 0xcc66ff, under: 0xcc66ff, underAccent: 0x44ffaa, rearLight: 0xff1155 },
    { name: 'Ice', front: 0xaaddff, back: 0x4466ff, ring: 0xffffff, under: 0xaaddff, underAccent: 0xffffff, rearLight: 0xff2244 }
];

const CAR_COLOR_FIELDS = [
    { key: 'front', label: 'Voorkant' },
    { key: 'back', label: 'Achterkant' },
    { key: 'ring', label: 'Velgen' },
    { key: 'rearLight', label: 'Achterlicht' },
    { key: 'under', label: 'Neon lamp' },
    { key: 'underAccent', label: 'Neon accent' }
];

function defaultCarConfig() {
    return {
        front: 0xff00ff,
        back: 0xaa00aa,
        ring: 0xff00ff,
        rearLight: 0xff0000,
        under: 0x00ffff,
        underAccent: 0xff00ff,
        steerSens: 0.60
    };
}

let carConfig = defaultCarConfig();
const carPreview = { scene: null, camera: null, renderer: null, carMesh: null, inited: false };

function hexNumToCss(n) {
    return `#${(Number(n) >>> 0).toString(16).padStart(6, '0')}`;
}

function hexNumToRgba(n, alpha) {
    const v = Number(n) >>> 0;
    const r = (v >> 16) & 255;
    const g = (v >> 8) & 255;
    const b = v & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexCssToNum(v) {
    if (typeof v === 'number') return v >>> 0;
    let s = String(v || '#ffffff').replace('#', '').trim();
    if (s.length === 8) {
        s = s.substring(0, 6);
    } else if (s.length === 4) {
        s = s.substring(0, 3);
    }
    return parseInt(s, 16) || 0xffffff;
}

function normalizeThemeColors(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const t = raw;
    const parse = (v) => hexCssToNum(v);
    const parseArr = (arr) => Array.isArray(arr) ? arr.map(parse) : arr;
    return {
        ...t,
        sky: t.sky != null ? parse(t.sky) : t.sky,
        fog: t.fog != null ? parse(t.fog) : t.fog,
        hemi: t.hemi != null ? parseArr(t.hemi) : t.hemi,
        road: t.road != null ? parse(t.road) : t.road,
        stripe1: t.stripe1 != null ? parse(t.stripe1) : t.stripe1,
        stripe2: t.stripe2 != null ? parse(t.stripe2) : t.stripe2,

        underlayLeft: t.underlayLeft != null ? parse(t.underlayLeft) : t.underlayLeft,
        underlayRight: t.underlayRight != null ? parse(t.underlayRight) : t.underlayRight,
        gate: t.gate != null ? parseArr(t.gate) : t.gate,
        terrain: t.terrain != null ? parseArr(t.terrain) : t.terrain,
        palettes: t.palettes != null ? parseArr(t.palettes) : t.palettes,
        palette: t.palette != null ? parseArr(t.palette) : t.palette
    };
}

function resolveTrackTheme(track) {
    const raw = GameConfig.resolveTrackTheme(track);
    return raw ? normalizeThemeColors(raw) : null;
}

function normalizeCarConfig(raw) {
    const base = defaultCarConfig();
    if (!raw || typeof raw !== 'object') return base;
    return {
        front: hexCssToNum(raw.front ?? hexNumToCss(base.front)),
        back: hexCssToNum(raw.back ?? hexNumToCss(base.back)),
        ring: hexCssToNum(raw.ring ?? hexNumToCss(base.ring)),
        rearLight: hexCssToNum(raw.rearLight ?? hexNumToCss(base.rearLight)),
        under: hexCssToNum(raw.under ?? hexNumToCss(base.under)),
        underAccent: hexCssToNum(raw.underAccent ?? hexNumToCss(base.underAccent)),
        steerSens: clamp(Number(raw.steerSens ?? base.steerSens), 0.25, 1)
    };
}

function carConfigFromStyleId(id) {
    const style = CAR_STYLES.find((s) => s.id === id);
    if (!style) return defaultCarConfig();
    return normalizeCarConfig({
        front: style.front,
        back: style.back,
        ring: style.ring,
        under: style.under ?? style.ring,
        underAccent: style.underAccent ?? style.back ?? style.ring,
        rearLight: 0xff0000,
        steerSens: style.steerSens
    });
}

function exportCarConfig() {
    return {
        front: hexNumToCss(carConfig.front),
        back: hexNumToCss(carConfig.back),
        ring: hexNumToCss(carConfig.ring),
        rearLight: hexNumToCss(carConfig.rearLight),
        under: hexNumToCss(carConfig.under),
        underAccent: hexNumToCss(carConfig.underAccent),
        steerSens: carConfig.steerSens
    };
}

function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function resolveSectorBlueprint(track, seed) {
    if (track.sectorBlueprint) return track.sectorBlueprint;
    if (track.gates != null && typeof SectorGenerator !== 'undefined' && SectorGenerator.composeSectorBlueprint) {
        return SectorGenerator.composeSectorBlueprint(
            { gates: track.gates, doubles: track.splits ?? 1 },
            seed ?? track.seed
        );
    }
    return null;
}

function getLevelConfig(level, difficulty, seed) {
    const diff = GameConfig.difficulty[difficulty] || GameConfig.difficulty.normal;
    const track = GameConfig.getTrack(level);
    const resolvedSeed = seed ?? track.seed;
    const theme = resolveTrackTheme(track);
    const bend = theme?.bendProfile || GameConfig.resolveBendProfile(track);

    return {
        level: track.id,
        seed: resolvedSeed,
        gates: track.gates,
        nodeCount: track.gates,
        curviness: bend.curviness * (diff.curvinessMul || 1) * bend.bendMul * bend.turnMul,
        buildingChanceMul: track.buildingChanceMul,
        theme: theme,
        themeLabel: theme?.label || track.name,
        sectorBlueprint: resolveSectorBlueprint(track, resolvedSeed),
        splits: track.splits ?? 1,
        sectorGateCount: track.gates,
        gateInterval: theme?.gateInterval ?? GameConfig.TRACK_DEFAULTS.gateInterval,
        straightChance: bend.straightChance,
        rollMul: track.bumpMul ?? 0.65,
        topSpeedKMH: track.topSpeedKMH,
        sections: Array.isArray(track.sections) ? track.sections : null,
        timeLimit: 99999
    };
}

function applyTrackTheme(theme) {
    activeTheme = theme || resolveTrackTheme(GameConfig.tracks[0]);
    if (!scene) return;

    scene.background.setHex(activeTheme.sky);
    if (scene.fog) {
        scene.fog.color.setHex(activeTheme.fog);
        scene.fog.density = activeTheme.fogDensity;
    }

    if (hemiLight) {
        hemiLight.color.setHex(activeTheme.hemi[0]);
        hemiLight.groundColor.setHex(activeTheme.hemi[1]);
    }

    if (gridMesh) {
        scene.remove(gridMesh);
        gridMesh.geometry?.dispose?.();
        const gridMats = Array.isArray(gridMesh.material) ? gridMesh.material : [gridMesh.material];
        gridMats.forEach((m) => m?.dispose?.());
        gridMesh = null;
    }

    if (typeof activeTheme.road === 'number') {
        ROAD_STYLE.roadColor = activeTheme.road;
    }

    const edgeNeon = getLevelEdgeNeonColor(currentLevel);
    const themeUnderlayLeft = typeof activeTheme.underlayLeft === 'number' ? activeTheme.underlayLeft : edgeNeon;
    const themeUnderlayRight = typeof activeTheme.underlayRight === 'number' ? activeTheme.underlayRight : edgeNeon;

    if (roadMesh?.material && typeof activeTheme.road === 'number') roadMesh.material.color.setHex(activeTheme.road);
    if (edgeUnderlayMeshL?.material) edgeUnderlayMeshL.material.color.setHex(themeUnderlayLeft);
    if (edgeUnderlayMeshR?.material) edgeUnderlayMeshR.material.color.setHex(themeUnderlayRight);
    if (centerStripeMesh?.material) centerStripeMesh.material.color.setHex(activeTheme?.stripe1 ?? 0x303030);
    if (centerStripeMesh2?.material) centerStripeMesh2.material.color.setHex(activeTheme?.stripe2 ?? 0x282828);

    const terrainColors = getTerrainColors();
    if (terrainMesh?.material) terrainMesh.material.color.setHex(terrainColors.fill);
    if (terrainGridMesh?.material) terrainGridMesh.material.color.setHex(terrainColors.grid);
}

function sampleTrackSegmentY(a, b, pos) {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = pos.x - a.x;
    const apz = pos.z - a.z;
    const abLen2 = abx * abx + abz * abz;
    let t = 0;
    if (abLen2 > 1e-6) {
        t = clamp((apx * abx + apz * abz) / abLen2, 0, 1);
    }
    const segLen = Math.sqrt(abLen2) || 1;
    const y = a.y + (b.y - a.y) * t;
    const slope = (b.y - a.y) / segLen;
    return { y, slope, t };
}

function getLaneSurfaceAt(pos, hintGlobalIdx = null) {
    const n = trackPoints.length;
    if (n < 2) return { y: 0, slope: 0, dist: Infinity, idx: trackStartIndex };

    const mainInfo = getClosestOnMain(pos, hintGlobalIdx);
    const laneInfo = getClosestLaneInfo(pos, hintGlobalIdx);

    let pts = trackPoints;
    let localIdx = clamp(laneInfo.idx - trackStartIndex, 0, n - 2);

    if (sectorAltStrips?.length && laneInfo.dist < mainInfo.dist - 0.01) {
        for (const strip of sectorAltStrips) {
            const k = laneInfo.idx - strip.startIdx;
            if (k >= 0 && k < strip.points.length - 1) {
                pts = strip.points;
                localIdx = k;
                break;
            }
        }
    }

    const a = pts[localIdx];
    const b = pts[localIdx + 1];
    const sample = sampleTrackSegmentY(a, b, pos);
    return { y: sample.y, slope: sample.slope, dist: laneInfo.dist, idx: laneInfo.idx, t: sample.t };
}

function getTrackSurfaceAt(pos, hintGlobalIdx = null) {
    return getLaneSurfaceAt(pos, hintGlobalIdx);
}

function getTerrainColors() {
    const sky = activeTheme?.sky ?? 0x050510;
    const fill = activeTheme?.terrain?.[0] ?? Math.max(0, ((sky >> 1) & 0x7f7f7f));
    const grid = activeTheme?.terrain?.[1] ?? activeTheme?.underlayLeft ?? 0x334466;
    return { fill, grid };
}

function getGroundHeightAt(pos, hintGlobalIdx = null) {
    const n = trackPoints.length;
    if (n < 2) return 0;

    const laneInfo = getClosestLaneInfo(pos, hintGlobalIdx);
    const localIdx = clamp(laneInfo.idx - trackStartIndex, 0, n - 1);

    let pts = trackPoints;
    let localLaneIdx = localIdx;

    if (sectorAltStrips?.length) {
        for (const strip of sectorAltStrips) {
            const k = laneInfo.idx - strip.startIdx;
            if (k >= 0 && k < strip.points.length) {
                pts = strip.points;
                localLaneIdx = k;
                break;
            }
        }
    }

    const frame = computeRoadFrame(pts, localLaneIdx);

    const dx = pos.x - frame.p.x;
    const dz = pos.z - frame.p.z;
    const lateral = dx * frame.normal.x + dz * frame.normal.z;

    const halfW = trackWidth / 2;
    const terrainOuter = halfW + TERRAIN_CFG.outerExtra;
    const absLat = Math.abs(lateral);

    let drop = ROAD_SURFACE.shoulderOuterDrop;
    if (absLat <= halfW) {
        drop = ROAD_SURFACE.shoulderInnerDrop;
    } else if (absLat < terrainOuter) {
        const t = (absLat - halfW) / (terrainOuter - halfW);
        drop = ROAD_SURFACE.shoulderInnerDrop + t * (ROAD_SURFACE.shoulderOuterDrop - ROAD_SURFACE.shoulderInnerDrop);
    }

    return roadVertexAt(frame, lateral, drop).y + 0.18;
}

function attachGroundPad(parent, width, accentColor) {
    const padR = width * 0.58 + 5;
    const geo = new THREE.CylinderGeometry(padR, padR * 1.08, 1.1, 10);
    geo.translate(0, -0.55, 0);
    const mat = new THREE.MeshPhongMaterial({
        color: 0x040408,
        emissive: accentColor,
        emissiveIntensity: 0.08,
        shininess: 8
    });
    const pad = new THREE.Mesh(geo, mat);
    parent.add(pad);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(padR * 0.92, 0.14, 6, 20),
        new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.35 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    parent.add(ring);
}

function refreshBuildingGroundHeights() {
    for (const rec of buildingRecords) {
        const mesh = rec.mesh;
        if (!mesh) continue;
        const groundY = getGroundHeightAt(mesh.position, rec.segIdx);
        mesh.position.y = groundY + (rec.floating ? (rec.floatOffset || 0) : 0);
    }
}

function resetTerrainRoll() {
    terrainRoll = { vel: 0 };
}

function headingDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
}

function getBendFactor(aNode, bNode) {
    const bend = headingDelta(aNode.heading, bNode.heading);
    if (bend < 0.12) return 1;
    if (bend > 0.55) return 0.12;
    return 1 - ((bend - 0.12) / 0.43) * 0.88;
}

function smoothSegmentElevation(segmentPoints, strength, startIdx = 1, endIdx = null) {
    if (segmentPoints.length < 3 || strength <= 0) return;
    const end = endIdx === null ? segmentPoints.length - 1 : endIdx;
    for (let pass = 0; pass < 2; pass++) {
        for (let i = Math.max(1, startIdx); i < end; i++) {
            const avg = (segmentPoints[i - 1].y + segmentPoints[i + 1].y) * 0.5;
            segmentPoints[i].y += (avg - segmentPoints[i].y) * strength;
        }
    }
}

function gateRollTaper(along) {
    return Math.sin(Math.PI * along);
}

function enforceSegmentStartContinuity(segmentPoints, startY) {
    const blend = Math.min(4, segmentPoints.length);
    for (let i = 0; i < blend; i++) {
        const w = 1 - i / blend;
        segmentPoints[i].y += (startY - segmentPoints[i].y) * w * 0.92;
    }
}

function softenGateEnd(segmentPoints) {
    const n = segmentPoints.length;
    if (n < 4) return;
    const tail = Math.max(3, Math.floor(n * 0.22));
    const anchor = n - tail - 1;
    const slope = segmentPoints[anchor].y - segmentPoints[anchor - 1].y;
    for (let i = n - tail; i < n; i++) {
        const steps = i - anchor;
        const linearY = segmentPoints[anchor].y + slope * steps * 0.8;
        const blend = (i - (n - tail) + 1) / tail;
        segmentPoints[i].y += (linearY - segmentPoints[i].y) * blend * 0.82;
    }
    smoothSegmentElevation(segmentPoints, 0.55, Math.max(1, n - tail - 1), n - 1);
}

function applySegmentRoll(segmentPoints, segStartGlobalIdx, bendFactor = 1, startY = 0) {
    const baseAmp = activeTheme?.rollWaveAmp ?? 3.5;
    const len1 = activeTheme?.rollWaveLength ?? 80;
    const len2 = activeTheme?.rollWaveLength2 ?? 32;
    const phase = (levelSeed % 1000) * 0.01 + segStartGlobalIdx * 0.002;
    const n = segmentPoints.length;

    for (let i = 0; i < n; i++) {
        const along = n > 1 ? i / (n - 1) : 0;
        let localFactor = bendFactor * gateRollTaper(along);
        if (bendFactor < 0.75) {
            const enterEase = clamp((along - 0.2) / 0.55, 0, 1);
            const exitEase = along > 0.72 ? clamp((0.95 - along) / 0.23, 0, 1) : 1;
            localFactor = bendFactor + (1 - bendFactor) * enterEase * exitEase;
            localFactor *= gateRollTaper(along);
        }
        const amp = baseAmp * localFactor;
        const g = segStartGlobalIdx + i;
        const wave1 = Math.sin((g / len1) * Math.PI * 2 + phase) * amp;
        const wave2 = Math.sin((g / len2) * Math.PI * 2 + phase * 1.6) * amp * 0.55;
        segmentPoints[i].y += wave1 + wave2;
    }

    enforceSegmentStartContinuity(segmentPoints, startY);
    softenGateEnd(segmentPoints);

    if (bendFactor < 0.75) {
        smoothSegmentElevation(segmentPoints, 0.25 + (1 - bendFactor) * 0.45);
    }
}

function getTrackCurveMods() {
    return activeTheme?.curve || {};
}

function pickThemeNeonColor(segGlobalIdx = 0) {
    const colors = activeTheme?.palettes || activeTheme?.palette || TRACK_CFG.neonPalettes[0];
    const list = Array.isArray(colors) ? colors : TRACK_CFG.neonPalettes[0];
    if (list.length <= 1) return list[0] ?? 0xffffff;
    const bias = Math.abs(segGlobalIdx) % list.length;
    if (Math.random() < 0.55) return list[bias];
    return list[Math.floor(Math.random() * list.length)];
}

function scaleHexColor(hex, mul) {
    const c = hex ?? 0xffffff;
    const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * mul)));
    const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * mul)));
    const b = Math.max(0, Math.min(255, Math.round((c & 255) * mul)));
    return (r << 16) | (g << 8) | b;
}

function getLevelEdgeNeonColor(levelId) {
    const id = Number(levelId) || 1;
    return LEVEL_EDGE_NEON_COLORS[(Math.max(1, id) - 1) % LEVEL_EDGE_NEON_COLORS.length];
}

function createDecorByType(type, color) {
    switch (type) {
        case 'tower': return createNeonTower(color);
        case 'building': return createNeonBuilding(color);
        case 'house': return createNeonHouse(color, 0.5);
        case 'tree': return createNeonTree(color);
        case 'boom_2': return createNeonBoom2(color);
        case 'cactus': return createNeonCactus(color);
        case 'pillar': return createNeonPillar(color);
        case 'crystal': return createNeonCrystal(color);
        case 'crystal_2': return createNeonCrystal2(color);
        case 'pyramid': return createNeonPyramid(color);
        case 'planet': return createNeonPlanet(color);
        default: return createNeonBuilding(color);
    }
}

function pickDecorObject(neonColor) {
    const weights = activeTheme?.decorWeights;
    if (weights) {
        const entries = Object.entries(weights).filter(([, w]) => w > 0);
        if (entries.length) {
            let total = 0;
            for (const [, w] of entries) total += w;
            let roll = Math.random() * total;
            for (const [type, w] of entries) {
                roll -= w;
                if (roll <= 0) return createDecorByType(type, neonColor);
            }
            return createDecorByType(entries[0][0], neonColor);
        }
    }

    const decor = activeTheme?.decor || 'city';
    const r = Math.random();
    if (decor === 'city') return r > 0.12 ? createNeonBuilding(neonColor) : createNeonHouse(neonColor, 0.55);
    if (decor === 'forest') {
        if (r > 0.55) return createNeonTree(neonColor);
        if (r > 0.2) return createNeonHouse(neonColor, 0.45);
        return createNeonBuilding(neonColor, 0.35);
    }
    if (decor === 'highway') {
        if (r > 0.82) return createNeonBuilding(neonColor, 0.7);
        if (r > 0.45) return createNeonTree(neonColor);
        return createNeonHouse(neonColor, 0.4);
    }
    if (r > 0.55) return createNeonBuilding(neonColor);
    if (r > 0.25) return createNeonTree(neonColor);
    return createNeonHouse(neonColor, 0.5);
}

function clampTrackLevel(level) {
    return Math.max(1, Math.min(GameConfig.trackCount, Number(level) || 1));
}

function canPlayTrackLevel(level) {
    return Vip.canAccessTrack(clampTrackLevel(level), sessionMeta);
}

function getNextPlayableTrackLevel(fromLevel) {
    for (let i = clampTrackLevel(fromLevel) + 1; i <= GameConfig.trackCount; i++) {
        if (canPlayTrackLevel(i)) return i;
    }
    return null;
}

function getTrackBaseSeed(level) {
    return GameConfig.getTrack(clampTrackLevel(level)).seed;
}

/** Vast basis-seed per baan (thema/records). */
function getTrackSeed(level) {
    return getTrackBaseSeed(level);
}

/** Nieuw random parcours binnen hetzelfde baan-thema. */
function rollFreshTrackSeed(level) {
    return getTrackBaseSeed(level) + Math.floor(Math.random() * 900000) + 1;
}

function formatRaceTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    if (s >= 60) {
        const m = Math.floor(s / 60);
        const r = (s % 60).toFixed(2).padStart(5, '0');
        return `${m}:${r}`;
    }
    return `${s.toFixed(2)}s`;
}

function formatSplitDelta(delta) {
    const d = Number(delta) || 0;
    const sign = d > 0 ? '+' : '';
    return `${sign}${d.toFixed(2)}s`;
}

function formatRecordDeltaLine(elapsed, prevBest) {
    if (!prevBest || typeof prevBest.time !== 'number') {
        return { text: 'Eerste record op deze baan', tone: 'first' };
    }
    const delta = elapsed - prevBest.time;
    if (Math.abs(delta) < 0.005) {
        return { text: 'Gelijk aan je record', tone: 'even' };
    }
    if (delta < 0) {
        return { text: `${Math.abs(delta).toFixed(2)}s sneller dan record`, tone: 'ahead' };
    }
    return { text: `${delta.toFixed(2)}s langzamer dan record`, tone: 'behind' };
}

function normalizeLevelRecord(data) {
    if (data == null) return null;
    if (typeof data === 'number') return { time: data, splits: [] };
    if (typeof data === 'object' && typeof data.time === 'number') {
        return {
            time: data.time,
            splits: Array.isArray(data.splits) ? data.splits.map(Number) : []
        };
    }
    return null;
}

function getLevelBest(level) {
    return normalizeLevelRecord(bestTimes[level]);
}

function getLevelRecordFromStorage(level, sessionId = null) {
    const lvl = clampTrackLevel(level);
    const trySession = (session) => {
        if (!session?.gameState?.bestTimes) return null;
        return normalizeLevelRecord(session.gameState.bestTimes[lvl]);
    };

    if (sessionId) {
        return trySession(Storage.getSession(sessionId));
    }

    const activeId = Menu.getActiveSessionId?.();
    if (activeId) {
        return trySession(Storage.getSession(activeId));
    }

    const lastId = Storage.readLastSessionId();
    if (lastId && lastId !== activeId) {
        const rec = trySession(Storage.getSession(lastId));
        if (rec) return rec;
    }

    for (const session of Storage.readSessions()) {
        const rec = trySession(session);
        if (rec) return rec;
    }

    return null;
}

function getLevelRecordForDisplay(level) {
    return getLevelBest(level) || getLevelRecordFromStorage(level);
}

function setLevelBest(level, record) {
    const normalized = normalizeLevelRecord(record);
    if (!normalized) return;
    const lvl = clampTrackLevel(level);
    const existing = getLevelBest(lvl);
    if (!existing || normalized.time < existing.time) {
        bestTimes[lvl] = normalized;
    }
}

function importBestTimes(raw, merge = false) {
    if (!merge) bestTimes = {};
    if (!raw || typeof raw !== 'object') return;
    for (const [key, value] of Object.entries(raw)) {
        const lvl = Number(key);
        const rec = normalizeLevelRecord(value);
        if (!rec) continue;
        const existing = getLevelBest(lvl);
        if (!existing || rec.time < existing.time) {
            bestTimes[lvl] = rec;
        }
    }
}

function mergeBestTimesExport(memory, stored) {
    const out = {};
    const ingest = (src) => {
        if (!src || typeof src !== 'object') return;
        for (const [key, value] of Object.entries(src)) {
            const rec = normalizeLevelRecord(value);
            if (!rec) continue;
            const existing = normalizeLevelRecord(out[key]);
            if (!existing || rec.time < existing.time) {
                out[key] = { time: rec.time, splits: [...rec.splits] };
            }
        }
    };
    ingest(stored);
    ingest(memory);
    return out;
}

function syncBestTimesFromSession(sessionId = null) {
    const sid = sessionId || Menu.getActiveSessionId?.();
    if (!sid) {
        bestTimes = {};
        return;
    }
    const session = Storage.getSession(sid);
    if (!session?.gameState?.bestTimes) {
        bestTimes = {};
        return;
    }
    importBestTimes(session.gameState.bestTimes, false);
}

function exportBestTimes() {
    const memory = {};
    for (const [key, value] of Object.entries(bestTimes)) {
        const rec = normalizeLevelRecord(value);
        if (rec) memory[key] = { time: rec.time, splits: [...rec.splits] };
    }

    const sid = Menu.getActiveSessionId?.();
    const stored = sid ? Storage.getSession(sid)?.gameState?.bestTimes : null;
    return mergeBestTimesExport(memory, stored);
}

function createGateLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(10, 5, 1);
    sprite.position.y = 14.5;
    sprite.renderOrder = 10;
    return { sprite, canvas, ctx, texture, material };
}

function drawGateLabel(label, text, color = '#ffdd33') {
    if (!label) return;
    const { canvas, ctx, texture } = label;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(16, 28, canvas.width - 32, canvas.height - 56);
    ctx.fillStyle = color;
    ctx.font = 'bold 52px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
}

function gateNumberText(gateOrder) {
    return String(gateOrder);
}

function hudGateCount() {
    return gatesPassed <= 0 ? 0 : gatesPassed - 1;
}

function hudGateTotal() {
    return Math.max(0, gatesTotal - 1);
}

function refreshGateLabel(gate) {
    if (!gate || gate.isFinish) return;
    const num = gateNumberText(gate.gateOrder);
    const list = gate.labels?.length ? gate.labels : (gate.label ? [gate.label] : []);
    for (const label of list) {
        const text = label.side ? `${num}${label.side}` : num;
        drawGateLabel(label, text, '#ffdd33');
    }
}

function showSplitNotification(text, kind = 'ahead') {
    if (!countdownOverlay) return;
    countdownOverlay.classList.remove('split-flash-animate', 'split-ahead', 'split-behind');
    countdownOverlay.textContent = text;
    countdownOverlay.classList.add(`split-${kind}`);
    void countdownOverlay.offsetWidth;
    countdownOverlay.classList.add('split-flash-animate');

    const onEnd = () => {
        countdownOverlay.classList.remove('split-flash-animate', 'split-ahead', 'split-behind');
        countdownOverlay.textContent = '';
        countdownOverlay.removeEventListener('animationend', onEnd);
    };
    countdownOverlay.addEventListener('animationend', onEnd);
}

function refreshAllGateLabels() {
    for (const gate of savePoints) refreshGateLabel(gate);
}

function getGateArches(gate) {
    if (!gate) return [];
    if (gate.arches?.length) return gate.arches;
    return gate.arch ? [gate.arch] : [];
}

function setGateArchColor(gate, colorHex) {
    for (const arch of getGateArches(gate)) {
        if (!arch?.material) continue;
        arch.material.color.setHex(colorHex);
        arch.material.emissive.setHex(colorHex);
    }
}

function makeGateArchMesh() {
    const archRadius = (trackWidth / 2) + 2.6;
    const tube = 0.55;
    const arch = new THREE.Mesh(
        new THREE.TorusGeometry(archRadius, tube, 14, 80, Math.PI),
        new THREE.MeshPhongMaterial({
            color: activeTheme?.gate?.[0] ?? SAVE_CFG.color,
            emissive: activeTheme?.gate?.[1] ?? SAVE_CFG.emissive,
            emissiveIntensity: 1.35,
            transparent: true,
            opacity: 0.96,
            fog: false
        })
    );
    arch.scale.y = 0.58;
    arch.position.y = 0.15;
    return arch;
}

function restorePassedGateLabels() {
    for (const gate of savePoints) {
        const splitIdx = gate.gateOrder - 1;
        if (gate.isFinish || splitIdx < 0 || splitIdx >= currentRunSplits.length) continue;
        gate.passed = true;
        refreshGateLabel(gate);
    }
}

function handleGatePassed(gate) {
    if (!gate || gate.isFinish) return;
    gate.passed = true;
    refreshGateLabel(gate);
    if (gate.gateOrder === 0) return;

    const splitIdx = gate.gateOrder - 1;
    currentRunSplits.push(elapsedTime);
    const record = getLevelBest(currentLevel);
    const refSplit = record?.splits?.[splitIdx];

    if (refSplit == null) return;

    const delta = elapsedTime - refSplit;
    const ahead = delta <= 0;
    setGateArchColor(gate, ahead ? 0x00ff88 : 0xff4466);
    showSplitNotification(formatSplitDelta(delta), ahead ? 'ahead' : 'behind');
}

function readStoredTrackSettings() {
    try {
        const raw = localStorage.getItem('racing_track_settings');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        // Removed curviness setting
    } catch {
        return;
    }
}

function writeStoredTrackSettings() {
    try {
        localStorage.setItem('racing_track_settings', JSON.stringify({
            // Removed curviness setting
        }));
    } catch {
        return;
    }
}

function readStoredControlSettings() {
    try {
        const raw = localStorage.getItem('racing_control_settings');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.steerSensitivity === 'number') controlSettings.steerSensitivity = clamp(parsed.steerSensitivity, 0.1, 1.2);
    } catch {
        return;
    }
}

function writeStoredControlSettings() {
    try {
        localStorage.setItem('racing_control_settings', JSON.stringify({
            steerSensitivity: controlSettings.steerSensitivity
        }));
    } catch {
        return;
    }
}

// Removed syncTrackSettingsUI

function syncControlSettingsUI() {
    // Removed steerSensEl and steerSensValEl as they are not in the provided diff.
    // Assuming they are part of a larger control settings UI that is not being removed.
    // If they were part of the track-settings div, they would be removed.
    // For now, keeping this function as is, but it might become a no-op if elements are removed elsewhere.
}

// Removed initTrackSettingsUI

function initControlSettingsUI() {
    // Removed steerSensEl and steerSensValEl as they are not in the provided diff.
    // Assuming they are part of a larger control settings UI that is not being removed.
    // For now, keeping this function as is, but it might become a no-op if elements are removed elsewhere.
}

function applyCarConfig(partial = {}, options = {}) {
    carConfig = normalizeCarConfig({ ...carConfig, ...partial });
    controlSettings.steerSensitivity = carConfig.steerSens;
    if (!options.skipSave) {
        const settings = Storage.readSettings();
        Storage.writeSettings({ ...settings, carConfig: exportCarConfig(), carStyleId: null });
    }
    if (!options.skipCar && isInited) createCar();
    syncCarCustomizerUi();
    updateCarPreview();
    if (!options.skipStats) updatePanelStats();
}

function syncCarCustomizerUi() {
    const steerEl = document.getElementById('car-steer');
    const steerVal = document.getElementById('car-steer-val');
    if (steerEl) steerEl.value = String(Math.round(carConfig.steerSens * 100));
    if (steerVal) steerVal.textContent = `${Math.round(carConfig.steerSens * 100)}%`;

    for (const field of CAR_COLOR_FIELDS) {
        const input = document.getElementById(`car-color-${field.key}`);
        if (input) input.value = hexNumToCss(carConfig[field.key]);
    }
}

function initCarPreviewRenderer(canvas) {
    if (!canvas || typeof THREE === 'undefined' || carPreview.inited) return;

    carPreview.scene = new THREE.Scene();
    carPreview.scene.background = new THREE.Color(0x0a1020);

    const aspect = canvas.width / canvas.height;
    carPreview.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 50);
    carPreview.camera.position.set(-5.8, 3.1, 5.4);
    carPreview.camera.lookAt(0, 0.52, -0.15);

    carPreview.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    carPreview.renderer.setSize(canvas.width, canvas.height, false);
    carPreview.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    carPreview.renderer.toneMapping = THREE.NoToneMapping;
    if (carPreview.renderer.outputColorSpace != null && THREE.SRGBColorSpace) {
        carPreview.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    carPreview.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const hemi = new THREE.HemisphereLight(0xaaccff, 0x223344, 0.75);
    carPreview.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-6, 9, 5);
    carPreview.scene.add(key);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.MeshPhongMaterial({ color: 0x141428, shininess: 20 })
    );
    floor.rotation.x = -Math.PI / 2;
    carPreview.scene.add(floor);

    carPreview.inited = true;
}

function updateCarPreview() {
    const canvas = document.getElementById('character-car-preview');
    if (!canvas || typeof THREE === 'undefined') return;

    initCarPreviewRenderer(canvas);
    if (!carPreview.renderer) return;

    if (carPreview.carMesh) {
        carPreview.scene.remove(carPreview.carMesh);
        disposeObject(carPreview.carMesh);
        carPreview.carMesh = null;
    }

    const built = buildCarVisualGroup(carConfig, { includeUnderGlow: true });
    carPreview.carMesh = built.group;
    carPreview.carMesh.position.set(0, 0.3, 0);

    carPreview.scene.add(carPreview.carMesh);
    carPreview.renderer.render(carPreview.scene, carPreview.camera);
}

function renderCarShareCanvas(width = 320, height = 220) {
    if (typeof THREE === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1020);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(-5.8, 3.1, 5.4);
    camera.lookAt(0, 0.52, -0.15);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    if (renderer.outputColorSpace != null && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const hemi = new THREE.HemisphereLight(0xff00ff, 0x00ffff, 0.8);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-6, 9, 5);
    scene.add(key);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.MeshPhongMaterial({ color: 0x141428, shininess: 20 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const built = buildCarVisualGroup(carConfig, { includeUnderGlow: true });
    built.group.position.set(0, 0.3, 0);
    scene.add(built.group);
    renderer.render(scene, camera);

    disposeObject(built.group);
    renderer.dispose();

    return canvas;
}

function initCarCustomizer() {
    const presetsEl = document.getElementById('car-theme-presets');
    const colorsEl = document.getElementById('car-color-list');
    const steerEl = document.getElementById('car-steer');

    if (presetsEl && !presetsEl.dataset.bound) {
        presetsEl.dataset.bound = '1';
        presetsEl.innerHTML = CAR_THEME_PRESETS.map((p) =>
            `<button type="button" class="car-theme-chip" data-theme="${p.name}" title="${p.name}">${p.name}</button>`
        ).join('');
        presetsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-theme]');
            if (!btn) return;
            const theme = CAR_THEME_PRESETS.find((p) => p.name === btn.dataset.theme);
            if (theme) applyCarConfig(theme);
        });
    }

    if (colorsEl && !colorsEl.dataset.bound) {
        colorsEl.dataset.bound = '1';
        colorsEl.innerHTML = CAR_COLOR_FIELDS.map((field) => `
          <label class="color-row" for="car-color-${field.key}">
            <span class="color-row-label">${field.label}</span>
            <input type="color" class="color-input" id="car-color-${field.key}" value="${hexNumToCss(carConfig[field.key])}">
          </label>
        `).join('');
        colorsEl.addEventListener('input', (e) => {
            const input = e.target.closest('.color-input');
            if (!input) return;
            const key = input.id.replace('car-color-', '');
            if (!CAR_COLOR_FIELDS.some((f) => f.key === key)) return;
            applyCarConfig({ [key]: hexCssToNum(input.value) });
        });
    }

    if (steerEl && !steerEl.dataset.bound) {
        steerEl.dataset.bound = '1';
        steerEl.addEventListener('input', () => {
            applyCarConfig({ steerSens: Number(steerEl.value) / 100 });
        });
    }

    syncCarCustomizerUi();
    updateCarPreview();
}

function loadCarConfigFromSettings() {
    const settings = Storage.readSettings();
    if (settings.carConfig) {
        carConfig = normalizeCarConfig(settings.carConfig);
    } else if (settings.carStyleId) {
        carConfig = carConfigFromStyleId(settings.carStyleId);
    }
    controlSettings.steerSensitivity = carConfig.steerSens;
}

function bindGameUi() {
    if (gameUiBound) return;
    gameUiBound = true;
    btnGoMenu?.addEventListener('click', () => {
        gameOverEl.style.display = 'none';
        Menu.openStartScreen(true);
    });
    btnGoNext?.addEventListener('click', () => {
        gameOverEl.style.display = 'none';
        if (pendingNextLevel) {
            const nextLevel = getNextPlayableTrackLevel(currentLevel);
            if (nextLevel) currentLevel = nextLevel;
            pendingNextLevel = false;
            levelSeed = rollFreshTrackSeed(currentLevel);
        }
        startLevelRun();
    });
    btnGoRestart?.addEventListener('click', () => {
        restartCurrentLevel();
    });
    setupTouchControls();
    window.addEventListener('resize', updateInstructions);
}

function startLevelRun() {
    if (!isInited) {
        initThree();
        isInited = true;
        bindGameUi();
    }
    const levelCfg = getLevelConfig(currentLevel, sessionMeta.difficulty, levelSeed);
    maxSpeed = (Number(levelCfg.topSpeedKMH) || 340) / 100;
    resetFinishSequence();
    if (midRunRestore) {
        const rs = midRunRestore;
        midRunRestore = null;
        buildLevelTrack(levelCfg);
        elapsedTime = rs.elapsedTime || 0;
        gatesPassed = rs.gatesPassed || 0;
        maxTopSpeed = rs.maxTopSpeed || 0;
        speed = rs.speed || 0;
        isDriving = rs.isDriving ?? (rs.gear > 0);
        updateDriveButton();
        rotation = rs.rotation || 0;
        lastPassedGateIdx = rs.lastPassedGateIdx ?? -1;
        lastClosestIndex = rs.lastClosestIndex || 0;
        if (car) {
            car.position.x = rs.carX || 0;
            car.position.z = rs.carZ || 0;
            car.rotation.y = rotation;
        }
        if (topSpeedEl) topSpeedEl.innerText = String(maxTopSpeed);
        if (speedEl) speedEl.innerText = String(Math.round(Math.abs(speed) * 100));
        if (gateCountEl) gateCountEl.innerText = String(hudGateCount());
        if (timerEl) timerEl.innerText = elapsedTime.toFixed(2);
        timerStarted = elapsedTime > 0;
        currentRunSplits = Array.isArray(rs.gateSplits) ? [...rs.gateSplits] : [];
        restorePassedGateLabels();
    } else {
        resetRun();
        buildLevelTrack(levelCfg);
        placeCarAtSpawn();
    }
    isPlaying = true;
    isGameOver = false;
    clock?.start();
    updateInstructions();
    updateHudLevel();
    updatePanelStats();
}

function startRun(resume = false) {
    gameOverEl.style.display = 'none';
    currentLevel = clampTrackLevel(currentLevel);
    if (!resume) {
        levelSeed = rollFreshTrackSeed(currentLevel);
    }
    startLevelRun();
}

function restartCurrentLevel() {
    pendingNextLevel = false;
    midRunRestore = null;
    gameOverEl.style.display = 'none';
    startLevelRun();
}

function placeCarAtSpawn() {
    const spawnIdx = Math.min(START_SPAWN_POINT_IDX, Math.max(0, trackPoints.length - 1));
    const spawnPos = trackPoints[spawnIdx] ? trackPoints[spawnIdx].clone() : new THREE.Vector3(0, 0, 0);
    const spawnAhead = trackPoints[Math.min(spawnIdx + 1, Math.max(0, trackPoints.length - 1))] || spawnPos;
    const spawnDir = spawnAhead.clone().sub(spawnPos);
    spawnDir.y = 0;
    rotation = spawnDir.lengthSq() > 1e-6 ? Math.atan2(spawnDir.x, spawnDir.z) : 0;
    lastClosestIndex = trackStartIndex + spawnIdx;
    if (car) {
        car.position.set(spawnPos.x, spawnPos.y + ROAD_SURFACE.roadLift + carBaseHeight, spawnPos.z);
        car.rotation.y = rotation;
        if (carGroup) carGroup.rotation.x = 0;
    }
}

function resetRun() {
    speed = 0;
    rotation = 0;
    isDriving = false;
    updateDriveButton();
    maxTopSpeed = 0;
    gatesPassed = 0;
    lastPassedGateIdx = -1;
    currentRunSplits = [];
    elapsedTime = 0;
    isGameOver = false;
    timerStarted = false;
    carVerticalVel = 0;
    if (countdownOverlay) {
        countdownOverlay.classList.remove('countdown-animate');
        countdownOverlay.innerText = '';
    }
    placeCarAtSpawn();
    if (topSpeedEl) topSpeedEl.innerText = '0';
    if (speedEl) speedEl.innerText = '0';
    if (gateCountEl) gateCountEl.innerText = '0';
    if (gateTotalEl) gateTotalEl.innerText = String(hudGateTotal());
    if (timerEl) timerEl.innerText = '0.00';
    if (finishDistEl) finishDistEl.innerText = '—';
    gameOverEl.style.display = 'none';
    if (isInited) createCar();
}

function updateHudLevel() {
    if (levelNumEl) levelNumEl.innerText = String(currentLevel);
    const titleEl = document.getElementById('title');
    if (titleEl) {
        const track = GameConfig.getTrack(currentLevel);
        titleEl.textContent = track.name;
    }
}

function createGlowTexture(primary = 0x00ffff, accent = 0xff00ff) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const base = ctx.createRadialGradient(64, 64, 10, 64, 64, 56);
    base.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    base.addColorStop(0.16, hexNumToRgba(primary, 0.78));
    base.addColorStop(0.52, hexNumToRgba(primary, 0.2));
    base.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter';
    const accentGlow = ctx.createRadialGradient(64, 64, 18, 64, 64, 58);
    accentGlow.addColorStop(0, 'rgba(255, 255, 255, 0)');
    accentGlow.addColorStop(0.28, hexNumToRgba(accent, 0.05));
    accentGlow.addColorStop(0.62, hexNumToRgba(accent, 0.14));
    accentGlow.addColorStop(0.88, hexNumToRgba(accent, 0.04));
    accentGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = accentGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

function buildCarVisualGroup(config, opts = {}) {
    const cfg = normalizeCarConfig(config || carConfig);
    const group = new THREE.Group();
    const wheelMeshes = [];

    const chassisGeo = new THREE.BoxGeometry(2.4, 0.4, 4.4);
    const chassis = new THREE.Mesh(chassisGeo, new THREE.MeshPhongMaterial({ color: 0x222222 }));
    chassis.position.y = 0.2;
    group.add(chassis);

    const bodyFront = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2), new THREE.MeshPhongMaterial({ color: cfg.front }));
    bodyFront.position.set(0, 0.5, 0.5);
    group.add(bodyFront);

    const bodyBack = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2), new THREE.MeshPhongMaterial({ color: cfg.back }));
    bodyBack.position.set(0, 0.6, -1.0);
    group.add(bodyBack);

    const spoilerMat = new THREE.MeshPhongMaterial({ color: cfg.back });
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.8), spoilerMat);
    spoiler.position.set(0, 1.2, -1.8);
    group.add(spoiler);
    const sLeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), spoilerMat);
    sLeg1.position.set(0.8, 1.0, -1.8);
    group.add(sLeg1);
    const sLeg2 = sLeg1.clone();
    sLeg2.position.x = -0.8;
    group.add(sLeg2);

    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.6, 0.1),
        new THREE.MeshPhongMaterial({ color: 0x1a2844, specular: 0x446688, shininess: 100 })
    );
    windshield.position.set(0, 0.9, 0.4);
    windshield.rotation.x = -0.3;
    group.add(windshield);

    const createLight = (x, y, z, color) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color }));
        mesh.position.set(x, y, z);
        const pLight = new THREE.PointLight(color, 1, 5);
        mesh.add(pLight);
        return mesh;
    };
    group.add(createLight(0.8, 0.4, 2.2, 0xffffff));
    group.add(createLight(-0.8, 0.4, 2.2, 0xffffff));
    group.add(createLight(0.8, 0.4, -2.2, cfg.rearLight));
    group.add(createLight(-0.8, 0.4, -2.2, cfg.rearLight));

    const tireMajor = 0.52;
    const tireTube = 0.33;
    const rimRadius = 0.28;
    const tireMat = new THREE.MeshPhongMaterial({ color: 0x121212, shininess: 10 });
    const rimMat = new THREE.MeshPhongMaterial({
        color: cfg.ring,
        emissive: cfg.ring,
        emissiveIntensity: 0.45,
        shininess: 110,
        specular: 0xffffff
    });
    const hubMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 50 });
    const wheelPositions = [
        { x: 1.2, y: 0.4, z: 1.4 }, { x: -1.2, y: 0.4, z: 1.4 },
        { x: 1.2, y: 0.4, z: -1.4 }, { x: -1.2, y: 0.4, z: -1.4 }
    ];

    const buildRimFace = (parent, sideX) => {
        const face = new THREE.Group();
        face.position.x = sideX;

        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(rimRadius, rimRadius, 0.05, 20),
            rimMat
        );
        disc.rotation.z = Math.PI / 2;
        face.add(disc);

        const lip = new THREE.Mesh(
            new THREE.TorusGeometry(rimRadius, 0.025, 8, 24),
            rimMat
        );
        lip.rotation.y = -Math.PI / 2;
        face.add(lip);

        const spokeGeo = new THREE.BoxGeometry(0.24, 0.04, 0.03);
        for (let i = 0; i < 5; i++) {
            const arm = new THREE.Group();
            arm.rotation.x = (i / 5) * Math.PI * 2;
            const spoke = new THREE.Mesh(spokeGeo, rimMat);
            spoke.position.y = rimRadius * 0.55;
            arm.add(spoke);
            face.add(arm);
        }

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), hubMat);
        hub.rotation.z = Math.PI / 2;
        face.add(hub);

        parent.add(face);
    };

    wheelPositions.forEach((p) => {
        const wheel = new THREE.Group();
        wheel.position.set(p.x, p.y, p.z);

        const tire = new THREE.Mesh(
            new THREE.TorusGeometry(tireMajor, tireTube, 14, 32),
            tireMat
        );
        tire.rotation.y = -Math.PI / 2;
        wheel.add(tire);

        const rimInset = tireTube * 0.48;
        buildRimFace(wheel, rimInset);
        buildRimFace(wheel, -rimInset);

        group.add(wheel);
        wheelMeshes.push(wheel);
    });

    if (opts.includeUnderGlow) {
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: createGlowTexture(cfg.under, cfg.underAccent),
                color: 0xffffff,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                opacity: 0.55,
                fog: false
            })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.03;
        glow.scale.set(4.8, 4.8, 1);
        group.add(glow);
    }

    return { group, wheels: wheelMeshes };
}

function createCarShadow() {
    const cfg = normalizeCarConfig(carConfig);
    const material = new THREE.MeshBasicMaterial({
        map: createGlowTexture(cfg.under, cfg.underAccent),
        color: 0xffffff,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        blending: THREE.AdditiveBlending,
        opacity: 0.6,
        fog: true
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.scale.set(7.4, 7.4, 1);
    return mesh;
}

function createCar() {
    if (carGroup) scene.remove(carGroup);
    const built = buildCarVisualGroup(carConfig);
    carGroup = built.group;
    wheels = built.wheels;
    carGroup.position.set(0, 0.3, 0);
    scene.add(carGroup);
    if (!carShadow) {
        carShadow = createCarShadow();
        scene.add(carShadow);
    }
    if (carShadow?.material) {
        const cfg = normalizeCarConfig(carConfig);
        carShadow.material.map?.dispose?.();
        carShadow.material.map = createGlowTexture(cfg.under, cfg.underAccent);
        carShadow.material.needsUpdate = true;
    }
    car = carGroup;
    updateCarPreview();
}

function initThree() {
    initMathScratch();
    // Scene & Fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a001a);
    scene.fog = new THREE.FogExp2(0x0a001a, 0.00095);

    const vp = getGameViewportSize();
    camera = new THREE.PerspectiveCamera(75, vp.width / vp.height, 0.1, 9000);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xff00ff, 0x00ffff, 0.8);
    scene.add(hemiLight);

    createCar();

    const mobileRenderer = shouldUseMobileRenderer(vp.width);
    renderer = new THREE.WebGLRenderer({
        antialias: !mobileRenderer,
        powerPreference: 'high-performance'
    });
    if (!clock) clock = new THREE.Clock(false);
    renderer.setSize(vp.width, vp.height, true);
    renderer.setPixelRatio(getRendererPixelRatio(vp.width));
    renderer.toneMapping = THREE.NoToneMapping;
    if (renderer.outputColorSpace != null && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const mount = gameWrapEl || document.body;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    // Events
    window.addEventListener('keydown', (e) => handleKey(e.key.toLowerCase(), true, e.repeat));
    window.addEventListener('keyup', (e) => handleKey(e.key.toLowerCase(), false));
    window.addEventListener('resize', onWindowResize);
}

function resetProceduralWorld() {
    if (!scene) return;
    if (trackGroup) scene.remove(trackGroup);

    trackGroup = new THREE.Group();
    scene.add(trackGroup);

    const terrainColors = getTerrainColors();
    terrainMesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
            color: terrainColors.fill,
            side: THREE.DoubleSide,
            fog: true,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: 4,
            polygonOffsetUnits: 4
        })
    );
    terrainMesh.renderOrder = 0;
    terrainMesh.frustumCulled = false;
    trackGroup.add(terrainMesh);

    terrainGridMesh = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: terrainColors.grid,
            transparent: true,
            opacity: 0.16,
            fog: true
        })
    );
    terrainGridMesh.frustumCulled = false;
    trackGroup.add(terrainGridMesh);

    const roadMat = new THREE.MeshBasicMaterial({
        color: ROAD_STYLE.roadColor,
        side: THREE.FrontSide,
        fog: false,
        depthTest: true,
        depthWrite: true
    });
    const edgeNeon = getLevelEdgeNeonColor(currentLevel);
    const edgeUnderlay = edgeNeon;
    const edgeMatL = new THREE.MeshBasicMaterial({
        color: edgeUnderlay,
        side: THREE.FrontSide,
        fog: false,
        depthTest: true,
        depthWrite: true
    });
    const edgeMatR = new THREE.MeshBasicMaterial({
        color: edgeUnderlay,
        side: THREE.FrontSide,
        fog: false,
        depthTest: true,
        depthWrite: true
    });
    edgeUnderlayMeshL = new THREE.Mesh(new THREE.BufferGeometry(), edgeMatL);
    edgeUnderlayMeshL.renderOrder = 1;
    edgeUnderlayMeshL.frustumCulled = false;
    trackGroup.add(edgeUnderlayMeshL);
    edgeUnderlayMeshR = new THREE.Mesh(new THREE.BufferGeometry(), edgeMatR);
    edgeUnderlayMeshR.renderOrder = 1;
    edgeUnderlayMeshR.frustumCulled = false;
    trackGroup.add(edgeUnderlayMeshR);

    roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
    roadMesh.renderOrder = 2;
    roadMesh.frustumCulled = false;
    trackGroup.add(roadMesh);

    const stripeMat = new THREE.MeshBasicMaterial({
        color: 0x303030,
        side: THREE.FrontSide,
        fog: false,
        depthTest: true,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    centerStripeMesh = new THREE.Mesh(new THREE.BufferGeometry(), stripeMat);
    centerStripeMesh.renderOrder = 3;
    centerStripeMesh.frustumCulled = false;
    trackGroup.add(centerStripeMesh);

    const stripeMat2 = new THREE.MeshBasicMaterial({
        color: 0x282828,
        side: THREE.FrontSide,
        fog: false,
        depthTest: true,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    centerStripeMesh2 = new THREE.Mesh(new THREE.BufferGeometry(), stripeMat2);
    centerStripeMesh2.renderOrder = 3;
    centerStripeMesh2.frustumCulled = false;
    trackGroup.add(centerStripeMesh2);



    buildingsGroup = new THREE.Group();
    trackGroup.add(buildingsGroup);

    savePointsGroup = new THREE.Group();
    trackGroup.add(savePointsGroup);

    trackPoints = [new THREE.Vector3(0, 0, 0)];
    trackStartIndex = 0;
    lastClosestIndex = 0;
    heading = 0;
    turnVel = 0;
    lateralOffset = 0;
    lateralVel = 0;
    buildingRecords = [];
    resetTerrainRoll();
    mainNodes = [];
    nodeStartId = 0;
    savePoints = [];
    sectorRenderLanes = [];
    sectorAltStrips = [];
    if (sectorRoadGroup) {
        trackGroup.remove(sectorRoadGroup);
        disposeObject(sectorRoadGroup);
        sectorRoadGroup = null;
    }
    roadRenderDirty = true;

    mainNodes.push({
        id: 0,
        pos: trackPoints[0].clone(),
        heading: 0,
        pointIdxGlobal: 0
    });
    createSavePointAt(trackPoints[0], 0, 0);
    applyTrackTheme(activeTheme);
}

function buildLevelTrack(config) {
    worldTour = null;
    applyTrackTheme(config.theme);
    applyGateInterval(config.gateInterval ?? config.theme?.gateInterval);
    const rng = mulberry32(config.seed);
    const origRandom = Math.random;
    Math.random = rng;

    try {
        levelFixedLength = true;
        const layoutScale = config.sectorGateCount || config.nodeCount || 20;
        levelBuildingChanceMul = (Number(config.buildingChanceMul) || 1) * clamp(14 / layoutScale, 0.35, 1);
        trackSettings.curviness = config.curviness;

        resetProceduralWorld();

        if (config.sections && typeof SectorGenerator !== 'undefined') {
            buildWorldTourTrack(config, rng);
        } else if (config.sectorBlueprint && typeof SectorGenerator !== 'undefined') {
            buildSectorLevelTrack(config, rng);
        } else {
            const segmentsNeeded = config.nodeCount * activeSaveStepSegments;
            generateSegments(segmentsNeeded);
            applyStartLeadIn();
            const finishLead = applyFinishLeadOut();
            finishPointIdx = trackStartIndex + finishLead.finishLocalIdx;
            replaceLastGateWithFinish();
            gatesTotal = savePoints.filter((p) => !p.isFinish).length;
            spawnObjectsAlongTrackRange(finishLead.leadStartLocalIdx, 0.65);
            rebuildRoadRender();
            refreshAllGateLabels();
        }
    } finally {
        Math.random = origRandom;
    }

    if (gateTotalEl) gateTotalEl.innerText = String(hudGateTotal());
}

function buildSectorLevelTrack(config, rng) {
    const roll = {
        amp: (activeTheme?.rollWaveAmp ?? 3.2) * (config.rollMul ?? 1),
        len1: activeTheme?.rollWaveLength ?? 80,
        len2: activeTheme?.rollWaveLength2 ?? 32
    };
    const bendRadiusMul = clamp(1 + Math.max(0, (config.curviness ?? 1) - 1.7) * 0.6, 1, 1.35);
    const curveMods = activeTheme?.curve || {};
    const turnMul = curveMods.turnMul ?? 1;
    const result = SectorGenerator.buildTrack(config.sectorBlueprint, rng, config.curviness, {
        sectorLength: SAVE_CFG.interval,
        steps: activeSaveStepSegments,
        trackWidth,
        minBendRadius: (trackWidth * 2 * bendRadiusMul) / turnMul,
        maxBendRadius: trackWidth * 6 * bendRadiusMul,
        seed: config.seed,
        roll,
        straightChance: config.straightChance,
        oscMagMul: curveMods.wobbleMul ?? 1,
        chordDevMul: curveMods.chordDevMul ?? 0.14
    });

    trackPoints = result.mainPoints;
    sectorRenderLanes = result.renderLanes;
    sectorAltStrips = result.altStrips;

    if (savePoints.length > 0) {
        const startGate = savePoints[0];
        savePointsGroup.remove(startGate.group);
        disposeObject(startGate.group);
        savePoints = [];
    }

    for (const cp of result.checkpoints) {
        createCheckpointGate(cp);
    }

    applyStartLeadIn();
    const finishLead = applyFinishLeadOut();
    finishPointIdx = trackStartIndex + finishLead.finishLocalIdx;
    replaceLastGateWithFinish();
    gatesTotal = savePoints.filter((p) => !p.isFinish).length;
    spawnObjectsAlongTrackRange(1, 0.65);

    roadRenderDirty = true;
    rebuildRoadRender();
    refreshAllGateLabels();
}

function spawnObjectsInRange(startLocalIdx, endLocalIdx, chanceScale = 0.65) {
    const begin = Math.max(1, Math.floor(startLocalIdx || 1));
    const end = Math.min(trackPoints.length, Math.max(begin, Math.floor(endLocalIdx || trackPoints.length)));
    for (let i = begin; i < end; i++) {
        const prevPt = trackPoints[i - 1];
        const p = trackPoints[i];
        const d = p.clone().sub(prevPt);
        d.y = 0;
        if (d.lengthSq() < 1e-6) continue;
        const segH = Math.atan2(d.x, d.z);
        maybeSpawnObjects(prevPt, p, segH, trackStartIndex + i, chanceScale);
    }
}

function snapLaneStartToPrevLanes(lanes, startPt, maxDist = 6) {
    if (!lanes?.length || !startPt) return;
    let bestEnd = null;
    let bestD2 = maxDist * maxDist;
    for (const lane of lanes) {
        const pts = lane.points;
        if (!pts?.length) continue;
        const end = pts[pts.length - 1];
        const dx = end.x - startPt.x;
        const dz = end.z - startPt.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
            bestD2 = d2;
            bestEnd = end;
        }
    }
    if (bestEnd) {
        startPt.x = bestEnd.x;
        startPt.z = bestEnd.z;
        startPt.y = bestEnd.y;
    }
}

function buildWorldTourTrack(config, rng) {
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const builtSections = [];

    trackPoints = [];
    sectorRenderLanes = [];
    sectorAltStrips = [];

    if (savePoints.length > 0) {
        const startGate = savePoints[0];
        savePointsGroup.remove(startGate.group);
        disposeObject(startGate.group);
        savePoints = [];
    }

    let currentPos = new THREE.Vector3(0, 0, 0);
    let currentHeading = 0;
    let globalOffset = 0;

    for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        const trackId = Number(section?.trackId) || 1;
        const gates = Math.max(8, Number(section?.gates) || 10);
        const sectionSeed = (Number(config.seed) || 1) + (trackId * 1000) + (si * 17);
        const sectionCfg = getLevelConfig(trackId, sessionMeta.difficulty, sectionSeed);
        const sectionTheme = sectionCfg.theme || config.theme;
        const sectionRng = mulberry32(sectionSeed);
        const profile = { gates, doubles: sectionCfg.splits ?? 1 };
        const blueprint = (typeof SectorGenerator !== 'undefined' && SectorGenerator.composeSectorBlueprint)
            ? SectorGenerator.composeSectorBlueprint(profile, sectionSeed)
            : sectionCfg.sectorBlueprint;

        applyTrackTheme(sectionTheme);
        applyGateInterval(sectionCfg.gateInterval ?? sectionTheme?.gateInterval);
        const roll = {
            amp: (sectionTheme?.rollWaveAmp ?? 3.2) * (sectionCfg.rollMul ?? 1),
            len1: sectionTheme?.rollWaveLength ?? 80,
            len2: sectionTheme?.rollWaveLength2 ?? 32
        };
        const bendRadiusMul = clamp(1 + Math.max(0, (sectionCfg.curviness ?? 1) - 1.7) * 0.6, 1, 1.35);
        const sectionCurviness = sectionCfg.curviness ?? config.curviness;
        const curveMods = sectionTheme?.curve || {};
        const turnMul = curveMods.turnMul ?? 1;

        const res = SectorGenerator.buildTrack(blueprint, sectionRng, sectionCurviness, {
            sectorLength: SAVE_CFG.interval,
            steps: activeSaveStepSegments,
            trackWidth,
            minBendRadius: (trackWidth * 2 * bendRadiusMul) / turnMul,
            maxBendRadius: trackWidth * 6 * bendRadiusMul,
            seed: sectionSeed,
            roll,
            straightChance: sectionCfg.straightChance,
            startPos: currentPos,
            startHeading: currentHeading,
            oscMagMul: curveMods.wobbleMul ?? 1,
            chordDevMul: curveMods.chordDevMul ?? 0.14
        });

        const omitFirst = globalOffset > 0;
        const mainPts = omitFirst ? res.mainPoints.slice(1) : res.mainPoints.slice();
        for (const p of mainPts) trackPoints.push(p);

        for (const lane of res.renderLanes || []) {
            const pts = lane.points.map((p) => p.clone());
            if (pts.length < 2) continue;
            if (omitFirst) snapLaneStartToPrevLanes(sectorRenderLanes, pts[0]);
            sectorRenderLanes.push({ points: pts, theme: sectionTheme });
        }
        for (const strip of res.altStrips || []) {
            const pts = omitFirst ? strip.points.slice(1) : strip.points.slice();
            if (pts.length < 2) continue;
            sectorAltStrips.push({ startIdx: strip.startIdx + globalOffset - (omitFirst ? 1 : 0), points: pts });
        }

        for (const cp of res.checkpoints || []) {
            if (omitFirst && cp.idx === 0) continue;
            createCheckpointGate({
                ...cp,
                idx: cp.idx + globalOffset - (omitFirst ? 1 : 0)
            });
        }

        const sectionEndIdx = trackStartIndex + trackPoints.length - 1;
        builtSections.push({ trackId, theme: sectionTheme, endIdx: sectionEndIdx });

        if (trackPoints.length >= 2) {
            const a = trackPoints[trackPoints.length - 2];
            const b = trackPoints[trackPoints.length - 1];
            const d = b.clone().sub(a);
            d.y = 0;
            currentHeading = d.lengthSq() > 1e-6 ? Math.atan2(d.x, d.z) : currentHeading;
            currentPos = b.clone();
        }

        globalOffset += res.mainPoints.length - (omitFirst ? 1 : 0);
    }

    applyStartLeadIn();
    const finishLead = applyFinishLeadOut();
    finishPointIdx = trackStartIndex + finishLead.finishLocalIdx;
    replaceLastGateWithFinish();
    gatesTotal = savePoints.filter((p) => !p.isFinish).length;

    worldTour = {
        sections: builtSections,
        activeIdx: -1
    };

    const shift = START_LEAD_POINTS;
    for (const sec of worldTour.sections) {
        sec.endIdx += shift;
    }

    for (let i = 0; i < builtSections.length; i++) {
        const sec = builtSections[i];
        const baseTrack = GameConfig.getTrack(sec.trackId);
        const sectionTheme = resolveTrackTheme(baseTrack) || config.theme;
        const prevEnd = i === 0 ? 1 : (builtSections[i - 1].endIdx - trackStartIndex);
        const endLocal = (sec.endIdx - trackStartIndex);
        applyTrackTheme(sectionTheme);
        spawnObjectsInRange(prevEnd, endLocal, 0.65);
    }

    applyTrackTheme(config.theme);
    roadRenderDirty = true;
    rebuildRoadRender();
    refreshAllGateLabels();
}

function updateWorldTourTheme() {
    if (!worldTour?.sections?.length) return;
    let idx = 0;
    while (idx < worldTour.sections.length - 1 && lastClosestIndex > worldTour.sections[idx].endIdx) {
        idx += 1;
    }
    if (idx !== worldTour.activeIdx) {
        worldTour.activeIdx = idx;
        applyTrackTheme(worldTour.sections[idx].theme);
    }
}

function replaceLastGateWithFinish() {
    if (!savePointsGroup || trackPoints.length < 2) return;

    if (savePoints.length > 0) {
        const last = savePoints[savePoints.length - 1];
        savePointsGroup.remove(last.group);
        disposeObject(last.group);
        savePoints.pop();
    }

    const finishLocalIdx = clamp(finishPointIdx - trackStartIndex, 1, trackPoints.length - 1);
    const endPos = trackPoints[finishLocalIdx];
    const prevPos = trackPoints[Math.max(0, finishLocalIdx - 1)];
    const nextPos = trackPoints[Math.min(trackPoints.length - 1, finishLocalIdx + 1)];
    const d = nextPos.clone().sub(prevPos);
    d.y = 0;
    const finishHeading = d.lengthSq() > 1e-6 ? Math.atan2(d.x, d.z) : heading;
    createFinishGateAt(endPos, finishPointIdx, finishHeading);
}

function createFinishGateAt(pos, globalPointIdx, headingAtPoint) {
    if (!savePointsGroup) return;

    createFinishLineAt(pos, headingAtPoint);
    const g = new THREE.Group();
    const archOffset = forwardFromHeading(headingAtPoint || 0).multiplyScalar(3.8);
    g.position.set(pos.x + archOffset.x, pos.y + 0.14, pos.z + archOffset.z);
    g.rotation.y = headingAtPoint || 0;

    const archRadius = (trackWidth / 2) + 2.8;
    const pillarMat = new THREE.MeshPhongMaterial({
        color: 0x0e1429,
        emissive: 0x00b7ff,
        emissiveIntensity: 0.9,
        fog: false
    });
    const pillarGeo = new THREE.BoxGeometry(1.05, 8.8, 1.05);
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-archRadius + 0.8, 4.4, 0);
    g.add(leftPillar);
    const rightPillar = leftPillar.clone();
    rightPillar.position.x = archRadius - 1;
    g.add(rightPillar);

    for (const side of [-1, 1]) {
        const sideGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 7.8, 0.18),
            new THREE.MeshBasicMaterial({ color: side < 0 ? 0x00e5ff : 0xff3ca6, fog: false })
        );
        sideGlow.position.set(side * (archRadius - 0.8), 4.5, 0.62);
        g.add(sideGlow);
    }

    const outerArch = new THREE.Mesh(
        new THREE.TorusGeometry(archRadius, 0.34, 14, 80, Math.PI),
        new THREE.MeshPhongMaterial({
            color: 0x00f0ff,
            emissive: 0x00b7ff,
            emissiveIntensity: 1.7,
            transparent: true,
            opacity: 0.98,
            fog: false
        })
    );
    outerArch.scale.y = 0.86;
    outerArch.position.y = 0.4;
    g.add(outerArch);

    const innerArch = new THREE.Mesh(
        new THREE.TorusGeometry(archRadius - 1.15, 0.16, 12, 60, Math.PI),
        new THREE.MeshPhongMaterial({
            color: 0xff50c8,
            emissive: 0xb40084,
            emissiveIntensity: 1.35,
            transparent: true,
            opacity: 0.9,
            fog: false
        })
    );
    innerArch.scale.y = 0.82;
    innerArch.position.y = 0.48;
    g.add(innerArch);

    const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry(trackWidth * 0.78, 0.46, 0.75),
        new THREE.MeshPhongMaterial({ color: 0xf7fbff, emissive: 0x3c8cff, emissiveIntensity: 0.8, fog: false })
    );
    topBeam.position.y = 7.6;
    g.add(topBeam);

    for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.22, 0.7),
            new THREE.MeshPhongMaterial({ color: 0xff3ca6, emissive: 0xa80068, emissiveIntensity: 1.15, fog: false })
        );
        fin.position.set(side * (archRadius - 0.8), 7.28, 0);
        fin.rotation.z = side * 0.48;
        g.add(fin);
    }

    const finishLight = new THREE.PointLight(0x8cf7ff, 2.8, 48);
    finishLight.position.y = 5.4;
    g.add(finishLight);

    savePointsGroup.add(g);
    finishGroup = g;
    savePoints.push({ idx: globalPointIdx, group: g, isFinish: true });
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function randRange(a, b) {
    return a + Math.random() * (b - a);
}

function disposeObject(obj) {
    if (!obj) return;
    obj.traverse((n) => {
        const anyN = n;
        if (anyN.geometry && typeof anyN.geometry.dispose === 'function') anyN.geometry.dispose();
        if (anyN.material) {
            const mats = Array.isArray(anyN.material) ? anyN.material : [anyN.material];
            for (const m of mats) {
                if (m && typeof m.dispose === 'function') m.dispose();
            }
        }
    });
}

function createSavePointAt(pos, globalPointIdx, headingAtPoint) {
    createCheckpointGate({
        kind: 'single',
        idx: globalPointIdx,
        arches: [{ pos: pos.clone(), heading: headingAtPoint || 0 }]
    });
}

function createStartLineAt(pos, headingAtPoint) {
    if (!savePointsGroup) return;
    const g = new THREE.Group();
    g.position.set(pos.x, (pos.y || 0) + ROAD_SURFACE.roadLift + 0.16, pos.z);
    g.rotation.y = headingAtPoint || 0;

    const stripeCount = 8;
    const totalWidth = trackWidth * 1.18;
    const cellW = totalWidth / stripeCount;
    const cellGeo = new THREE.BoxGeometry(cellW * 1.04, 0.08, 2.6);
    for (let i = 0; i < stripeCount; i++) {
        const cell = new THREE.Mesh(
            cellGeo,
            new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xffffff : 0x111111,
                fog: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            })
        );
        cell.position.set(-totalWidth * 0.5 + cellW * (i + 0.5), 0, 0);
        cell.renderOrder = 5;
        g.add(cell);
    }

    savePointsGroup.add(g);
}

function createFinishLineAt(pos, headingAtPoint) {
    if (!savePointsGroup) return;
    const g = new THREE.Group();
    g.position.set(pos.x, (pos.y || 0) + ROAD_SURFACE.roadLift + 0.18, pos.z);
    g.rotation.y = headingAtPoint || 0;

    const stripeCount = 10;
    const totalWidth = trackWidth * 1.22;
    const cellW = totalWidth / stripeCount;
    const cellGeo = new THREE.BoxGeometry(cellW * 1.04, 0.09, 3.4);
    for (let i = 0; i < stripeCount; i++) {
        const cell = new THREE.Mesh(
            cellGeo,
            new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xffffff : 0x05070d,
                fog: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            })
        );
        cell.position.set(-totalWidth * 0.5 + cellW * (i + 0.5), 0, 0);
        cell.renderOrder = 6;
        g.add(cell);
    }

    for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.1, 4.2),
            new THREE.MeshBasicMaterial({ color: side < 0 ? 0x00eaff : 0xff4ca8, fog: false })
        );
        rail.position.set(side * (totalWidth * 0.5 + 0.4), 0.02, 0);
        rail.renderOrder = 6;
        g.add(rail);
    }

    savePointsGroup.add(g);
}

function addFinishBoulevardDecor(leadPts, finishLocalIdx) {
    if (!buildingsGroup || !leadPts?.length) return;

    for (let i = 1; i < leadPts.length - 1; i += 2) {
        const p = leadPts[i];
        const prev = leadPts[i - 1];
        const next = leadPts[Math.min(leadPts.length - 1, i + 1)];
        const tangent = next.clone().sub(prev);
        tangent.y = 0;
        if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, 1);
        tangent.normalize();
        const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
        const segGlobalIdx = trackStartIndex + finishLocalIdx + i;
        const neonColor = pickThemeNeonColor(segGlobalIdx + 17);

        for (const side of [-1, 1]) {
            const lampData = createNeonPillar(side < 0 ? neonColor : pickThemeNeonColor(segGlobalIdx + 43));
            const lampOffset = (trackWidth / 2) + 16;
            const lampPos = p.clone().addScaledVector(normal, side * lampOffset);
            lampData.mesh.position.copy(lampPos);
            lampData.mesh.position.y = getGroundHeightAt(lampPos, segGlobalIdx);
            lampData.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
            attachGroundPad(lampData.mesh, lampData.width, neonColor);
            buildingsGroup.add(lampData.mesh);
            buildingRecords.push({ segIdx: segGlobalIdx, mesh: lampData.mesh });

            const decorData = ((i + (side > 0 ? 1 : 0)) % 4 === 0)
                ? createNeonBuilding(pickThemeNeonColor(segGlobalIdx + 91), 0.6)
                : createNeonTree(pickThemeNeonColor(segGlobalIdx + 133));
            const decorOffset = (trackWidth / 2) + 34 + (i % 3) * 6;
            const decorPos = p.clone().addScaledVector(normal, side * decorOffset);
            decorData.mesh.position.copy(decorPos);
            decorData.mesh.position.y = getGroundHeightAt(decorPos, segGlobalIdx);
            decorData.mesh.rotation.y = Math.atan2(tangent.x, tangent.z) + (side > 0 ? 0.18 : -0.18);
            attachGroundPad(decorData.mesh, decorData.width, neonColor);
            buildingsGroup.add(decorData.mesh);
            buildingRecords.push({ segIdx: segGlobalIdx, mesh: decorData.mesh });
        }
    }
}

function applyStartLeadIn() {
    if (!trackPoints || trackPoints.length < 2) return;

    const startPos = trackPoints[0].clone();
    const nextPos = trackPoints[1].clone();
    const dir = nextPos.sub(startPos);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();

    const added = [];
    for (let i = START_LEAD_POINTS; i >= 1; i--) {
        const dist = (START_LEAD_LENGTH * i) / START_LEAD_POINTS;
        added.push(new THREE.Vector3(
            startPos.x - dir.x * dist,
            startPos.y,
            startPos.z - dir.z * dist
        ));
    }

    trackPoints = added.concat(trackPoints);
    const shift = added.length;
    const startHeading = Math.atan2(dir.x, dir.z);

    for (const gate of savePoints) {
        if (Number.isFinite(gate.idx)) gate.idx += shift;
    }
    for (const strip of sectorAltStrips) {
        strip.startIdx += shift;
    }
    for (const node of mainNodes) {
        if (Number.isFinite(node.pointIdxGlobal)) node.pointIdxGlobal += shift;
    }
    if (finishPointIdx >= 0) finishPointIdx += shift;

    if (sectorRenderLanes.length > 0) {
        sectorRenderLanes.unshift({
            points: added.map((p) => p.clone()).concat([startPos.clone()])
        });
    }

    createStartLineAt(startPos, startHeading);
}

function applyFinishLeadOut() {
    if (!trackPoints || trackPoints.length < 2) {
        return { finishLocalIdx: Math.max(0, trackPoints.length - 1), leadStartLocalIdx: Math.max(1, trackPoints.length) };
    }

    const finishLocalIdx = trackPoints.length - 1;
    const finishPos = trackPoints[finishLocalIdx].clone();
    const prevPos = trackPoints[finishLocalIdx - 1].clone();
    const dir = finishPos.clone().sub(prevPos);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    const leadPts = [];
    for (let i = 1; i <= FINISH_LEAD_POINTS; i++) {
        const t = i / FINISH_LEAD_POINTS;
        const dist = (FINISH_LEAD_LENGTH * i) / FINISH_LEAD_POINTS;
        const lateral = Math.sin(t * Math.PI * 0.5) * FINISH_BEND_AMPLITUDE;
        leadPts.push(new THREE.Vector3(
            finishPos.x + dir.x * dist + right.x * lateral,
            finishPos.y,
            finishPos.z + dir.z * dist + right.z * lateral
        ));
    }

    trackPoints.push(...leadPts);

    if (sectorRenderLanes.length > 0) {
        sectorRenderLanes.push({
            points: [finishPos.clone(), ...leadPts.map((p) => p.clone())]
        });
    }

    addFinishBoulevardDecor([finishPos.clone(), ...leadPts.map((p) => p.clone())], finishLocalIdx);

    return { finishLocalIdx, leadStartLocalIdx: finishLocalIdx + 1 };
}

function spawnObjectsAlongTrackRange(startLocalIdx, chanceScale = 0.65) {
    const begin = Math.max(1, Math.floor(startLocalIdx || 1));
    for (let i = begin; i < trackPoints.length; i++) {
        const prevPt = trackPoints[i - 1];
        const p = trackPoints[i];
        const d = p.clone().sub(prevPt);
        d.y = 0;
        if (d.lengthSq() < 1e-6) continue;
        const segH = Math.atan2(d.x, d.z);
        maybeSpawnObjects(prevPt, p, segH, trackStartIndex + i, chanceScale);
    }
}

/**
 * Checkpoint-poortje: één boog (single) of twee bogen (dual) per sectorgrens.
 * Dual = twee rijstroken (na S/D); telt als één checkpoint op idx.
 */
function createCheckpointGate(checkpoint) {
    if (!savePointsGroup || !checkpoint?.arches?.length) return;

    const gateOrder = savePoints.filter((p) => !p.isFinish).length;
    const g = new THREE.Group();
    const arches = [];
    const labels = [];
    const hideVisuals = gateOrder === 0 && checkpoint.idx === 0;

    if (!hideVisuals) {
        for (const spec of checkpoint.arches) {
            const sub = new THREE.Group();
            sub.position.set(spec.pos.x, (spec.pos.y || 0) + 0.14, spec.pos.z);
            sub.rotation.y = spec.heading || 0;
            const arch = makeGateArchMesh();
            sub.add(arch);
            g.add(sub);
            arches.push(arch);

            const label = createGateLabel();
            label.sprite.position.set(spec.pos.x, (spec.pos.y || 0) + 14.64, spec.pos.z);
            label.side = spec.side || null;
            g.add(label.sprite);
            labels.push(label);
        }
    }

    savePointsGroup.add(g);
    const gate = {
        idx: checkpoint.idx,
        kind: checkpoint.kind || (checkpoint.arches.length > 1 ? 'dual' : 'single'),
        group: g,
        gateOrder,
        labels,
        label: labels[0],
        arches,
        arch: arches[0],
        passed: false
    };
    savePoints.push(gate);
    refreshGateLabel(gate);
}

function dist2PointToSegmentXZ(p, a, b) {
    const ax = a.x, az = a.z;
    const bx = b.x, bz = b.z;
    const px = p.x, pz = p.z;
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;
    const abLen2 = abx * abx + abz * abz;
    if (abLen2 <= 1e-6) {
        const dx = px - ax;
        const dz = pz - az;
        return dx * dx + dz * dz;
    }
    let t = (apx * abx + apz * abz) / abLen2;
    t = clamp(t, 0, 1);
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const dx = px - cx;
    const dz = pz - cz;
    return dx * dx + dz * dz;
}

function getClosestOnMain(pos, hintGlobalIdx = null) {
    const n = trackPoints.length;
    if (n < 2) return { dist: Infinity, idx: trackStartIndex };

    const baseIdx = hintGlobalIdx !== null ? hintGlobalIdx : lastClosestIndex;
    const guessLocal = clamp(baseIdx - trackStartIndex, 0, n - 2);
    const scan = TRACK_CFG.closestScanSegments;
    const start = clamp(guessLocal - scan, 0, n - 2);
    const end = clamp(guessLocal + scan, 0, n - 2);

    let bestLocal = start;
    let bestDist2 = Infinity;
    for (let i = start; i <= end; i++) {
        const d2 = dist2PointToSegmentXZ(pos, trackPoints[i], trackPoints[i + 1]);
        if (d2 < bestDist2) {
            bestDist2 = d2;
            bestLocal = i;
        }
    }

    const rescanD2 = (trackWidth * TRACK_CFG.globalRescanDistFactor) * (trackWidth * TRACK_CFG.globalRescanDistFactor);
    if (bestDist2 > rescanD2) {
        let bestAll = bestLocal;
        for (let i = 0; i <= n - 2; i++) {
            const d2 = dist2PointToSegmentXZ(pos, trackPoints[i], trackPoints[i + 1]);
            if (d2 < bestDist2) {
                bestDist2 = d2;
                bestAll = i;
            }
        }
        bestLocal = bestAll;
    }

    const bestGlobal = trackStartIndex + bestLocal;
    return { dist: Math.sqrt(bestDist2), idx: bestGlobal };
}

function getClosestTrackInfo(pos, hintGlobalIdx = null) {
    return getClosestOnMain(pos, hintGlobalIdx);
}

/**
 * Dichtstbijzijnde rijstrook (middenlijn óf rechter altStrip van dubbele
 * sectoren). De rechter strook ligt index-uitgelijnd op de middenlijn, dus we
 * geven een correcte globale idx terug voor voortgang en blijven "op de baan".
 */
function getClosestLaneInfo(pos, hintGlobalIdx = null) {
    const base = getClosestOnMain(pos, hintGlobalIdx);
    if (!sectorAltStrips || sectorAltStrips.length === 0) return base;

    let best = base;
    for (const strip of sectorAltStrips) {
        const pts = strip.points;
        if (!pts || pts.length < 2) continue;
        const startLocal = strip.startIdx - trackStartIndex;
        const endLocal = startLocal + pts.length - 1;
        const hintLocal = (hintGlobalIdx !== null ? hintGlobalIdx : lastClosestIndex) - trackStartIndex;
        if (hintLocal < startLocal - TRACK_CFG.closestScanSegments ||
            hintLocal > endLocal + TRACK_CFG.closestScanSegments) {
            continue;
        }
        let bestDist2 = Infinity;
        let bestK = 0;
        for (let k = 0; k < pts.length - 1; k++) {
            const d2 = dist2PointToSegmentXZ(pos, pts[k], pts[k + 1]);
            if (d2 < bestDist2) {
                bestDist2 = d2;
                bestK = k;
            }
        }
        const dist = Math.sqrt(bestDist2);
        if (dist < best.dist) {
            best = { dist, idx: strip.startIdx + bestK };
        }
    }
    return best;
}

function forwardFromHeading(h) {
    return new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
}

function appendRoadBetweenNodes(aNode, bNode) {
    const c = trackSettings.curviness;
    const curve = getTrackCurveMods();
    const offsetMul = curve.offsetMul ?? 1;
    const wobbleMul = curve.wobbleMul ?? 1;
    const tangentScale = clamp(0.45 + (c - 1) * 0.12, 0.35, 0.75);
    const m0 = forwardFromHeading(aNode.heading).multiplyScalar(SAVE_CFG.interval * tangentScale);
    const m1 = forwardFromHeading(bNode.heading).multiplyScalar(SAVE_CFG.interval * tangentScale);
    const steps = activeSaveStepSegments;
    const baseOffset = randRange(-MAIN_CURVE_CFG.maxOffset * c * offsetMul, MAIN_CURVE_CFG.maxOffset * c * offsetMul);
    const wobbleAmp = randRange(0, MAIN_CURVE_CFG.wobbleAmp * c * wobbleMul);
    const wobblePhase = randRange(0, Math.PI * 2);

    const segmentPoints = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const p = hermitePoint(aNode.pos, bNode.pos, m0, m1, t);
        const deriv = hermiteDerivative(aNode.pos, bNode.pos, m0, m1, t);
        if (deriv.lengthSq() < 1e-6) deriv.set(0, 0, 1);
        deriv.normalize();
        const perp = new THREE.Vector3(-deriv.z, 0, deriv.x);

        const s = Math.sin(Math.PI * t);
        const bulge = s * s;
        const wobble = Math.sin(Math.PI * 2 * t + wobblePhase) * wobbleAmp * bulge;
        p.addScaledVector(perp, baseOffset * bulge + wobble);

        trackPoints.push(p);
        segmentPoints.push(p);
    }

    const segStartGlobal = trackStartIndex + trackPoints.length - steps;
    const bendFactor = getBendFactor(aNode, bNode);
    applySegmentRoll(segmentPoints, segStartGlobal, bendFactor, aNode.pos.y || 0);

    // Spawn objects along main road
    for (let i = 0; i < steps; i++) {
        const prevPt = i === 0 ? aNode.pos : segmentPoints[i - 1];
        const p = segmentPoints[i];
        const segGlobalIdx = trackStartIndex + trackPoints.length - steps + i;
        const d = p.clone().sub(prevPt);
        d.y = 0;
        const segH = Math.atan2(d.x, d.z);
        maybeSpawnObjects(prevPt, p, segH, segGlobalIdx, 1);
    }

    bNode.pos.y = segmentPoints[segmentPoints.length - 1].y;
    bNode.pointIdxGlobal = trackStartIndex + trackPoints.length - 1;
    createSavePointAt(bNode.pos, bNode.pointIdxGlobal, bNode.heading);
}

function addNextMainNode() {
    const prev = mainNodes[mainNodes.length - 1];
    const c = trackSettings.curviness;
    const curve = getTrackCurveMods();
    const turnMul = curve.turnMul ?? 1;
    const lateralMul = curve.lateralMul ?? 1;

    // Stabilize turnVel: less randomness, more damping
    turnVel += (Math.random() - 0.5) * 1.2 * c * turnMul;
    turnVel *= 0.4;
    const turnClamp = Math.min(1.35, 0.8 * c * turnMul);
    turnVel = clamp(turnVel, -turnClamp, turnClamp);
    heading = prev.heading + turnVel;

    const lateralVelRand = MAIN_CURVE_CFG.lateralVelRand * c * 0.7 * lateralMul;
    const lateralVelClamp = Math.min(2.4, MAIN_CURVE_CFG.lateralVelClamp * c * 0.8 * lateralMul);
    const lateralStep = MAIN_CURVE_CFG.lateralStep * c * 0.8 * lateralMul;
    const maxNodeOffset = Math.min(500, MAIN_CURVE_CFG.maxNodeOffset * c * lateralMul);

    lateralVel += (Math.random() - 0.5) * lateralVelRand;
    lateralVel *= 0.55;
    lateralVel = clamp(lateralVel, -lateralVelClamp, lateralVelClamp);
    lateralOffset += lateralVel * lateralStep;
    lateralOffset *= 0.85;
    lateralOffset = clamp(lateralOffset, -maxNodeOffset, maxNodeOffset);

    const forward = forwardFromHeading(heading);
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const pos = prev.pos.clone()
        .addScaledVector(forward, SAVE_CFG.interval)
        .addScaledVector(right, lateralOffset);
    const rollStrength = activeTheme?.rollStrength ?? 2.2;
    const bendMul = Math.abs(turnVel) > 0.45 ? 0.2 : Math.abs(turnVel) > 0.22 ? 0.5 : 1;
    terrainRoll.vel += randRange(-rollStrength * 0.28, rollStrength * 0.28) * bendMul;
    terrainRoll.vel = clamp(terrainRoll.vel, -rollStrength * 0.65, rollStrength * 0.65);
    terrainRoll.vel *= 0.94;
    const maxNodeStep = rollStrength * 0.32 * bendMul;
    const targetY = clamp((prev.pos.y || 0) + terrainRoll.vel * bendMul, -14, 20);
    pos.y = clamp(targetY, (prev.pos.y || 0) - maxNodeStep, (prev.pos.y || 0) + maxNodeStep);
    const node = {
        id: nodeStartId + mainNodes.length,
        pos,
        heading,
        pointIdxGlobal: null
    };
    mainNodes.push(node);
    return node;
}

function generateSegments(count) {
    let remaining = Math.max(0, Math.floor(count));
    while (remaining > 0) {
        const prevNode = mainNodes[mainNodes.length - 1];
        const node = addNextMainNode();
        appendRoadBetweenNodes(prevNode, node);
        remaining -= activeSaveStepSegments;
    }
    roadRenderDirty = true;
}

function hermitePoint(p0, p1, m0, m1, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return new THREE.Vector3(
        p0.x * h00 + m0.x * h10 + p1.x * h01 + m1.x * h11,
        p0.y * h00 + p1.y * h01,
        p0.z * h00 + m0.z * h10 + p1.z * h01 + m1.z * h11
    );
}

function hermiteDerivative(p0, p1, m0, m1, t) {
    const t2 = t * t;
    const dh00 = 6 * t2 - 6 * t;
    const dh10 = 3 * t2 - 4 * t + 1;
    const dh01 = -6 * t2 + 6 * t;
    const dh11 = 3 * t2 - 2 * t;
    return new THREE.Vector3(
        p0.x * dh00 + m0.x * dh10 + p1.x * dh01 + m1.x * dh11,
        0,
        p0.z * dh00 + m0.z * dh10 + p1.z * dh01 + m1.z * dh11
    );
}

function maybeSpawnObjects(a, b, segHeading, segGlobalIdx, chanceScale) {
    const neonColor = pickThemeNeonColor(segGlobalIdx);

    const sideChance = TRACK_CFG.buildingChancePerSide * (chanceScale ?? 1) * levelBuildingChanceMul;
    const tan = b.clone().sub(a);
    tan.y = 0;
    if (tan.lengthSq() < 1e-6) return;
    tan.normalize();
    const normal = new THREE.Vector3(0, 1, 0).cross(tan).normalize();

    const mid = a.clone().add(b).multiplyScalar(0.5);

    for (const side of [-1, 1]) {
        if (Math.random() > sideChance) continue;

        const objData = pickDecorObject(neonColor);

        const { mesh, width, floating, floatHeight } = objData;
        const minSide = (trackWidth / 2) + (width / 2) + 1.5;
        const sideOffset = minSide + randRange(TRACK_CFG.buildingMinSideOffset, TRACK_CFG.buildingMaxSideOffset);
        const alongOffset = randRange(-TRACK_CFG.segmentLength * 0.45, TRACK_CFG.segmentLength * 0.45);

        const spawnPos = mid.clone()
            .addScaledVector(normal, side * sideOffset)
            .addScaledVector(tan, alongOffset);

        const trackInfo = getClosestLaneInfo(spawnPos, segGlobalIdx);
        if (trackInfo.dist < (trackWidth / 2) + (width / 2) + 1.0) {
            disposeObject(mesh);
            continue;
        }

        const floatOffset = floating ? (floatHeight ?? randRange(70, 150)) : 0;
        mesh.position.copy(spawnPos);
        mesh.position.y = getGroundHeightAt(spawnPos, segGlobalIdx) + floatOffset;
        mesh.rotation.y = segHeading + randRange(-0.3, 0.3);
        if (!floating) attachGroundPad(mesh, width, neonColor);
        buildingsGroup.add(mesh);
        buildingRecords.push({ segIdx: segGlobalIdx, mesh, floating: !!floating, floatOffset });
    }
}

function createNeonBuilding(color, scale = 1.0) {
    const bx = randRange(TRACK_CFG.buildingMinSize, TRACK_CFG.buildingMaxSize) * scale;
    const bz = randRange(TRACK_CFG.buildingMinSize, TRACK_CFG.buildingMaxSize) * scale;
    const h = randRange(TRACK_CFG.buildingMinHeight, TRACK_CFG.buildingMaxHeight) * scale;
    const geo = new THREE.BoxGeometry(bx, h, bz);
    geo.translate(0, h / 2, 0);
    const mat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0;

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.7
    }));
    m.add(line);
    return { mesh: m, width: Math.max(bx, bz) };
}

function createNeonTree(color) {
    const r = randRange(6, 18);
    const h = randRange(35, 75);
    const geo = new THREE.ConeGeometry(r, h, 8);
    geo.translate(0, h / 2, 0);
    const mat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0;

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
    }));
    m.add(line);
    return { mesh: m, width: r * 2 };
}

function addNeonEdges(mesh, geo, color, opacity = 0.75) {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity
    }));
    mesh.add(line);
}

function createNeonTower(color, scale = 1.0) {
    const bx = randRange(10, 18) * scale;
    const bz = randRange(10, 18) * scale;
    const h = randRange(TRACK_CFG.buildingMinHeight * 1.15, TRACK_CFG.buildingMaxHeight * 1.35) * scale;
    const geo = new THREE.BoxGeometry(bx, h, bz);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(m, geo, color, 0.82);
    return { mesh: m, width: Math.max(bx, bz) };
}

function createNeonCactus(color) {
    const r = randRange(3.5, 6);
    const h = randRange(22, 42);
    const geo = new THREE.CylinderGeometry(r, r * 0.85, h, 8);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(m, geo, color, 0.85);

    const armH = h * randRange(0.28, 0.42);
    const armR = r * 0.65;
    for (const side of [-1, 1]) {
        if (Math.random() > 0.82) continue;
        const armGeo = new THREE.CylinderGeometry(armR, armR * 0.8, armH, 6);
        armGeo.translate(0, armH / 2, 0);
        const arm = new THREE.Mesh(armGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
        arm.position.set(side * (r + armR * 0.7), h * randRange(0.35, 0.55), 0);
        arm.rotation.z = side * Math.PI / 2;
        addNeonEdges(arm, armGeo, color, 0.8);
        m.add(arm);
    }
    return { mesh: m, width: (r + armR) * 2.6 };
}

function createNeonPillar(color) {
    const r = randRange(2.2, 4.5);
    const h = randRange(45, 110);
    const geo = new THREE.CylinderGeometry(r, r * 1.15, h, 6);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(m, geo, color, 0.9);

    const ringCount = Math.floor(randRange(2, 5));
    for (let i = 0; i < ringCount; i++) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r * 1.8, 0.18, 6, 16),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * (0.2 + (i / ringCount) * 0.65);
        m.add(ring);
    }
    return { mesh: m, width: r * 4 };
}

function createNeonCrystal(color) {
    const m = new THREE.Group();
    const shardCount = Math.floor(randRange(2, 4));
    let maxSpan = 0;
    for (let i = 0; i < shardCount; i++) {
        const r = randRange(4, 9);
        const h = randRange(18, 42);
        const geo = new THREE.ConeGeometry(r, h, 5);
        geo.translate(0, h / 2, 0);
        const shard = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
        shard.position.set(randRange(-5, 5), 0, randRange(-5, 5));
        shard.rotation.y = randRange(0, Math.PI * 2);
        shard.rotation.x = randRange(-0.25, 0.25);
        addNeonEdges(shard, geo, color, 0.88);
        m.add(shard);
        maxSpan = Math.max(maxSpan, r * 2.2);
    }
    return { mesh: m, width: maxSpan || 14 };
}

/** Rechte schacht met puntige top — bergkristal. */
function createNeonCrystal2(color) {
    const m = new THREE.Group();
    const shaftR = randRange(3.2, 6.5);
    const shaftH = randRange(30, 58);
    const shaftGeo = new THREE.CylinderGeometry(shaftR * 0.82, shaftR, shaftH, 6);
    shaftGeo.translate(0, shaftH / 2, 0);
    const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(shaft, shaftGeo, color, 0.9);
    m.add(shaft);

    const tipH = randRange(12, 24);
    const tipR = shaftR * randRange(0.55, 0.75);
    const tipGeo = new THREE.ConeGeometry(tipR, tipH, 6);
    tipGeo.translate(0, tipH / 2, 0);
    const tip = new THREE.Mesh(tipGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    tip.position.y = shaftH;
    addNeonEdges(tip, tipGeo, color, 0.92);
    m.add(tip);

    m.rotation.z = randRange(-0.08, 0.08);
    return { mesh: m, width: Math.max(shaftR, tipR) * 2.4 };
}

/** Grote piramide (woestijn-monument). */
function createNeonPyramid(color) {
    const base = randRange(38, 58);
    const h = randRange(55, 95);
    const geo = new THREE.ConeGeometry(base, h, 4);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    m.rotation.y = Math.PI / 4;
    addNeonEdges(m, geo, color, 0.85);
    return { mesh: m, width: base * 1.45 };
}

/** Bol met ring — zweeft in de lucht. */
function createNeonPlanet(color) {
    const m = new THREE.Group();
    const r = randRange(9, 17);
    const sphereGeo = new THREE.SphereGeometry(r, 12, 10);
    const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(sphere, sphereGeo, color, 0.88);
    m.add(sphere);

    const ringGeo = new THREE.TorusGeometry(r * randRange(1.45, 1.85), 0.32, 6, 24);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82
    }));
    ring.rotation.x = Math.PI / 2 + randRange(-0.35, 0.35);
    ring.rotation.y = randRange(0, Math.PI * 2);
    m.add(ring);

    return {
        mesh: m,
        width: r * 3.6,
        floating: true,
        floatHeight: randRange(75, 165)
    };
}

/** Stomp met bol — lollipop-boom. */
function createNeonBoom2(color) {
    const m = new THREE.Group();
    const trunkR = randRange(2.2, 4.2);
    const trunkH = randRange(20, 36);
    const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.9, trunkR * 1.12, trunkH, 6);
    trunkGeo.translate(0, trunkH / 2, 0);
    const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    addNeonEdges(trunk, trunkGeo, color, 0.82);
    m.add(trunk);

    const crownR = randRange(11, 20);
    const crownGeo = new THREE.SphereGeometry(crownR, 10, 8);
    const crown = new THREE.Mesh(crownGeo, new THREE.MeshPhongMaterial({ color: 0x000000 }));
    crown.position.y = trunkH;
    addNeonEdges(crown, crownGeo, color, 0.88);
    m.add(crown);

    return { mesh: m, width: crownR * 2.2 };
}

function createNeonHouse(color, scale = 1.0) {
    const size = randRange(15, 30) * scale;
    const h = randRange(12, 24) * scale;
    const geo = new THREE.BoxGeometry(size, h, size);
    geo.translate(0, h / 2, 0);
    const mat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0;

    const roofGeo = new THREE.ConeGeometry(size * 0.9, h * 0.9, 4);
    roofGeo.translate(0, (h * 0.9) / 2, 0);
    const roof = new THREE.Mesh(roofGeo, mat);
    roof.position.y = h;
    roof.rotation.y = Math.PI / 4;
    m.add(roof);

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.75
    }));
    m.add(line);

    const roofEdges = new THREE.EdgesGeometry(roofGeo);
    const roofLine = new THREE.LineSegments(roofEdges, new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.75
    }));
    roof.add(roofLine);

    return { mesh: m, width: size };
}

function trimBuildingsBefore(keepFromIdx) {
    for (let i = buildingRecords.length - 1; i >= 0; i--) {
        if (buildingRecords[i].segIdx < keepFromIdx) {
            buildingsGroup.remove(buildingRecords[i].mesh);
            disposeObject(buildingRecords[i].mesh);
            buildingRecords.splice(i, 1);
        }
    }
}

/** 3D-raam langs de weg (volgt hellingen — geen plat XZ-vlak). */
function computeRoadFrame(points, i) {
    const p = points[i];
    const n = points.length;
    const tan = new THREE.Vector3();
    if (i === 0) tan.subVectors(points[1], points[0]);
    else if (i === n - 1) tan.subVectors(points[n - 1], points[n - 2]);
    else tan.subVectors(points[i + 1], points[i - 1]);
    if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
    else tan.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let normal = new THREE.Vector3().crossVectors(tan, up);
    if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
    else normal.normalize();
    const roadUp = new THREE.Vector3().crossVectors(tan, normal).normalize();
    if (roadUp.y < 0) roadUp.negate();
    return { p, normal, roadUp };
}

function roadVertexAt(frame, lateral, lift) {
    return new THREE.Vector3(
        frame.p.x + frame.normal.x * lateral + frame.roadUp.x * lift,
        frame.p.y + frame.normal.y * lateral + frame.roadUp.y * lift,
        frame.p.z + frame.normal.z * lateral + frame.roadUp.z * lift
    );
}

function buildRoadStripBuffers(points, halfW, opts) {
    const n = points.length;
    if (n < 2) return null;

    const stripeHalfW = Math.max(6.5, trackWidth * 0.38);
    const stripe2HalfW = Math.max(2.2, stripeHalfW * 0.34);
    const roadLift = opts?.roadLift ?? ROAD_SURFACE.roadLift;
    const stripeLift = opts?.stripeLift ?? ROAD_SURFACE.stripeLift;
    const edgeExtra = opts?.edgeExtra ?? EDGE_UNDERLAY_EXTRA;
    const edgeLift = opts?.edgeLift ?? (roadLift - EDGE_UNDERLAY_LIFT_DELTA);
    const drawStripe = opts?.stripe !== false;
    const IndexArray = n * 2 <= 65535 ? Uint16Array : Uint32Array;

    const pos = new Float32Array(n * 2 * 3);
    const idx = new IndexArray((n - 1) * 6);
    const edgeLPos = new Float32Array(n * 2 * 3);
    const edgeRPos = new Float32Array(n * 2 * 3);
    const stripePos = drawStripe ? new Float32Array(n * 2 * 3) : null;
    const stripeIdx = drawStripe ? new IndexArray((n - 1) * 6) : null;
    const stripe2Pos = drawStripe ? new Float32Array(n * 2 * 3) : null;
    const stripe2Idx = drawStripe ? new IndexArray((n - 1) * 6) : null;

    for (let i = 0; i < n; i++) {
        const frame = computeRoadFrame(points, i);
        const left = roadVertexAt(frame, halfW, roadLift);
        const right = roadVertexAt(frame, -halfW, roadLift);
        const edgeOuterL = roadVertexAt(frame, halfW + edgeExtra, edgeLift);
        const edgeInnerL = roadVertexAt(frame, halfW, edgeLift);
        const edgeInnerR = roadVertexAt(frame, -halfW, edgeLift);
        const edgeOuterR = roadVertexAt(frame, -(halfW + edgeExtra), edgeLift);

        const v0 = (i * 2) * 3;
        pos[v0 + 0] = left.x;
        pos[v0 + 1] = left.y;
        pos[v0 + 2] = left.z;
        pos[v0 + 3] = right.x;
        pos[v0 + 4] = right.y;
        pos[v0 + 5] = right.z;
        edgeLPos[v0 + 0] = edgeOuterL.x;
        edgeLPos[v0 + 1] = edgeOuterL.y;
        edgeLPos[v0 + 2] = edgeOuterL.z;
        edgeLPos[v0 + 3] = edgeInnerL.x;
        edgeLPos[v0 + 4] = edgeInnerL.y;
        edgeLPos[v0 + 5] = edgeInnerL.z;
        edgeRPos[v0 + 0] = edgeInnerR.x;
        edgeRPos[v0 + 1] = edgeInnerR.y;
        edgeRPos[v0 + 2] = edgeInnerR.z;
        edgeRPos[v0 + 3] = edgeOuterR.x;
        edgeRPos[v0 + 4] = edgeOuterR.y;
        edgeRPos[v0 + 5] = edgeOuterR.z;

        if (stripePos) {
            const stripeL = roadVertexAt(frame, stripeHalfW, stripeLift);
            const stripeR = roadVertexAt(frame, -stripeHalfW, stripeLift);
            const stripe2L = roadVertexAt(frame, stripe2HalfW, stripeLift);
            const stripe2R = roadVertexAt(frame, -stripe2HalfW, stripeLift);
            const sv0 = (i * 2) * 3;
            stripePos[sv0 + 0] = stripeL.x;
            stripePos[sv0 + 1] = stripeL.y;
            stripePos[sv0 + 2] = stripeL.z;
            stripePos[sv0 + 3] = stripeR.x;
            stripePos[sv0 + 4] = stripeR.y;
            stripePos[sv0 + 5] = stripeR.z;
            stripe2Pos[sv0 + 0] = stripe2L.x;
            stripe2Pos[sv0 + 1] = stripe2L.y;
            stripe2Pos[sv0 + 2] = stripe2L.z;
            stripe2Pos[sv0 + 3] = stripe2R.x;
            stripe2Pos[sv0 + 4] = stripe2R.y;
            stripe2Pos[sv0 + 5] = stripe2R.z;
        }

        if (i < n - 1) {
            const base = i * 6;
            const l0 = i * 2;
            const r0 = i * 2 + 1;
            const l1 = (i + 1) * 2;
            const r1 = (i + 1) * 2 + 1;
            idx[base + 0] = l0;
            idx[base + 1] = l1;
            idx[base + 2] = r0;
            idx[base + 3] = r0;
            idx[base + 4] = l1;
            idx[base + 5] = r1;
            if (stripeIdx) {
                stripeIdx[base + 0] = l0;
                stripeIdx[base + 1] = l1;
                stripeIdx[base + 2] = r0;
                stripeIdx[base + 3] = r0;
                stripeIdx[base + 4] = l1;
                stripeIdx[base + 5] = r1;
                stripe2Idx[base + 0] = l0;
                stripe2Idx[base + 1] = l1;
                stripe2Idx[base + 2] = r0;
                stripe2Idx[base + 3] = r0;
                stripe2Idx[base + 4] = l1;
                stripe2Idx[base + 5] = r1;
            }
        }
    }

    return { pos, edgeLPos, edgeRPos, idx, stripePos, stripeIdx, stripe2Pos, stripe2Idx };
}

function addStripMeshToGroup(group, buffers, materials) {
    if (!buffers) return;

    if (buffers.edgeLPos && materials.edgeL) {
        const edgeLGeo = new THREE.BufferGeometry();
        edgeLGeo.setIndex(new THREE.BufferAttribute(buffers.idx, 1));
        edgeLGeo.setAttribute('position', new THREE.BufferAttribute(buffers.edgeLPos, 3));
        edgeLGeo.computeVertexNormals();
        const edgeL = new THREE.Mesh(edgeLGeo, materials.edgeL);
        edgeL.renderOrder = 1;
        edgeL.frustumCulled = false;
        group.add(edgeL);
    }
    if (buffers.edgeRPos && materials.edgeR) {
        const edgeRGeo = new THREE.BufferGeometry();
        edgeRGeo.setIndex(new THREE.BufferAttribute(buffers.idx, 1));
        edgeRGeo.setAttribute('position', new THREE.BufferAttribute(buffers.edgeRPos, 3));
        edgeRGeo.computeVertexNormals();
        const edgeR = new THREE.Mesh(edgeRGeo, materials.edgeR);
        edgeR.renderOrder = 1;
        edgeR.frustumCulled = false;
        group.add(edgeR);
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setIndex(new THREE.BufferAttribute(buffers.idx, 1));
    roadGeo.setAttribute('position', new THREE.BufferAttribute(buffers.pos, 3));
    roadGeo.computeVertexNormals();
    const road = new THREE.Mesh(roadGeo, materials.road);
    road.renderOrder = 2;
    road.frustumCulled = false;
    group.add(road);

    if (buffers.stripePos && materials.stripe) {
        const stripeGeo = new THREE.BufferGeometry();
        stripeGeo.setIndex(new THREE.BufferAttribute(buffers.stripeIdx, 1));
        stripeGeo.setAttribute('position', new THREE.BufferAttribute(buffers.stripePos, 3));
        stripeGeo.computeVertexNormals();
        const stripe = new THREE.Mesh(stripeGeo, materials.stripe);
        stripe.renderOrder = 3;
        stripe.frustumCulled = false;
        group.add(stripe);

        const stripe2Geo = new THREE.BufferGeometry();
        stripe2Geo.setIndex(new THREE.BufferAttribute(buffers.stripe2Idx, 1));
        stripe2Geo.setAttribute('position', new THREE.BufferAttribute(buffers.stripe2Pos, 3));
        stripe2Geo.computeVertexNormals();
        const stripe2 = new THREE.Mesh(stripe2Geo, materials.stripe2);
        stripe2.renderOrder = 3;
        stripe2.frustumCulled = false;
        group.add(stripe2);
    }


}

function buildTerrainStripBuffers(points, halfW) {
    const n = points.length;
    if (n < 2) return null;

    const terrainOuter = halfW + TERRAIN_CFG.outerExtra;
    const innerEdge = halfW;
    const innerDrop = TERRAIN_VIS.innerDrop;
    const outerDrop = TERRAIN_VIS.outerDrop;
    const IndexArray = n * 4 <= 65535 ? Uint16Array : Uint32Array;

    const terrainPos = new Float32Array(n * 4 * 3);
    const terrainIdx = new IndexArray((n - 1) * 12);

    for (let i = 0; i < n; i++) {
        const frame = computeRoadFrame(points, i);
        const innerL = roadVertexAt(frame, innerEdge, innerDrop);
        const innerR = roadVertexAt(frame, -innerEdge, innerDrop);
        const farLpt = roadVertexAt(frame, terrainOuter, outerDrop);
        const farRpt = roadVertexAt(frame, -terrainOuter, outerDrop);

        const tv0 = (i * 4) * 3;
        terrainPos[tv0 + 0] = farLpt.x;
        terrainPos[tv0 + 1] = farLpt.y;
        terrainPos[tv0 + 2] = farLpt.z;
        terrainPos[tv0 + 3] = innerL.x;
        terrainPos[tv0 + 4] = innerL.y;
        terrainPos[tv0 + 5] = innerL.z;
        terrainPos[tv0 + 6] = innerR.x;
        terrainPos[tv0 + 7] = innerR.y;
        terrainPos[tv0 + 8] = innerR.z;
        terrainPos[tv0 + 9] = farRpt.x;
        terrainPos[tv0 + 10] = farRpt.y;
        terrainPos[tv0 + 11] = farRpt.z;

        if (i < n - 1) {
            const tb = i * 12;
            const b0 = i * 4;
            const b1 = (i + 1) * 4;
            terrainIdx[tb + 0] = b0;
            terrainIdx[tb + 1] = b0 + 1;
            terrainIdx[tb + 2] = b1;
            terrainIdx[tb + 3] = b1;
            terrainIdx[tb + 4] = b0 + 1;
            terrainIdx[tb + 5] = b1 + 1;
            terrainIdx[tb + 6] = b0 + 2;
            terrainIdx[tb + 7] = b1 + 2;
            terrainIdx[tb + 8] = b0 + 3;
            terrainIdx[tb + 9] = b1 + 2;
            terrainIdx[tb + 10] = b1 + 3;
            terrainIdx[tb + 11] = b0 + 3;
        }
    }

    return { terrainPos, terrainIdx };
}

function addTerrainStripToGroup(group, points, halfW) {
    const buffers = buildTerrainStripBuffers(points, halfW);
    if (!buffers) return;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(buffers.terrainIdx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.terrainPos, 3));
    geo.computeVertexNormals();
    const terrainColors = getTerrainColors();
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
            color: terrainColors.fill,
            side: THREE.DoubleSide,
            fog: true,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 6,
            polygonOffsetUnits: 6
        })
    );
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
}

function buildSectorTerrainBuffers() {
    const n = trackPoints.length;
    if (n < 2) return null;

    const innerDrop = TERRAIN_VIS.innerDrop;
    const outerDrop = TERRAIN_VIS.outerDrop;
    const IndexArray = n * 6 <= 65535 ? Uint16Array : Uint32Array;
    const terrainPos = new Float32Array(n * 6 * 3);
    const terrainIdx = new IndexArray((n - 1) * 18);

    const gridSegCount = Math.ceil(n / TERRAIN_CFG.gridStep) + Math.ceil(n / TERRAIN_CFG.gridLongStep);
    const gridPos = new Float32Array(gridSegCount * 8 * 3);
    let gridVerts = 0;

    const baseHalfW = trackWidth / 2;
    const outerExtra = TERRAIN_CFG.outerExtra;

    for (let i = 0; i < n; i++) {
        let altPts = null;
        let altK = -1;
        if (sectorAltStrips?.length) {
            for (const strip of sectorAltStrips) {
                const k = i - (strip.startIdx - trackStartIndex);
                if (k >= 0 && k < strip.points.length) {
                    altPts = strip.points;
                    altK = k;
                    break;
                }
            }
        }

        const frameA = computeRoadFrame(trackPoints, i);
        let innerL, innerR, midL, midR, farLpt, farRpt;

        if (altPts) {
            const frameB = computeRoadFrame(altPts, altK);
            
            innerL = roadVertexAt(frameA, baseHalfW, innerDrop);
            midL = roadVertexAt(frameA, -baseHalfW, innerDrop);
            midR = roadVertexAt(frameB, baseHalfW, innerDrop);
            innerR = roadVertexAt(frameB, -baseHalfW, innerDrop);
            
            farLpt = roadVertexAt(frameA, baseHalfW + outerExtra, outerDrop);
            farRpt = roadVertexAt(frameB, -(baseHalfW + outerExtra), outerDrop);
        } else {
            innerL = roadVertexAt(frameA, baseHalfW, innerDrop);
            innerR = roadVertexAt(frameA, -baseHalfW, innerDrop);
            
            const midPt = roadVertexAt(frameA, 0, innerDrop);
            midL = midPt;
            midR = midPt;
            
            farLpt = roadVertexAt(frameA, baseHalfW + outerExtra, outerDrop);
            farRpt = roadVertexAt(frameA, -(baseHalfW + outerExtra), outerDrop);
        }

        const tv0 = (i * 6) * 3;
        terrainPos[tv0 + 0] = farLpt.x;
        terrainPos[tv0 + 1] = farLpt.y;
        terrainPos[tv0 + 2] = farLpt.z;
        terrainPos[tv0 + 3] = innerL.x;
        terrainPos[tv0 + 4] = innerL.y;
        terrainPos[tv0 + 5] = innerL.z;
        terrainPos[tv0 + 6] = midL.x;
        terrainPos[tv0 + 7] = midL.y;
        terrainPos[tv0 + 8] = midL.z;
        terrainPos[tv0 + 9] = midR.x;
        terrainPos[tv0 + 10] = midR.y;
        terrainPos[tv0 + 11] = midR.z;
        terrainPos[tv0 + 12] = innerR.x;
        terrainPos[tv0 + 13] = innerR.y;
        terrainPos[tv0 + 14] = innerR.z;
        terrainPos[tv0 + 15] = farRpt.x;
        terrainPos[tv0 + 16] = farRpt.y;
        terrainPos[tv0 + 17] = farRpt.z;

        if (i % TERRAIN_CFG.gridStep === 0) {
            const g0 = gridVerts * 3;
            gridPos[g0 + 0] = farLpt.x;
            gridPos[g0 + 1] = farLpt.y + 0.04;
            gridPos[g0 + 2] = farLpt.z;
            gridPos[g0 + 3] = farRpt.x;
            gridPos[g0 + 4] = farRpt.y + 0.04;
            gridPos[g0 + 5] = farRpt.z;
            gridVerts += 2;
        }
        if (i % TERRAIN_CFG.gridLongStep === 0 && i < n - 1) {
            let nextAltPts = null;
            let nextAltK = -1;
            if (sectorAltStrips?.length) {
                for (const strip of sectorAltStrips) {
                    const k = (i + 1) - (strip.startIdx - trackStartIndex);
                    if (k >= 0 && k < strip.points.length) {
                        nextAltPts = strip.points;
                        nextAltK = k;
                        break;
                    }
                }
            }

            const nextFrameA = computeRoadFrame(trackPoints, i + 1);
            let aheadFarL, aheadFarR;
            if (nextAltPts) {
                const nextFrameB = computeRoadFrame(nextAltPts, nextAltK);
                aheadFarL = roadVertexAt(nextFrameA, baseHalfW + outerExtra, outerDrop);
                aheadFarR = roadVertexAt(nextFrameB, -(baseHalfW + outerExtra), outerDrop);
            } else {
                aheadFarL = roadVertexAt(nextFrameA, baseHalfW + outerExtra, outerDrop);
                aheadFarR = roadVertexAt(nextFrameA, -(baseHalfW + outerExtra), outerDrop);
            }

            const g0 = gridVerts * 3;
            gridPos[g0 + 0] = farLpt.x;
            gridPos[g0 + 1] = farLpt.y + 0.04;
            gridPos[g0 + 2] = farLpt.z;
            gridPos[g0 + 3] = aheadFarL.x;
            gridPos[g0 + 4] = aheadFarL.y + 0.04;
            gridPos[g0 + 5] = aheadFarL.z;
            gridVerts += 2;
            
            const g1 = gridVerts * 3;
            gridPos[g1 + 0] = farRpt.x;
            gridPos[g1 + 1] = farRpt.y + 0.04;
            gridPos[g1 + 2] = farRpt.z;
            gridPos[g1 + 3] = aheadFarR.x;
            gridPos[g1 + 4] = aheadFarR.y + 0.04;
            gridPos[g1 + 5] = aheadFarR.z;
            gridVerts += 2;
        }

        if (i < n - 1) {
            const tb = i * 18;
            const b0 = i * 6;
            const b1 = (i + 1) * 6;
            
            // Strip 1: left outer terrain (farLpt to innerL)
            terrainIdx[tb + 0] = b0 + 0;
            terrainIdx[tb + 1] = b0 + 1;
            terrainIdx[tb + 2] = b1 + 0;
            terrainIdx[tb + 3] = b1 + 0;
            terrainIdx[tb + 4] = b0 + 1;
            terrainIdx[tb + 5] = b1 + 1;

            // Strip 2: center terrain (midL to midR)
            terrainIdx[tb + 6] = b0 + 2;
            terrainIdx[tb + 7] = b0 + 3;
            terrainIdx[tb + 8] = b1 + 2;
            terrainIdx[tb + 9] = b1 + 2;
            terrainIdx[tb + 10] = b0 + 3;
            terrainIdx[tb + 11] = b1 + 3;

            // Strip 3: right outer terrain (innerR to farRpt)
            terrainIdx[tb + 12] = b0 + 4;
            terrainIdx[tb + 13] = b0 + 5;
            terrainIdx[tb + 14] = b1 + 4;
            terrainIdx[tb + 15] = b1 + 4;
            terrainIdx[tb + 16] = b0 + 5;
            terrainIdx[tb + 17] = b1 + 5;
        }
    }

    return { terrainPos, terrainIdx, gridPos, gridVerts };
}

function addSectorTerrainToGroup(group) {
    const buffers = buildSectorTerrainBuffers();
    if (!buffers) return;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(buffers.terrainIdx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.terrainPos, 3));
    geo.computeVertexNormals();
    const terrainColors = getTerrainColors();
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
            color: terrainColors.fill,
            side: THREE.DoubleSide,
            fog: true,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: 8,
            polygonOffsetUnits: 8
        })
    );
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    group.add(mesh);

    if (terrainGridMesh && buffers.gridPos) {
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.BufferAttribute(buffers.gridPos.subarray(0, buffers.gridVerts * 3), 3));
        terrainGridMesh.geometry.dispose();
        terrainGridMesh.geometry = gridGeo;
        terrainGridMesh.visible = true;
    }
}

function rebuildSectorRoadRender() {
    if (sectorRoadGroup) {
        trackGroup.remove(sectorRoadGroup);
        disposeObject(sectorRoadGroup);
        sectorRoadGroup = null;
    }

    sectorRoadGroup = new THREE.Group();
    trackGroup.add(sectorRoadGroup);

    const halfW = trackWidth / 2;
    addSectorTerrainToGroup(sectorRoadGroup);
    const edgeMatL = edgeUnderlayMeshL.material;
    const edgeMatR = edgeUnderlayMeshR.material;
    const matCache = new Map();
    const getMatsForTheme = (theme) => {
        const key = theme || activeTheme;
        if (matCache.has(key)) return matCache.get(key);
        const roadMat = new THREE.MeshBasicMaterial({
            color: key?.road ?? ROAD_STYLE.roadColor,
            side: THREE.FrontSide,
            fog: false,
            depthTest: true,
            depthWrite: true
        });
        const stripeMat = new THREE.MeshBasicMaterial({
            color: key?.stripe1 ?? 0x303030,
            side: THREE.FrontSide,
            fog: false,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const stripe2Mat = new THREE.MeshBasicMaterial({
            color: key?.stripe2 ?? 0x282828,
            side: THREE.FrontSide,
            fog: false,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        const mats = { road: roadMat, stripe: stripeMat, stripe2: stripe2Mat };
        matCache.set(key, mats);
        return mats;
    };

    for (const lane of sectorRenderLanes) {
        if (!lane.points || lane.points.length < 2) continue;
        const tm = getMatsForTheme(lane.theme);
        const materials = {
            edgeL: edgeMatL,
            edgeR: edgeMatR,
            road: tm.road,
            stripe: tm.stripe,
            stripe2: tm.stripe2
        };
        const buffers = buildRoadStripBuffers(lane.points, halfW, {

            stripe: true,
            edgeExtra: EDGE_UNDERLAY_EXTRA
        });
        addStripMeshToGroup(sectorRoadGroup, buffers, materials);
    }

    edgeUnderlayMeshL.visible = false;
    edgeUnderlayMeshR.visible = false;
    roadMesh.visible = false;
    centerStripeMesh.visible = false;
    centerStripeMesh2.visible = false;
}

function rebuildRoadRender() {
    if (!roadRenderDirty) return;
    roadRenderDirty = false;
    if (!roadMesh || !edgeUnderlayMeshL || !edgeUnderlayMeshR || !centerStripeMesh || !centerStripeMesh2) return;

    const n = trackPoints.length;
    if (n < 2) return;

    if (terrainMesh) terrainMesh.visible = true;
    if (terrainGridMesh) terrainGridMesh.visible = true;

    roadMesh.visible = true;
    edgeUnderlayMeshL.visible = true;
    edgeUnderlayMeshR.visible = true;
    centerStripeMesh.visible = true;
    centerStripeMesh2.visible = true;

    if (sectorRenderLanes.length > 0) {
        rebuildSectorRoadRender();
        if (terrainMesh) terrainMesh.visible = false;
        refreshBuildingGroundHeights();
        return;
    } else if (sectorRoadGroup) {
        trackGroup.remove(sectorRoadGroup);
        disposeObject(sectorRoadGroup);
        sectorRoadGroup = null;
    }

    const halfW = trackWidth / 2;
    const edgeHalfW = halfW + EDGE_UNDERLAY_EXTRA;
    const terrainOuter = halfW + TERRAIN_CFG.outerExtra;
    const stripeHalfW = Math.max(6.5, trackWidth * 0.38);
    const stripe2HalfW = Math.max(2.2, stripeHalfW * 0.34);
    const roadLift = ROAD_SURFACE.roadLift;
    const stripeLift = ROAD_SURFACE.stripeLift;
    const borderLift = ROAD_SURFACE.borderLift;
    const edgeLift = roadLift - EDGE_UNDERLAY_LIFT_DELTA;
    const innerEdge = halfW;
    const innerDrop = TERRAIN_VIS.innerDrop;
    const outerDrop = TERRAIN_VIS.outerDrop;
    const IndexArray = n * 2 <= 65535 ? Uint16Array : Uint32Array;
    const pos = new Float32Array(n * 2 * 3);
    const edgeLPos = new Float32Array(n * 2 * 3);
    const edgeRPos = new Float32Array(n * 2 * 3);
    const idx = new IndexArray((n - 1) * 6);

    const stripePos = new Float32Array(n * 2 * 3);
    const stripeIdx = new IndexArray((n - 1) * 6);
    const stripe2Pos = new Float32Array(n * 2 * 3);
    const stripe2Idx = new IndexArray((n - 1) * 6);
    const terrainPos = new Float32Array(n * 4 * 3);
    const terrainIdx = new IndexArray((n - 1) * 12);
    const gridSegCount = Math.ceil(n / TERRAIN_CFG.gridStep) + Math.ceil(n / TERRAIN_CFG.gridLongStep);
    const gridPos = new Float32Array(gridSegCount * 4 * 3);
    let gridVerts = 0;

    for (let i = 0; i < n; i++) {
        const frame = computeRoadFrame(trackPoints, i);
        const p = frame.p;
        const py = p.y || 0;
        const left = roadVertexAt(frame, halfW, roadLift);
        const right = roadVertexAt(frame, -halfW, roadLift);
        const edgeOuterL = roadVertexAt(frame, edgeHalfW, edgeLift);
        const edgeInnerL = roadVertexAt(frame, halfW, edgeLift);
        const edgeInnerR = roadVertexAt(frame, -halfW, edgeLift);
        const edgeOuterR = roadVertexAt(frame, -edgeHalfW, edgeLift);
        const stripeL = roadVertexAt(frame, stripeHalfW, stripeLift);
        const stripeR = roadVertexAt(frame, -stripeHalfW, stripeLift);
        const stripe2L = roadVertexAt(frame, stripe2HalfW, stripeLift);
        const stripe2R = roadVertexAt(frame, -stripe2HalfW, stripeLift);
        const innerL = roadVertexAt(frame, innerEdge, innerDrop);
        const innerR = roadVertexAt(frame, -innerEdge, innerDrop);
        const farLpt = roadVertexAt(frame, terrainOuter, outerDrop);
        const farRpt = roadVertexAt(frame, -terrainOuter, outerDrop);

        const v0 = (i * 2) * 3;
        pos[v0 + 0] = left.x;
        pos[v0 + 1] = left.y;
        pos[v0 + 2] = left.z;
        pos[v0 + 3] = right.x;
        pos[v0 + 4] = right.y;
        pos[v0 + 5] = right.z;
        edgeLPos[v0 + 0] = edgeOuterL.x;
        edgeLPos[v0 + 1] = edgeOuterL.y;
        edgeLPos[v0 + 2] = edgeOuterL.z;
        edgeLPos[v0 + 3] = edgeInnerL.x;
        edgeLPos[v0 + 4] = edgeInnerL.y;
        edgeLPos[v0 + 5] = edgeInnerL.z;
        edgeRPos[v0 + 0] = edgeInnerR.x;
        edgeRPos[v0 + 1] = edgeInnerR.y;
        edgeRPos[v0 + 2] = edgeInnerR.z;
        edgeRPos[v0 + 3] = edgeOuterR.x;
        edgeRPos[v0 + 4] = edgeOuterR.y;
        edgeRPos[v0 + 5] = edgeOuterR.z;


        const sv0 = (i * 2) * 3;
        stripePos[sv0 + 0] = stripeL.x;
        stripePos[sv0 + 1] = stripeL.y;
        stripePos[sv0 + 2] = stripeL.z;
        stripePos[sv0 + 3] = stripeR.x;
        stripePos[sv0 + 4] = stripeR.y;
        stripePos[sv0 + 5] = stripeR.z;

        stripe2Pos[sv0 + 0] = stripe2L.x;
        stripe2Pos[sv0 + 1] = stripe2L.y;
        stripe2Pos[sv0 + 2] = stripe2L.z;
        stripe2Pos[sv0 + 3] = stripe2R.x;
        stripe2Pos[sv0 + 4] = stripe2R.y;
        stripe2Pos[sv0 + 5] = stripe2R.z;

        const tv0 = (i * 4) * 3;
        terrainPos[tv0 + 0] = farLpt.x;
        terrainPos[tv0 + 1] = farLpt.y;
        terrainPos[tv0 + 2] = farLpt.z;
        terrainPos[tv0 + 3] = innerL.x;
        terrainPos[tv0 + 4] = innerL.y;
        terrainPos[tv0 + 5] = innerL.z;
        terrainPos[tv0 + 6] = innerR.x;
        terrainPos[tv0 + 7] = innerR.y;
        terrainPos[tv0 + 8] = innerR.z;
        terrainPos[tv0 + 9] = farRpt.x;
        terrainPos[tv0 + 10] = farRpt.y;
        terrainPos[tv0 + 11] = farRpt.z;

        if (i % TERRAIN_CFG.gridStep === 0) {
            const g0 = gridVerts * 3;
            gridPos[g0 + 0] = farLpt.x;
            gridPos[g0 + 1] = farLpt.y + 0.04;
            gridPos[g0 + 2] = farLpt.z;
            gridPos[g0 + 3] = farRpt.x;
            gridPos[g0 + 4] = farRpt.y + 0.04;
            gridPos[g0 + 5] = farRpt.z;
            gridVerts += 2;
        }
        if (i % TERRAIN_CFG.gridLongStep === 0 && i < n - 1) {
            const aheadFrame = computeRoadFrame(trackPoints, i + 1);
            const aheadFarL = roadVertexAt(aheadFrame, terrainOuter, ROAD_SURFACE.shoulderOuterDrop);
            const aheadFarR = roadVertexAt(aheadFrame, -terrainOuter, ROAD_SURFACE.shoulderOuterDrop);
            const g0 = gridVerts * 3;
            gridPos[g0 + 0] = farLpt.x;
            gridPos[g0 + 1] = farLpt.y + 0.04;
            gridPos[g0 + 2] = farLpt.z;
            gridPos[g0 + 3] = aheadFarL.x;
            gridPos[g0 + 4] = aheadFarL.y + 0.04;
            gridPos[g0 + 5] = aheadFarL.z;
            gridVerts += 2;
            const g1 = gridVerts * 3;
            gridPos[g1 + 0] = farRpt.x;
            gridPos[g1 + 1] = farRpt.y + 0.04;
            gridPos[g1 + 2] = farRpt.z;
            gridPos[g1 + 3] = aheadFarR.x;
            gridPos[g1 + 4] = aheadFarR.y + 0.04;
            gridPos[g1 + 5] = aheadFarR.z;
            gridVerts += 2;
        }

        if (i < n - 1) {
            const base = i * 6;
            const l0 = i * 2;
            const r0 = i * 2 + 1;
            const l1 = (i + 1) * 2;
            const r1 = (i + 1) * 2 + 1;
            idx[base + 0] = l0;
            idx[base + 1] = l1;
            idx[base + 2] = r0;
            idx[base + 3] = r0;
            idx[base + 4] = l1;
            idx[base + 5] = r1;

            stripeIdx[base + 0] = l0;
            stripeIdx[base + 1] = l1;
            stripeIdx[base + 2] = r0;
            stripeIdx[base + 3] = r0;
            stripeIdx[base + 4] = l1;
            stripeIdx[base + 5] = r1;

            stripe2Idx[base + 0] = l0;
            stripe2Idx[base + 1] = l1;
            stripe2Idx[base + 2] = r0;
            stripe2Idx[base + 3] = r0;
            stripe2Idx[base + 4] = l1;
            stripe2Idx[base + 5] = r1;

            const tb = i * 12;
            const b0 = i * 4;
            const b1 = (i + 1) * 4;
            terrainIdx[tb + 0] = b0;
            terrainIdx[tb + 1] = b0 + 1;
            terrainIdx[tb + 2] = b1;
            terrainIdx[tb + 3] = b1;
            terrainIdx[tb + 4] = b0 + 1;
            terrainIdx[tb + 5] = b1 + 1;
            terrainIdx[tb + 6] = b0 + 2;
            terrainIdx[tb + 7] = b1 + 2;
            terrainIdx[tb + 8] = b0 + 3;
            terrainIdx[tb + 9] = b1 + 2;
            terrainIdx[tb + 10] = b1 + 3;
            terrainIdx[tb + 11] = b0 + 3;
        }
    }

    if (terrainMesh) {
        const terrainGeo = new THREE.BufferGeometry();
        terrainGeo.setIndex(new THREE.BufferAttribute(terrainIdx, 1));
        terrainGeo.setAttribute('position', new THREE.BufferAttribute(terrainPos, 3));
        terrainGeo.computeVertexNormals();
        terrainMesh.geometry.dispose();
        terrainMesh.geometry = terrainGeo;
    }

    if (terrainGridMesh) {
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos.subarray(0, gridVerts * 3), 3));
        terrainGridMesh.geometry.dispose();
        terrainGridMesh.geometry = gridGeo;
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    roadGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    roadGeo.computeVertexNormals();

    roadMesh.geometry.dispose();
    roadMesh.geometry = roadGeo;

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeLPos, 3));
    edgeGeo.computeVertexNormals();
    edgeUnderlayMeshL.geometry.dispose();
    edgeUnderlayMeshL.geometry = edgeGeo;

    const edgeGeo2 = new THREE.BufferGeometry();
    edgeGeo2.setIndex(new THREE.BufferAttribute(idx, 1));
    edgeGeo2.setAttribute('position', new THREE.BufferAttribute(edgeRPos, 3));
    edgeGeo2.computeVertexNormals();
    edgeUnderlayMeshR.geometry.dispose();
    edgeUnderlayMeshR.geometry = edgeGeo2;

    const stripeGeo = new THREE.BufferGeometry();
    stripeGeo.setIndex(new THREE.BufferAttribute(stripeIdx, 1));
    stripeGeo.setAttribute('position', new THREE.BufferAttribute(stripePos, 3));
    stripeGeo.computeVertexNormals();

    centerStripeMesh.geometry.dispose();
    centerStripeMesh.geometry = stripeGeo;

    const stripe2Geo = new THREE.BufferGeometry();
    stripe2Geo.setIndex(new THREE.BufferAttribute(stripe2Idx, 1));
    stripe2Geo.setAttribute('position', new THREE.BufferAttribute(stripe2Pos, 3));
    stripe2Geo.computeVertexNormals();

    centerStripeMesh2.geometry.dispose();
    centerStripeMesh2.geometry = stripe2Geo;


    refreshBuildingGroundHeights();
}

function trimBehindIfNeeded() {
    if (sectorRenderLanes.length > 0) return;
    const behind = lastClosestIndex - trackStartIndex;
    const trimCount = behind - TRACK_CFG.keepBehindSegments;
    if (trimCount <= 0) return;

    trackPoints.splice(0, trimCount);
    trackStartIndex += trimCount;
    roadRenderDirty = true;

    trimBuildingsBefore(trackStartIndex);
    const keepFromIdx = trackStartIndex;
    for (let i = savePoints.length - 1; i >= 0; i--) {
        if (savePoints[i].idx < keepFromIdx) {
            savePointsGroup.remove(savePoints[i].group);
            disposeObject(savePoints[i].group);
            savePoints.splice(i, 1);
        }
    }

    while (mainNodes.length > 0 && (mainNodes[0].pointIdxGlobal ?? -1) < keepFromIdx) {
        mainNodes.shift();
        nodeStartId += 1;
    }
}

function ensureAheadIfNeeded() {
    if (levelFixedLength) return;
    const endGlobalIdx = trackStartIndex + trackPoints.length - 1;
    const wantEnd = lastClosestIndex + TRACK_CFG.keepAheadSegments;
    const needed = wantEnd - endGlobalIdx;
    if (needed > 0) generateSegments(needed + TRACK_CFG.rebuildAheadPadding);
}

function getDistanceToFinish() {
    if (!car || finishPointIdx < 0 || trackPoints.length < 2) return Infinity;
    const finishLocalIdx = finishPointIdx - trackStartIndex;
    const finishPos = trackPoints[finishLocalIdx];
    if (!finishPos) return Infinity;
    const dx = car.position.x - finishPos.x;
    const dz = car.position.z - finishPos.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function hasCrossedFinishLine() {
    if (finishPointIdx < 0) return false;
    if (lastClosestIndex >= finishPointIdx - 1) return true;
    const finishGate = savePoints.find((g) => g.isFinish);
    return !!(finishGate && lastClosestIndex >= finishGate.idx - 1);
}

function setDriving(active) {
    isDriving = active;
    if (active) timerStarted = true;
    updateDriveButton();
}

function updateDriveButton() {
    if (!btnDrive) return;
    btnDrive.textContent = isDriving ? 'Stop' : 'Start';
    btnDrive.classList.toggle('is-driving', isDriving);
    btnDrive.setAttribute('aria-pressed', String(isDriving));
}

function toggleDriving() {
    setDriving(!isDriving);
}

function handleKey(key, value, repeat = false) {
    if (key === 'a') keys.a = value;
    if (key === 'd') keys.d = value;
    if (key === 'arrowleft') keys.left = value;
    if (key === 'arrowright') keys.right = value;
    if (key === ' ') keys.space = value;

    if (!value || repeat) return;
    if (key === 'arrowup') setDriving(true);
    if (key === 'arrowdown') setDriving(false);
}

function shouldUseTouchControls() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('notouch')) return false;
    return true;
}

function updateInstructions() {
    const showTouch = shouldUseTouchControls() && isPlaying;
    document.body.classList.toggle('touch-controls-on', showTouch);
    if (touchControlsEl) {
        touchControlsEl.style.display = showTouch ? 'flex' : 'none';
        touchControlsEl.setAttribute('aria-hidden', showTouch ? 'false' : 'true');
    }
}

function setupTouchControls() {
    if (!btnDrive || !btnLeft || !btnRight) return;

    const bindHold = (el, onDown, onUp) => {
        const down = (e) => {
            el.setPointerCapture(e.pointerId);
            onDown();
            e.preventDefault();
        };
        const up = (e) => {
            onUp();
            e.preventDefault();
        };
        el.addEventListener('pointerdown', down, { passive: false });
        el.addEventListener('pointerup', up, { passive: false });
        el.addEventListener('pointercancel', up, { passive: false });
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    bindHold(btnLeft, () => { keys.left = true; }, () => { keys.left = false; });
    bindHold(btnRight, () => { keys.right = true; }, () => { keys.right = false; });

    btnDrive.addEventListener('pointerdown', (e) => {
        toggleDriving();
        e.preventDefault();
    }, { passive: false });
    btnDrive.addEventListener('contextmenu', (e) => e.preventDefault());
    updateDriveButton();
}

function getGameViewportSize() {
    const el = gameWrapEl || document.getElementById('screen-play') || document.body;
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    return { width: w, height: h };
}

function onWindowResize() {
    if (!camera || !renderer) return;
    const vp = getGameViewportSize();
    camera.aspect = vp.width / vp.height;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.width, vp.height, true);
    renderer.setPixelRatio(getRendererPixelRatio(vp.width));
    updateInstructions();
}

function updatePhysics(dt) {
    if (!isPlaying || isGameOver) return;
    const step = dt * 60;

    if (isDriving) timerStarted = true;

    if (timerStarted && !finishSequence) {
        elapsedTime += dt;
        if (timerEl) timerEl.innerText = elapsedTime.toFixed(2);
    }

    let steerAxis = 0;
    if (keys.a || keys.left) steerAxis += 1;
    if (keys.d || keys.right) steerAxis -= 1;

    const laneInfo = getClosestLaneInfo(car.position, lastClosestIndex);
    const onRoad = laneInfo.dist <= trackWidth / 2;

    if (isDriving) {
        const targetSpeed = maxSpeed;
        if (speed < targetSpeed - 0.05) {
            speed += (targetSpeed - speed) * DRIVE_ACCEL * step;
        } else if (onRoad) {
            speed += 0.0006 * step;
        }
    } else {
        speed += (0 - speed) * DRIVE_COAST * step;
    }

    if (keys.space) speed += (0 - speed) * 0.15 * step;
    // Cap at a large value for stability, but high enough to feel infinite
    speed = Math.max(-REVERSE_SPEED, Math.min(25.0, speed));

    const currentKMH = Math.round(Math.abs(speed) * 100);
    if (currentKMH > maxTopSpeed) {
        maxTopSpeed = currentKMH;
        if (topSpeedEl) topSpeedEl.innerText = maxTopSpeed;
    }

    // Count gates passed (finish gate telt niet mee)
    for (let i = savePoints.length - 1; i >= 0; i--) {
        const gate = savePoints[i];
        if (gate.isFinish) continue;
        if (lastClosestIndex >= gate.idx && gate.idx > lastPassedGateIdx) {
            gatesPassed++;
            lastPassedGateIdx = gate.idx;
            handleGatePassed(gate);
            if (gateCountEl) gateCountEl.innerText = String(hudGateCount());
            break;
        }
    }

    if (Math.abs(speed) > 0.01) {
        const dir = speed > 0 ? 1 : -1;
        rotation += (steeringSpeed * 0.65) * controlSettings.steerSensitivity * steerAxis * dir * step;
    }

    car.rotation.y = rotation;
    car.position.x += Math.sin(rotation) * speed * step;
    car.position.z += Math.cos(rotation) * speed * step;

    const surface = getLaneSurfaceAt(car.position, lastClosestIndex);
    const trackIdx = surface.idx;
    if (surface.dist > OFF_ROAD_RESTART_DIST) {
        restartCurrentLevel();
        return;
    }

    const lookAhead = clamp(Math.abs(speed) * 3.5, 6, 20);
    const aheadX = car.position.x + Math.sin(rotation) * lookAhead;
    const aheadZ = car.position.z + Math.cos(rotation) * lookAhead;
    const aheadSurf = getLaneSurfaceAt(new THREE.Vector3(aheadX, car.position.y, aheadZ), trackIdx);
    const midX = car.position.x + Math.sin(rotation) * lookAhead * 0.45;
    const midZ = car.position.z + Math.cos(rotation) * lookAhead * 0.45;
    const midSurf = getLaneSurfaceAt(new THREE.Vector3(midX, car.position.y, midZ), trackIdx);
    const roadY = Math.max(surface.y, midSurf.y, aheadSurf.y);
    const groundY = roadY + ROAD_SURFACE_LIFT + carBaseHeight;

    carVerticalVel -= GRAVITY * step;

    const nearGround = car.position.y <= groundY + 0.45;
    if (nearGround && Math.abs(speed) > 0.38 && surface.slope > 0.035) {
        carVerticalVel += surface.slope * Math.abs(speed) * SLOPE_LAUNCH * step;
    }
    if (nearGround && Math.abs(speed) > 0.45 && surface.slope > 0.02) {
        if (aheadSurf.y < surface.y - 0.12) {
            carVerticalVel += Math.abs(speed) * 0.045;
        }
    }

    carVerticalVel = clamp(carVerticalVel, -MAX_VERTICAL_VEL, MAX_VERTICAL_VEL);
    car.position.y += carVerticalVel * step;

    const airborne = car.position.y > groundY + 0.22;
    if (car.position.y < groundY) {
        car.position.y = groundY;
        carVerticalVel = Math.max(0, carVerticalVel * 0.35);
    } else if (!airborne) {
        car.position.y = Math.max(car.position.y, groundY);
        if (carVerticalVel < 0) carVerticalVel = 0;
    }

    if (carGroup) {
        const slopePitch = airborne ? 0 : clamp(-surface.slope * 1.8, -0.18, 0.18);
        const targetPitch = airborne ? clamp(-carVerticalVel * 0.08, -0.28, 0.22) : slopePitch;
        carGroup.rotation.x += (targetPitch - carGroup.rotation.x) * 0.18 * step;
    }
    if (carShadow) {
        const hover = Math.max(0, car.position.y - groundY);
        const hoverT = clamp(hover / 6, 0, 1);
        const shadowLocalIdx = clamp(trackIdx - trackStartIndex, 0, Math.max(0, trackPoints.length - 2));
        const shadowFrame = computeRoadFrame(trackPoints, shadowLocalIdx);
        const shadowForward = new THREE.Vector3()
            .crossVectors(shadowFrame.roadUp, shadowFrame.normal)
            .normalize();
        const shadowQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(shadowFrame.normal, shadowForward, shadowFrame.roadUp)
        );
        carShadow.position.set(
            car.position.x,
            surface.y + ROAD_SURFACE_LIFT + 0.16,
            car.position.z
        );
        carShadow.quaternion.copy(shadowQuat);
        carShadow.scale.set(7.4 + hoverT * 1.8, 7.4 + hoverT * 1.8, 1);
        carShadow.material.opacity = 0.6 - hoverT * 0.24;
        carShadow.visible = true;
    }

    wheels.forEach(w => { w.rotation.x += speed * 0.4 * step; });

    // COLLISION — bij dubbele sectoren telt ook de rechter rijstrook als baan
    // Off-road vertraging alleen op de grond; in de lucht behoud je snelheid
    if (!onRoad && !airborne) speed *= Math.pow(OFF_ROAD_SPEED_DECAY, step);
    lastClosestIndex = Math.max(lastClosestIndex, trackIdx, laneInfo.idx);
    updateWorldTourTheme();

    if (levelFixedLength && finishPointIdx >= 0) {
        const distFinish = getDistanceToFinish();
        if (finishDistEl) finishDistEl.innerText = String(Math.max(0, Math.round(distFinish)));
        const nearFinish = lastClosestIndex >= finishPointIdx - activeSaveStepSegments;
        const crossedFinish = hasCrossedFinishLine();
        const closeEnough = distFinish < trackWidth * 1.15;
        if (crossedFinish || (nearFinish && closeEnough && Math.abs(speed) > 0.02)) {
            completeLevel();
        }
    }

    if (finishSequence) {
        finishSequence.time += dt;
        const fadeT = clamp((finishSequence.time - FINISH_FADE_DELAY) / FINISH_FADE_DURATION, 0, 1);
        if (finishFadeEl) finishFadeEl.style.opacity = String(fadeT);
        if (finishSequence.time >= FINISH_FADE_DELAY + FINISH_FADE_DURATION) {
            finalizeCompletedLevel();
            return;
        }
    }

    ensureAheadIfNeeded();
    trimBehindIfNeeded();
    if (roadRenderDirty) {
        rebuildRoadRender();
        roadRenderDirty = false;
    }

    // UI
    speedEl.innerText = Math.round(Math.abs(speed) * 100);
}

function showLevelResult(title, showNext, resultMeta = null) {
    isGameOver = true;
    isPlaying = false;
    clock?.stop();
    pendingNextLevel = !!showNext;
    resetFinishSequence();

    if (goTitleEl) goTitleEl.textContent = title;
    if (finalLevelEl) finalLevelEl.innerText = String(currentLevel);
    if (finalTimeEl) finalTimeEl.innerText = elapsedTime.toFixed(2);
    if (finalRecordEl) {
        const best = getLevelBest(currentLevel);
        finalRecordEl.innerText = best ? formatRaceTime(best.time) : '—';
    }
    if (finalRecordDeltaEl) {
        if (resultMeta?.showRecordDelta) {
            const line = formatRecordDeltaLine(elapsedTime, resultMeta.prevBest);
            finalRecordDeltaEl.textContent = line.text;
            finalRecordDeltaEl.className = `final-record-delta delta-${line.tone}`;
            finalRecordDeltaEl.style.display = '';
        } else {
            finalRecordDeltaEl.textContent = '';
            finalRecordDeltaEl.className = 'final-record-delta';
            finalRecordDeltaEl.style.display = 'none';
        }
    }
    if (finalGatesEl) finalGatesEl.innerText = gatesPassed;
    if (finalTopSpeedEl) finalTopSpeedEl.innerText = maxTopSpeed;
    if (btnGoNext) {
        if (!showNext) {
            btnGoNext.style.display = 'none';
        } else if (getNextPlayableTrackLevel(currentLevel)) {
            const nextId = getNextPlayableTrackLevel(currentLevel);
            const nextTrack = GameConfig.getTrack(nextId);
            btnGoNext.textContent = `Volgende: ${nextTrack.name}`;
            btnGoNext.style.display = 'inline-flex';
        } else {
            btnGoNext.textContent = 'Nogmaals rijden';
            btnGoNext.style.display = 'inline-flex';
        }
    }
    if (gameOverEl) gameOverEl.style.display = 'flex';
    updatePanelStats();
}

function resetFinishSequence() {
    finishSequence = null;
    if (finishFadeEl) finishFadeEl.style.opacity = '0';
}

function finalizeCompletedLevel() {
    if (isGameOver) return;

    syncBestTimesFromSession();
    const prevBest = getLevelRecordForDisplay(currentLevel);
    const isNewRecord = !prevBest || elapsedTime < prevBest.time;
    if (isNewRecord) {
        setLevelBest(currentLevel, { time: elapsedTime, splits: [...currentRunSplits] });
    }

    const saved = Menu.autoSaveGameState?.();
    if (!saved) {
        console.warn('Record niet opgeslagen: geen actieve session.');
    }
    showLevelResult(isNewRecord ? 'NIEUW RECORD!' : 'FINISH!', true, {
        showRecordDelta: true,
        prevBest,
        isNewRecord
    });

    if (isNewRecord) {
        Share.offerRecord(
            currentLevel,
            elapsedTime,
            sessionMeta.characterName,
            true,
            () => {},
            sessionMeta.difficulty
        );
    }
}

function completeLevel() {
    if (isGameOver || finishSequence) return;
    timerStarted = false;
    if (finishDistEl) finishDistEl.innerText = '0';
    finishSequence = { time: 0 };
}

function failLevel(reason) {
    showLevelResult(reason || 'Mislukt', false);
}

function getSessionBestTimes(session) {
    if (!session) return null;
    let times = session.gameState?.bestTimes || null;
    const activeId = Menu.getActiveSessionId?.();
    if (session.id === activeId) {
        times = mergeBestTimesExport(exportBestTimes(), times);
    }
    if (!times || !Object.keys(times).length) return null;
    return times;
}

function renderRecordBlockHtml(lvl, rec) {
    const splits = rec?.splits?.length
        ? rec.splits.map((t, i) => `P${i + 1}: ${formatRaceTime(t)}`).join(' · ')
        : '';
    return `<div class="record-block">
      <div class="record-row">
        <div><strong>Level ${lvl}</strong><br><span class="record-level-name">${GameConfig.getLevelName(lvl)}</span></div>
        <div class="time">${formatRaceTime(rec.time)}</div>
      </div>
      ${splits ? `<div class="record-splits">${splits}</div>` : ''}
    </div>`;
}

function renderAllSessionRecordsHtml() {
    const activeId = Menu.getActiveSessionId?.();
    const sessions = Storage.readSessions()
        .map((session) => {
            Vip.syncSessionVip(session);
            return { session, bestTimes: getSessionBestTimes(session) };
        })
        .filter((entry) => entry.bestTimes)
        .sort((a, b) => {
            if (a.session.id === activeId) return -1;
            if (b.session.id === activeId) return 1;
            return (b.session.updatedAt || 0) - (a.session.updatedAt || 0);
        });

    if (!sessions.length) {
        return '<p class="empty-state">Nog geen records. Voltooi een baan in een session!</p>';
    }

    return sessions.map(({ session, bestTimes }) => {
        const keys = Object.keys(bestTimes)
            .map(Number)
            .filter((lvl) => lvl >= 1 && lvl <= GameConfig.trackCount)
            .sort((a, b) => a - b);
        if (!keys.length) return '';

        const isActive = session.id === activeId;
        const vipTag = session.vip ? '<span class="record-session-vip">VIP</span>' : '';
        const activeTag = isActive ? '<span class="record-session-active">Actief</span>' : '';
        const tracksHtml = keys.map((lvl) => {
            const rec = normalizeLevelRecord(bestTimes[lvl]);
            return rec ? renderRecordBlockHtml(lvl, rec) : '';
        }).join('');

        return `<section class="record-session-block">
          <div class="record-session-head">
            <div>
              <strong class="record-session-name">${session.sessionName}</strong>
              <span class="record-session-meta">${session.characterName}</span>
            </div>
            <div class="record-session-badges">${vipTag}${activeTag}</div>
          </div>
          ${tracksHtml}
        </section>`;
    }).filter(Boolean).join('');
}

function updatePanelStats() {
    const charEl = document.getElementById('player-name');

    if (charEl && document.activeElement !== charEl) {
        charEl.value = sessionMeta.characterName || '';
    }

    const recordsList = document.getElementById('records-list');
    if (recordsList) {
        recordsList.innerHTML = renderAllSessionRecordsHtml();
    }
    Tracks.refresh?.();
}

function exportGameState() {
    return {
        level: currentLevel,
        levelSeed,
        carConfig: exportCarConfig(),
        bestTimes: exportBestTimes(),
        inRun: false,
        runState: null
    };
}

function importGameState(state, mergeBestOnly = false) {
    if (!state) return;
    if (!mergeBestOnly) {
        if (state.level != null) currentLevel = clampTrackLevel(state.level);
        if (state.levelSeed != null) levelSeed = Number(state.levelSeed) || getTrackSeed(currentLevel);
        if (state.carConfig) {
            applyCarConfig(normalizeCarConfig(state.carConfig), { skipSave: true, skipCar: !isInited });
        } else if (state.carStyleId) {
            applyCarConfig(carConfigFromStyleId(state.carStyleId), { skipSave: true, skipCar: !isInited });
        }
    }
    if (state.bestTimes) importBestTimes(state.bestTimes, mergeBestOnly);
    if (!mergeBestOnly) {
        updateHudLevel();
        updatePanelStats();
    }
}

function updateCamera(dt) {
    if (!car || !camera) return;
    initMathScratch();
    const smoothXZ = 1 - Math.exp(-10 * dt);
    const smoothY = 1 - Math.exp(-16 * dt);

    const factor = 1;

    const camDist = 14 + 5.5 * factor;
    const camHeight = 7.5 + 3.0 * factor;
    const lookDist = 14 - 4.0 * factor;

    CAM_OFFSET.set(-Math.sin(rotation) * camDist, 0, -Math.cos(rotation) * camDist);
    CAM_TARGET.copy(car.position).add(CAM_OFFSET);
    const camSurface = getTrackSurfaceAt(CAM_TARGET, lastClosestIndex);
    CAM_TARGET.y = Math.max(camSurface.y + camHeight, car.position.y + camHeight * 0.65);

    camera.position.x += (CAM_TARGET.x - camera.position.x) * smoothXZ;
    camera.position.z += (CAM_TARGET.z - camera.position.z) * smoothXZ;
    camera.position.y += (CAM_TARGET.y - camera.position.y) * smoothY;

    CAM_LOOK_AHEAD.set(
        car.position.x + Math.sin(rotation) * lookDist,
        car.position.y,
        car.position.z + Math.cos(rotation) * lookDist
    );
    const aheadSurface = getTrackSurfaceAt(CAM_LOOK_AHEAD, lastClosestIndex);
    const roadLookY = aheadSurface.y + carBaseHeight + (1.4 + 0.2 * factor);
    const carLookY = car.position.y + 1.1;
    const lookY = Math.max(roadLookY, carLookY);

    CAM_LOOK.set(CAM_LOOK_AHEAD.x, lookY, CAM_LOOK_AHEAD.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(CAM_LOOK);
}

function animate() {
    requestAnimationFrame(animate);
    if (clock) {
        if (isPlaying && !isGameOver && clock.running) {
            frameDt = Math.min(clock.getDelta(), 0.05);
        } else if (clock.running) {
            clock.getDelta();
            frameDt = 1 / 60;
        }
    }
    updatePhysics(frameDt);
    if (isInited) updateCamera(frameDt);
    if (renderer && scene && camera) renderer.render(scene, camera);
}

const NeonRacerGame = (() => {
    let uiBound = false;

    let resizeObserver = null;

    function init() {
        readStoredControlSettings();
        loadCarConfigFromSettings();
        if (!uiBound) {
            bindGameUi();
            uiBound = true;
        }
        if (gameWrapEl && typeof ResizeObserver !== 'undefined' && !resizeObserver) {
            resizeObserver = new ResizeObserver(() => onWindowResize());
            resizeObserver.observe(gameWrapEl);
        }
        updateInstructions();
        animate();
    }

    function start(resume = false) {
        if (!resume) {
            const settings = Storage.readSettings();
            currentLevel = clampTrackLevel(settings.selectedTrack || 1);
            syncBestTimesFromSession();
            levelSeed = rollFreshTrackSeed(currentLevel);
            midRunRestore = null;
        }
        startRun(resume);
    }

    function startFreshFromLoad() {
        midRunRestore = null;
        pendingNextLevel = false;
        gameOverEl.style.display = 'none';
        currentLevel = clampTrackLevel(currentLevel);
        startRun(false);
    }

    function playTrack(trackId) {
        const level = clampTrackLevel(trackId);
        if (!canPlayTrackLevel(level)) {
            Toast.show(Vip.getLockReason(level, sessionMeta) || 'Deze baan is nog vergrendeld');
            return;
        }
        currentLevel = level;
        syncBestTimesFromSession();
        midRunRestore = null;
        pendingNextLevel = false;
        gameOverEl.style.display = 'none';
        pausedByOverlay = false;
        wasPlayingBeforePause = false;
        const settings = Storage.readSettings();
        Storage.writeSettings({ ...settings, selectedTrack: currentLevel });
        startRun(false);
    }

    function getCurrentLevel() {
        return currentLevel;
    }

    function getLevelRecord(level) {
        return getLevelRecordForDisplay(level);
    }

    function getAllTrackRecords() {
        const out = {};
        for (let i = 1; i <= GameConfig.trackCount; i++) {
            const rec = getLevelRecordForDisplay(i);
            if (rec) out[i] = rec;
        }
        return out;
    }

    function isRaceInProgress() {
        return isPlaying && !isGameOver;
    }

    function pause() {
        if (!isPlaying) return;
        wasPlayingBeforePause = true;
        isPlaying = false;
        clock?.stop();
    }

    function resume() {
        if (isGameOver) return;
        if (!wasPlayingBeforePause) return;
        isPlaying = true;
        clock?.start();
        wasPlayingBeforePause = false;
    }

    function pauseForOverlay() {
        pausedByOverlay = true;
        pause();
    }

    function resumeFromOverlay() {
        pausedByOverlay = false;
        if (!Menu.isVisible?.()) resume();
    }

    function stopGame() {
        isPlaying = false;
        isGameOver = false;
        clock?.stop();
        gameOverEl.style.display = 'none';
    }

    function onTabVisible() {
        requestAnimationFrame(() => {
            onWindowResize();
            updateInstructions();
            if (!Menu.isVisible?.() && !pausedByOverlay) {
                resume();
            }
        });
    }

    function onTabHidden() {
        if (isPlaying) pause();
    }

    function setSessionMeta(meta) {
        sessionMeta = {
            sessionName: meta?.sessionName || '',
            characterName: meta?.characterName || 'Karakter',
            difficulty: meta?.difficulty || 'normal',
            vip: !!meta?.vip
        };
        updatePanelStats();
    }

    function exportState() {
        return exportGameState();
    }

    function importState(state, mergeBestOnly = false) {
        importGameState(state, mergeBestOnly);
        if (!mergeBestOnly) midRunRestore = null;
    }

    return {
        init,
        start,
        pause,
        resume,
        pauseForOverlay,
        resumeFromOverlay,
        stopGame,
        onTabVisible,
        onTabHidden,
        setSessionMeta,
        exportState,
        importState,
        initCarCustomizer,
        syncCarCustomizerUi,
        updateCarPreview,
        renderCarShareCanvas,
        updatePanelStats,
        playTrack,
        startFreshFromLoad,
        getCurrentLevel,
        getLevelRecord,
        getAllTrackRecords,
        isRaceInProgress
    };
})();
/* END-MERGE-BLOCK */
