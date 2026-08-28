/* MERGE-BLOCK: sector-generator.js */
/**
 * Sector-gebaseerde baangenerator — poortjes-georiënteerd.
 *
 * Een poortje (gate) = { pos, heading, side }. De heading is de rijrichting
 * waarmee de weg het poortje raakt: sectoren komen tangentiaal uit op deze
 * richting. Alle poortjes staan op hoogte 0.
 *
 * Sector-types (poortje → poortje):
 *   E = enkel   : 1 → 1
 *   S = split   : 1 → 2 (Y, twee ver uit elkaar liggende rijstroken)
 *   D = dubbel  : 2 → 2 (twee losse enkele wegen: links→links, rechts→rechts)
 *   M = merge   : 2 → 1 (omgekeerde Y)
 *
 * Bij twee poortjes staan ze ver uit elkaar (laneSpacing × random 1.0–2.6).
 * Poortafstand = rechte lijn (chord) tussen opeenvolgende poortjes, niet booglengte.
 * Bochten: Hermite via sub-poortje (zij-offset) + gedeelde tangent (geen knik).
 * minBendRadius beperkt draaiing; hobbelen = apart (Y, alleen E-sectoren).
 * De middenlijn voor de fysica volgt steeds de LINKER rijstrook; de rechter
 * strook wordt als "altStrip" meegegeven zodat de fysica
 * weet dat ook die kant op de baan ligt.
 * Dubbele rijstroken zijn vlak (geen elevatie) → licht en geen geribbel.
 */
const SectorGenerator = (() => {
    const SECTOR_LENGTH = 500;
    const STEPS = 50;
    const LANE_SPACING_MUL = 3.6;
    const MIN_BEND_RADIUS = 55;
    const GATE_TURN_MAX_DEG = 86;
    const GATE_TURN_MAX_RAD = (GATE_TURN_MAX_DEG * Math.PI) / 180;
    const REF_HEADING_LIMIT = Math.PI / 2 - 0.05;
    const MIN_CHORD_PROGRESS = 0.38;
    const DUAL_SPACING_MUL_MIN = 1.0;
    const DUAL_SPACING_MUL_MAX = 2.6;
    const STUB_FRAC = 0.3;
    const S_STUB_FRAC = 0.22;
    const FORK_STRAIGHT_FRAC = 0.48;
    const MERGE_ENTER_FRAC = 0.34;
    const LOOP_MIN_GATE_MUL = 0.34;
    const LOOP_GATE_SKIP_RECENT = 4;
    const LOOP_SEG_SKIP_RECENT = 6;
    const LOOP_SEG_MIN_GAP = 14;
    const LOOP_NEAR_DIST = 26;
    const PROGRESS_MIN_FRAC = 0.55;
    const OSC_FRAC_MIN = 0.1;
    const OSC_FRAC_MAX = 0.24;
    const REF_DRIFT_RETAIN = 0.93;    // lange stukken in dezelfde richting (ook X / -X)
    const REF_DRIFT_MAX = 0.34;       // draai per sector richting sweep (~19°)
    const REF_COMMIT_CHANCE = 0.38;   // kans op nieuwe sweep-richting
    const LOOP_MAX_RETRIES = 8;

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function randRange(rng, lo, hi) {
        return lo + rng() * (hi - lo);
    }

    function normalizeAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    function bendRadiusBounds(opts, curviness, flat) {
        const minR = Math.max(opts?.minBendRadius ?? MIN_BEND_RADIUS, 1);
        const c = clamp(curviness ?? 1, 0.3, 3.5);
        const flatMul = flat ? 1.1 : 1;
        const maxR = opts?.maxBendRadius ?? (minR + 95 * c);
        return { minR: minR * flatMul, maxR: maxR * flatMul };
    }

    /** Richting clamp: tot ~±90° → lange stukken in Z én X/-X; geen volle omkeer. */
    function clampTrackHeading(h) {
        return clamp(normalizeAngle(h), -REF_HEADING_LIMIT, REF_HEADING_LIMIT);
    }

    function headingFromDelta(dx, dz) {
        return clampTrackHeading(Math.atan2(dx, dz));
    }

    function turnBetween(inHeading, outHeading) {
        return normalizeAngle(outHeading - inHeading);
    }

    /** Vooruit = +Z (startrichting auto), slingering = X (heen-en-weer). */
    function defaultTrackLayout() {
        return { forward: 'z', osc: 'x' };
    }

    function fwdCoord(pos, layout) {
        return layout.forward === 'x' ? pos.x : pos.z;
    }

    function oscCoord(pos, layout) {
        return layout.osc === 'z' ? pos.z : pos.x;
    }

    function vecFromFwdOsc(fwd, osc, layout) {
        return layout.forward === 'x'
            ? vec3(fwd, 0, osc)
            : vec3(osc, 0, fwd);
    }

    function advanceFwd(pos, delta, layout) {
        return vecFromFwdOsc(fwdCoord(pos, layout) + delta, oscCoord(pos, layout), layout);
    }

    function withOsc(pos, oscVal, layout) {
        return vecFromFwdOsc(fwdCoord(pos, layout), oscVal, layout);
    }

    function lerpAngle(a, b, t) {
        return a + normalizeAngle(b - a) * t;
    }

    /** Effectieve referentie-richting; op retries naar de inkomende richting (rechter). */
    function effectiveRefHeading(inGate, opts) {
        let ref = opts?.refHeading;
        if (ref == null) ref = inGate.heading;
        const blend = opts?.refBlend ?? 0;
        if (blend > 0) ref = lerpAngle(ref, inGate.heading, blend);
        return clampTrackHeading(ref);
    }

    /**
     * Volgende poortje: vooruit langs de referentie-richting (mag meedraaien naar X/-X),
     * met afwisselende zijwaartse slingering loodrecht erop.
     */
    function resolveMaxChordDev(opts, chord) {
        const mul = clamp(opts?.chordDevMul ?? 0.14, 0.02, 0.4);
        return chord * mul;
    }

    function chordFrame(a, b) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        return {
            ax: dx / len,
            az: dz / len,
            px: -dz / len,
            pz: dx / len,
            len
        };
    }

    function lateralFromChord(p, origin, frame) {
        const tx = p.x - origin.x;
        const tz = p.z - origin.z;
        return tx * frame.px + tz * frame.pz;
    }

    function placeSerpentineGate(inGate, len, refHeading, oscSign, rng, curviness, opts) {
        const c = clamp(curviness ?? 1, 0.5, 3.5);
        const oscMul = opts?.oscMagMul ?? 1;
        const maxLat = resolveMaxChordDev(opts, len);
        const fwdStep = randRange(rng, len * PROGRESS_MIN_FRAC, len * 0.82);
        const oscRaw = oscSign * len * randRange(rng, OSC_FRAC_MIN, OSC_FRAC_MAX) * c * oscMul;
        const oscStep = clamp(oscRaw, -maxLat, maxLat);
        const f = forward(refHeading);
        const r = rightVec(refHeading);
        return vec3(
            inGate.pos.x + f.x * fwdStep + r.x * oscStep,
            0,
            inGate.pos.z + f.z * fwdStep + r.z * oscStep
        );
    }

    function gateFromSerpentine(inGate, len, refHeading, oscSign, rng, curviness, opts) {
        const outPos = placeSerpentineGate(inGate, len, refHeading, oscSign, rng, curviness, opts);
        const dx = outPos.x - inGate.pos.x;
        const dz = outPos.z - inGate.pos.z;
        const outHeading = headingFromDelta(dx, dz);
        return {
            gate: gate(outPos, outHeading),
            turn: turnBetween(inGate.heading, outHeading)
        };
    }

    /** Dubbele poortjes: symmetrisch loodrecht op de rijrichting. */
    function dualGatePair(centerPos, heading, spacing, spread) {
        const half = spacing * 0.5;
        const r = rightVec(heading);
        const leftPos = vec3(centerPos.x - r.x * half, 0, centerPos.z - r.z * half);
        const rightPos = vec3(centerPos.x + r.x * half, 0, centerPos.z + r.z * half);
        const leftGate = gate(leftPos, heading - spread, 'L');
        const rightGate = gate(rightPos, heading + spread, 'R');
        return { leftGate, rightGate };
    }

    function serpentineAnchor(inGates, layout) {
        if (inGates.length === 1) return inGates[0];
        const midFwd = inGates.reduce((s, g) => s + fwdCoord(g.pos, layout), 0) / inGates.length;
        const midOsc = inGates.reduce((s, g) => s + oscCoord(g.pos, layout), 0) / inGates.length;
        const avgHeading = inGates.reduce((s, g) => s + g.heading, 0) / inGates.length;
        return gate(vecFromFwdOsc(midFwd, midOsc, layout), avgHeading);
    }

    /** Dubbele poortjes: basis-afstand × random factor (minstens normaal, tot 2.6× verder). */
    function randomDualSpacing(baseSpacing, rng) {
        return baseSpacing * randRange(rng, DUAL_SPACING_MUL_MIN, DUAL_SPACING_MUL_MAX);
    }

    /** Houd rechter poortje naast de linker op vaste rij-afstand. */
    function alignRightGateToLeft(leftGate, rightGate, heading, spacing) {
        const r = rightVec(heading);
        rightGate.pos.x = leftGate.pos.x + r.x * spacing;
        rightGate.pos.z = leftGate.pos.z + r.z * spacing;
    }

    /** Positie precies `len` verder (chord), met lichte zijwaartse offset. */
    function advanceGatePos(inGate, len, heading, lateral) {
        const f = forward(heading);
        const r = rightVec(heading);
        const dx = f.x * len + r.x * (lateral || 0);
        const dz = f.z * len + r.z * (lateral || 0);
        const d = Math.hypot(dx, dz) || 1;
        const s = len / d;
        return vec3(inGate.pos.x + dx * s, 0, inGate.pos.z + dz * s);
    }

    function snapLaneEndToGate(pts, g) {
        if (!pts.length) return;
        pts[pts.length - 1].x = g.pos.x;
        pts[pts.length - 1].z = g.pos.z;
    }

    function snapLaneStartToGate(pts, g) {
        if (!pts.length || !g) return;
        pts[0].x = g.pos.x;
        pts[0].z = g.pos.z;
    }

    /** Laatste stuk van een branch zacht naar het merge-punt trekken. */
    function taperBranchToJunction(branch, junction, taperFrac) {
        const n = branch.length;
        if (n < 2) return;
        const start = Math.max(0, Math.floor(n * (1 - taperFrac)));
        const jx = junction.x;
        const jz = junction.z;
        const end = n - 1;
        for (let i = start; i <= end; i++) {
            const u = start === end ? 1 : (i - start) / (end - start);
            const w = smoothstep(0, 1, u);
            branch[i].x += (jx - branch[i].x) * w;
            branch[i].z += (jz - branch[i].z) * w;
        }
    }

    function forward(h) {
        return { x: Math.sin(h), z: Math.cos(h) };
    }

    function rightVec(h) {
        const f = forward(h);
        return { x: f.z, z: -f.x };
    }

    function vec3(x, y, z) {
        return new THREE.Vector3(x, y || 0, z);
    }

    function gate(pos, heading, side) {
        return { pos: pos.clone(), heading: clampTrackHeading(heading), side: side || null };
    }

    function gateRollTaper(along) {
        return Math.sin(Math.PI * along);
    }

    function applyElevation(points, seed, rollCfg) {
        const n = points.length;
        if (n < 2) return;
        const baseAmp = rollCfg?.amp ?? 3.2;
        const len1 = rollCfg?.len1 ?? 80;
        const len2 = rollCfg?.len2 ?? 32;
        const phase = (seed % 1000) * 0.01;

        for (let i = 0; i < n; i++) {
            const along = i / (n - 1);
            const amp = baseAmp * gateRollTaper(along);
            const wave1 = Math.sin((i / len1) * Math.PI * 2 + phase) * amp;
            const wave2 = Math.sin((i / len2) * Math.PI * 2 + phase * 1.6) * amp * 0.55;
            points[i].y = wave1 + wave2;
        }
        points[0].y = 0;
        points[n - 1].y = 0;
    }

    function hermitePoint(p0, p1, m0, m1, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        return vec3(
            p0.x * h00 + m0.x * h10 + p1.x * h01 + m1.x * h11,
            0,
            p0.z * h00 + m0.z * h10 + p1.z * h01 + m1.z * h11
        );
    }

    function hermiteDerivative(p0, p1, m0, m1, t) {
        const t2 = t * t;
        const dh00 = 6 * t2 - 6 * t;
        const dh10 = 3 * t2 - 4 * t + 1;
        const dh01 = -6 * t2 + 6 * t;
        const dh11 = 3 * t2 - 2 * t;
        return vec3(
            p0.x * dh00 + m0.x * dh10 + p1.x * dh01 + m1.x * dh11,
            0,
            p0.z * dh00 + m0.z * dh10 + p1.z * dh01 + m1.z * dh11
        );
    }

    function hermiteTangents(inGate, outGate, chord, minRadius) {
        const turnFactor = Math.abs(normalizeAngle(outGate.heading - inGate.heading));
        const minTangent = Math.max(minRadius ?? MIN_BEND_RADIUS, 42);
        const k = clamp(chord * (0.4 + turnFactor * 0.34), minTangent, chord * 0.9);
        const f0 = forward(inGate.heading);
        const f1 = forward(outGate.heading);
        return {
            m0: vec3(f0.x * k, 0, f0.z * k),
            m1: vec3(f1.x * k, 0, f1.z * k)
        };
    }

    function maxHermiteLateral(inPos, outPos, m0, m1, frame, samples) {
        let maxLat = 0;
        const n = samples || 28;
        for (let i = 1; i < n; i++) {
            const t = i / n;
            const p = hermitePoint(inPos, outPos, m0, m1, t);
            maxLat = Math.max(maxLat, Math.abs(lateralFromChord(p, inPos, frame)));
        }
        return maxLat;
    }

    function fitHermiteTangents(inGate, outGate, chord, minRadius, maxDev) {
        const base = hermiteTangents(inGate, outGate, chord, minRadius);
        const frame = chordFrame(inGate.pos, outGate.pos);
        let lo = 0.05;
        let hi = 1;
        for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) * 0.5;
            const m0 = vec3(base.m0.x * mid, 0, base.m0.z * mid);
            const m1 = vec3(base.m1.x * mid, 0, base.m1.z * mid);
            if (maxHermiteLateral(inGate.pos, outGate.pos, m0, m1, frame) <= maxDev) lo = mid;
            else hi = mid;
        }
        const s = lo;
        return {
            m0: vec3(base.m0.x * s, 0, base.m0.z * s),
            m1: vec3(base.m1.x * s, 0, base.m1.z * s)
        };
    }

    function sampleHermiteSegment(p0, p1, m0, m1, steps) {
        const pts = [];
        const n = Math.max(steps, 4);
        for (let i = 1; i <= n; i++) {
            pts.push(hermitePoint(p0, p1, m0, m1, i / n));
        }
        return pts;
    }

    /** Gedeelde raaklijn op een knoop — Catmull-Rom-achtig, C¹ tussen twee segmenten. */
    function sharedKnotTangent(pPrev, pKnot, pNext, scale) {
        const dx = pNext.x - pPrev.x;
        const dz = pNext.z - pPrev.z;
        const len = Math.hypot(dx, dz) || 1;
        const s = scale / len;
        return vec3(dx * s, 0, dz * s);
    }

    /**
     * Sub-poortje met zij-offset (bocht) + twee Hermite-stukken met dezelfde tangent in het midden.
     */
    function sampleHermiteLane(inGate, outGate, steps, minRadius, opts) {
        const p0 = inGate.pos;
        const p1 = outGate.pos;
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const chord = Math.hypot(dx, dz) || 1;
        const frame = chordFrame(p0, p1);
        const maxDev = resolveMaxChordDev(opts, chord);
        const sign = opts?.oscSign ?? 1;
        const rng = opts?.rng;
        const lat = sign * maxDev * (rng ? randRange(rng, 0.75, 1) : 0.88);

        const midPos = vec3(
            p0.x + frame.ax * frame.len * 0.5 + frame.px * lat,
            0,
            p0.z + frame.az * frame.len * 0.5 + frame.pz * lat
        );

        const turnFactor = Math.abs(normalizeAngle(outGate.heading - inGate.heading));
        const minTangent = Math.max(minRadius ?? MIN_BEND_RADIUS, 42);
        const kEnd = clamp(chord * (0.38 + turnFactor * 0.32), minTangent, chord * 0.5);
        const kMid = clamp(chord * 0.3, minTangent * 0.7, chord * 0.42);

        const f0 = forward(inGate.heading);
        const f1 = forward(outGate.heading);
        const m0 = vec3(f0.x * kEnd, 0, f0.z * kEnd);
        const mEnd = vec3(f1.x * kEnd, 0, f1.z * kEnd);
        const mMid = sharedKnotTangent(p0, midPos, p1, kMid);

        const totalSteps = Math.max(steps, 32);
        const midSteps = Math.max(8, Math.round(totalSteps * 0.5));
        const tailSteps = Math.max(8, totalSteps - midSteps);

        return sampleHermiteSegment(p0, midPos, m0, mMid, midSteps)
            .concat(sampleHermiteSegment(midPos, p1, mMid, mEnd, tailSteps));
    }

    /**
     * Extra S-bochten binnen een sector (sin² → 0 aan poortjes, geen knik).
     */
    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Hermite tussen twee poortjes; virtueel sub-poortje op t=0.5, tangentiaal (4→4.1→5).
     */
    function buildLaneCurve(inGate, outGate, steps, minRadius, opts, flat) {
        const pts = sampleHermiteLane(inGate, outGate, steps, minRadius, opts);
        if (pts.length) {
            pts[pts.length - 1].x = outGate.pos.x;
            pts[pts.length - 1].z = outGate.pos.z;
            pts[pts.length - 1].y = 0;
        }
        return pts;
    }

    /** Rechte lijn (stub vóór split / na merge). */
    function buildStraightLane(inGate, outGate, steps) {
        const pts = [];
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            pts.push(vec3(
                inGate.pos.x + (outGate.pos.x - inGate.pos.x) * t,
                0,
                inGate.pos.z + (outGate.pos.z - inGate.pos.z) * t
            ));
        }
        return pts;
    }

    function laneEndHeading(pts) {
        if (!pts || pts.length < 2) return 0;
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        return headingFromDelta(b.x - a.x, b.z - a.z);
    }

    /** Vork: eerst recht, daarna pas zijwaarts naar de rijstrook. */
    function buildForkBranch(inGate, outGate, steps) {
        const f = forward(inGate.heading);
        const r = rightVec(inGate.heading);
        const dx = outGate.pos.x - inGate.pos.x;
        const dz = outGate.pos.z - inGate.pos.z;
        const alongF = dx * f.x + dz * f.z;
        const lateral = dx * r.x + dz * r.z;
        const pts = [];
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const latT = t <= FORK_STRAIGHT_FRAC ? 0 : smoothstep(FORK_STRAIGHT_FRAC, 1, t);
            const along = alongF * t;
            pts.push(vec3(
                inGate.pos.x + f.x * along + r.x * lateral * latT,
                0,
                inGate.pos.z + f.z * along + r.z * lateral * latT
            ));
        }
        pts[pts.length - 1].x = outGate.pos.x;
        pts[pts.length - 1].z = outGate.pos.z;
        return pts;
    }

    /**
     * Samenvoeging: eerst recht doorrijden op de rijstrook, daarna Hermite naar merge-punt.
     */
    function buildMergeBranch(inGate, outGate, steps, minR, opts) {
        const enterSteps = Math.max(3, Math.round(steps * MERGE_ENTER_FRAC));
        const bendSteps = Math.max(3, steps - enterSteps);

        const fIn = forward(inGate.heading);
        const vx = outGate.pos.x - inGate.pos.x;
        const vz = outGate.pos.z - inGate.pos.z;
        const along = vx * fIn.x + vz * fIn.z;
        const enterDist = along * MERGE_ENTER_FRAC;
        const enterPos = vec3(
            inGate.pos.x + fIn.x * enterDist,
            0,
            inGate.pos.z + fIn.z * enterDist
        );
        const enterGate = gate(enterPos, inGate.heading);

        const straightPts = buildStraightLane(inGate, enterGate, enterSteps);
        const bendPts = sampleHermiteLane(enterGate, outGate, bendSteps, minR, opts);
        bendPts[bendPts.length - 1].x = outGate.pos.x;
        bendPts[bendPts.length - 1].z = outGate.pos.z;
        return straightPts.concat(bendPts);
    }

    /** Rijstrook; mode: hermite | straight | fork | merge. Poortje bepaalt eindpunt (chord). */
    function buildLane(inGate, outGate, steps, opts, flat, seedOffset, _arcTarget, mode) {
        const { minR } = bendRadiusBounds(opts, opts?.curviness, flat);
        let pts;
        switch (mode) {
            case 'straight': pts = buildStraightLane(inGate, outGate, steps); break;
            case 'fork': pts = buildForkBranch(inGate, outGate, steps); break;
            case 'merge': pts = buildMergeBranch(inGate, outGate, steps, minR, opts); break;
            default: pts = buildLaneCurve(inGate, outGate, steps, minR, opts, flat);
        }
        if (!flat) applyElevation(pts, (opts?.seed ?? 1) + (seedOffset || 0), opts?.roll);
        pts[pts.length - 1].y = 0;
        snapLaneStartToGate(pts, inGate);
        snapLaneEndToGate(pts, outGate);
        return pts;
    }

    /** E: 1 → 1. Bochtige enkele weg, met glooiingen. */
    function generateE(inGate, curviness, opts) {
        const len = opts?.length ?? SECTOR_LENGTH;
        const steps = opts?.steps ?? STEPS;
        const rng = opts.rng;
        const refH = effectiveRefHeading(inGate, opts);
        const { gate: outGate, turn } = gateFromSerpentine(
            inGate, len, refH, opts?.oscSign ?? 1, rng, curviness, opts
        );
        const lane = buildLane(inGate, outGate, steps, opts, false, 0);

        return {
            type: 'E',
            center: lane,
            altOffset: -1,
            alt: null,
            renderLanes: [lane],
            outGates: [outGate],
            lastTurn: turn
        };
    }

    /**
     * S: 1 → 2. Recht vooruit langs de rijrichting; twee poortjes symmetrisch
     * loodrecht ernaast. Beide poortjes wijzen vooruit → vloeiende S-vork (geen knik).
     */
    function generateS(inGate, curviness, opts) {
        const len = opts?.length ?? SECTOR_LENGTH;
        const steps = opts?.steps ?? STEPS;
        const rng = opts.rng;
        const baseSpacing = opts?.laneSpacing ?? SECTOR_LENGTH;
        const spacing = randomDualSpacing(baseSpacing, rng);

        const stubSteps = Math.max(4, Math.round(steps * S_STUB_FRAC));
        const branchSteps = Math.max(6, steps - stubSteps);
        const stubLen = len * S_STUB_FRAC;

        const f = forward(inGate.heading);
        const r = rightVec(inGate.heading);

        const fwdStep = randRange(rng, len * 0.62, len * 0.82);
        const branchFwd = Math.max(1, fwdStep - stubLen);
        // Zijwaartse spreiding begrensd t.o.v. vooruit-afstand → zachte Y (~18°)
        const half = Math.min(spacing * 0.5, branchFwd * 0.34);

        const splitPos = vec3(
            inGate.pos.x + f.x * stubLen,
            0,
            inGate.pos.z + f.z * stubLen
        );
        const centerEnd = vec3(
            inGate.pos.x + f.x * fwdStep,
            0,
            inGate.pos.z + f.z * fwdStep
        );
        const splitGate = gate(splitPos, inGate.heading);
        const leftPos = vec3(centerEnd.x - r.x * half, 0, centerEnd.z - r.z * half);
        const rightPos = vec3(centerEnd.x + r.x * half, 0, centerEnd.z + r.z * half);

        // Beide uitgangen wijzen vooruit (= rijrichting) → Hermite-takken eindigen parallel
        const leftOut = gate(leftPos, inGate.heading, 'L');
        const rightOut = gate(rightPos, inGate.heading, 'R');

        const stub = buildLane(inGate, splitGate, stubSteps, opts, true, 0, null, 'straight');
        const leftLane = buildLane(splitGate, leftOut, branchSteps, opts, true, 0);
        const rightLane = buildLane(splitGate, rightOut, branchSteps, opts, true, 0);

        snapLaneEndToGate(leftLane, leftOut);
        snapLaneEndToGate(rightLane, rightOut);

        const center = stub.concat(leftLane);
        snapLaneEndToGate(center, leftOut);

        return {
            type: 'S',
            center,
            altOffset: stubSteps,
            alt: rightLane,
            renderLanes: [stub, leftLane, rightLane],
            outGates: [leftOut, rightOut],
            lastTurn: 0
        };
    }

    /** D: 2 → 2. Twee losse enkele wegen (links→links, rechts→rechts), vlak. */
    function generateD(inGates, curviness, opts) {
        const len = opts?.length ?? SECTOR_LENGTH;
        const steps = opts?.steps ?? STEPS;
        const rng = opts.rng;
        const spacing = opts?.laneSpacing ?? SECTOR_LENGTH;

        const leftIn = inGates[0];
        const rightIn = inGates[1];
        const layout = opts.trackLayout ?? defaultTrackLayout();
        const anchor = serpentineAnchor(inGates, layout);
        const refH = effectiveRefHeading(anchor, opts);
        const centerPos = placeSerpentineGate(anchor, len, refH, opts?.oscSign ?? 1, rng, curviness, opts);
        const dx = centerPos.x - anchor.pos.x;
        const dz = centerPos.z - anchor.pos.z;
        const outHeading = headingFromDelta(dx, dz);
        const turn = turnBetween(anchor.heading, outHeading);
        const { leftGate: leftOut, rightGate: rightOut } = dualGatePair(centerPos, outHeading, spacing, 0);

        const leftLane = buildLane(
            leftIn, gate(leftOut.pos.clone(), outHeading, 'L'), steps, opts, false, 0
        );
        const rightLane = buildLane(
            rightIn, gate(rightOut.pos.clone(), outHeading, 'R'), steps, opts, false, 0
        );
        snapLaneEndToGate(leftLane, leftOut);
        snapLaneEndToGate(rightLane, rightOut);

        return {
            type: 'D',
            center: leftLane,
            altOffset: 0,
            alt: rightLane,
            renderLanes: [leftLane, rightLane],
            outGates: [leftOut, rightOut],
            lastTurn: turn
        };
    }

    /**
     * M: 2 → 1. Spiegelbeeld van de split: recht vooruit langs de gemiddelde
     * rijrichting; twee takken convergeren vloeiend (S-curve) naar één uitgang.
     */
    function generateM(inGates, curviness, opts) {
        const len = opts?.length ?? SECTOR_LENGTH;
        const steps = opts?.steps ?? STEPS;
        const rng = opts.rng;

        const leftIn = inGates[0];
        const rightIn = inGates[1];
        const layout = opts.trackLayout ?? defaultTrackLayout();
        const anchor = serpentineAnchor(inGates, layout);
        const outHeading = anchor.heading;
        const f = forward(outHeading);

        const stubSteps = Math.max(4, Math.round(steps * STUB_FRAC));
        const branchSteps = Math.max(6, steps - stubSteps);
        const stubLen = len * STUB_FRAC;
        const fwdStep = randRange(rng, len * 0.62, len * 0.82);

        const mergePos = vec3(
            anchor.pos.x + f.x * (fwdStep - stubLen),
            0,
            anchor.pos.z + f.z * (fwdStep - stubLen)
        );
        const outPos = vec3(
            anchor.pos.x + f.x * fwdStep,
            0,
            anchor.pos.z + f.z * fwdStep
        );
        const mergeGate = gate(mergePos, outHeading);
        const outGate = gate(outPos, outHeading);

        const leftBranch = buildLane(leftIn, gate(mergePos.clone(), outHeading), branchSteps, opts, true, 0);
        const rightBranch = buildLane(rightIn, gate(mergePos.clone(), outHeading), branchSteps, opts, true, 0);
        snapLaneEndToGate(leftBranch, mergeGate);
        snapLaneEndToGate(rightBranch, mergeGate);

        const stub = buildLane(mergeGate, outGate, stubSteps, opts, true, 0, null, 'straight');

        const center = leftBranch.concat(stub);
        snapLaneEndToGate(center, outGate);

        return {
            type: 'M',
            center,
            altOffset: 0,
            alt: rightBranch,
            renderLanes: [leftBranch, rightBranch, stub],
            outGates: [outGate],
            lastTurn: 0
        };
    }

    function randomSector(type, inGates, curviness, opts) {
        switch (type) {
            case 'E': return generateE(inGates[0], curviness, opts);
            case 'S': return generateS(inGates[0], curviness, opts);
            case 'D': return generateD(inGates, curviness, opts);
            case 'M': return generateM(inGates, curviness, opts);
            default: return generateE(inGates[0], curviness, opts);
        }
    }

    /** splits / doubles: getal 0–3, of legacy sp0–sp3. */
    function profileTier(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return clamp(Math.round(value), 0, 3);
        }
        const map = {
            low: 0, mid: 1, med: 1, medium: 1, high: 2,
            sp0: 0, sp1: 1, sp2: 2, sp3: 3
        };
        return map[String(value ?? 'mid').toLowerCase()] ?? 1;
    }

    /**
     * Genereer een geldige sector-blueprint (E/S/D/M) uit een profiel.
     * gates = aantal poortjes; doubles/bends/bumps = low | mid | high (bumps/bends via game-config).
     */
    function composeSectorBlueprint(profile, seed) {
        const sectors = Math.max(8, profile?.gates ?? 20);
        const d = clamp(profileTier(profile?.doubles), 0, 3);
        const splitP = [0.08, 0.18, 0.38, 0.55][d];
        const mergeP = [0.25, 0.35, 0.48, 0.55][d];
        const maxDualRun = [3, 3, 3, 3][d];

        let rngState = (seed >>> 0) || 1;
        const rng = () => {
            rngState |= 0;
            rngState = (rngState + 0x6d2b79f5) | 0;
            let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const types = [];
        let lanes = 1;
        let dualStreak = 0;
        let singleStreak = 1; // start ready to split

        for (let i = 0; i < sectors; i++) {
            const remaining = sectors - i;

            if (lanes === 2) {
                const mustMerge = remaining <= 1 || dualStreak >= maxDualRun;
                const canMerge = dualStreak > 1; // Enforce at least one D sector between S and M
                if (mustMerge || (canMerge && rng() < mergeP)) {
                    types.push('M');
                    lanes = 1;
                    dualStreak = 0;
                    singleStreak = 0;
                    continue;
                }
                types.push('D');
                dualStreak++;
            } else {
                // lanes === 1
                const roomForFork = remaining >= 5;
                const canSplit = singleStreak >= 1; // Enforce at least one E sector between M and S
                if (roomForFork && canSplit && rng() < splitP) {
                    types.push('S');
                    lanes = 2;
                    dualStreak = 1;
                    singleStreak = 0;
                } else {
                    types.push('E');
                    singleStreak++;
                }
            }
        }

        if (lanes === 2) types.push('M');
        return types.join(',');
    }

    function clonePts(arr) {
        return arr.map((p) => p.clone());
    }

    function lanePointsNear(a, b, eps = 3) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return (dx * dx + dy * dy + dz * dz) <= eps * eps;
    }

    function pushRenderLane(renderLanes, lanePts, stitch) {
        if (!lanePts?.length) return;
        if (stitch && renderLanes.length > 0) {
            const prevPts = renderLanes[renderLanes.length - 1].points;
            const end = prevPts[prevPts.length - 1];
            const start = lanePts[0];
            if (lanePointsNear(end, start)) {
                start.x = end.x;
                start.z = end.z;
                start.y = end.y;
                for (let i = 1; i < lanePts.length; i++) prevPts.push(lanePts[i].clone());
                return;
            }
        }
        renderLanes.push({ points: clonePts(lanePts) });
    }

    function distXZ2(ax, az, bx, bz) {
        const dx = ax - bx;
        const dz = az - bz;
        return dx * dx + dz * dz;
    }

    function pointSegDist(px, pz, ax, az, bx, bz) {
        const abx = bx - ax;
        const abz = bz - az;
        const apx = px - ax;
        const apz = pz - az;
        const abLen2 = abx * abx + abz * abz;
        if (abLen2 < 1e-6) return Math.hypot(apx, apz);
        let t = (apx * abx + apz * abz) / abLen2;
        t = clamp(t, 0, 1);
        const cx = ax + abx * t;
        const cz = az + abz * t;
        return Math.hypot(px - cx, pz - cz);
    }

    function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
        const d1x = bx - ax;
        const d1z = bz - az;
        const d2x = dx - cx;
        const d2z = dz - cz;
        const denom = d1x * d2z - d1z * d2x;
        if (Math.abs(denom) < 1e-9) return false;
        const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
        const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
        const eps = 0.02;
        return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
    }

    function segSegMinDist(ax, az, bx, bz, cx, cz, dx, dz) {
        if (segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
        return Math.min(
            pointSegDist(ax, az, cx, cz, dx, dz),
            pointSegDist(bx, bz, cx, cz, dx, dz),
            pointSegDist(cx, cz, ax, az, bx, bz),
            pointSegDist(dx, dz, ax, az, bx, bz)
        );
    }

    function centerPathSegments(pts, densify) {
        const segs = [];
        if (!pts || pts.length < 2) return segs;
        for (let i = 1; i < pts.length; i++) {
            const x0 = pts[i - 1].x;
            const z0 = pts[i - 1].z;
            const x1 = pts[i].x;
            const z1 = pts[i].z;
            segs.push({ x0, z0, x1, z1 });
            if (densify) {
                segs.push({
                    x0, z0,
                    x1: (x0 + x1) * 0.5,
                    z1: (z0 + z1) * 0.5
                });
                segs.push({
                    x0: (x0 + x1) * 0.5,
                    z0: (z0 + z1) * 0.5,
                    x1, z1
                });
            }
        }
        return segs;
    }

    function sectorCollides(sector, trackState, inGates, sectorLen, layout) {
        const minGateDist = Math.max(120, sectorLen * LOOP_MIN_GATE_MUL);
        const minGateDist2 = minGateDist * minGateDist;
        const gateLimit = Math.max(0, trackState.gates.length - LOOP_GATE_SKIP_RECENT);
        const minFwd = sectorLen * PROGRESS_MIN_FRAC;
        const anchor = serpentineAnchor(inGates, layout);
        const f = forward(anchor.heading);

        const inFwd = forward(inGates[0].heading);
        const minChord = sectorLen * MIN_CHORD_PROGRESS;
        for (const g of sector.outGates) {
            const vx = g.pos.x - anchor.pos.x;
            const vz = g.pos.z - anchor.pos.z;
            const dispFwd = vx * f.x + vz * f.z;
            const chordProg = vx * inFwd.x + vz * inFwd.z;
            if (dispFwd < minFwd * 0.65) return true;
            if (chordProg < minChord * 0.55) return true;
            const gFwd = forward(g.heading);
            const moveLen = Math.hypot(vx, vz) || 1;
            const moveAlign = (vx * gFwd.x + vz * gFwd.z) / moveLen;
            if (moveAlign < 0.12) return true;
            for (let i = 0; i < gateLimit; i++) {
                const pg = trackState.gates[i];
                const d2 = distXZ2(g.pos.x, g.pos.z, pg.x, pg.z);
                if (d2 < minGateDist2) return true;
                if (pg.heading != null) {
                    const hDiff = Math.abs(normalizeAngle(g.heading - pg.heading));
                    if (d2 < minGateDist2 * 1.45 && hDiff > 1.15) return true;
                }
            }
        }

        const newSegs = centerPathSegments(sector.center, true);
        const segLimit = Math.max(0, trackState.segments.length - LOOP_SEG_SKIP_RECENT);
        const proxLimit = Math.max(0, trackState.segments.length - LOOP_SEG_SKIP_RECENT - LOOP_SEG_MIN_GAP);
        for (const ns of newSegs) {
            for (let i = 0; i < segLimit; i++) {
                const os = trackState.segments[i];
                if (segmentsIntersect(ns.x0, ns.z0, ns.x1, ns.z1, os.x0, os.z0, os.x1, os.z1)) {
                    return true;
                }
                if (i < proxLimit) {
                    const d = segSegMinDist(ns.x0, ns.z0, ns.x1, ns.z1, os.x0, os.z0, os.x1, os.z1);
                    if (d < LOOP_NEAR_DIST) return true;
                }
            }
        }
        return false;
    }

    function recordTrackState(trackState, sector) {
        for (const g of sector.outGates) {
            trackState.gates.push({ x: g.pos.x, z: g.pos.z, heading: g.heading });
        }
        for (const s of centerPathSegments(sector.center, false)) {
            trackState.segments.push(s);
        }
    }

    function loopAvoidOpts(baseOpts, attempt) {
        if (attempt === 0) return baseOpts;
        const o = { ...baseOpts };
        o.oscMagMul = Math.max(0.3, (baseOpts.oscMagMul ?? 1) * (1 - attempt * 0.12));
        o.refBlend = Math.min(1, attempt * 0.22);
        if (attempt >= 2) o.oscSign = -(baseOpts.oscSign ?? 1);
        return o;
    }

    function straightFallbackOpts(baseOpts) {
        return { ...baseOpts, oscMagMul: 0.05, refBlend: 1 };
    }

    function generateSectorSafe(type, inGates, curviness, baseOpts) {
        const len = baseOpts?.length ?? SECTOR_LENGTH;
        const trackState = baseOpts.trackState;
        const layout = baseOpts.trackLayout ?? defaultTrackLayout();
        for (let attempt = 0; attempt < LOOP_MAX_RETRIES; attempt++) {
            const sector = randomSector(type, inGates, curviness, loopAvoidOpts(baseOpts, attempt));
            if (!sectorCollides(sector, trackState, inGates, len, layout)) return sector;
        }
        return randomSector(type, inGates, curviness, straightFallbackOpts(baseOpts));
    }

    /**
     * Bouw een volledige baan uit een blueprint.
     * @returns {{ mainPoints, renderLanes, altStrips, checkpoints }}
     *   mainPoints  : Vector3[] middenlijn (volgt linker rijstrook) voor fysica
     *   renderLanes : { points }[] alle weg-rijstroken om te tekenen
     *   altStrips   : { startIdx, points }[] rechter rijstroken, uitgelijnd op mainPoints
     *   checkpoints : { kind, idx, arches:[{pos,heading,side}] }[]
     */
    function buildTrack(blueprint, rng, curviness, opts) {
        const types = (Array.isArray(blueprint) ? blueprint : blueprint.split(','))
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);

        const baseSeed = opts?.seed ?? 1;
        const trackW = opts?.trackWidth ?? 28;
        const genOptsBase = {
            length: opts?.sectorLength ?? SECTOR_LENGTH,
            steps: opts?.steps ?? STEPS,
            laneSpacing: opts?.laneSpacing ?? trackW * LANE_SPACING_MUL,
            minBendRadius: opts?.minBendRadius ?? Math.max(MIN_BEND_RADIUS, trackW * 2),
            maxBendRadius: opts?.maxBendRadius ?? trackW * 6,
            roll: opts?.roll
        };

        const trackLayout = defaultTrackLayout();
        const startPos = opts?.startPos ? vec3(opts.startPos.x || 0, opts.startPos.y || 0, opts.startPos.z || 0) : vec3(0, 0, 0);
        const startGate = gate(startPos, opts?.startHeading ?? 0);
        let lanes = [startGate];
        let oscSign = rng() > 0.5 ? 1 : -1;
        let oscStreak = Math.floor(rng() * 3) + 1;
        let driftVel = 0;
        let lastTurn = 0;
        const renderLanes = [];
        const altStrips = [];
        const checkpoints = [];
        const mainPoints = [startPos.clone()];
        const trackState = { gates: [{ x: startPos.x, z: startPos.z, heading: startGate.heading }], segments: [] };
        let lastSectorType = null;

        checkpoints.push({
            kind: 'single',
            idx: 0,
            arches: [{ pos: startPos.clone(), heading: startGate.heading, side: null }]
        });

        for (let si = 0; si < types.length; si++) {
            const type = types[si];
            const inGates = lanes;

            // Referentie-richting drift: af en toe een nieuwe sweeping draai, anders
            // langzaam rechttrekken → lange stukken in dezelfde (mogelijk X/-X) richting.
            if (rng() < REF_COMMIT_CHANCE) {
                driftVel = randRange(rng, -REF_DRIFT_MAX, REF_DRIFT_MAX);
            }
            driftVel *= REF_DRIFT_RETAIN;
            const inHeading = inGates[0].heading;
            let refHeading = clampTrackHeading(inHeading + driftVel);

            const sectorOpts = {
                ...genOptsBase,
                seed: (baseSeed + si * 997) | 0,
                rng,
                curviness,
                trackLayout,
                refHeading,
                oscSign,
                lastTurn,
                oscMagMul: opts?.oscMagMul ?? 1,
                chordDevMul: opts?.chordDevMul ?? 0.14,
                trackState
            };

            const sector = generateSectorSafe(type, inGates, curviness, sectorOpts);
            recordTrackState(trackState, sector);

            if (sector.lastTurn != null) lastTurn = sector.lastTurn;
            
            oscStreak--;
            if (oscStreak <= 0) {
                const rand = rng();
                if (rand < 0.18) {
                    oscSign = 0;
                    oscStreak = Math.floor(rng() * 2) + 1;
                } else {
                    if (oscSign === 0) {
                        oscSign = rng() > 0.5 ? 1 : -1;
                    } else {
                        oscSign = -oscSign;
                    }
                    oscStreak = Math.floor(rng() * 3) + 1;
                }
            }

            // index van de laatste bestaande middenlijn-punt (= ingang van deze sector)
            const baseGlobal = mainPoints.length - 1;
            for (const p of sector.center) mainPoints.push(p);

            const ensureStart = (pts, startPos) => {
                const start = startPos.clone();
                if (!pts || pts.length === 0) return [start];
                const first = pts[0];
                start.x = startPos.x;
                start.z = startPos.z;
                const dx = first.x - start.x;
                const dz = first.z - start.z;
                if ((dx * dx + dz * dz) < 0.25) start.y = first.y;
                else start.y = startPos.y ?? first.y ?? 0;
                const dy = (first.y || 0) - start.y;
                if ((dx * dx + dy * dy + dz * dz) < 1e-4) return clonePts(pts);
                return [start, ...clonePts(pts)];
            };

            const stitchNextE = lastSectorType === 'E' || lastSectorType === 'M';

            if (type === 'E') {
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[0], inGates[0].pos), stitchNextE);
            } else if (type === 'D') {
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[0], inGates[0].pos), false);
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[1], inGates[1].pos), false);
            } else if (type === 'S') {
                const stub = sector.renderLanes[0];
                const splitPos = stub && stub.length ? stub[stub.length - 1].clone() : inGates[0].pos.clone();
                pushRenderLane(renderLanes, ensureStart(stub, inGates[0].pos), false);
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[1], splitPos), false);
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[2], splitPos), false);
            } else if (type === 'M') {
                const leftBranch = sector.renderLanes[0];
                const rightBranch = sector.renderLanes[1];
                const mergePos = leftBranch && leftBranch.length
                    ? leftBranch[leftBranch.length - 1].clone()
                    : inGates[0].pos.clone();
                pushRenderLane(renderLanes, ensureStart(leftBranch, inGates[0].pos), false);
                pushRenderLane(renderLanes, ensureStart(rightBranch, inGates[1].pos), false);
                pushRenderLane(renderLanes, ensureStart(sector.renderLanes[2], mergePos), false);
            } else {
                for (const lane of sector.renderLanes) {
                    pushRenderLane(renderLanes, ensureStart(lane, inGates[0].pos), false);
                }
            }

            lastSectorType = type;

            if (sector.alt && sector.altOffset >= 0) {
                const startIdx = baseGlobal + 1 + sector.altOffset;
                altStrips.push({ startIdx, points: clonePts(sector.alt) });
            }

            const endIdx = mainPoints.length - 1;
            lanes = sector.outGates;
            const kind = sector.outGates.length > 1 ? 'dual' : 'single';
            checkpoints.push({
                kind,
                idx: endIdx,
                arches: sector.outGates.map((g) => ({
                    pos: g.pos.clone(),
                    heading: g.heading,
                    side: g.side
                }))
            });
        }

        for (const cp of checkpoints) {
            for (const a of cp.arches) a.pos.y = 0;
        }

        return { mainPoints, renderLanes, altStrips, checkpoints };
    }

    return {
        SECTOR_LENGTH,
        STEPS,
        MIN_BEND_RADIUS,
        LANE_SPACING_MUL,
        GATE_TURN_MAX_DEG,
        bendRadiusBounds,
        DUAL_SPACING_MUL_MIN,
        DUAL_SPACING_MUL_MAX,
        generateE,
        generateS,
        generateD,
        generateM,
        randomSector,
        buildTrack,
        composeSectorBlueprint
    };
})();
/* END-MERGE-BLOCK */
