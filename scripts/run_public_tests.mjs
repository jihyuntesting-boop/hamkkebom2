#!/usr/bin/env node
// Run the unit tests that also work in the public evaluation snapshot
// (jihyuntesting-boop/hamkkebom2). That snapshot only carries web/,
// scripts/build_core_modules.py, this runner and the files listed below, so
// every test here must:
//   - read only files under web/ (no docs/, tests/fixtures/ or internal scripts),
//   - need no API key or secret and make no external network request,
//   - contain no credential-like literal that the public sync scanner blocks.
// Selection evidence and the excluded tests are listed in
// docs/submission/CODE_CONVENTION.md (section "Tests").
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PUBLIC_TESTS = [
  "tests/accessibility_live.test.cjs",
  "tests/agent_aa_rich_facilities_ui.test.cjs",
  "tests/agent_aa_walking_provider.test.cjs",
  "tests/agent_r_naver_handoff.test.cjs",
  "tests/agent_t_public_toilets.test.cjs",
  "tests/agent_t_toilet_overlay.test.cjs",
  "tests/agent_t_toilet_pilot.test.cjs",
  "tests/agent_v_weather_reliability.test.cjs",
  "tests/agent_v_weather_ui_handoff.test.cjs",
  "tests/agent_x_rich_tour_integration.test.cjs",
  "tests/catalog_accessibility_integration.test.cjs",
  "tests/discovery-editorial.test.cjs",
  "tests/endpoints_unify_indoor_weathertext.test.cjs",
  "tests/finish_error_empty_box.test.cjs",
  "tests/frontend_accessibility_detail.test.cjs",
  "tests/frontend_family_share.test.cjs",
  "tests/frontend_itinerary_editor.test.cjs",
  "tests/frontend_map_center_search.test.cjs",
  "tests/frontend_map_lifecycle.test.cjs",
  "tests/frontend_place_exploration.test.cjs",
  "tests/frontend_replan.test.cjs",
  "tests/frontend_ui_polish.test.cjs",
  "tests/header_home_nav.test.cjs",
  "tests/hide_remaining_notices.test.cjs",
  "tests/home_photo_credit_compact.test.cjs",
  "tests/home_rich_discovery_hidden.test.cjs",
  "tests/illustration_system.test.cjs",
  "tests/itinerary_schema.test.cjs",
  "tests/legacy_browser_migration.test.cjs",
  "tests/mobility_recommendation.test.cjs",
  "tests/mvp_condition_replan.test.cjs",
  "tests/mvp_family_share_completion.test.cjs",
  "tests/mvp_map_completion.test.cjs",
  "tests/mvp_recommendation_flow.test.cjs",
  "tests/naver_provider_integration.test.cjs",
  "tests/place_photo_api_contract_q.test.cjs",
  "tests/planner_home_times.test.cjs",
  "tests/planner_rest_preferences.test.cjs",
  "tests/planner_route_button.test.cjs",
  "tests/planner_travel_preview.test.cjs",
  "tests/planner_trip_endpoints.test.cjs",
  "tests/rec01_input_contract.test.cjs",
  "tests/seasonal_recommendation.test.cjs",
  "tests/submission_local_restore.test.cjs",
  "tests/travel_date_time_window.test.cjs",
  "tests/weather_normalizer.test.cjs",
  "tests/weather_provider.test.cjs",
  "tests/weather_recommendation_options.test.cjs",
  "tests/weather_suggestions.test.cjs",
  "tests/weather_time_candidates.test.cjs",
  "tests/wizard_step_navigation.test.cjs",
];

// Opt-in live smoke tests are switched on by these variables; never pass them,
// nor anything that looks like a credential, to the public test processes.
const SENSITIVE_ENV = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)|_LIVE(_TEST)?$/i;

function main() {
  const missing = PUBLIC_TESTS.filter((file) => !existsSync(path.join(root, file)));
  if (missing.length) {
    console.error(
      `Missing public test files (check the public sync path list):\n  ${missing.join("\n  ")}`,
    );
    return 1;
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "hb-public-tests-"));
  const networkLog = path.join(workDir, "network.log");
  const guard = path.join(root, "scripts", "public_test_network_guard.cjs");
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!SENSITIVE_ENV.test(name)) env[name] = value;
  }
  env.HB_PUBLIC_TEST_NETWORK_LOG = networkLog;
  // NODE_OPTIONS reaches the per-file child processes that node --test spawns.
  env.NODE_OPTIONS = `--require ${JSON.stringify(guard)}`;

  console.log(`Node ${process.version}; public test files: ${PUBLIC_TESTS.length}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=spec", "--test-timeout=20000", ...PUBLIC_TESTS],
    { cwd: root, env, stdio: "inherit" },
  );

  let blocked = "";
  try {
    blocked = readFileSync(networkLog, "utf8").trim();
  } catch {
    blocked = "";
  }
  rmSync(workDir, { recursive: true, force: true });

  if (blocked) {
    console.error(`External network access attempted during public tests:\n${blocked}`);
    return 1;
  }
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  const code = result.status ?? 1;
  console.log(
    `Public test run: ${PUBLIC_TESTS.length} files, exit ${code}, external network attempts: 0`,
  );
  return code;
}

process.exitCode = main();
