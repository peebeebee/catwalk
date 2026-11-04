import test from "node:test";
import assert from "node:assert/strict";
import { DOG_GALLOP, createDog, dogStanceLength, updateDog } from "../src/dog.js";
import { createSecondOrder, stepSecondOrder } from "../src/cat-motion.js";

function run(dog, seconds, dt = 1 / 120, each = () => {}) {
  for (let t = 0; t < seconds; t += dt) {
    updateDog(dog, dt);
    each(dog);
  }
}

test("a planted paw stays put while the dog runs over it", () => {
  const dog = createDog({ x: 0, dir: 1, speed: 600, floorY: 500 });
  const planted = new Map();
  let worst = 0;
  run(dog, 1.5, 1 / 120, (d) => {
    for (const leg of d.legs) {
      if (!leg.planted) {
        planted.delete(leg.name);
        continue;
      }
      if (!planted.has(leg.name)) planted.set(leg.name, leg.foot.x);
      worst = Math.max(worst, Math.abs(leg.foot.x - planted.get(leg.name)));
      assert.ok(Math.abs(leg.foot.y - 500) < 1.5, `${leg.name} on the floor`);
    }
  });
  assert.ok(worst < 1.5, `paws slid ${worst.toFixed(2)}px`);
});

test("the gallop has a moment with all four paws in the air", () => {
  const dog = createDog({ x: 0, dir: -1, speed: 600, floorY: 500 });
  let airborne = 0;
  run(dog, 1, 1 / 240, (d) => {
    if (d.legs.every((leg) => !leg.planted)) airborne += 1;
  });
  assert.ok(airborne > 0);
});

test("the dog covers its speed and its legs keep their lengths", () => {
  const dog = createDog({ x: 100, dir: 1, speed: 600, floorY: 500 });
  run(dog, 0.5);
  assert.ok(Math.abs(dog.x - 400) < 1);
  for (const leg of dog.legs) {
    const upper = Math.hypot(leg.knee.x - leg.shoulder.x, leg.knee.y - leg.shoulder.y);
    const lower = Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y);
    assert.ok(Math.abs(upper - leg.upper) < 1e-6 && Math.abs(lower - leg.lower) < 1e-6, leg.name);
  }
  assert.ok(Math.abs(dogStanceLength(600) - (600 * DOG_GALLOP.duty) / DOG_GALLOP.frequency) < 1e-9);
});

test("the dog's head floats steadier than its bobbing body", () => {
  const dog = createDog({ x: 0, dir: 1, speed: 600, floorY: 500 });
  run(dog, 1);
  const body = [];
  const head = [];
  run(dog, 1, 1 / 120, (d) => {
    body.push(d.pose.centerY);
    head.push(d.head.y);
  });
  const range = (values) => Math.max(...values) - Math.min(...values);
  assert.ok(range(head) < range(body) / 2, `head ${range(head).toFixed(1)} body ${range(body).toFixed(1)}`);
});

test("second-order follower settles on its target, and bounces when lightly damped", () => {
  const smooth = createSecondOrder(2, 1, 0, 0);
  const bouncy = createSecondOrder(2, 0.3, 0, 0);
  let peak = 0;
  for (let i = 0; i < 600; i += 1) {
    stepSecondOrder(smooth, 10, 1 / 120);
    peak = Math.max(peak, stepSecondOrder(bouncy, 10, 1 / 120));
  }
  assert.ok(Math.abs(smooth.y - 10) < 0.01);
  assert.ok(peak > 11, "overshoots");
});
