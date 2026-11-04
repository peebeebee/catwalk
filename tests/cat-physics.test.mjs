import test from "node:test";
import assert from "node:assert/strict";
import {
  centerYForSurface,
  isOnBoxTop,
  resolveHorizontal,
  resolveVertical,
  solveTwoBone,
  updateJumpWindow
} from "../src/cat-physics.js";

const collider = { w: 94, h: 62, offsetY: 4 };
const box = { left: 300, right: 420, top: 420, bottom: 520 };

test("solveTwoBone keeps lower segment length stable", () => {
  const solved = solveTwoBone({ x: 0, y: 0 }, { x: 40, y: 20 }, 25, 28, 1, 0.1);
  const lowerLength = Math.hypot(solved.end.x - solved.joint.x, solved.end.y - solved.joint.y);
  assert.ok(Math.abs(lowerLength - 28) < 1e-6);
});

test("resolveHorizontal blocks at left wall with overlap", () => {
  const res = resolveHorizontal({
    x: 230,
    y: centerYForSurface(500, collider), // torso deep enough to collide with sides
    vx: 500,
    dt: 0.2,
    collider,
    box,
    worldWidth: 1200
  });
  assert.equal(res.vx, 0);
  assert.equal(res.x, box.left - collider.w / 2);
});

test("resolveHorizontal ejects when already embedded in obstacle", () => {
  const res = resolveHorizontal({
    x: 350, // inside the box band and biased to the left half
    y: centerYForSurface(500, collider),
    vx: 0,
    dt: 0.016,
    collider,
    box,
    worldWidth: 1200
  });
  assert.equal(res.vx, 0);
  assert.equal(res.x, box.left - collider.w / 2);
});

test("resolveHorizontal respects head bumper distance", () => {
  const headBumper = 18;
  const res = resolveHorizontal({
    x: 230,
    y: centerYForSurface(500, collider),
    vx: 500,
    dt: 0.2,
    collider,
    box,
    worldWidth: 1200,
    headBumper
  });
  assert.equal(res.vx, 0);
  assert.equal(res.x, box.left - collider.w / 2 - headBumper);
});

test("resolveHorizontal still blocks when barely below top edge", () => {
  const res = resolveHorizontal({
    x: 230,
    y: centerYForSurface(box.top + 4, collider),
    vx: 500,
    dt: 0.2,
    collider,
    box,
    worldWidth: 1200
  });
  assert.equal(res.vx, 0);
  assert.equal(res.x, box.left - collider.w / 2);
});

test("resolveHorizontal does not block when jumping above the box", () => {
  const res = resolveHorizontal({
    x: 230,
    y: 300, // well above the top edge
    vx: 500,
    dt: 0.2,
    collider,
    box,
    worldWidth: 1200
  });
  assert.ok(res.x > 230);
  assert.equal(res.vx, 500);
});

test("resolveVertical lands on box top", () => {
  const startY = centerYForSurface(box.top - 10, collider);
  const res = resolveVertical({
    x: 340,
    y: startY,
    vy: 400,
    dt: 0.08,
    collider,
    box,
    floorY: 700
  });
  assert.equal(res.onGround, true);
  assert.equal(res.vy, 0);
  assert.equal(res.y, centerYForSurface(box.top, collider));
});

test("resolveVertical lands on floor when not over box", () => {
  const res = resolveVertical({
    x: 120,
    y: 610,
    vy: 500,
    dt: 0.2,
    collider,
    box,
    floorY: 700
  });
  assert.equal(res.onGround, true);
  assert.equal(res.vy, 0);
  assert.equal(res.y, centerYForSurface(700, collider));
});

test("isOnBoxTop uses torso collider, not legs", () => {
  const y = centerYForSurface(box.top, collider);
  assert.equal(isOnBoxTop({ x: 340, y, collider, box }), true);
  assert.equal(isOnBoxTop({ x: 210, y, collider, box }), false);
});

test("updateJumpWindow consumes a buffered jump while on coyote time", () => {
  const state = updateJumpWindow({
    jumpQueued: true,
    jumpBuffer: 0,
    coyoteTime: 0.06,
    onGround: false,
    dt: 0.016
  });
  assert.equal(state.shouldJump, true);
  assert.equal(state.jumpBuffer, 0);
  assert.equal(state.coyoteTime, 0);
});

test("updateJumpWindow preserves queued jump while still airborne", () => {
  const state = updateJumpWindow({
    jumpQueued: true,
    jumpBuffer: 0,
    coyoteTime: 0,
    onGround: false,
    dt: 0.016
  });
  assert.equal(state.shouldJump, false);
  assert.ok(state.jumpBuffer > 0.12);
  assert.equal(state.coyoteTime, 0);
});
