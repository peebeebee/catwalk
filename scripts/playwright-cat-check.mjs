import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] || "/tmp/pw_cat_eval";
const url = process.argv[3] || "http://127.0.0.1:5500/index.html";

async function captureFrames(page, prefix, frames, intervalMs) {
  for (let i = 0; i < frames; i += 1) {
    const name = `${prefix}_${String(i + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    await page.waitForTimeout(intervalMs);
  }
}

async function sampleCollisionState(page, label) {
  return page.evaluate((captureLabel) => {
    const debug = window.__catDebug;
    const { cat, world } = debug;
    const box = {
      left: world.box.x,
      right: world.box.x + world.box.w,
      top: world.box.y,
      bottom: world.box.y + world.box.h
    };
    const rect = {
      left: cat.x - cat.collider.w / 2,
      right: cat.x + cat.collider.w / 2,
      top: cat.y + cat.collider.offsetY - cat.collider.h / 2,
      bottom: cat.y + cat.collider.offsetY + cat.collider.h / 2
    };
    const overlapX = Math.max(0, Math.min(rect.right, box.right) - Math.max(rect.left, box.left));
    const overlapY = Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
    const sideBandOverlap = overlapX > 0.5 && overlapY > 0.5 && rect.bottom > box.top + 2 && rect.top < box.bottom - 2;

    return {
      label: captureLabel,
      cat: {
        x: cat.x,
        y: cat.y,
        vx: cat.vx,
        vy: cat.vy,
        supportSurface: cat.supportSurface
      },
      rect,
      box,
      overlapX,
      overlapY,
      sideBandOverlap
    };
  }, label);
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  await captureFrames(page, "idle", 4, 150);

  await page.keyboard.down("ArrowRight");
  await captureFrames(page, "walk_right", 24, 110);
  // The room is wider than the view; keep walking until the cat reaches the
  // box (it stops a head bumper's width short of it).
  await page.waitForFunction(() => {
    const { cat, world } = window.__catDebug;
    return cat.x + cat.collider.w / 2 >= world.box.x - 12;
  }, null, { timeout: 15000 });
  await captureFrames(page, "push_box_left_side", 10, 100);

  await page.keyboard.press("KeyH");
  await captureFrames(page, "debug_left_side_contact", 4, 120);
  const leftSideState = await sampleCollisionState(page, "left_side");
  console.log(JSON.stringify(leftSideState));
  await page.keyboard.press("KeyH");

  // Space is held through the jump: a quick tap only gives a low pounce.
  await page.keyboard.down("Space");
  await captureFrames(page, "jump_right", 20, 100);
  await page.keyboard.up("Space");
  await captureFrames(page, "land_right", 8, 110);
  await page.keyboard.up("ArrowRight");

  await captureFrames(page, "post_jump", 6, 120);

  await page.keyboard.down("ArrowLeft");
  await captureFrames(page, "walk_left", 24, 110);
  await captureFrames(page, "push_box_right_side", 10, 100);
  await page.keyboard.press("KeyH");
  await captureFrames(page, "debug_right_side_contact", 4, 120);
  const rightSideState = await sampleCollisionState(page, "right_side");
  console.log(JSON.stringify(rightSideState));
  await page.keyboard.press("KeyH");
  await page.keyboard.down("Space");
  await captureFrames(page, "jump_left", 18, 100);
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowLeft");

  await captureFrames(page, "settle", 6, 150);

  if (leftSideState.sideBandOverlap || rightSideState.sideBandOverlap) {
    throw new Error("Collider side overlap detected in side-contact samples.");
  }

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
