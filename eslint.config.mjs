// ESLint flat config for HAMKKEBOM.
// Goal: catch real bugs (undefined names, unreachable code, duplicate keys)
// in the existing code without a mass rewrite. Style is not enforced here.
// See docs/submission/CODE_CONVENTION.md for the reasoning behind each choice.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "qa-unit-results/**",
      "qa-screenshots/**",
      ".qa-venv/**",
      // Edit-time fragments of one shared IIFE; not parseable on their own.
      // They are linted through the generated bundle 00-app-core.js.
      "web/assets/core-src/**",
    ],
  },
  js.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // Kept as bug detectors but reported as warnings so legacy code passes.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-useless-assignment": "warn",
      // Style-only findings: visible, never blocking.
      "no-useless-escape": "warn",
      "no-regex-spaces": "warn",
      // Input validators intentionally reject C0 control characters
      // (/[\u0000-\u001f\u007f]/) before text reaches the UI or storage.
      "no-control-regex": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Classic browser scripts loaded by web/index.html and web/migration.html.
    // Some also export for Node tests behind `typeof module` guards (UMD style).
    files: ["web/assets/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly",
      },
    },
  },
  {
    // Generated bundle: later feature layers deliberately wrap earlier
    // functions (e.g. `const oldView = plan; plan = function () {...}`).
    files: ["web/assets/scripts/00-app-core.js"],
    rules: {
      "no-func-assign": "warn",
    },
  },
  {
    // Tests build deliberately odd inputs (constant conditions, exact
    // whitespace in source-matching regexes).
    files: ["tests/**"],
    rules: {
      "no-constant-condition": "warn",
      "no-constant-binary-expression": "warn",
    },
  },
  {
    // Vercel serverless handlers (CommonJS) and server helpers.
    files: ["web/api/**/*.js", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
