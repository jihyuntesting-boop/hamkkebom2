"use strict";
/* Agent I: CSS contract tests. Full visual QA is required after the integration
 * owner loads 14-mvp-ui-polish.css after 13-editorial.css in web/index.html. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const legacy = fs.readFileSync(path.join(root, "web/assets/styles/14-mvp-ui-polish.css"), "utf8");
const activeCss = fs.readFileSync(path.join(root, "web/assets/styles/13-editorial.css"), "utf8");
const css = legacy + "\n" + activeCss;
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web/assets/scripts/00-app-core.js"), "utf8");
function color(variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;"));
  assert.ok(match, "missing color token " + variable);
  return match[1];
}
function contrast(a, b) {
  const lum = hex => {
    const nums = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const rgb = nums.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const [light, dark] = [lum(a), lum(b)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
test("brand, ink and muted text meet normal-text contrast on pure white", () => {
  assert.equal(color("--hb-brand").toUpperCase(), "#191F28");
  assert.equal(color("--hb-surface").toUpperCase(), "#FFFFFF");
  assert.equal(color("--hb-soft").toUpperCase(), "#F2F4F6");
  assert.equal(color("--hb-quiet").toUpperCase(), "#FCEBF1");
  for (const name of ["--hb-brand", "--hb-ink", "--hb-muted"]) {
    assert.ok(contrast(color(name), "#FFFFFF") >= 4.5, name + " must meet 4.5:1 on white");
  }
});
test("final polish styles existing real UI-01 to UI-07 markup", () => {
  const linked = [
    [".hb-landing-hero", "hb-landing-hero"],
    [".hb-choice-grid", "hb-choice-grid"],
    [".hb-recommend-card", "hb-recommend-card"],
    [".hb-evidence-row", "hb-evidence-row"],
    [".hb-itinerary-row", "hb-itinerary-row"],
    [".hb-rpl-card", "hb-rpl-card"],
    ["#hb-share-receiver", "hb-share-receiver"],
  ];
  for (const [selector, token] of linked) {
    assert.ok(css.includes(selector), "missing design selector " + selector);
    assert.ok(app.includes(token), "not present in actual view template: " + token);
  }
  assert.match(html, /13-editorial\.css/);
  assert.equal((html.match(/14-mvp-ui-polish\.css/g)||[]).length,1);
  assert.ok(html.indexOf("14-mvp-ui-polish.css") < html.indexOf("13-editorial.css"), "bean-baek editorial is the final design layer");
});
test("large itinerary mode, mobile widths, focus and reduced motion have explicit CSS", () => {
  assert.match(css, /--hb-touch:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.hb-large-plan\s*\{/);
  assert.match(app, /hbLargePlanMode/);
  assert.match(css, /@media\s*\(max-width:\s*400px\)/);
  assert.match(css, /@media\s*\(max-width:\s*750px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /#nearby-list/);
  assert.match(css, /#hb-trip-map/);
  assert.match(css, /#hb-rpl-cancel/);
  assert.match(css, /#hb-rpl-confirm/);
});
test("CSS only changes appearance: no hidden functions, external images or interactive overlays", () => {
  const stripped = legacy.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(stripped, /pointer-events:\s*none/i);
  assert.doesNotMatch(stripped, /(?:visibility:\s*hidden|position:\s*fixed)/i);
  assert.doesNotMatch(stripped, /url\s*\(/i);
  assert.deepEqual(Array.from(stripped.matchAll(/display:\s*none\s*!important/gi), m => m[0]),
    ["display: none !important"]);
  assert.match(stripped, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  let depth = 0;
  for (const char of stripped) {
    if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; assert.ok(depth >= 0); }
  }
  assert.equal(depth, 0);
});

// Verify the active theme rather than assuming the legacy layer is the visual authority.
test("Butter & Rose active semantic tokens have readable foreground pairs", () => {
 const active=activeCss;
 const get=name=>{const m=active.match(new RegExp(name+"\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;"));assert.ok(m,name);return m[1]};
 assert.equal(get("--hb-primary"),"#FFD66B"); assert.equal(get("--hb-rose"),"#EFA6BA");
 for(const [fg,bg] of [["--hb-primary-ink","--hb-primary"],["--hb-primary-ink","--hb-primary-hover"],["--hb-brand","--hb-surface"],["--hb-brand","--hb-quiet"],["--hb-ink","--hb-surface"],["--hb-muted","--hb-surface"],["--hb-success-ink","--hb-success-bg"],["--hb-warning-ink","--hb-warning-bg"],["--hb-error-ink","--hb-error-bg"]]) assert.ok(contrast(get(fg),get(bg))>=4.5,fg+" / "+bg);
 assert.doesNotMatch(active,/\\.hb-place-photo\\[data-photo-state="pending"\\]\\s*\\{\\s*display:\\s*none/i);
});

test("single token owner and Black text / Butter primary / Rose selection", () => {
 const declarations=[...activeCss.matchAll(/^\s*(--hb-[\w-]+)\s*:/gm)].map(m=>m[1]);
 assert.equal(declarations.length,new Set(declarations).size,"duplicate tokens");
 assert.doesNotMatch(legacy,/^\s*--hb-[\w-]+\s*:/m);
 assert.doesNotMatch(activeCss,/#82506A|#693C55|#285c50|#66559A/i);
 assert.equal(color("--hb-brand"),"#191F28");
 assert.match(activeCss,/--hb-primary:\s*#FFD66B/);
 assert.match(activeCss,/--hb-secondary:\s*#EFA6BA/);
 assert.match(activeCss,/button:disabled/);
 assert.match(activeCss,/aria-pressed="true"/);
 assert.match(activeCss,/hb-selection-tray\s*\{[^}]*max-height/s);
 assert.match(activeCss,/prefers-reduced-motion/);
});

test("shared typography and layout rhythm tokens are explicit; large-type and print remain separate", () => {
 for (const token of ["--hb-track-body","--hb-track-heading","--hb-track-ui","--hb-leading-body","--hb-leading-heading","--hb-page-max","--hb-page-gutter","--hb-panel-pad","--hb-card-pad"]) assert.ok(activeCss.includes(token+":"));
 assert.match(activeCss,/main#app\s*\{[^}]*var\(--hb-page-gutter\)/s);
 assert.match(activeCss,/\.hb-recommend-card > \.actions\s*\{[^}]*margin-top: auto/s);
 assert.match(activeCss,/\.hb-plan-generator\s*\{[^}]*grid-template-columns/s);
 assert.match(activeCss,/\.hb-large-plan :is\(p,li,label,button,input,select,\.muted,\.hb-plan-meta\)\s*\{[^}]*1\.25rem/s);
});

test("roomy vertical rhythm and accessible photo gallery styles remain explicit",()=>{assert.match(activeCss,/--hb-leading-body:\s*1\.85/);assert.match(activeCss,/--hb-section-gap:\s*clamp\(32px, 5vw, 56px\)/);assert.match(activeCss,/--hb-card-gap:\s*24px/);assert.match(activeCss,/\.hb-home-photo-gallery/);});

test("unavailable list photos do not occupy space and visible attribution is below the photo",()=>{assert.match(activeCss,/\.hb-place-photo\[data-photo-state="unavailable"\]\s*\{\s*display:none!important/);assert.match(activeCss,/\.hb-place-photo \.hb-photo-credit\s*\{\s*position:static/);});
