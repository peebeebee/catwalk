import test from "node:test";
import assert from "node:assert/strict";
import {
  COMBO_WINDOW,
  CRITTER_POINTS,
  boopPoints,
  MAX_COMBO,
  MOUSE_KINDS,
  nextCombo,
  scoreBoop,
  waveClearBonus,
  waveConfig,
  waveIntro
} from "../src/game-rules.js";

test("waveConfig ramps mouse count and pressure", () => {
  const first = waveConfig(1);
  const later = waveConfig(6);
  assert.equal(first.count, 4);
  assert.equal(first.maxOut, 1);
  assert.equal(first.brownChance, 0);
  assert.equal(first.catnip, false);
  assert.ok(later.count > first.count);
  assert.ok(later.maxOut > first.maxOut);
  assert.ok(later.spawnGap < first.spawnGap);
  assert.ok(later.reaction < first.reaction);
  assert.ok(later.peek < first.peek);
  assert.ok(later.runSpeed > first.runSpeed);
  assert.ok(later.fleeSpeed > first.fleeSpeed);
});

test("first-wave mice flee slower than the cat runs", () => {
  assert.ok(waveConfig(1).fleeSpeed < 330);
  assert.ok(waveConfig(5).fleeSpeed >= 330);
});

test("waveConfig caps difficulty for very long games", () => {
  const far = waveConfig(60);
  assert.equal(far.maxOut, 4);
  assert.equal(far.spawnGap, 0.8);
  assert.equal(far.runSpeed, 260);
  assert.equal(far.fleeSpeed, 370);
  assert.equal(far.reaction, 0.12);
  assert.equal(far.peek, 0.5);
  assert.ok(far.brownChance <= 0.55);
});

test("waves unlock brown mice, catnip and gold mice in order", () => {
  assert.ok(waveConfig(2).brownChance > 0);
  assert.equal(waveConfig(2).catnip, false);
  assert.equal(waveConfig(3).catnip, true);
  assert.equal(waveConfig(3).goldChance, 0);
  assert.ok(waveConfig(4).goldChance > 0);
  assert.equal(typeof waveIntro(2), "string");
  assert.equal(waveIntro(9), null);
});

test("nextCombo chains quick catches and resets after the window", () => {
  assert.equal(nextCombo(0, 99), 1);
  assert.equal(nextCombo(1, 1), 2);
  assert.equal(nextCombo(3, COMBO_WINDOW), 4);
  assert.equal(nextCombo(4, COMBO_WINDOW + 0.01), 1);
  assert.equal(nextCombo(MAX_COMBO, 0.5), MAX_COMBO);
});

test("scoreBoop doubles flying boops and multiplies by streak", () => {
  assert.equal(scoreBoop({ kind: "grey", flying: false, streak: 1 }), 10);
  assert.equal(scoreBoop({ kind: "grey", flying: true, streak: 1 }), 20);
  assert.equal(scoreBoop({ kind: "brown", flying: true, streak: 3 }), 120);
  assert.equal(scoreBoop({ kind: "gold", flying: false, streak: 99 }), 50 * MAX_COMBO);
});

test("every animal is worth a different number of points", () => {
  const kinds = ["grey", "brown", "gold", "grasshopper", "fly", "bird"];
  const points = kinds.map((kind) => boopPoints(kind));
  assert.equal(new Set(points).size, kinds.length);
  assert.equal(scoreBoop({ kind: "bird", flying: true, streak: 2 }), CRITTER_POINTS.bird * 4);
});

test("only regular mice steal cheese", () => {
  assert.equal(MOUSE_KINDS.grey.stealsCheese, true);
  assert.equal(MOUSE_KINDS.brown.stealsCheese, true);
  assert.equal(MOUSE_KINDS.gold.stealsCheese, false);
});

test("waveClearBonus rewards later and perfect waves", () => {
  assert.equal(waveClearBonus(1, false), 50);
  assert.equal(waveClearBonus(3, true), 250);
});

test("the dog joins at wave 6 and comes more often later", () => {
  assert.equal(waveConfig(5).dogs, 0);
  assert.equal(waveConfig(6).dogs, 1);
  assert.equal(waveConfig(8).dogs, 2);
  assert.equal(waveConfig(20).dogs, 3);
  assert.ok(waveIntro(6).toLowerCase().includes("dog"));
});
