import type { Linter } from "eslint";
import nodePlugin from "eslint-plugin-n";
import { defineConfig } from "eslint/config";

const nodeFlatRecommended = nodePlugin.configs![
  "flat/recommended"
] as Linter.Config;

export const honoConfig = defineConfig(nodeFlatRecommended, {
  files: ["**/*.js", "**/*.ts", "**/*.tsx"],
  languageOptions: {
    globals: {
      fetch: "readonly",
      Response: "readonly",
      Request: "readonly",
      addEventListener: "readonly",
    },
  },
  rules: {
    "no-debugger": "error",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-process-exit": "off",
    "no-useless-escape": "off",
    "prefer-const": ["warn", { destructuring: "all" }],

    "n/no-missing-import": "off",
    "n/no-missing-require": "off",
    "n/no-deprecated-api": "off",
    "n/no-unpublished-import": "off",
    "n/no-unpublished-require": "off",
    "n/no-unsupported-features/es-syntax": "off",
    "n/no-unsupported-features/node-builtins": "off",

    "@typescript-eslint/no-empty-object-type": "off",
    "@typescript-eslint/no-unsafe-function-type": "off",
    "@typescript-eslint/no-empty-function": [
      "error",
      { allow: ["arrowFunctions"] },
    ],
    "@typescript-eslint/no-unused-expressions": "off",
    "@typescript-eslint/no-empty-interface": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-inferrable-types": "off",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-var-requires": "off",

    "@typescript-eslint/no-base-to-string": [
      "error",
      {
        ignoredTypeNames: ["Error", "RegExp", "URL", "URLSearchParams"],
      },
    ],
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      {
        allow: [{ name: ["Error", "URL", "URLSearchParams"], from: "lib" }],
        allowAny: true,
        allowBoolean: true,
        allowNullish: true,
        allowNumber: true,
        allowRegExp: true,
      },
    ],

    curly: ["error", "all"],
  },
});
