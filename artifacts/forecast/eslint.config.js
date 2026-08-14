import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tsParser,
    },
    linterOptions: {
      // Existing files reference @typescript-eslint/no-explicit-any in disable
      // comments; suppress "unknown rule" errors until that plugin is adopted.
      reportUnusedDisableDirectives: false,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
