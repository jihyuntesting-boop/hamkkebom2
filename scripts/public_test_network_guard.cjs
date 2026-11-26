"use strict";
// Preloaded into every public test process by scripts/run_public_tests.mjs.
// Public tests must be offline: any DNS lookup or fetch() to a non-loopback
// host is rejected and recorded so the runner can fail the whole run, even
// when a test swallows the error.
const fs = require("node:fs");
const dns = require("node:dns");

const logFile = process.env.HB_PUBLIC_TEST_NETWORK_LOG;
const LOOPBACK = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]"]);

function record(kind, host) {
  const line = `${kind} ${host}\n`;
  process.stderr.write(`[network-guard] blocked ${line}`);
  if (logFile) fs.appendFileSync(logFile, line);
}

function blockedError(host) {
  const error = new Error(`network-guard: external host blocked (${host})`);
  error.code = "ENOTFOUND";
  return error;
}

const originalLookup = dns.lookup;
dns.lookup = function guardedLookup(host, ...rest) {
  if (LOOPBACK.has(String(host || ""))) return originalLookup.call(this, host, ...rest);
  record("dns", host);
  const callback = rest[rest.length - 1];
  if (typeof callback === "function") process.nextTick(callback, blockedError(host));
  return {};
};

const originalPromiseLookup = dns.promises.lookup;
dns.promises.lookup = async function guardedPromiseLookup(host, ...rest) {
  if (LOOPBACK.has(String(host || ""))) return originalPromiseLookup.call(this, host, ...rest);
  record("dns", host);
  throw blockedError(host);
};

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    let host = "";
    try {
      const raw = typeof input === "string" || input instanceof URL ? input : input && input.url;
      host = new URL(String(raw)).hostname;
    } catch {
      return originalFetch.call(this, input, init);
    }
    if (LOOPBACK.has(host)) return originalFetch.call(this, input, init);
    record("fetch", host);
    return Promise.reject(blockedError(host));
  };
}
