// Shared physics helpers used by both runtime and tests.

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function normalizeAngle(a) {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function solveTwoBone(base, target, l1, l2, bendDir, minReachRatio = 0.05) {
  const dx = target.x - base.x;
  const dy = target.y - base.y;
  let d = Math.hypot(dx, dy);
  if (d < 0.0001) d = 0.0001;

  const maxReach = l1 + l2 - 0.0001;
  const minReach = Math.max(Math.abs(l1 - l2) + 0.0001, (l1 + l2) * minReachRatio);
  const clampedD = clamp(d, minReach, maxReach);
  const angleToTarget = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + clampedD * clampedD - l2 * l2) / (2 * l1 * clampedD), -1, 1);
  const offset = Math.acos(cosA) * bendDir;
  const jointAngle = angleToTarget + offset;

  const joint = {
    x: base.x + Math.cos(jointAngle) * l1,
    y: base.y + Math.sin(jointAngle) * l1
  };

  const endDirX = target.x - joint.x;
  const endDirY = target.y - joint.y;
  const endDirMag = Math.hypot(endDirX, endDirY) || 1;
  const end = {
    x: joint.x + (endDirX / endDirMag) * l2,
    y: joint.y + (endDirY / endDirMag) * l2
  };

  return { joint, end };
}

export function colliderRectAt(x, y, collider) {
  const centerY = y + collider.offsetY;
  return {
    left: x - collider.w / 2,
    right: x + collider.w / 2,
    top: centerY - collider.h / 2,
    bottom: centerY + collider.h / 2
  };
}

export function overlapsX(rect, box) {
  return rect.right > box.left && rect.left < box.right;
}

export function overlapsY(rect, box) {
  return rect.bottom > box.top && rect.top < box.bottom;
}

export function centerYForSurface(surfaceY, collider) {
  return surfaceY - collider.offsetY - collider.h / 2;
}

export function resolveHorizontal({ x, y, vx, dt, collider, box, worldWidth, headBumper = 0 }) {
  // Runtime can optionally pass previous center X so overlap recovery can pick
  // a stable ejection side rather than guessing from instantaneous velocity.
  const previousX = arguments[0].previousX ?? x;
  let nextX = x + vx * dt;
  let nextVx = vx;
  const ejectionLeftX = box.left - collider.w / 2 - headBumper;
  const ejectionRightX = box.right + collider.w / 2 + headBumper;
  const sideBandInset = 3;
  const currentRect = colliderRectAt(x, y, collider);
  const sideBandTop = box.top + 2;
  const sideBandBottom = box.bottom - 2;
  const intersectsSideBand = (rect) => rect.bottom > sideBandTop && rect.top < sideBandBottom;
  const intersectsTightSideBand = (rect) =>
    rect.bottom > box.top + sideBandInset && rect.top < box.bottom - sideBandInset;
  const rectCenterX = (rect) => (rect.left + rect.right) * 0.5;
  const leftPenetration = (rect) => rect.right - box.left;
  const rightPenetration = (rect) => box.right - rect.left;
  const chooseEjectionSide = (rect) => {
    const wasOnLeft = previousX <= ejectionLeftX + 0.5;
    const wasOnRight = previousX >= ejectionRightX - 0.5;
    if (wasOnLeft) return "left";
    if (wasOnRight) return "right";
    if (vx > 1) return "left";
    if (vx < -1) return "right";

    // If motion history is ambiguous, use minimum translation distance.
    return leftPenetration(rect) <= rightPenetration(rect) ? "left" : "right";
  };
  const forceOutside = (rect) => {
    const side = chooseEjectionSide(rect);
    nextX = side === "left" ? ejectionLeftX : ejectionRightX;
    nextVx = 0;
  };

  // If the collider is already interpenetrating the obstacle side band, force a
  // clean horizontal separation before considering new movement.
  if (overlapsX(currentRect, box) && intersectsTightSideBand(currentRect)) {
    forceOutside(currentRect);
  } else {
    const nextRect = colliderRectAt(nextX, y, collider);
    const movingRight = vx > 0;
    const movingLeft = vx < 0;
    const currentFront = movingRight ? currentRect.right + headBumper : currentRect.left - headBumper;
    const nextFront = movingRight ? nextRect.right + headBumper : nextRect.left - headBumper;

    // Crossing test only applies inside the side band; above the top edge
    // motion should continue so jump arcs can clear the obstacle.
    if (intersectsSideBand(nextRect)) {
      if (movingRight && currentFront <= box.left && nextFront > box.left) {
        nextX = ejectionLeftX;
        nextVx = 0;
      } else if (movingLeft && currentFront >= box.right && nextFront < box.right) {
        nextX = ejectionRightX;
        nextVx = 0;
      }
    }
  }

  // Final safety net: after all math, we should never leave the torso collider
  // overlapping a box side band in the returned position.
  const resolvedRect = colliderRectAt(nextX, y, collider);
  if (overlapsX(resolvedRect, box) && intersectsTightSideBand(resolvedRect)) {
    const side = rectCenterX(resolvedRect) <= (box.left + box.right) * 0.5 ? "left" : "right";
    nextX = side === "left" ? ejectionLeftX : ejectionRightX;
    nextVx = 0;
  }

  nextX = clamp(nextX, collider.w / 2 + headBumper, worldWidth - collider.w / 2 - headBumper);
  return { x: nextX, vx: nextVx };
}

export function resolveVertical({ x, y, vy, dt, collider, box, floorY }) {
  let nextY = y + vy * dt;
  const currentRect = colliderRectAt(x, y, collider);
  const nextRect = colliderRectAt(x, nextY, collider);
  let nextVy = vy;
  let onGround = false;

  if (vy >= 0) {
    if (currentRect.bottom <= box.top && nextRect.bottom >= box.top && overlapsX(nextRect, box)) {
      nextY = centerYForSurface(box.top, collider);
      nextVy = 0;
      onGround = true;
    } else if (nextRect.bottom >= floorY) {
      nextY = centerYForSurface(floorY, collider);
      nextVy = 0;
      onGround = true;
    }
  } else if (currentRect.top >= box.bottom && nextRect.top <= box.bottom && overlapsX(nextRect, box)) {
    nextY = box.bottom + collider.h / 2 - collider.offsetY;
    nextVy = 0;
  }

  return { y: nextY, vy: nextVy, onGround };
}

export function isOnBoxTop({ x, y, collider, box, epsilon = 6, inset = 8 }) {
  const rect = colliderRectAt(x, y, collider);
  const touchingTop = Math.abs(rect.bottom - box.top) < epsilon;
  const centeredOverBox = rect.right - inset > box.left && rect.left + inset < box.right;
  return touchingTop && centeredOverBox;
}

// Handles buffered-jump and coyote-time windows in a deterministic way.
// - `jumpQueued` adds/refreshes the jump buffer window.
// - `onGround` refreshes coyote time.
// - A jump triggers if a buffered press exists while grounded/coyote is active.
export function updateJumpWindow({
  jumpQueued,
  jumpBuffer,
  coyoteTime,
  onGround,
  dt,
  bufferWindow = 0.14,
  coyoteWindow = 0.11
}) {
  const safeDt = Math.max(0, dt);
  let nextBuffer = Math.max(0, jumpBuffer - safeDt);
  let nextCoyote = Math.max(0, coyoteTime - safeDt);

  if (onGround) nextCoyote = Math.max(nextCoyote, coyoteWindow);
  if (jumpQueued) nextBuffer = bufferWindow;

  const shouldJump = nextBuffer > 0 && (onGround || nextCoyote > 0);
  if (shouldJump) {
    nextBuffer = 0;
    nextCoyote = 0;
  }

  return {
    jumpBuffer: nextBuffer,
    coyoteTime: nextCoyote,
    shouldJump
  };
}
