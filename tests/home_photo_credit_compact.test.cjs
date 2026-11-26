"use strict";
/* DATA-03 / UX-01 / UI-01: on the main home cards the CC photo credit is compacted
 * to a small focusable chip and expands on hover/keyboard focus. The credit is a
 * license condition (author, license, change notice), so it must never be removed;
 * detail pages and print keep the full visible text. CSS-only contract test. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "web/assets/styles/13-editorial.css"), "utf8");
const photoJs = fs.readFileSync(path.join(root, "web/assets/scripts/02-place-thumbnails.js"), "utf8");
const SCOPE = "#app :is(.hb-home-photo-gallery,#nearby-list) .hb-place-photo:not(.hb-detail-photo) .hb-photo-credit";

function rulesFor(selector) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripped))) if (m[1].trim() === selector) out.push(m[2]);
  return out;
}

test("compact credit is scoped to home cards only (gallery and nearby list, never detail)", () => {
  const compact = rulesFor(SCOPE);
  assert.equal(compact.length, 1, "exactly one compact rule");
  assert.match(compact[0], /position:absolute/);
  assert.match(compact[0], /font-size:0/);
  // Every rule that compacts the credit must carry the home-only scope.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*font-size:0[^{}]*)\}/g)) {
    if (m[1].includes("hb-photo-credit")) assert.ok(m[1].trim().startsWith("#app :is(.hb-home-photo-gallery,#nearby-list)"), m[1]);
  }
  assert.ok(SCOPE.includes(":not(.hb-detail-photo)"), "detail photo credit must be excluded");
});

test("compact chip has a visible label and a 44px touch target", () => {
  const [compact] = rulesFor(SCOPE);
  assert.match(compact, /min-width:44px/);
  assert.match(compact, /min-height:44px/);
  const [label] = rulesFor(SCOPE + "::before");
  assert.ok(label, "missing chip label");
  assert.match(label, /content:"ⓘ 출처"/);
  assert.match(label, /font-size:var\(--hb-text-xs\)/);
});

test("hover and keyboard focus reveal the full credit text", () => {
  const [open] = rulesFor(SCOPE + ":is(:hover,:focus-visible)");
  assert.ok(open, "missing hover/focus expansion");
  assert.match(open, /font-size:var\(--hb-text-xs\)/);
  assert.match(open, /white-space:normal/);
  assert.match(open, /text-decoration:underline/);
  const [hideLabel] = rulesFor(SCOPE + ":is(:hover,:focus-visible)::before");
  assert.match(hideLabel, /content:none/);
});

test("compact rules are screen-only so print keeps the full attribution", () => {
  const idx = css.indexOf(SCOPE + " {");
  assert.ok(idx > 0);
  const before = css.slice(0, idx);
  assert.ok(before.lastIndexOf("@media screen {") > before.lastIndexOf("\n}\n"), "compact rule must be inside @media screen");
});

test("default (detail) credit stays full and visible below the photo", () => {
  assert.match(css, /#app \.hb-place-photo \.hb-photo-credit\s*\{\s*position:static/);
});

test("credit element stays a focusable link with an accessible name (license condition)", () => {
  // Loose on purpose: the photo enhancement JS is owned by another task (#100/#102).
  assert.match(photoJs, /className = 'hb-photo-credit'/);
  assert.match(photoJs, /\.href = /);
  assert.match(photoJs, /setAttribute\('aria-label'/);
});
