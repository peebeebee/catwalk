import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAirPhase,
  computeAirLegTarget,
  blendedPhaseOffset,
  distalAngle,
  chooseGaitProfile,
  gaitParams,
  isSwingPhase,
  normalizedPhase,
  phaseOffsetForLeg,
  projectPointOutsideEllipse,
  solveDistanceConstraint,
  spineMap,
  swingFootPoint
} from "../src/cat-motion.js";

test("chooseGaitProfile transitions from walk to trot by speed", () => {
  assert.equal(chooseGaitProfile(120).name, "walk");
  assert.equal(chooseGaitProfile(230).name, "trot");
});

test("normalizedPhase always stays within 0..TAU", () => {
  const p = normalizedPhase(-Math.PI * 3.5);
  assert.ok(p >= 0 && p < Math.PI * 2);
});

test("isSwingPhase follows duty factor threshold", () => {
  const duty = 0.6;
  assert.equal(isSwingPhase(Math.PI * 0.5, duty), false);
  assert.equal(isSwingPhase(Math.PI * 1.9, duty), true);
});

test("swingFootPoint creates arc above endpoints", () => {
  const start = { x: 0, y: 100 };
  const end = { x: 20, y: 100 };
  const mid = swingFootPoint(start, end, 0.5, 14);
  assert.ok(mid.y < 100);
});

test("solveDistanceConstraint preserves target length", () => {
  const anchor = { x: 2, y: 3 };
  const point = { x: 13, y: 7 };
  const solved = solveDistanceConstraint(anchor, point, 9);
  const dist = Math.hypot(solved.x - anchor.x, solved.y - anchor.y);
  assert.ok(Math.abs(dist - 9) < 1e-6);
});

test("projectPointOutsideEllipse pushes internal point outward", () => {
  const point = { x: 5, y: 2 };
  const center = { x: 0, y: 0 };
  const projected = projectPointOutsideEllipse(point, center, 10, 8, 0);
  const v = (projected.x * projected.x) / (10 * 10) + (projected.y * projected.y) / (8 * 8);
  assert.ok(v >= 0.999);
});

test("phaseOffsetForLeg uses diagonal pairing in trot", () => {
  assert.equal(phaseOffsetForLeg("rear-far", "trot"), 0);
  assert.equal(phaseOffsetForLeg("front-near", "trot"), 0);
  assert.equal(phaseOffsetForLeg("front-far", "trot"), Math.PI);
  assert.equal(phaseOffsetForLeg("rear-near", "trot"), Math.PI);
});

test("classifyAirPhase returns ascent/apex/descent bands", () => {
  assert.equal(classifyAirPhase(-260), "ascent");
  assert.equal(classifyAirPhase(0), "apex");
  assert.equal(classifyAirPhase(280), "descent");
});

test("computeAirLegTarget makes forelegs reach more on descent", () => {
  const hip = { x: 100, y: 100 };
  const ascentFront = computeAirLegTarget({
    hip,
    facing: 1,
    isFront: true,
    vy: -300,
    supportY: 300
  });
  const descentFront = computeAirLegTarget({
    hip,
    facing: 1,
    isFront: true,
    vy: 360,
    supportY: 300
  });
  assert.ok(descentFront.x > ascentFront.x);
  assert.ok(descentFront.y > ascentFront.y);
});

test("computeAirLegTarget keeps hind legs trailing during ascent", () => {
  const hip = { x: 100, y: 100 };
  const ascentHind = computeAirLegTarget({
    hip,
    facing: 1,
    isFront: false,
    vy: -340,
    supportY: 300
  });
  const descentHind = computeAirLegTarget({
    hip,
    facing: 1,
    isFront: false,
    vy: 360,
    supportY: 300
  });
  assert.ok(ascentHind.x < descentHind.x);
  assert.ok(ascentHind.y > 100);
});

test("gaitParams keeps the planted stride within reach at any speed", () => {
  for (const speed of [40, 120, 250, 330, 462]) {
    const gait = gaitParams(speed);
    assert.ok(gait.halfStride <= 30 + 1e-9, `speed ${speed}`);
    // Ground covered while a paw is down matches the stride, so paws don't slide.
    assert.ok(Math.abs((speed * gait.dutyFactor) / gait.cadenceHz - 2 * gait.halfStride) < 1e-9);
  }
  assert.equal(gaitParams(0).cadenceHz, 0);
});

test("gaitParams changes the step rate smoothly with speed", () => {
  let last = gaitParams(10).cadenceHz;
  for (let speed = 15; speed <= 470; speed += 5) {
    const cadence = gaitParams(speed).cadenceHz;
    assert.ok(Math.abs(cadence - last) < 0.3, `cadence jumps at ${speed}`);
    last = cadence;
  }
  assert.ok(gaitParams(330).cadenceHz > gaitParams(100).cadenceHz);
});

test("blendedPhaseOffset matches the pure gaits at the ends of each blend", () => {
  const walk = gaitParams(60);
  const trot = gaitParams(300);
  assert.ok(Math.abs(blendedPhaseOffset("front-far", walk) - phaseOffsetForLeg("front-far", "walk")) < 1e-9);
  const trotOffset = blendedPhaseOffset("front-near", trot);
  assert.ok(Math.abs(Math.cos(trotOffset) - Math.cos(phaseOffsetForLeg("front-near", "trot"))) < 1e-9);
});

test("swingFootPoint lifts the paw before it travels forward", () => {
  const start = { x: 0, y: 100 };
  const end = { x: 60, y: 100 };
  const early = swingFootPoint(start, end, 0.2, 12);
  assert.ok(100 - early.y > 8, "lifted well clear early on");
  assert.ok(early.x < 6, "barely moved forward yet");
  const done = swingFootPoint(start, end, 1, 12);
  assert.ok(Math.abs(done.x - 60) < 1e-9 && Math.abs(done.y - 100) < 1e-9);
});

test("distalAngle folds a lifting forepaw back and reaches it forward to land", () => {
  const liftOff = distalAngle({ isFront: true, mode: "stance", reach: -30 });
  const folded = distalAngle({ isFront: true, mode: "swing", swingT: 0.35, liftOff });
  const reaching = distalAngle({ isFront: true, mode: "swing", swingT: 0.8, liftOff });
  const landed = distalAngle({ isFront: true, mode: "swing", swingT: 1, liftOff });
  assert.ok(folded < -1.5, "pads turned to the back");
  assert.ok(reaching > landed && landed > 0, "toes forward, then flat");
  assert.ok(Math.abs(distalAngle({ isFront: true, mode: "stance", reach: 0 }) - landed) < 1e-9);
  // A swing starts from the angle the paw lifted with.
  assert.equal(distalAngle({ isFront: false, mode: "swing", swingT: 0, liftOff: -0.4 }), -0.4);
});

test("distalAngle rolls a planted paw onto its toes as the body passes over", () => {
  for (const isFront of [true, false]) {
    const ahead = distalAngle({ isFront, mode: "stance", reach: 10 });
    const behind = distalAngle({ isFront, mode: "stance", reach: -30 });
    assert.ok(behind < ahead - 0.4, isFront ? "front" : "hind");
  }
  // Crouching sinks the hocks: the hind foot leans further.
  assert.ok(distalAngle({ isFront: false, mode: "stance", crouch: 1 }) > distalAngle({ isFront: false, mode: "stance" }) + 0.4);
});

test("computeAirLegTarget curls forepaws on the way up and points them down to land", () => {
  const hip = { x: 100, y: 100 };
  const up = computeAirLegTarget({ hip, facing: 1, isFront: true, vy: -900, supportY: 400 });
  const down = computeAirLegTarget({ hip, facing: 1, isFront: true, vy: 900, supportY: 400 });
  assert.ok(up.angle < -1 && down.angle > 0);
  const hindUp = computeAirLegTarget({ hip, facing: -1, isFront: false, vy: -900, supportY: 400 });
  assert.ok(hindUp.x > hip.x, "hind legs trail behind a cat facing left");
});

test("spineMap leaves the resting torso unchanged", () => {
  const spine = { rearX: -48, frontX: 44, arch: 0, length: 1 };
  for (const [x, y] of [[-60, 5], [0, -20], [30, 10], [55, 0]]) {
    const p = spineMap(x, y, spine);
    assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9, `${x},${y}`);
    assert.ok(Math.abs(p.angle) < 1e-12);
  }
});

test("spineMap rounds the back up by the arch and curls the rump down", () => {
  const spine = { rearX: -48, frontX: 44, arch: 10, length: 1 };
  const middle = spineMap(-2, 0, spine);
  assert.ok(Math.abs(middle.y + 10) < 1e-9, "middle rises by the arch");
  assert.ok(Math.abs(spineMap(-48, 0, spine).y) < 1e-9, "ends stay level");
  // Past the rear end the curve carries on downward, as a rounded back
  // tucks the rump under.
  assert.ok(spineMap(-60, 0, spine).y > 0);
  assert.ok(spineMap(-48, 0, spine).angle < 0 && spineMap(44, 0, spine).angle > 0);
});

test("spineMap stretches about the middle and thins the body", () => {
  const spine = { rearX: -48, frontX: 44, arch: 0, length: 1.21 };
  assert.ok(Math.abs(spineMap(-48, 0, spine).x - (-2 - 46 * 1.21)) < 1e-9);
  assert.ok(Math.abs(spineMap(44, 0, spine).x - (-2 + 46 * 1.21)) < 1e-9);
  assert.ok(Math.abs(spineMap(0, 11, spine).y - 10) < 1e-9, "y scales by 1 / sqrt(length)");
});
