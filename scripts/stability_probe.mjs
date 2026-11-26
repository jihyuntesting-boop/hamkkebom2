#!/usr/bin/env node
// HAMKKEBOM low-rate stability probe (read-only GET requests only).
//
// Calls ONE target per tick in round-robin order, so the total request rate stays at
// 1 request / interval (default 10 s, about 6 requests per minute across all targets).
// It never sends POST, credentials, cookies or API keys, and it never stores response
// bodies: only time, target label, HTTP status, latency and a short failure category.
//
// Usage:
//   node scripts/stability_probe.mjs [--base URL] [--minutes 35] [--interval 10]
//                                    [--timeout 15] [--out DIR]
// Output: <out>/stability-<UTC>.jsonl (one line per request) and
//         <out>/stability-<UTC>.summary.json (per-target success rate, p50/p95, errors).
// Exit code: 0 when the run completed (even with failed requests; see the summary),
//            2 for invalid arguments.
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const base = String(arg("base", "https://hamkkebom-omega.vercel.app")).replace(/\/+$/, "");
const minutes = Number(arg("minutes", "35"));
const intervalSec = Number(arg("interval", "10"));
const timeoutSec = Number(arg("timeout", "15"));
const outDir = String(arg("out", "stability-results"));
if (
  !/^https:\/\/[^\s/]+$/.test(base) ||
  !(minutes > 0 && minutes <= 24 * 60) ||
  !(intervalSec >= 5) ||
  !(timeoutSec > 0 && timeoutSec <= intervalSec * 3)
) {
  console.error("Invalid arguments: base must be https origin, minutes 0-1440, interval >= 5 s.");
  process.exit(2);
}

// Seoul calendar date for "tomorrow" keeps the weather request inside the forecast window.
const seoulTomorrow = new Date(Date.now() + 9 * 3600e3 + 24 * 3600e3).toISOString().slice(0, 10);
const seoul = encodeURIComponent("서울");
// expect: 'html' = 2xx + <html; 'json' = 2xx + parseable JSON object containing the key.
const targets = [
  { label: "page:home", path: "/", expect: "html" },
  {
    label: "api:featured",
    path: "/api/featured.js?lat=37.5665&lng=126.9780",
    expect: "json",
    key: "mode",
  },
  {
    label: "api:nearby",
    path: "/api/nearby.js?lat=37.5665&lng=126.9780",
    expect: "json",
    key: "places",
  },
  {
    label: "api:places-seoul",
    path: "/api/data?type=places&region=" + seoul,
    expect: "json",
    key: "places",
  },
  {
    label: "api:weather-forecast",
    path: `/api/data?type=weather&region=${seoul}&date=${seoulTomorrow}`,
    expect: "json",
    key: "status",
  },
  {
    label: "api:weather-alerts",
    path: `/api/weather?type=alerts&region=${seoul}&date=${seoulTomorrow}`,
    expect: "json",
    key: "status",
  },
  {
    label: "api:toilets",
    path: "/api/toilets?lat=37.5665&lng=126.978&radius=2000&limit=50",
    expect: "json",
    key: "status",
  },
  { label: "page:migration", path: "/migration.html", expect: "html" },
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, `stability-${stamp}.jsonl`);
const summaryPath = join(outDir, `stability-${stamp}.summary.json`);

async function probe(target) {
  const started = Date.now();
  const at = new Date(started).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  let status = null,
    ok = false,
    failure = null;
  try {
    const response = await fetch(base + target.path, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "hamkkebom-stability-probe/1 (low-rate read-only)" },
    });
    status = response.status;
    const text = await response.text();
    if (status < 200 || status > 299) failure = "http_" + status;
    else if (target.expect === "html" && !/<html[\s>]/i.test(text)) failure = "unexpected_body";
    else if (target.expect === "json") {
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        failure = "invalid_json";
      }
      if (!failure && (!body || typeof body !== "object" || !(target.key in body)))
        failure = "missing_key";
    }
    ok = !failure;
  } catch (error) {
    failure = error?.name === "AbortError" ? "timeout" : "network_error";
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - started;
  const row = { at, target: target.label, status, ms, ok, failure };
  appendFileSync(logPath, JSON.stringify(row) + "\n");
  return row;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

function summarize(rows, startedAt, endedAt) {
  const byTarget = {};
  for (const t of targets) byTarget[t.label] = rows.filter((r) => r.target === t.label);
  const block = (list) => {
    const ms = list.map((r) => r.ms).sort((a, b) => a - b);
    const failures = {};
    for (const r of list) if (!r.ok) failures[r.failure] = (failures[r.failure] || 0) + 1;
    const okCount = list.filter((r) => r.ok).length;
    return {
      requests: list.length,
      ok: okCount,
      successRate: list.length ? Number(((okCount / list.length) * 100).toFixed(2)) : null,
      p50ms: percentile(ms, 50),
      p95ms: percentile(ms, 95),
      maxMs: ms.length ? ms[ms.length - 1] : null,
      failures,
    };
  };
  return {
    base,
    startedAt,
    endedAt,
    intervalSec,
    timeoutSec,
    plannedMinutes: minutes,
    note: "Low-rate read-only GET sample (1 request per interval, round-robin). Not an SLA or load test.",
    overall: block(rows),
    targets: Object.fromEntries(Object.entries(byTarget).map(([k, v]) => [k, block(v)])),
  };
}

const startedAt = new Date().toISOString();
const deadline = Date.now() + minutes * 60e3;
const rows = [];
console.log(
  `stability probe start ${startedAt} base=${base} minutes=${minutes} interval=${intervalSec}s log=${logPath}`,
);
let tick = 0;
while (Date.now() < deadline) {
  const tickStart = Date.now();
  const row = await probe(targets[tick % targets.length]);
  rows.push(row);
  tick += 1;
  if (!row.ok || tick % targets.length === 0) {
    console.log(
      `${row.at} ${row.target} status=${row.status} ms=${row.ms} ${row.ok ? "ok" : "FAIL " + row.failure}`,
    );
  }
  const wait = intervalSec * 1000 - (Date.now() - tickStart);
  if (wait > 0 && Date.now() + wait < deadline) await new Promise((r) => setTimeout(r, wait));
  else if (wait > 0) break;
}
const summary = summarize(rows, startedAt, new Date().toISOString());
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log("summary written to " + summaryPath);
