import js from "@eslint/js";
import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "playwright-report/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { playwright },
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // The domain assertions live in assertions/GameAssertions.ts as
      // expectWinningResult/expectLosingResult/etc, not inline expect()
      // calls in every spec.
      "playwright/expect-expect": ["warn", { assertFunctionPatterns: ["^expect[A-Z]"] }],
    },
  },
  prettier,
);
