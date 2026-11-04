import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// The files sw.js keeps for playing offline, as listed in its FILES array.
function offlineFiles() {
  const list = read("sw.js").match(/const FILES = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
}

test("every file the service worker keeps exists", () => {
  for (const file of offlineFiles()) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is listed in sw.js but missing`);
  }
});

test("every game module is kept for offline play", () => {
  const kept = new Set(offlineFiles());
  for (const file of fs.readdirSync(path.join(root, "src"))) {
    assert.ok(kept.has(`src/${file}`), `src/${file} is missing from FILES in sw.js`);
  }
});

test("the manifest's icons exist and the page links the manifest", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} is missing`);
  }
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<script src="\.\/vendor\/matter\.min\.js"><\/script>/);
});
