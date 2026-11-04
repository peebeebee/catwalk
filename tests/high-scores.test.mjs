import test from "node:test";
import assert from "node:assert/strict";
import {
  HIGH_SCORE_COUNT,
  NAME_MAX,
  addHighScore,
  cleanName,
  highScoreRank,
  parseHighScores
} from "../src/high-scores.js";

const list = (...scores) => scores.map((score, i) => ({ name: `P${i}`, score, wave: 1 }));

test("highScoreRank places a score below equal ones and drops what doesn't fit", () => {
  const full = list(500, 400, 300, 200, 100);
  assert.equal(highScoreRank([], 10), 0);
  assert.equal(highScoreRank(full, 600), 0);
  assert.equal(highScoreRank(full, 350), 2);
  assert.equal(highScoreRank(full, 300), 3);
  assert.equal(highScoreRank(full, 100), -1);
  assert.equal(highScoreRank(full, 50), -1);
  assert.equal(highScoreRank(list(500, 400), 50), 2);
  assert.equal(highScoreRank([], 0), -1);
});

test("addHighScore inserts in place and keeps the list short", () => {
  const full = list(500, 400, 300, 200, 100);
  const next = addHighScore(full, { name: "Kit", score: 450, wave: 4 });
  assert.equal(next.length, HIGH_SCORE_COUNT);
  assert.deepEqual(next.map((e) => e.score), [500, 450, 400, 300, 200]);
  assert.equal(next[1].name, "Kit");
  assert.equal(addHighScore(full, { name: "Low", score: 90, wave: 1 }), full);
  assert.deepEqual(addHighScore([], { name: "A", score: 5, wave: 1 }).map((e) => e.name), ["A"]);
});

test("cleanName tidies typed names", () => {
  assert.equal(cleanName("  Kit  "), "Kit");
  assert.equal(cleanName("Zoë\u0007  Cat"), "Zoë Cat");
  assert.equal(cleanName("abcdefghijklmnopq"), "abcdefghijkl");
  assert.equal(Array.from(cleanName("😺".repeat(20))).length, NAME_MAX);
  assert.equal(cleanName(undefined), "");
});

test("parseHighScores survives bad data and sorts what it keeps", () => {
  assert.deepEqual(parseHighScores(null), []);
  assert.deepEqual(parseHighScores("not json"), []);
  assert.deepEqual(parseHighScores('{"score": 5}'), []);
  const parsed = parseHighScores(JSON.stringify([
    { name: "B", score: 100, wave: 3 },
    { name: "A", score: 900.7 },
    { name: "X", score: "lots" },
    null,
    { name: "Zero", score: 0 },
    { score: 50, wave: 2 }
  ]));
  assert.deepEqual(parsed, [
    { name: "A", score: 900, wave: null },
    { name: "B", score: 100, wave: 3 },
    { name: "", score: 50, wave: 2 }
  ]);
  const many = JSON.stringify(list(1, 2, 3, 4, 5, 6, 7));
  assert.deepEqual(parseHighScores(many).map((e) => e.score), [7, 6, 5, 4, 3]);
});
