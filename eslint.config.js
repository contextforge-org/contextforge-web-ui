import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

// Load .prettierrc explicitly instead of letting eslint-plugin-prettier
// resolve it via its own cosmiconfig search, so eslint --fix always agrees
// with the prettier CLI.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prettierOptions = JSON.parse(fs.readFileSync(path.join(__dirname, ".prettierrc"), "utf8"));

export default tseslint.config(
  {
    ignores: [
      "src/generated",
      "dist",
      "build",
      "server/dist",
      "server/public",
      "playwright-report",
      "test-results",
    ],
  },
  {
    extends: [...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      prettier: prettierPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...prettierConfig.rules,

      // Prettier integration
      "prettier/prettier": ["error", prettierOptions],

      // Security: ban dangerouslySetInnerHTML — XSS vector
      "react/no-danger": "error",
      // Security: ban eval() — blocked by CSP too, but belt-and-suspenders
      "no-eval": "error",
      "no-implied-eval": "error",
      // Security: ban Function constructor — equivalent to eval
      "no-new-func": "error",

      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Allow `_`-prefixed locals to signal intentional discard (destructured
      // rest patterns that strip a key, unused catch bindings, etc).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    extends: [...tseslint.configs.recommended],
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      "prettier/prettier": ["error", prettierOptions],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    extends: [...tseslint.configs.recommended],
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      "prettier/prettier": ["error", prettierOptions],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // Allow `_`-prefixed locals to signal intentional discard (destructured
      // rest patterns that strip a key, unused catch bindings, etc).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
);
