// High scores for Catwalk: the best few games with the player's name,
// kept in the browser by index.html. These helpers stay pure so the rules
// can be tested; the runtime does the storing.

export const HIGH_SCORE_COUNT = 5;
export const NAME_MAX = 12;

// Tidies a typed name: no control characters, single spaces, trimmed, and
// at most NAME_MAX characters.
export function cleanName(name) {
  const tidy = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(tidy).slice(0, NAME_MAX).join("").trim();
}

// A stored list read back, best first. Anything malformed is dropped, so a
// corrupt or hand-edited entry can't break the game.
export function parseHighScores(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((e) => e && Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({
      name: cleanName(e.name),
      score: Math.floor(e.score),
      wave: Number.isFinite(e.wave) ? e.wave : null
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGH_SCORE_COUNT);
}

// Where a score would go in the list (0 is the top), or -1 when it doesn't
// make it. A tie goes below the scores already there.
export function highScoreRank(list, score) {
  if (!(score > 0)) return -1;
  const above = list.filter((e) => e.score >= score).length;
  return above < HIGH_SCORE_COUNT ? above : -1;
}

// The list with an entry put in its place (unchanged if it doesn't make it).
export function addHighScore(list, entry) {
  const rank = highScoreRank(list, entry.score);
  if (rank < 0) return list;
  return [...list.slice(0, rank), entry, ...list.slice(rank)].slice(0, HIGH_SCORE_COUNT);
}
