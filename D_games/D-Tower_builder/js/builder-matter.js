/* MERGE-BLOCK: builder-matter.js — Matter.js voor toren-constructies */
const BuilderMatter = (() => {
  let Matter = null;
  let engine = null;
  let world = null;
  const bodyByNodeId = new Map();
  const constraintByBeamId = new Map();

  function available() {
    return typeof window !== 'undefined' && typeof window.Matter !== 'undefined';
  }

  function ensure() {
    if (!available()) return false;
    Matter = window.Matter;
    const g = (GameConfig.build && GameConfig.build.matterGravity) ?? 2;
    const gScale = (GameConfig.build && GameConfig.build.matterGravityScale) ?? 0.00135;
    if (!engine) {
      engine = Matter.Engine.create({
        enableSleeping: false,
        positionIterations: 10,
        velocityIterations: 8,
        constraintIterations: 4,
        gravity: { x: 0, y: g, scale: gScale }
      });
      world = engine.world;
    } else {
      engine.gravity.y = g;
      engine.gravity.scale = gScale;
    }
    return true;
  }

  function isActive() {
    return !!engine && available();
  }

  function clear() {
    if (!engine || !Matter) return;
    Matter.Composite.clear(world, false, true);
    bodyByNodeId.clear();
    constraintByBeamId.clear();
  }

  function stiffForKind(kind, cfg) {
    const base = kind === 'rope' ? cfg.ropeStiff
      : kind === 'walkway' ? cfg.walkwayStiff
        : cfg.beamStiff;
    // Soepeler dan voorheen: echte rek onder last (stress = |ΔL|/L).
    if (kind === 'rope') return Math.min(0.22, base * 0.18);
    return Math.min(0.78, 0.05 + base * 0.52);
  }

  function addNode(n, cfg, frozen) {
    if (!ensure()) return null;
    const r = Math.max(4, cfg.nodeRadius ?? 6);
    const body = Matter.Bodies.circle(n.x, n.y, r, {
      friction: 0.45,
      frictionStatic: 0.55,
      frictionAir: 0.01,
      restitution: 0.02,
      isStatic: !!n.fixed || frozen,
      slop: 0.05,
      density: 0.001
    });
    body.plugin = { nodeId: n.id };
    Matter.Composite.add(world, body);
    bodyByNodeId.set(n.id, body);
    return body;
  }

  function addBeam(b, cfg) {
    if (!ensure()) return null;
    const bodyA = bodyByNodeId.get(b.a);
    const bodyB = bodyByNodeId.get(b.b);
    if (!bodyA || !bodyB) return null;
    const c = Matter.Constraint.create({
      bodyA,
      bodyB,
      length: Math.max(1, b.rest),
      stiffness: stiffForKind(b.kind, cfg),
      damping: b.kind === 'rope' ? 0.06 : 0.02
    });
    c.plugin = { beamId: b.id, kind: b.kind, rest: b.rest };
    Matter.Composite.add(world, c);
    constraintByBeamId.set(b.id, c);
    return c;
  }

  function removeNode(nodeId) {
    const body = bodyByNodeId.get(nodeId);
    if (!body || !Matter) return;
    const linked = Matter.Composite.allConstraints(world).filter(
      (c) => c.bodyA === body || c.bodyB === body
    );
    Matter.Composite.remove(world, linked);
    Matter.Composite.remove(world, body);
    bodyByNodeId.delete(nodeId);
    for (const [bid, c] of constraintByBeamId.entries()) {
      if (c.bodyA === body || c.bodyB === body) constraintByBeamId.delete(bid);
    }
  }

  function removeBeam(beamId) {
    const c = constraintByBeamId.get(beamId);
    if (!c || !Matter) return;
    Matter.Composite.remove(world, c);
    constraintByBeamId.delete(beamId);
  }

  function rebuild(nodes, beams, cfg, frozen) {
    clear();
    if (!ensure()) return false;
    for (const n of nodes) {
      addNode(n, cfg, frozen || n.fixed);
      const body = bodyByNodeId.get(n.id);
      if (!body) continue;
      Matter.Body.setPosition(body, { x: n.x, y: n.y });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
    }
    for (const b of beams) addBeam(b, cfg);
    return true;
  }

  function setFrozen(frozen, nodes) {
    if (!ensure()) return;
    for (const n of nodes) {
      const body = bodyByNodeId.get(n.id);
      if (!body) continue;
      const stat = !!frozen || !!n.fixed;
      if (stat) {
        Matter.Body.setStatic(body, true);
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
      } else {
        Matter.Body.setStatic(body, false);
        Matter.Body.setPosition(body, { x: n.x, y: n.y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        if (Matter.Sleeping?.set) Matter.Sleeping.set(body, false);
      }
    }
  }

  function setNodeFixed(nodeId, fixed, nodes) {
    const body = bodyByNodeId.get(nodeId);
    if (!body || !Matter) return;
    Matter.Body.setStatic(body, !!fixed);
    if (fixed) Matter.Body.setVelocity(body, { x: 0, y: 0 });
  }

  function updateNodeMasses(nodes, beams, massKgFn, nodeExtraKg) {
    if (!ensure()) return;
    const acc = new Map();
    for (const n of nodes) acc.set(n.id, 0.08);
    for (const b of beams) {
      const m = massKgFn(b);
      acc.set(b.a, (acc.get(b.a) || 0) + m * 0.5);
      acc.set(b.b, (acc.get(b.b) || 0) + m * 0.5);
    }
    if (nodeExtraKg) {
      for (const [nid, extra] of nodeExtraKg) {
        if (extra > 0) acc.set(nid, (acc.get(nid) || 0) + extra);
      }
    }
    for (const n of nodes) {
      const body = bodyByNodeId.get(n.id);
      if (body && !body.isStatic) Matter.Body.setMass(body, Math.max(0.05, acc.get(n.id) || 0.1));
    }
  }

  function syncNodesFromBodies(nodes) {
    for (const n of nodes) {
      const body = bodyByNodeId.get(n.id);
      if (!body) continue;
      const x = body.position.x;
      const y = body.position.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      n.x = x;
      n.y = y;
      n.ox = n.x - (body.velocity.x || 0);
      n.oy = n.y - (body.velocity.y || 0);
    }
  }

  function syncBodiesFromNodes(nodes) {
    if (!ensure()) return;
    for (const n of nodes) {
      const body = bodyByNodeId.get(n.id);
      if (!body || body.isStatic) continue;
      const vx = n.x - (n.ox ?? n.x);
      const vy = n.y - (n.oy ?? n.y);
      Matter.Body.setPosition(body, { x: n.x, y: n.y });
      Matter.Body.setVelocity(body, { x: vx, y: vy });
    }
  }

  function applyEngineFromCfg(cfg) {
    if (!engine) return;
    const q = cfg.matterQualityMul ?? cfg.qualityMul ?? 1;
    engine.constraintIterations = Math.max(2, Math.round(4 * q));
    engine.velocityIterations = Math.max(4, Math.round(8 * q));
    engine.positionIterations = Math.max(6, Math.round(10 * q));
  }

  function syncConstraints(beams, cfg) {
    if (!ensure()) return;
    applyEngineFromCfg(cfg);
    for (const b of beams) {
      const c = constraintByBeamId.get(b.id);
      if (!c) continue;
      c.stiffness = stiffForKind(b.kind, cfg);
    }
  }

  function step(dt, nodes, cfg) {
    if (!ensure()) return false;
    applyEngineFromCfg(cfg);
    const sub = Math.max(1, cfg.substeps || 2);
    const ms = Math.min(20, (Math.min(0.033, dt) / sub) * 1000);
    for (let i = 0; i < sub; i++) Matter.Engine.update(engine, ms);
    syncNodesFromBodies(nodes);
    return true;
  }

  function init() {
    if (!available()) return false;
    clear();
    return ensure();
  }

  return {
    init,
    clear,
    isActive,
    available,
    rebuild,
    addNode,
    addBeam,
    removeNode,
    removeBeam,
    setFrozen,
    setNodeFixed,
    updateNodeMasses,
    syncConstraints,
    step,
    syncNodesFromBodies,
    syncBodiesFromNodes
  };
})();
/* END-MERGE-BLOCK */
