import { clamp } from "./cat-physics.js";

export const TAU = Math.PI * 2;

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Gait values are tuned for a domestic-cat side profile in a single-plane scene.
// Each gait is an anchor that gaitParams() blends between. Cadence is the
// slowest step rate; faster running raises it so strides stay within reach.
// The running gaits keep each paw down for under half the cycle, which gives
// the brief all-feet-up moments of a real run.
export function chooseGaitProfile(speed) {
  const absSpeed = Math.abs(speed);
  if (absSpeed < 24) {
    return { name: "idle", cadenceHz: 0.34, dutyFactor: 0.82, stepLiftPx: 3 };
  }
  if (absSpeed < 190) {
    return { name: "walk", cadenceHz: 1.18, dutyFactor: 0.66, stepLiftPx: 9 };
  }
  if (absSpeed < 305) {
    return { name: "trot", cadenceHz: 2.4, dutyFactor: 0.48, stepLiftPx: 12 };
  }
  return { name: "gallop", cadenceHz: 3, dutyFactor: 0.4, stepLiftPx: 14 };
}

const smoothstep01 = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

// Interpolates angles the short way round.
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// Continuous gait for a ground speed (px/s). Timing blends from the walk into
// the trot and then the gallop, so speeding up never snaps the legs into a new
// pattern. A planted paw covers speed * duty / cadence of ground; cadence rises
// so half of that stays within maxHalfStride, which the legs can reach.
export function gaitParams(speed, maxHalfStride = 30) {
  const v = Math.abs(speed);
  const walk = chooseGaitProfile(120);
  const trot = chooseGaitProfile(250);
  const gallop = chooseGaitProfile(420);
  const toTrot = smoothstep01((v - 110) / 120);
  const toGallop = smoothstep01((v - 380) / 80);
  const blend = (key) => lerp(lerp(walk[key], trot[key], toTrot), gallop[key], toGallop);
  const dutyFactor = blend("dutyFactor");
  const cadenceHz = v < 8 ? 0 : Math.max(blend("cadenceHz"), (v * dutyFactor) / (2 * maxHalfStride));
  return {
    cadenceHz,
    dutyFactor,
    halfStride: cadenceHz > 0 ? (v * dutyFactor) / (2 * cadenceHz) : 0,
    stepLiftPx: blend("stepLiftPx"),
    toTrot,
    toGallop
  };
}

// Leg phase maps are keyed by the rig leg names from index.html.
// Walk uses a 4-beat sequence, trot uses diagonal pairs, gallop bunches hind/front.
export function phaseOffsetForLeg(legName, gaitName) {
  const walkPhases = {
    "rear-far": 0,
    "front-far": Math.PI * 0.34,
    "rear-near": Math.PI,
    "front-near": Math.PI * 1.34
  };
  const trotPhases = {
    "rear-far": 0,
    "front-far": Math.PI,
    "rear-near": Math.PI,
    "front-near": 0
  };
  const gallopPhases = {
    "rear-far": 0,
    "rear-near": Math.PI * 0.17,
    "front-far": Math.PI * 0.96,
    "front-near": Math.PI * 1.1
  };

  const phases = gaitName === "trot"
    ? trotPhases
    : gaitName === "gallop"
      ? gallopPhases
      : walkPhases;
  return phases[legName] ?? 0;
}

// Phase offset for a leg at a blended gait (see gaitParams).
export function blendedPhaseOffset(legName, gait) {
  const walk = phaseOffsetForLeg(legName, "walk");
  const trot = phaseOffsetForLeg(legName, "trot");
  const gallop = phaseOffsetForLeg(legName, "gallop");
  return lerpAngle(lerpAngle(walk, trot, gait.toTrot), gallop, gait.toGallop);
}

export function normalizedPhase(phase) {
  let value = phase % TAU;
  if (value < 0) value += TAU;
  return value;
}

export function isSwingPhase(phase, dutyFactor) {
  const p = normalizedPhase(phase);
  return p > TAU * clamp(dutyFactor, 0.05, 0.95);
}

// A cat's paw peels up off the ground before it swings forward, then reaches
// out and settles: the lift peaks early and the forward travel starts late.
export function swingFootPoint(start, end, t, liftPx) {
  const u = clamp(t, 0, 1);
  const travel = smoothstep01((u - 0.12) / 0.83);
  const x = lerp(start.x, end.x, travel);
  const y = lerp(start.y, end.y, smoothstep01(u)) - Math.sin(Math.PI * Math.pow(u, 0.75)) * liftPx;
  return { x, y };
}

// Angle of the last leg segment (forepaw below the wrist, hind foot below the
// hock) away from straight down, in radians; positive tips the toes forward.
// A planted paw rolls up onto its toes as the body passes over it. Lifting, a
// forepaw folds right back at the wrist and a hind foot flexes at the hock;
// both then swing through and reach forward to land.
// `reach` is how far the toes are ahead of the shoulder or hip (px) and
// `crouch` (0..1) sinks the hocks for a sneak.
export function distalAngle({ isFront, mode, swingT = 0, reach = 0, liftOff = 0, crouch = 0 }) {
  const land = (isFront ? 0.17 : 0.14) + crouch * (isFront ? 0.1 : 0.55);
  if (mode === "swing") {
    const u = clamp(swingT, 0, 1);
    const fold = isFront ? -1.8 : -0.7;
    const reachOut = isFront ? 0.5 : 0.35;
    if (u < 0.35) return lerp(liftOff, fold, smoothstep01(u / 0.35));
    if (u < 0.8) return lerp(fold, reachOut, smoothstep01((u - 0.35) / 0.45));
    return lerp(reachOut, land, smoothstep01((u - 0.8) / 0.2));
  }
  return isFront
    ? land + clamp(reach / 30, -1, 0) * 0.85
    : land + clamp(reach / 34, -1, 0.2) * 0.7;
}

// Air phase is based on vertical speed so jump poses can switch cleanly.
export function classifyAirPhase(vy, apexThreshold = 120) {
  const threshold = Math.max(1, apexThreshold);
  if (vy < -threshold) return "ascent";
  if (vy > threshold) return "descent";
  return "apex";
}

// Returns an airborne leg target tuned for feline jump silhouettes:
// front legs reach during descent, hind legs trail during ascent.
export function computeAirLegTarget({
  hip,
  facing,
  isFront,
  vy,
  supportY
}) {
  const phase = classifyAirPhase(vy);
  // Normalizers match the jump speeds in index.html (~1200 px/s take-off).
  const ascent = clamp(-vy / 700, 0, 1);
  const descent = clamp(vy / 800, 0, 1);
  const apex = 1 - clamp(Math.abs(vy) / 300, 0, 1);

  // Offsets suit legs ~72px long, measured from the hip or the top of the
  // shoulder blade. Like a real leap: on the way up the forepaws fold under
  // the chest while the hind legs stay stretched out behind from the push;
  // over the top the cat stretches long, forepaws reaching ahead; coming down
  // the forepaws reach right down for the landing spot while the hind legs
  // tuck up under the belly, so the forepaws touch down first.
  // `angle` is the matching distalAngle (curled forepaws, pointed hind toes).
  let xOffset;
  let yOffset;
  let angle;

  if (isFront) {
    if (phase === "descent") {
      xOffset = (26 + descent * 6) * facing;
      yOffset = 60 + descent * 16;
      angle = 0.45;
    } else if (phase === "ascent") {
      xOffset = (10 - ascent * 4) * facing;
      yOffset = 40 - ascent * 6;
      angle = -1.6;
    } else {
      xOffset = (30 + apex * 6) * facing;
      yOffset = 48 - apex * 2;
      angle = 0.3;
    }
  } else if (phase === "descent") {
    xOffset = (-10 + descent * 10) * facing;
    yOffset = 42 + descent * 4;
    angle = 0.3;
  } else if (phase === "ascent") {
    xOffset = (-30 - ascent * 18) * facing;
    yOffset = 48 + ascent * 14;
    angle = -0.95;
  } else {
    xOffset = -38 * facing;
    yOffset = 38;
    angle = -0.7;
  }

  return {
    x: hip.x + xOffset,
    y: Math.min(supportY - 6, hip.y + yOffset),
    angle,
    phase
  };
}

// Returns a new point that satisfies fixed-length distance from `anchor`.
export function solveDistanceConstraint(anchor, point, length) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy) || 1;
  const scale = length / dist;
  return {
    x: anchor.x + dx * scale,
    y: anchor.y + dy * scale
  };
}

// Keeps a point outside an axis-aligned ellipse with optional padding.
export function projectPointOutsideEllipse(point, center, rx, ry, padding = 0) {
  const safeRx = Math.max(1, rx + padding);
  const safeRy = Math.max(1, ry + padding);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const norm = (dx * dx) / (safeRx * safeRx) + (dy * dy) / (safeRy * safeRy);
  if (norm >= 1) return { x: point.x, y: point.y };
  const inv = 1 / Math.sqrt(Math.max(norm, 0.000001));
  return {
    x: center.x + dx * inv,
    y: center.y + dy * inv
  };
}

// Carries a point of a resting torso (x along the body, y down from the
// spine) onto a bent spine: a curve between rearX and frontX that rounds up
// by `arch` px in the middle (negative hollows it) and is `length` times its
// resting length, centred where the resting spine was. The body thins as it
// stretches (y scales by 1 / sqrt(length)). Points past either end carry on
// along the end of the curve. Returns the point and the spine's angle there.
export function spineMap(x, y, { rearX, frontX, arch, length }) {
  const restLength = frontX - rearX;
  const span = restLength * length;
  const rear = (frontX + rearX) / 2 - span / 2;
  // A quadratic curve whose control point sits 2 * arch above the middle,
  // so x runs evenly along it and the middle rises by arch.
  const control = -2 * arch;
  const u = (x - rearX) / restLength;
  const t = clamp(u, 0, 1);
  const slope = 2 * control * (1 - 2 * t);
  const norm = Math.hypot(span, slope);
  const tx = span / norm;
  const ty = slope / norm;
  const beyond = (u - t) * span;
  const thick = y / Math.sqrt(length);
  return {
    x: rear + span * t + tx * beyond - ty * thick,
    y: 2 * (1 - t) * t * control + ty * beyond + tx * thick,
    angle: Math.atan2(ty, tx)
  };
}

// Second-order dynamics (a critically tunable spring-damper follower): y
// chases x with natural frequency f (Hz), damping zeta (1 = no overshoot,
// lower bounces) and response r (0 eases in, 1 is immediate, >1 overshoots
// the start of a move). A head driven through this floats steady while the
// body bobs beneath it. Create with an initial value, then step each frame.
export function createSecondOrder(f, zeta, r, x0) {
  return {
    k1: zeta / (Math.PI * f),
    k2: 1 / ((2 * Math.PI * f) ** 2),
    k3: (r * zeta) / (2 * Math.PI * f),
    xp: x0,
    y: x0,
    yd: 0
  };
}

export function stepSecondOrder(s, x, dt) {
  if (dt <= 0) return s.y;
  const xd = (x - s.xp) / dt;
  s.xp = x;
  // Keeps the integration stable when frames are long.
  const k2 = Math.max(s.k2, (dt * dt) / 2 + (dt * s.k1) / 2, dt * s.k1);
  s.y += dt * s.yd;
  s.yd += (dt * (x + s.k3 * xd - s.y - s.k1 * s.yd)) / k2;
  return s.y;
}
