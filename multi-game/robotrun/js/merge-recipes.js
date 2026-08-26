/**
 * Pure merge/combo recipe helpers for RobotRun.
 * Classic + CommonJS so browser and node tests both work.
 */
(function (root, factory) {
  const config = typeof CONFIG !== 'undefined'
    ? CONFIG
    : (typeof globalThis !== 'undefined' ? globalThis.CONFIG : undefined);
  const api = factory(config);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MergeRecipes = api;
})(typeof self !== 'undefined' ? self : this, function (CONFIG) {
  function sortedTypes(types) {
    return [...(types || [])].filter(Boolean).map(String).sort();
  }

  function recipeKey(inputs) {
    return sortedTypes(inputs).join('|');
  }

  function robotHasUpgrade(robot, upgradeId) {
    if (!upgradeId) return true;
    return (robot?.upgrades || []).some((u) => (u && u.id ? u.id : u) === upgradeId);
  }

  function resolveMergeRecipe(cards, robot) {
    const filled = (cards || []).filter(Boolean);
    if (filled.length < 2 || filled.length > 3) return null;
    const types = filled.map((c) => c.type);
    const key = recipeKey(types);
    const recipes = (CONFIG && CONFIG.MERGE_RECIPES) || [];
    for (const recipe of recipes) {
      if (recipeKey(recipe.inputs) !== key) continue;
      if (!robotHasUpgrade(robot, recipe.requiresUpgrade)) continue;
      return recipe;
    }
    return null;
  }

  function buildMergedCard(inputCards, outputType, rngFn) {
    const def = CONFIG && CONFIG.getCardTypeDef
      ? CONFIG.getCardTypeDef(outputType)
      : ((CONFIG && CONFIG.CARD_TYPES) || []).find((c) => c.type === outputType);
    if (!def) return null;
    const prios = (inputCards || []).filter(Boolean).map((c) => Number(c.priority) || 0);
    const priority = prios.length
      ? Math.round(prios.reduce((a, b) => a + b, 0) / prios.length)
      : def.priorityBase;
    const roll = typeof rngFn === 'function' ? rngFn() : Math.random();
    const idRoll = Number(roll).toString(36).slice(2, 10) || Math.random().toString(36).slice(2, 10);
    return {
      id: `card_${idRoll}`,
      type: def.type,
      label: def.label,
      icon: def.icon,
      priority,
    };
  }

  return { sortedTypes, resolveMergeRecipe, buildMergedCard, recipeKey };
});
