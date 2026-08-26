const RobotRallyAI = {
  programBotRegisters(bot, engine) {
    if (!bot) return;

    const unlocked = engine.getUnlockedRegisterCount(bot);
    const previous = (bot.registers || []).map(card => (card ? { ...card } : null));
    const chosenRegisters = [null, null, null, null, null];

    // Vastgezette registers behouden (laatste move blijft tot genoeg HP)
    for (let i = unlocked; i < 5; i++) {
      chosenRegisters[i] = engine.getCardForLockedRegister
        ? engine.getCardForLockedRegister(bot, i)
        : previous[i];
    }

    if (unlocked <= 0 || !bot.hand || bot.hand.length === 0) {
      bot.registers = chosenRegisters;
      return;
    }

    const targetCpNum = bot.checkpoint;
    let targetPos = null;

    for (let y = 0; y < engine.board.height; y++) {
      for (let x = 0; x < engine.board.width; x++) {
        const tile = engine.board.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.CHECKPOINT && tile.num === targetCpNum) {
          targetPos = { x, y };
          break;
        }
      }
      if (targetPos) break;
    }

    if (!targetPos) {
      targetPos = { x: Math.floor(engine.board.width / 2), y: Math.floor(engine.board.height / 2) };
    }

    const availableCards = [...bot.hand];
    let simX = bot.x;
    let simY = bot.y;
    let simDir = bot.dir;

    for (let reg = 0; reg < unlocked; reg++) {
      if (availableCards.length === 0) break;

      let bestCardIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < availableCards.length; i++) {
        const card = availableCards[i];
        const res = this.simulateCard(simX, simY, simDir, card, engine, {
          ignoreWalls: engine.hasUpgrade(bot, 'ghost')
        });
        const dist = Math.abs(res.x - targetPos.x) + Math.abs(res.y - targetPos.y);

        let score = 100 - dist * 10;
        if (res.inPit) score -= 500;
        if (res.outOfBounds) score -= 500;

        if (score > bestScore) {
          bestScore = score;
          bestCardIndex = i;
        }
      }

      const pickedCard = availableCards.splice(bestCardIndex, 1)[0];
      chosenRegisters[reg] = pickedCard;

      const nextSim = this.simulateCard(simX, simY, simDir, pickedCard, engine, {
        ignoreWalls: engine.hasUpgrade(bot, 'ghost')
      });
      simX = nextSim.x;
      simY = nextSim.y;
      simDir = nextSim.dir;
    }

    bot.registers = chosenRegisters;
  },

  simulateCard(x, y, dir, card, engine, options = {}) {
    let nextX = x;
    let nextY = y;
    let nextDir = dir;
    let outOfBounds = false;
    let inPit = false;

    const moveStep = (moveDir) => {
      if (!options.ignoreWalls && engine.hasWallAt(x, y, moveDir)) return false;
      const tx = x + [0, 1, 0, -1][moveDir];
      const ty = y + [-1, 0, 1, 0][moveDir];
      // Rand blokkeert (ook Ghost); positie blijft op het bord.
      if (tx < 0 || tx >= engine.board.width || ty < 0 || ty >= engine.board.height) {
        outOfBounds = true;
        return false;
      }
      x = tx;
      y = ty;
      const tile = engine.board.grid[y] && engine.board.grid[y][x];
      inPit = !!(tile && tile.type === CONFIG.TILE_TYPES.PIT);
      return !inPit;
    };

    switch (card.type) {
      case 'move1':
        moveStep(dir);
        break;
      case 'move2':
        moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        break;
      case 'move3':
        moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        break;
      case 'move4':
        moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        if (!outOfBounds && !inPit) moveStep(dir);
        break;
      case 'backup':
        moveStep((dir + 2) % 4);
        break;
      case 'backup2':
        moveStep((dir + 2) % 4);
        if (!outOfBounds && !inPit) moveStep((dir + 2) % 4);
        break;
      case 'strafeL':
        moveStep((dir + 3) % 4);
        break;
      case 'strafeR':
        moveStep((dir + 1) % 4);
        break;
      case 'turnR':
        nextDir = (dir + 1) % 4;
        break;
      case 'turnL':
        nextDir = (dir + 3) % 4;
        break;
      case 'uturn':
        nextDir = (dir + 2) % 4;
        break;
    }

    nextX = x;
    nextY = y;

    return { x: nextX, y: nextY, dir: nextDir, outOfBounds, inPit };
  }
};
