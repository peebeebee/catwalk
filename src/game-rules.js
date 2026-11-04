// Pure rules for Catwalk: waves, mouse kinds and scoring. Mice carry
// cheese across the room; a boop on the nose makes them drop it. The runtime
// in index.html owns the state; these helpers stay deterministic for tests.
import { clamp } from "./cat-physics.js";

export const MAX_CHEESE = 5;
// Seconds between boops that still extend a streak.
export const COMBO_WINDOW = 3;
export const MAX_COMBO = 5;

export const MOUSE_KINDS = {
  grey: { points: 10, runBoost: 0, fleeBoost: 0, reactionScale: 1, stealsCheese: true },
  // Quicker to spot the cat and quicker to run.
  brown: { points: 20, runBoost: 70, fleeBoost: 40, reactionScale: 0.75, stealsCheese: true },
  // A rare bonus carrying golden cheese: very fast, and none of yours.
  gold: { points: 50, runBoost: 110, fleeBoost: 75, reactionScale: 0.6, stealsCheese: false }
};

// Bonus animals that roam the room. They don't take cheese; booping them just
// scores. Harder ones are worth more: grasshoppers hop away, flies have to be
// reached in the air, and the bird is the most alert of all.
export const CRITTER_POINTS = { grasshopper: 15, fly: 25, bird: 40 };
// Jumping clean over the dog (wave 6 on).
export const DOG_HOP_POINTS = 50;

export function boopPoints(kind) {
  return MOUSE_KINDS[kind]?.points ?? CRITTER_POINTS[kind];
}

// Difficulty for a wave (1-based): more mice, more of them out at once,
// faster and more alert, with new kinds and catnip unlocking along the way.
// Early mice flee slower than the cat runs (330 px/s), so a plain chase can
// reach them; from wave 5 they match it and flying boops become the way.
export function waveConfig(wave) {
  const n = Math.max(1, Math.floor(wave));
  return {
    count: 2 + n * 2,
    maxOut: Math.min(1 + Math.floor((n - 1) / 2), 4),
    // Seconds a mouse peeks out of its hole before it runs: the warning.
    peek: Math.max(0.5, 1.5 - (n - 1) * 0.12),
    spawnGap: Math.max(0.8, 2.4 - n * 0.2),
    runSpeed: 160 + Math.min((n - 1) * 14, 100),
    fleeSpeed: 290 + Math.min((n - 1) * 10, 80),
    // Seconds a mouse freezes when it first spots the cat.
    reaction: Math.max(0.12, 0.36 - (n - 1) * 0.03),
    brownChance: n >= 2 ? Math.min(0.25 + (n - 2) * 0.08, 0.55) : 0,
    catnip: n >= 3,
    goldChance: n >= 4 ? 0.6 : 0,
    // From wave 6 a dog gallops across the room: once, then more often.
    dogs: n >= 6 ? Math.min(1 + Math.floor((n - 6) / 2), 3) : 0
  };
}

// Banner line announcing what a wave adds, or null when nothing is new.
export function waveIntro(wave) {
  if (wave === 1) return "Boop the mice before they get across with your cheese!";
  if (wave === 2) return "New: speedy brown mice, 20 points a boop";
  if (wave === 3) return "Catnip grows on the furniture: grab it for the zoomies";
  if (wave === 4) return "A golden mouse with golden cheese: 50 points!";
  if (wave === 6) return "Watch out for the dog! Hold Space to jump high over it";
  return null;
}

export function nextCombo(combo, secondsSinceLastCatch) {
  return secondsSinceLastCatch <= COMBO_WINDOW ? Math.min(combo + 1, MAX_COMBO) : 1;
}

// A boop from the air (a "flying boop") scores double, times the streak.
export function scoreBoop({ kind, flying, streak }) {
  const multiplier = clamp(Math.floor(streak), 1, MAX_COMBO);
  return boopPoints(kind) * (flying ? 2 : 1) * multiplier;
}

// Clearing a wave pays more each wave, plus a bonus when no cheese was lost.
export function waveClearBonus(wave, perfect) {
  return wave * 50 + (perfect ? 100 : 0);
}
