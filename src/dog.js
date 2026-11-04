// The brown dog that gallops across the room from wave 6.
//
// It moves like the dog in a biologist's gait table (Hildebrand): in a rotary
// gallop each leg touches down at its own phase of the stride and stays down
// for the duty factor, and a planted paw stays put while the body passes
// over it. Once per stride the spine gathers (back rounded, legs bunched
// under) and extends (back long, legs reaching fore and aft); the body rocks
// and bobs; the head floats steady on a spring filter; the ears and tail
// swing on springs. Legs are built like the cat's: digitigrade, with the
// paw's angle set first and two-bone IK for the joints above.
import { clamp, normalizeAngle, solveTwoBone } from "./cat-physics.js";
import { TAU, createSecondOrder, distalAngle, lerp, spineMap, stepSecondOrder } from "./cat-motion.js";

// Touchdown phase per leg in a rotary gallop (near hind, far hind, far fore,
// near fore) and the fraction of the stride each paw is down. With paws
// down only 30% of the stride there is a moment with all four in the air.
export const DOG_GALLOP = {
  offsets: { "rear-near": 0, "rear-far": 0.1, "front-far": 0.48, "front-near": 0.6 },
  duty: 0.3,
  frequency: 2.8
};

// The resting torso's spine runs between these x positions (see spineMap).
export const DOG_SPINE = { rearX: -56, frontX: 52 };

// Body centre height above the floor, and how far it rises and falls.
const RIDE = 80;
const BOB = 6;

// (localX, localY) is the hip or the top of the shoulder blade, stanceX
// where the paw is planted mid-stance relative to it, lift how high a paw
// is raised in its swing. As for the cat, a hind leg is thigh, shin and a
// long foot (knee forward, hock back); a foreleg hangs from a rocking
// shoulder blade with a backward elbow and a short paw.
export const DOG_LEGS = [
  { name: "rear-far", localX: -46, localY: -4, stanceX: -4, near: false, upper: 33, lower: 38, distal: 26, lift: 30 },
  { name: "front-far", localX: 36, localY: -16, stanceX: 10, near: false, blade: 24, upper: 28, lower: 42, distal: 13, lift: 26 },
  { name: "rear-near", localX: -42, localY: -3, stanceX: -4, near: true, upper: 33, lower: 38, distal: 26, lift: 30 },
  { name: "front-near", localX: 40, localY: -15, stanceX: 10, near: true, blade: 24, upper: 28, lower: 42, distal: 13, lift: 26 }
];

// Points of the resting body the rest of the dog hangs from.
export const DOG_NECK = { x: 54, y: -12 };
export const DOG_TAIL = { x: -64, y: -14 };
const TAIL_SEGMENTS = 7;
const TAIL_LENGTH = 9;

const frac = (x) => x - Math.floor(x);
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const point = () => ({ x: 0, y: 0 });

export function createDog({ x, dir, speed = 600, floorY }) {
  const dog = {
    x,
    dir,
    speed,
    floorY,
    phase: 0,
    t: 0,
    started: false,
    pose: { arch: 0, length: 1, tilt: 0, centerY: floorY - RIDE },
    legs: DOG_LEGS.map((cfg) => ({
      ...cfg,
      planted: false,
      // True on the frame a paw touches down (for a puff of dust).
      justPlanted: false,
      plantX: 0,
      liftRel: 0,
      liftAngle: 0,
      angle: 0,
      hip: point(),
      shoulder: point(),
      knee: point(),
      ankle: point(),
      foot: point()
    })),
    head: { x: 0, y: 0, neckBase: point(), filter: null },
    // Ear flap angle (radians from hanging straight back) and its speed.
    ear: { angle: 0, vel: 0 },
    tail: {
      angles: new Array(TAIL_SEGMENTS).fill(dir > 0 ? Math.PI : 0),
      velocities: new Array(TAIL_SEGMENTS).fill(0),
      joints: Array.from({ length: TAIL_SEGMENTS + 1 }, point)
    }
  };
  updateDog(dog, 0);
  return dog;
}

// A point of the resting body (facing right, y down from the spine) on the
// dog as it is now, in world space; also the spine's world angle there.
export function dogBodyPoint(dog, localX, localY) {
  const p = spineMap(localX, localY, { ...DOG_SPINE, arch: dog.pose.arch, length: dog.pose.length });
  const wx = p.x * dog.dir;
  const cos = Math.cos(dog.pose.tilt);
  const sin = Math.sin(dog.pose.tilt);
  return {
    x: dog.x + wx * cos - p.y * sin,
    y: dog.pose.centerY + wx * sin + p.y * cos,
    angle: dog.pose.tilt + dog.dir * p.angle
  };
}

// Ground a paw covers while planted: the stride's stance part at this speed.
export function dogStanceLength(speed) {
  return (speed * DOG_GALLOP.duty) / DOG_GALLOP.frequency;
}

export function updateDog(dog, dt) {
  const { duty, frequency, offsets } = DOG_GALLOP;
  const stance = dogStanceLength(dog.speed);
  dog.t += dt;
  dog.x += dog.dir * dog.speed * dt;
  dog.phase = frac(dog.phase + dt * frequency);

  // Gathered (flex 1) in the moment in the air before the hind paws land,
  // extended (-1) as the forepaws reach for the ground.
  const flex = Math.cos(TAU * (dog.phase - 0.95));
  const prevCenterY = dog.pose.centerY;
  dog.pose.arch = 9 * flex;
  dog.pose.length = 1 - 0.09 * flex;
  // Rocking: nose up as the hind legs drive, nose down onto the forepaws.
  dog.pose.tilt = -dog.dir * 0.09 * Math.sin(TAU * (dog.phase - 0.05));
  dog.pose.centerY = dog.floorY - RIDE - BOB * flex;
  const bodyVy = dt > 0 ? (dog.pose.centerY - prevCenterY) / dt : 0;

  for (const leg of dog.legs) updateDogLeg(dog, leg, dt, stance, frequency, duty, offsets[leg.name]);
  updateDogHead(dog, dt, bodyVy);
  updateDogTail(dog, dt);
  dog.started = true;
}

function updateDogLeg(dog, leg, dt, stance, frequency, duty, offset) {
  const isFront = leg.name.startsWith("front");
  const anchor = dogBodyPoint(dog, leg.localX, leg.localY);
  leg.hip.x = anchor.x;
  leg.hip.y = anchor.y;
  const p = frac(dog.phase - offset);
  const center = anchor.x + dog.dir * leg.stanceX;
  leg.justPlanted = false;
  let toeX;
  let toeY;
  let angleTarget;
  if (p < duty) {
    if (!leg.planted) {
      leg.planted = true;
      leg.justPlanted = dog.started;
      // A paw lands half a stance ahead of mid-stance; the first time it is
      // seen it may already be part-way through.
      leg.plantX = center + dog.dir * (stance / 2 - (dog.started ? 0 : (stance * p) / duty));
    }
    toeX = leg.plantX;
    toeY = dog.floorY;
    angleTarget = distalAngle({ isFront, mode: "stance", reach: (leg.plantX - center) * dog.dir });
  } else {
    if (leg.planted || !dog.started) {
      leg.planted = false;
      leg.liftRel = dog.started ? (leg.foot.x - anchor.x) * dog.dir : leg.stanceX - stance / 2;
      leg.liftAngle = dog.started ? leg.angle : distalAngle({ isFront, mode: "stance", reach: -stance / 2 });
    }
    // The swing runs relative to the moving body, so the paw never
    // overshoots it: lift, travel forward, settle ahead. A hind leg first
    // stays stretched out low behind from its push, and folds up highest as
    // it swings under the belly; a forepaw tucks up early.
    const u = (p - duty) / (1 - duty);
    const rel = lerp(leg.liftRel, leg.stanceX + stance / 2, smoothstep((u - (isFront ? 0.1 : 0.2)) / 0.75));
    toeX = anchor.x + dog.dir * rel;
    toeY = dog.floorY - leg.lift * Math.sin(Math.PI * Math.pow(u, isFront ? 0.75 : 1.4));
    angleTarget = distalAngle({ isFront, mode: "swing", swingT: u, liftOff: leg.liftAngle });
  }
  leg.angle = dog.started ? lerp(leg.angle, angleTarget, 1 - Math.exp(-dt * 30)) : angleTarget;

  // The paw below the wrist or hock hangs at leg.angle from the toes.
  const distalX = Math.sin(leg.angle) * leg.distal * dog.dir;
  const distalY = Math.cos(leg.angle) * leg.distal;
  let shoulder = anchor;
  if (isFront) {
    // The shoulder blade rocks forward as the paw reaches ahead.
    const ahead = (toeX - anchor.x) * dog.dir - leg.stanceX;
    const rock = 0.35 + clamp(ahead / 45, -1, 1) * 0.5;
    const turn = anchor.angle;
    const bx = Math.sin(rock) * leg.blade * dog.dir;
    const by = Math.cos(rock) * leg.blade;
    shoulder = {
      x: anchor.x + bx * Math.cos(turn) - by * Math.sin(turn),
      y: anchor.y + bx * Math.sin(turn) + by * Math.cos(turn)
    };
  }
  leg.shoulder.x = shoulder.x;
  leg.shoulder.y = shoulder.y;
  const ankleTarget = { x: toeX - distalX, y: toeY - distalY };
  // Elbows bend back, knees forward.
  const bend = (isFront ? 1 : -1) * dog.dir;
  const solved = solveTwoBone(shoulder, ankleTarget, leg.upper, leg.lower, bend, 0.12);
  leg.knee.x = solved.joint.x;
  leg.knee.y = solved.joint.y;
  leg.ankle.x = solved.end.x;
  leg.ankle.y = solved.end.y;
  leg.foot.x = solved.end.x + distalX;
  leg.foot.y = solved.end.y + distalY;
}

function updateDogHead(dog, dt, bodyVy) {
  // The head ignores the body's bob and rocking: it chases a steady height
  // (with a gentle nod each stride) through a spring filter, out ahead of
  // the shoulders.
  const neckBase = dogBodyPoint(dog, DOG_NECK.x, DOG_NECK.y);
  dog.head.neckBase.x = neckBase.x;
  dog.head.neckBase.y = neckBase.y;
  const targetY = dog.floorY - 108 + Math.sin(TAU * dog.phase) * 2;
  if (!dog.head.filter) dog.head.filter = createSecondOrder(2.2, 0.85, 0, targetY);
  dog.head.y = stepSecondOrder(dog.head.filter, targetY, dt);
  dog.head.x = neckBase.x + dog.dir * 30;

  // The ears stream back in the wind and flap up as the body drops away
  // beneath them.
  const ear = dog.ear;
  const target = 0.35 + clamp(bodyVy * 0.004, -0.5, 0.6);
  ear.vel += (70 * (target - ear.angle) - 7 * ear.vel) * dt;
  ear.angle += ear.vel * dt;
}

function updateDogTail(dog, dt) {
  // A spring chain like the cat's: the root follows the rump and a happy
  // wag; each segment chases its parent with a slight upward curl.
  const base = dogBodyPoint(dog, DOG_TAIL.x, DOG_TAIL.y);
  const back = dog.dir > 0 ? Math.PI : 0;
  const rump = dogBodyPoint(dog, DOG_SPINE.rearX, 0).angle;
  const wag = Math.sin(dog.t * 13) * 0.22;
  const rootTarget = back + rump + dog.dir * (0.3 + wag);
  const curl = dog.dir * 0.06;
  const { angles, velocities, joints } = dog.tail;
  const last = angles.length - 1;
  const steps = dog.started ? 3 : 0;
  const h = dt / Math.max(steps, 1);
  for (let step = 0; step < steps; step += 1) {
    for (let i = 0; i <= last; i += 1) {
      const parent = i === 0 ? rootTarget : angles[i - 1];
      const delta = normalizeAngle(parent + curl - angles[i]);
      const stiffness = lerp(300, 90, i / last);
      const damping = 2 * Math.sqrt(stiffness) * 0.6;
      velocities[i] += (stiffness * delta - damping * velocities[i]) * h;
      angles[i] += velocities[i] * h;
    }
  }
  if (!dog.started) angles.fill(rootTarget);
  joints[0].x = base.x;
  joints[0].y = base.y;
  for (let i = 0; i <= last; i += 1) {
    joints[i + 1].x = joints[i].x + Math.cos(angles[i]) * TAIL_LENGTH;
    joints[i + 1].y = joints[i].y + Math.sin(angles[i]) * TAIL_LENGTH;
  }
}

// The dog's box for bumping into the cat: the core of its body down to the
// floor, a little smaller than it looks, so a jump that is nearly in time
// still clears it.
export function dogHitBox(dog) {
  return { left: dog.x - 50, right: dog.x + 50, top: dog.floorY - 80, bottom: dog.floorY };
}
