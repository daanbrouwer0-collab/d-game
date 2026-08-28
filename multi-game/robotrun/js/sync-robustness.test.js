import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Setup minimal global environment
globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};

const configSrc = readFileSync(join(__dirname, "config.js"), "utf8");
const configCtx = { console };
vm.runInNewContext(`${configSrc}\nthis.CONFIG = CONFIG;`, configCtx);
globalThis.CONFIG = configCtx.CONFIG;

const aiSrc = readFileSync(join(__dirname, "robotrally-ai.js"), "utf8");
const aiCtx = { console, CONFIG: globalThis.CONFIG, window: globalThis };
vm.runInNewContext(`${aiSrc}\nthis.RobotRallyAI = RobotRallyAI;`, aiCtx);
globalThis.RobotRallyAI = aiCtx.RobotRallyAI;

const engineSrc = readFileSync(join(__dirname, "robotrally-engine.js"), "utf8");
const engineCtx = {
  console,
  CONFIG: globalThis.CONFIG,
  RobotRallyAI: globalThis.RobotRallyAI,
  window: globalThis,
  Math,
  Date,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
};
vm.runInNewContext(`${engineSrc}\nthis.RobotRallyEngine = RobotRallyEngine;`, engineCtx);
globalThis.RobotRallyEngine = engineCtx.RobotRallyEngine;

const { CONFIG, RobotRallyEngine } = globalThis;

console.log("Testing RobotRun Sync Robustness...");

// Test 1: Start upgrades initialization and auto-assignment on countdown/timeout
{
  const engine = new RobotRallyEngine();
  const players = [
    { robotId: "p1", name: "Player 1", isBot: false },
    { robotId: "p2", name: "Player 2", isBot: false },
  ];
  engine.loadCourse("cross", players, CONFIG.GAME_MODES.P2P, 2, null, { awaitMatchReady: true });

  assert.equal(engine.phase, "match_ready");
  assert.ok(engine.matchCountdownEndsAt > Date.now());
  const humanRobots = engine.robots.filter((r) => !r.isBot);
  assert.equal(humanRobots.length, 2);

  // Player 1 confirms upgrade
  const r1 = humanRobots[0];
  const r2 = humanRobots[1];
  const offer1 = engine.matchUpgradeOffers[r1.id];
  assert.ok(offer1 && offer1.length > 0);
  assert.equal(engine.confirmMatchUpgrade(r1.id, offer1[0]), true);
  assert.equal(engine.isRobotMatchReady(r1.id), true);
  assert.equal(engine.isRobotMatchReady(r2.id), false);
  assert.equal(engine.phase, "match_ready");

  // Timeout expires: startMatchFromCountdown should auto-assign upgrade to Player 2
  engine.phase = "match_countdown";
  assert.equal(engine.startMatchFromCountdown(), true);
  assert.equal(engine.phase, "programming");
  assert.equal(engine.roundNumber, 1);
  assert.equal(r1.upgrades.length, 1);
  assert.equal(r2.upgrades.length, 1);
  console.log("✔ Test 1: Match start & auto-upgrade assignment on timeout ok");
}

// Test 2: Simultaneous programming timeout auto-fill & commit
{
  const engine = new RobotRallyEngine();
  const players = [
    { robotId: "p1", name: "Player 1", isBot: false },
    { robotId: "p2", name: "Player 2", isBot: false },
  ];
  engine.loadCourse("cross", players, CONFIG.GAME_MODES.P2P, 2, null, {});

  assert.equal(engine.phase, "programming");
  assert.ok(engine.programmingDeadline > Date.now());

  const humanRobots = engine.robots.filter((r) => !r.isBot);
  const r1 = humanRobots[0];
  const r2 = humanRobots[1];

  // Player 1 commits valid cards
  const p1Cards = r1.hand.slice(0, 5);
  engine.commitRegistersForRobot(r1.id, p1Cards);
  assert.equal(engine.isRobotCommitted(r1.id), true);
  assert.equal(engine.isRobotCommitted(r2.id), false);
  assert.equal(engine.phase, "programming");

  // Programming timeout expires: resolveProgrammingTimeout should auto-fill and commit Player 2
  assert.equal(engine.resolveProgrammingTimeout(), true);
  assert.equal(engine.isRobotCommitted(r2.id), true);
  assert.equal(r2.registers.filter(Boolean).length, 5);

  engine.refreshReadyPhaseFromCommits();
  assert.equal(engine.phase, "ready");
  console.log("✔ Test 2: Programming timeout auto-fill & commit ok");
}

// Test 3: Upgrade Choice timeout during execution
{
  const engine = new RobotRallyEngine();
  const players = [
    { robotId: "p1", name: "Player 1", isBot: false },
    { robotId: "p2", name: "Player 2", isBot: false },
  ];
  engine.loadCourse("cross", players, CONFIG.GAME_MODES.P2P, 2, null, {});

  const r1 = engine.robots[0];
  engine.pendingUpgradeQueue = [
    {
      robotId: r1.id,
      options: CONFIG.UPGRADES.slice(0, 3),
    },
  ];
  engine.advanceUpgradeChoice();

  assert.equal(engine.phase, "upgrade_choice");
  assert.ok(engine.currentUpgradeChoice);
  assert.equal(engine.currentUpgradeChoice.robotId, r1.id);
  assert.ok(engine.currentUpgradeChoice.deadline > Date.now());

  // Timeout occurs: resolveUpgradeChoiceTimeout auto-picks first valid option
  assert.equal(engine.resolveUpgradeChoiceTimeout(), true);
  assert.equal(r1.upgrades.length, 1);
  assert.equal(engine.currentUpgradeChoice, null);
  console.log("✔ Test 3: Upgrade choice timeout auto-resolution ok");
}

console.log("All sync-robustness tests passed successfully!");
