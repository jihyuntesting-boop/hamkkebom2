'use strict';

/**
 * WTH-01: pure, fail-closed weather normalization. No network requests or UI writes.
 * KMA short-term forecast is handled separately from the legacy summary-only proxy.
 * A result is 'available' only when time, geography, source, and freshness can be checked.
 */

const KST_OFFSET = '+09:00';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KMA_SOURCE = Object.freeze({
  name: '기상청 단기예보 조회서비스',
  type: 'kma_short_term',
  url: 'https://www.data.go.kr/data/15084084/openapi.do'
});
// HAMKKEBOM product defaults, NOT a KMA-issued staleness standard.
// The official short-term release cadence is 3 hours. A 1-hour buffer is a
// provisional operational choice; monitor real publication lag before launch.
const DEFAULT_FRESHNESS_POLICIES = Object.freeze({
  kma_short_term: Object.freeze({maxAgeMinutes: 240, clockSkewMinutes: 10})
});
const STATUSES = Object.freeze(['available', 'no_forecast', 'stale', 'error', 'invalid']);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
};
const isDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const dateIntervalKst = date => {
  const start = Date.parse(date + 'T00:00:00' + KST_OFFSET);
  return [start, start + DAY_MS];
};
const kmaInstant = (date, time) => {
  const day = String(date ?? '');
  const clock = String(time ?? '');
  if (!/^\d{8}$/.test(day) || !/^\d{4}$/.test(clock)) return null;
  const formatted = day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8);
  const hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(2));
  if (!isDate(formatted) || hour > 23 || minute > 59) return null;
  const label = formatted + 'T' + clock.slice(0, 2) + ':' + clock.slice(2) + ':00' + KST_OFFSET;
  const millis = Date.parse(label);
  return Number.isFinite(millis) ? {millis, label} : null;
};
const instant = value => {
  // Reject implicit server-local timezone and numeric timestamps.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  // Date.parse normalizes impossible calendar dates; reject these explicitly.
  const date = value.slice(0, 10);
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const seconds = value.length > 16 && value[16] === ':' ? Number(value.slice(17, 19)) : 0;
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!isDate(date) || hour > 23 || minute > 59 || seconds > 59 ||
      (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59))) return null;
  // Compare original wall-clock date/time against its represented instant.
  const offsetMinutes = offset ? (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  const wall = new Date(millis + offsetMinutes * 60000).toISOString();
  if (wall.slice(0, 16) !== value.slice(0, 16)) return null;
  return millis;
};
const kstLabel = millis => new Date(millis + 9 * HOUR_MS).toISOString().slice(0, 19) + KST_OFFSET;
const validGrid = grid => object(grid) && Number.isInteger(grid.nx) && grid.nx > 0 &&
  Number.isInteger(grid.ny) && grid.ny > 0;
const sameGrid = (record, grid) => Number(record.nx) === grid.nx && Number(record.ny) === grid.ny &&
  record.nx != null && record.ny != null;
const safeSource = value => object(value) && typeof value.name === 'string' && value.name.trim() &&
  typeof value.type === 'string' && value.type.trim()
  ? {name: value.name.trim(), type: value.type.trim(), url: typeof value.url === 'string' && /^https:\/\//.test(value.url) ? value.url : null}
  : null;
const safeText = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;

function weatherRequestKey(region, date) { return JSON.stringify([region, date]); }
function shouldApplyWeatherResponse(current, incoming) {
  return object(current) && object(incoming) &&
    current.requestId != null && incoming.requestId != null &&
    current.requestId === incoming.requestId &&
    typeof current.requestKey === 'string' && current.requestKey === incoming.requestKey;
}

function normalizeWeather(options = {}) {
  const input = object(options) ? options : {};
  const region = input.region;
  const date = input.date;
  const now = input.now === undefined ? new Date() : input.now;
  const checkedAt = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : null;
  const requestId = typeof input.requestId === 'string' || Number.isSafeInteger(input.requestId) ? input.requestId : null;
  const base = {
    status: 'invalid', reason: null, region: typeof region === 'string' ? region : null,
    date: typeof date === 'string' ? date : null, timezone: 'Asia/Seoul',
    forecastType: null, issuedAt: null, validFrom: null, validTo: null,
    source: null, grid: null, temperatureC: null, precipitationProbabilityPercent: null,
    precipitationAmountMm: null, precipitationText: null, precipitationType: null, summary: null,
    coverage: null, validityMethod: null, checkedAt, requestId,
    requestKey: weatherRequestKey(region, date),
    evidence: {adapter: null, sourceVerified: false, regionVerified: false, rawSummary: null}
  };
  const outcome = (status, reason) => ({...base, status, reason});
  if (!['서울', '경기'].includes(region)) return outcome('invalid', 'unsupported_region');
  if (!isDate(date)) return outcome('invalid', 'invalid_travel_date');
  if (!checkedAt) return outcome('invalid', 'invalid_current_time');

  // Network/HTTP/provider failures are *not* forecast absence.
  if (input.error != null) return {...outcome('error', 'network_error'), evidence: {...base.evidence, errorType: safeText(input.error?.name) || 'request_failure'}};
  if (input.httpStatus != null && (!Number.isInteger(input.httpStatus) || input.httpStatus < 200 || input.httpStatus >= 300)) {
    return {...outcome('error', 'http_error'), evidence: {...base.evidence, httpStatus: input.httpStatus}};
  }
  const payload = input.payload;
  if (!object(payload)) return outcome('invalid', 'invalid_payload');
  if (own(payload, 'error') && payload.error != null) return outcome('error', 'provider_error');

  // Optional, externally validated provider coverage, never a guessed 3/5/10-day horizon.
  if (input.supportedWindow != null) {
    const window = input.supportedWindow;
    if (!object(window) || !isDate(window.from) || !isDate(window.through) || window.from > window.through) {
      return outcome('invalid', 'invalid_supported_window');
    }
    base.coverage = {from: window.from, through: window.through, method: 'caller_supplied'};
    if (date < window.from || date > window.through) return outcome('no_forecast', 'outside_supported_window');
  }
  if (payload.status === 'no_forecast' || (Array.isArray(payload.forecasts) && payload.forecasts.length === 0)) {
    return outcome('no_forecast', 'provider_no_forecast');
  }

  const finish = values => {
    const result = {...base, ...values};
    const issued = instant(result.issuedAt);
    const start = instant(result.validFrom);
    const end = instant(result.validTo);
    if (issued === null || start === null || end === null) return {...result, status: 'invalid', reason: 'missing_or_invalid_forecast_time', summary: null};
    if (start >= end || issued > end) return {...result, status: 'invalid', reason: 'contradictory_forecast_time', summary: null};
    if (!result.source) return {...result, status: 'invalid', reason: 'missing_source', summary: null};
    if (!result.evidence.regionVerified) return {...result, status: 'invalid', reason: 'unverified_region', summary: null};
    const policy = input.freshnessPolicy === undefined
      ? DEFAULT_FRESHNESS_POLICIES[result.source.type]
      : input.freshnessPolicy;
    if (!object(policy) || !Number.isFinite(policy.maxAgeMinutes) || policy.maxAgeMinutes <= 0 ||
        !Number.isFinite(policy.clockSkewMinutes) || policy.clockSkewMinutes < 0) {
      return {...result, status: 'invalid', reason: 'freshness_policy_missing_or_invalid', summary: null};
    }
    if (issued > now.getTime() + policy.clockSkewMinutes * 60000) {
      return {...result, status: 'invalid', reason: 'future_issue_time', summary: null};
    }
    const [dayStart, dayEnd] = dateIntervalKst(date);
    if (end <= dayStart || start >= dayEnd) return {...result, status: 'no_forecast', reason: 'outside_forecast_validity', summary: null};
    // Preserve actual issuedAt; never equate checkedAt with issuedAt.
    if (now.getTime() - issued > policy.maxAgeMinutes * 60000) {
      return {...result, status: 'stale', reason: 'past_source_freshness_policy', freshnessPolicy: {
        sourceType: result.source.type, maxAgeMinutes: policy.maxAgeMinutes,
        clockSkewMinutes: policy.clockSkewMinutes, authority: 'hamkkebom_provisional'
      }};
    }
    return {...result, status: 'available', reason: 'verified_forecast', freshnessPolicy: {
      sourceType: result.source.type, maxAgeMinutes: policy.maxAgeMinutes,
      clockSkewMinutes: policy.clockSkewMinutes, authority: 'hamkkebom_provisional'
    }};
  };

  // Official KMA getVilageFcst response, identified by response/body/items.
  if (object(payload.response)) {
    const raw = payload.response;
    const code = raw.header?.resultCode;
    if (code != null && String(code) !== '00') return {...outcome('error', 'provider_result_code'), evidence: {...base.evidence, adapter: 'kma_vilage', providerCode: String(code)}};
    if (code == null || !object(raw.body)) return outcome('invalid', 'invalid_kma_envelope');
    const body = raw.body;
    const count = body.totalCount == null ? null : Number(body.totalCount);
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) return outcome('invalid', 'invalid_kma_total_count');
    if (count === 0) {
      if (body.items?.item != null && (!Array.isArray(body.items.item) || body.items.item.length > 0)) return outcome('invalid', 'inconsistent_kma_total_count');
      return outcome('no_forecast', 'kma_zero_items');
    }
    const rawItems = body.items?.item;
    const items = Array.isArray(rawItems) ? rawItems : object(rawItems) ? [rawItems] : null;
    if (!items) return outcome('invalid', 'invalid_kma_items');
    if (items.length === 0) return count !== null && count > 0 ? outcome('invalid', 'kma_page_missing_items') : outcome('no_forecast', 'kma_empty_items');
    if (count !== null && items.length > count) return outcome('invalid', 'inconsistent_kma_total_count');
    // A truncated first page must not be mistaken for all available forecast hours.
    if (count !== null && items.length < count) return outcome('invalid', 'incomplete_kma_page');
    if (payload.region != null && payload.region !== region) return outcome('invalid', 'region_mismatch');
    if (!validGrid(input.expectedGrid)) return outcome('invalid', 'missing_region_grid_mapping');
    const parsed = [];
    let issueMs = null;
    let issuedAt = null;
    for (const item of items) {
      if (!object(item) || typeof item.category !== 'string' || !item.category.trim()) return outcome('invalid', 'invalid_kma_item');
      const issue = kmaInstant(item.baseDate, item.baseTime);
      const validity = kmaInstant(item.fcstDate, item.fcstTime);
      if (!issue || !validity) return outcome('invalid', 'invalid_kma_item_time');
      if (issueMs != null && issueMs !== issue.millis) return outcome('invalid', 'mixed_issue_times');
      issueMs = issue.millis;
      issuedAt = issue.label;
      if (!sameGrid(item, input.expectedGrid)) return outcome('invalid', 'region_grid_mismatch');
      parsed.push({...item, ms: validity.millis});
    }
    const [dayStart, dayEnd] = dateIntervalKst(date);
    const allTimes = parsed.map(item => item.ms);
    const coverage = {from: kstLabel(Math.min(...allTimes)).slice(0, 10),
      through: kstLabel(Math.max(...allTimes)).slice(0, 10), method: 'kma_returned_slots'};
    const dayItems = parsed.filter(item => item.ms >= dayStart && item.ms < dayEnd);
    if (dayItems.length === 0) {
      return {...outcome('no_forecast', 'no_items_for_travel_date'), coverage, forecastType: 'short_term',
        issuedAt, source: {...KMA_SOURCE}, grid: {...input.expectedGrid},
        evidence: {adapter: 'kma_vilage', sourceVerified: true, regionVerified: true, rawSummary: null}};
    }
    const times = [...new Set(dayItems.map(item => item.ms))].sort((a, b) => a - b);
    const noon = input.preferUpcoming === true ? Math.max(dayStart + 12 * HOUR_MS, now.getTime()) : dayStart + 12 * HOUR_MS;
    const eligibleTimes = input.preferUpcoming === true ? times.filter(t => t + HOUR_MS > now.getTime()) : times;
    if (!eligibleTimes.length) return {...outcome('no_forecast', 'forecast_slots_expired'), coverage, issuedAt, source: {...KMA_SOURCE}, grid: {...input.expectedGrid}};
    const representative = [...eligibleTimes].sort((a, b) => Math.abs(a - noon) - Math.abs(b - noon) || a - b)[0];
    const values = new Map(dayItems.filter(item => item.ms === representative).map(item => [item.category, item.fcstValue]));
    const temp = finiteNumber(values.get('TMP'));
    const pop = finiteNumber(values.get('POP'));
    if (values.has('TMP') && temp === null) return outcome('invalid', 'invalid_temperature');
    if (values.has('POP') && pop === null) return outcome('invalid', 'invalid_precipitation_probability');
    if (pop != null && (pop < 0 || pop > 100)) return outcome('invalid', 'invalid_precipitation_probability');
    const sky = values.get('SKY');
    const pty = values.get('PTY');
    const skyNames = {'1': '맑음', '3': '구름많음', '4': '흐림'};
    const precipitationNames = {'1': '비', '2': '비 또는 눈', '3': '눈', '4': '소나기'};
    if (sky != null && !own(skyNames, String(sky))) return outcome('invalid', 'invalid_sky_code');
    if (pty != null && !own(precipitationNames, String(pty)) && String(pty) !== '0') return outcome('invalid', 'invalid_precipitation_type');
    const summary = precipitationNames[String(pty)] || skyNames[String(sky)] || null;
    const rawPcp = values.get('PCP');
    const pcp = rawPcp === '강수없음' ? 0 :
      typeof rawPcp === 'string' && /^\d+(?:\.\d+)?mm$/.test(rawPcp.trim()) ? Number(rawPcp.trim().slice(0, -2)) : finiteNumber(rawPcp);
    if (pcp !== null && pcp < 0) return outcome('invalid', 'invalid_precipitation_amount');
    if (temp === null && pop === null && pcp === null && summary === null) return outcome('invalid', 'no_supported_forecast_values');
    const earliest = times[0];
    const latest = times[times.length - 1] + HOUR_MS;
    return finish({
      forecastType: 'short_term', issuedAt, validFrom: kstLabel(earliest), validTo: kstLabel(latest),
      source: {...KMA_SOURCE}, grid: {...input.expectedGrid}, coverage,
      temperatureC: temp, precipitationProbabilityPercent: pop,
      precipitationType: pty == null ? null : String(pty) === '0' ? '없음' : precipitationNames[String(pty)],
      precipitationAmountMm: pcp, precipitationText: typeof rawPcp === 'string' ? safeText(rawPcp) : null,
      summary, validityMethod: 'kma_hourly_slot_range_inferred',
      evidence: {adapter: 'kma_vilage', sourceVerified: true, regionVerified: true,
        rawSummary: null, representativeAt: kstLabel(representative),
        countOnDate: dayItems.length, intervalMinutes: 60}
    });
  }

  // Proposed normalized forecast contract. The legacy summary-only route does
  // not contain enough metadata to be promoted to an actual forecast.
  if (object(payload.forecast)) {
    const f = payload.forecast;
    if (f.region != null && f.region !== region) return outcome('invalid', 'region_mismatch');
    if (f.region == null) return outcome('invalid', 'missing_forecast_region');
    if (f.date != null && f.date !== date) return outcome('invalid', 'date_mismatch');
    const src = safeSource(f.source || input.source);
    const temp = f.temperatureC == null ? null : finiteNumber(f.temperatureC);
    const pop = f.precipitationProbabilityPercent == null ? null : finiteNumber(f.precipitationProbabilityPercent);
    const amount = f.precipitationAmountMm == null ? null : finiteNumber(f.precipitationAmountMm);
    if ((f.temperatureC != null && temp === null) ||
        (f.precipitationProbabilityPercent != null && (pop === null || pop < 0 || pop > 100)) ||
        (f.precipitationAmountMm != null && (amount === null || amount < 0))) return outcome('invalid', 'invalid_forecast_measurement');
    const summary = safeText(f.summary);
    if (summary === null && temp === null && pop === null && amount === null) return outcome('invalid', 'no_forecast_values');
    return finish({
      forecastType: safeText(f.forecastType) || src?.type || null,
      issuedAt: f.issuedAt ?? null, validFrom: f.validFrom ?? null, validTo: f.validTo ?? null,
      source: src, grid: validGrid(f.grid) ? {...f.grid} : null,
      temperatureC: temp, precipitationProbabilityPercent: pop,
      precipitationAmountMm: amount, summary,
      validityMethod: 'provider_explicit',
      evidence: {adapter: 'normalized_forecast', sourceVerified: src !== null,
        regionVerified: true, rawSummary: null}
    });
  }
  if (own(payload, 'summary')) {
    return {...outcome('invalid', 'legacy_summary_unverifiable'),
      evidence: {...base.evidence, adapter: 'legacy_summary', rawSummary: safeText(payload.summary)}};
  }
  return outcome('invalid', 'unrecognized_payload');
}

module.exports = {normalizeWeather, weatherRequestKey, shouldApplyWeatherResponse,
  DEFAULT_FRESHNESS_POLICIES, KMA_SOURCE, STATUSES};
