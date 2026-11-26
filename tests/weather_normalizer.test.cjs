'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeWeather, weatherRequestKey, shouldApplyWeatherResponse,
  KMA_SOURCE, DEFAULT_FRESHNESS_POLICIES, STATUSES
} = require('../web/server/weather-normalizer.cjs');

// Observed legacy adapter: tests/fixtures/legacy-api-observed.json (2026-11-23).
const LEGACY_OBSERVED = {mode: 'live', summary: '기온 1°C · 강수확률 0%'};
const NOW = new Date('2026-11-24T00:30:00.000Z'); // 09:30 KST
const source = {name: '기상청 단기예보 조회서비스', type: 'kma_short_term', url: KMA_SOURCE.url};
const grid = {nx: 60, ny: 127}; // 서울시청 인근 격자의 시험용 값; 실제 목적지 매핑 미검증
const options = (payload, extra = {}) => ({region: '서울', date: '2026-11-24', payload, now: NOW, ...extra});
const validForecast = (fields = {}) => ({forecast: {
  region: '서울', date: '2026-11-24', forecastType: 'short_term', source,
  issuedAt: '2026-11-24T08:00:00+09:00',
  validFrom: '2026-11-24T09:00:00+09:00',
  validTo: '2026-11-24T18:00:00+09:00',
  temperatureC: 7, precipitationProbabilityPercent: 0, summary: '맑음',
  ...fields
}});
const item = (category, fcstValue, fields = {}) => ({
  baseDate: '20261124', baseTime: '0800',
  fcstDate: '20261124', fcstTime: '1200', nx: '60', ny: '127',
  category, fcstValue, ...fields
});
const kma = (items = [item('TMP', '7'), item('POP', '30'), item('SKY', '3'), item('PTY', '0'), item('PCP', '1mm 미만')], count = items.length) => ({
  response: {header: {resultCode: '00', resultMsg: 'NORMAL_SERVICE'},
    body: {totalCount: count, items: {item: items}}}
});

// Requirement 1: normal official short-term forecast
// Note: KMA request's nx/ny are supplied by a validated caller mapping, not inferred from region name.
test('1. KMA getVilageFcst: parses issue, hourly validity, source, grid, values', () => {
  const result = normalizeWeather(options(kma(), {expectedGrid: grid, requestId: 8}));
  assert.equal(result.status, 'available');
  assert.equal(result.issuedAt, '2026-11-24T08:00:00+09:00');
  assert.equal(result.validFrom, '2026-11-24T12:00:00+09:00');
  assert.equal(result.validTo, '2026-11-24T13:00:00+09:00');
  assert.deepEqual(result.source, source);
  assert.deepEqual(result.grid, grid);
  assert.equal(result.temperatureC, 7);
  assert.equal(result.precipitationProbabilityPercent, 30);
  assert.equal(result.precipitationAmountMm, null); // 1mm 미만 is not exact 0 or 1
  assert.equal(result.precipitationText, '1mm 미만');
  assert.equal(result.summary, '구름많음');
  assert.equal(result.evidence.representativeAt, '2026-11-24T12:00:00+09:00');
  assert.equal(result.evidence.intervalMinutes, 60);
  assert.equal(result.requestId, 8);
});

test('2. Missing issuedAt cannot be manufactured from checkedAt', () => {
  const result = normalizeWeather(options(validForecast({issuedAt: null})));
  assert.equal(result.status, 'invalid');
  assert.equal(result.issuedAt, null);
  assert.equal(result.reason, 'missing_or_invalid_forecast_time');
  assert.equal(result.summary, null);
  assert.equal(result.checkedAt, NOW.toISOString());
});

test('3. Invalid travel dates and leap day', () => {
  for (const date of ['2026-02-29', '2026-11-31', '2026-13-01', '2026-11-24T00:00Z', 'abc']) {
    assert.equal(normalizeWeather(options(kma(), {date, expectedGrid: grid})).reason, 'invalid_travel_date');
  }
  assert.notEqual(normalizeWeather(options({status: 'no_forecast'}, {date: '2028-02-29'})).status, 'invalid');
});

test('4. Different forecast validity day => no_forecast, not sunny', () => {
  const result = normalizeWeather(options(validForecast({validFrom: '2026-11-25T00:00:00+09:00', validTo: '2026-11-25T12:00:00+09:00'})));
  assert.equal(result.status, 'no_forecast');
  assert.equal(result.summary, null);
});

test('5. Old issue time with matching future validity => stale, with evidence', () => {
  const result = normalizeWeather(options(validForecast({issuedAt: '2026-11-23T23:00:00+09:00'})));
  assert.equal(result.status, 'stale');
  assert.equal(result.issuedAt, '2026-11-23T23:00:00+09:00');
  assert.equal(result.freshnessPolicy.maxAgeMinutes, DEFAULT_FRESHNESS_POLICIES.kma_short_term.maxAgeMinutes);
  assert.equal(result.freshnessPolicy.authority, 'hamkkebom_provisional');
});

test('6. Network, HTTP and provider errors are not empty forecasts', () => {
  assert.equal(normalizeWeather(options(null, {error: new Error('ECONNRESET')})).status, 'error');
  assert.equal(normalizeWeather(options({summary: ''}, {httpStatus: 429})).status, 'error');
  const provider = kma(); provider.response.header.resultCode = '22';
  assert.equal(normalizeWeather(options(provider, {expectedGrid: grid})).reason, 'provider_result_code');
  assert.equal(normalizeWeather(options({error: 'gateway_failed'})).status, 'error');
});

test('7. Empty confirmed KMA response => no_forecast', () => {
  const zero = kma([], 0);
  assert.equal(normalizeWeather(options(zero, {expectedGrid: grid})).status, 'no_forecast');
  assert.equal(normalizeWeather(options({forecasts: []})).status, 'no_forecast');
  assert.equal(normalizeWeather(options({status: 'no_forecast'})).status, 'no_forecast');
});

test('8. Region mismatch or unrelated grid cannot be accepted', () => {
  assert.equal(normalizeWeather(options(validForecast({region: '경기'}))).reason, 'region_mismatch');
  assert.equal(normalizeWeather(options(kma(), {expectedGrid: {nx: 61, ny: 127}})).reason, 'region_grid_mismatch');
  assert.equal(normalizeWeather(options(kma())).reason, 'missing_region_grid_mapping');
});

test('9. KST midnight inclusion, ending boundary exclusion, and UTC conversion', () => {
  const start = '2026-11-23T15:00:00Z'; // KST 24th 00:00
  const oneMinute = '2026-11-23T15:01:00Z';
  const atStart = normalizeWeather(options(validForecast({issuedAt: '2026-11-23T23:00:00+09:00', validFrom: start, validTo: oneMinute}), {now: new Date('2026-11-23T15:10:00Z')}));
  assert.equal(atStart.status, 'available');
  const atEnd = normalizeWeather(options(validForecast({issuedAt: '2026-11-23T23:00:00+09:00', validFrom: '2026-11-23T14:00:00Z', validTo: start}), {now: new Date('2026-11-23T15:10:00Z')}));
  assert.equal(atEnd.status, 'no_forecast');
  const nextDay = normalizeWeather(options(validForecast({validFrom: '2026-11-24T15:00:00Z', validTo: '2026-11-24T16:00:00Z'})));
  assert.equal(nextDay.status, 'no_forecast');
});

test('10. Missing source blocks available status', () => {
  const result = normalizeWeather(options(validForecast({source: null})));
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'missing_source');
  assert.equal(result.source, null);
});

test('11. Unexpected and malformed API payload are invalid, not 0 records', () => {
  for (const payload of [null, [], 'ok', {}, {response: {header: {resultCode: '00'}}}, {response: {header: {resultCode: '00'}, body: {totalCount: 4}}}]) {
    assert.equal(normalizeWeather(options(payload)).status, 'invalid');
  }
});

test('12. Observed legacy summary-only response cannot become sunny / available', () => {
  const result = normalizeWeather(options(LEGACY_OBSERVED));
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'legacy_summary_unverifiable');
  assert.equal(result.issuedAt, null);
  assert.equal(result.validFrom, null);
  assert.equal(result.summary, null);
  assert.equal(result.evidence.rawSummary, LEGACY_OBSERVED.summary);
  assert.notEqual(result.summary, '맑음');
  const empty = normalizeWeather(options({summary: '선택 날짜 단기예보 없음'}));
  assert.notEqual(empty.status, 'available');
});

test('13. Explicit provider-supported coverage outside requested date', () => {
  const result = normalizeWeather(options(kma(), {expectedGrid: grid, supportedWindow: {from: '2026-11-25', through: '2026-11-27'}}));
  assert.equal(result.status, 'no_forecast');
  assert.equal(result.reason, 'outside_supported_window');
  assert.deepEqual(result.coverage, {from: '2026-11-25', through: '2026-11-27', method: 'caller_supplied'});
});

test('14. App only supports selected Seoul/Gyeonggi region names', () => {
  assert.equal(normalizeWeather(options(kma(), {region: '부산'})).reason, 'unsupported_region');
  assert.equal(normalizeWeather(options(kma(), {region: null})).status, 'invalid');
});

test('15. Inverted validity or issue after validity => invalid', () => {
  assert.equal(normalizeWeather(options(validForecast({validFrom: '2026-11-24T18:00:00+09:00', validTo: '2026-11-24T09:00:00+09:00'}))).reason, 'contradictory_forecast_time');
  assert.equal(normalizeWeather(options(validForecast({issuedAt: '2026-11-24T19:00:00+09:00'}))).reason, 'contradictory_forecast_time');
});

test('16. Future issuance outside declared clock tolerance => invalid', () => {
  assert.equal(normalizeWeather(options(validForecast({issuedAt: '2026-11-24T12:00:00+09:00'}))).reason, 'future_issue_time');
});

test('17. Request ID plus region/date key protects against stale responses', () => {
  const current = {requestId: 12, requestKey: weatherRequestKey('서울', '2026-11-25')};
  assert.equal(shouldApplyWeatherResponse(current, {requestId: 11, requestKey: current.requestKey}), false);
  assert.equal(shouldApplyWeatherResponse(current, {requestId: 12, requestKey: weatherRequestKey('서울', '2026-11-24')}), false);
  assert.equal(shouldApplyWeatherResponse(current, {...current}), true);
  assert.equal(shouldApplyWeatherResponse(current, {requestKey: current.requestKey}), false);
});

test('18. KMA invalid publication/forecast dates or mixed bases => invalid', () => {
  const invalid = kma([item('TMP', '1', {baseTime: '2460'})]);
  assert.equal(normalizeWeather(options(invalid, {expectedGrid: grid})).reason, 'invalid_kma_item_time');
  const mixed = kma([item('TMP', '1'), item('POP', '20', {baseTime: '0500'})]);
  assert.equal(normalizeWeather(options(mixed, {expectedGrid: grid})).reason, 'mixed_issue_times');
});

test('19. Precipitation data range and non-numeric fields', () => {
  assert.equal(normalizeWeather(options(validForecast({precipitationProbabilityPercent: 110}))).reason, 'invalid_forecast_measurement');
  assert.equal(normalizeWeather(options(validForecast({temperatureC: 'seven'}))).reason, 'invalid_forecast_measurement');
  assert.equal(normalizeWeather(options(kma([item('POP', '110')]), {expectedGrid: grid})).reason, 'invalid_precipitation_probability');
});

test('20. KMA no sky category + PTY=0 must not imply sunny', () => {
  const result = normalizeWeather(options(kma([item('POP', '0'), item('PTY', '0')]), {expectedGrid: grid}));
  assert.equal(result.status, 'available');
  assert.equal(result.precipitationProbabilityPercent, 0);
  assert.equal(result.summary, null);
});

test('21. KMA no matching date only with complete page => no_forecast', () => {
  const items = [item('TMP', '2', {fcstDate: '20261125'})];
  assert.equal(normalizeWeather(options(kma(items), {expectedGrid: grid})).status, 'no_forecast');
  assert.equal(normalizeWeather(options(kma(items, 100), {expectedGrid: grid})).reason, 'incomplete_kma_page');
});

test('22. Unknown forecast provider policy does not claim freshness', () => {
  const f = validForecast({source: {name: 'example provider', type: 'example', url: 'https://example.org'}});
  assert.equal(normalizeWeather(options(f)).reason, 'freshness_policy_missing_or_invalid');
  assert.equal(normalizeWeather(options(f, {freshnessPolicy: {maxAgeMinutes: 120, clockSkewMinutes: 0}})).status, 'available');
});

test('23. Explicit zero measurement is retained, unknown is null', () => {
  const forecast = validForecast({temperatureC: 0, precipitationProbabilityPercent: 0, precipitationAmountMm: 0, summary: null});
  const result = normalizeWeather(options(forecast));
  assert.equal(result.status, 'available');
  assert.equal(result.temperatureC, 0);
  assert.equal(result.precipitationAmountMm, 0);
  assert.equal(result.summary, null);
});

test('24. Hourly KMA weather uses one representative slot, not values mixed across hours', () => {
  const result = normalizeWeather(options(kma([
    item('TMP', '1', {fcstTime: '0900'}), item('POP', '20', {fcstTime: '0900'}),
    item('TMP', '7', {fcstTime: '1200'}), item('SKY', '1', {fcstTime: '1200'})
  ]), {expectedGrid: grid}));
  assert.equal(result.status, 'available');
  assert.equal(result.temperatureC, 7);
  assert.equal(result.precipitationProbabilityPercent, null);
  assert.equal(result.summary, '맑음');
  assert.equal(result.validFrom, '2026-11-24T09:00:00+09:00');
  assert.equal(result.validTo, '2026-11-24T13:00:00+09:00');
});

test('25. API response contract distinguishes invalid HTTP status and bad time format', () => {
  assert.equal(normalizeWeather(options(validForecast(), {httpStatus: 200})).status, 'available');
  assert.equal(normalizeWeather(options(validForecast(), {httpStatus: 502})).status, 'error');
  assert.equal(normalizeWeather(options(validForecast({validFrom: '2026-11-24T09:00:00'}))).reason, 'missing_or_invalid_forecast_time');
  assert.deepEqual(STATUSES, ['available', 'no_forecast', 'stale', 'error', 'invalid']);
});

test('hourly forecast preserves actual complete slots; gaps and stale data never become dry hours',()=>{
 const rows=['1000','1100','1200'].flatMap(fcstTime=>[
  item('TMP','7',{fcstTime}),item('POP',fcstTime==='1100'?'80':'10',{fcstTime}),
  ...(fcstTime==='1200'?[]:[item('PTY',fcstTime==='1100'?'1':'0',{fcstTime})])
 ]);
 const result=normalizeWeather(options(kma(rows),{expectedGrid:grid}));
 assert.equal(result.status,'available');assert.equal(result.hourly.length,2);
 assert.equal(result.hourly[0].at,'2026-11-24T10:00:00+09:00');
 assert.equal(result.hourly[1].precipitationType,'비');
 const stale=normalizeWeather(options(kma(rows),{expectedGrid:grid,now:new Date('2026-11-24T04:30:00Z')}));
 assert.equal(stale.status,'stale');assert.deepEqual(stale.hourly,[]);
});
