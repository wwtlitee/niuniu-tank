(function researchRulesFactory(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ResearchRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createResearchRules() {
  "use strict";

  const QUEUE_CAPACITY = 20;

  const RESEARCH_TYPES = new Set(["tech", "breakthrough", "doctrine", "base", "academy"]);
  const REFUND_RATE = { research: 1, factory: 0.75, hero: 1 };

  function clampLevel(value, min, max) {
    const n = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
    return Math.max(min, Math.min(max, n));
  }

  function wallDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 1, Number.MAX_SAFE_INTEGER);
    if (lv <= 10) return 2;
    if (lv <= 30) return 3;
    return 4;
  }

  function mineDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 1, 5);
    return 2 + 2 * lv;
  }

  function structureDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 0, Number.MAX_SAFE_INTEGER);
    return Math.min(6, 2 + lv);
  }

  function techDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 0, Number.MAX_SAFE_INTEGER);
    return Math.min(6, 3 + Math.floor(lv / 3));
  }

  function doctrineDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 0, Number.MAX_SAFE_INTEGER);
    return 6 + lv;
  }

  function breakthroughDuration(currentLevel) {
    const lv = clampLevel(currentLevel, 0, Number.MAX_SAFE_INTEGER);
    return Math.min(10, 6 + lv);
  }

  function upgradeDuration(type, currentLevel) {
    switch (type) {
      case "wall": return wallDuration(currentLevel);
      case "goldmine": return mineDuration(currentLevel);
      case "turret":
      case "house":
      case "beacon": return structureDuration(currentLevel);
      case "branch": return 3;
      case "tech": return techDuration(currentLevel);
      case "breakthrough": return breakthroughDuration(currentLevel);
      case "doctrine": return doctrineDuration(currentLevel);
      case "base": return 10;
      case "academy": return 8;
      default: return structureDuration(currentLevel);
    }
  }

  function dedupKey(job) {
    const owner = job.ownerInstanceId != null ? job.ownerInstanceId : `${job.ownerKind}:${job.ownerX}:${job.ownerZ}`;
    return `${job.type}|${job.id}|${owner}|${job.targetLevel}`;
  }

  function nextTargetLevel(completedLevel, pendingForProject, cap) {
    const done = clampLevel(completedLevel, 0, Number.MAX_SAFE_INTEGER);
    const pending = clampLevel(pendingForProject, 0, Number.MAX_SAFE_INTEGER);
    const target = done + 1 + pending;
    if (cap != null && target > clampLevel(cap, 0, Number.MAX_SAFE_INTEGER)) return null;
    return target;
  }

  function refundRate(type) {
    if (type === "factory") return REFUND_RATE.factory;
    if (type === "hero") return REFUND_RATE.hero;
    return REFUND_RATE.research;
  }

  function isResearchType(type) {
    return RESEARCH_TYPES.has(type);
  }

  return Object.freeze({
    QUEUE_CAPACITY,
    upgradeDuration,
    wallDuration,
    mineDuration,
    structureDuration,
    techDuration,
    doctrineDuration,
    breakthroughDuration,
    dedupKey,
    nextTargetLevel,
    refundRate,
    isResearchType,
  });
});
