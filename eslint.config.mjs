import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        FormData: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      // 기본 안전 룰
      // smart: `== null` (null/undefined 동시 비교)는 허용 (관용적 패턴)
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "warn",

      // TypeScript
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // Next.js 핵심 룰
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-img-element": "warn",
      "@next/next/no-sync-scripts": "error",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".vercel/**",
      "_archive/**",
      "scripts/**",
      "supabase/migrations/**",
      "public/**",
      "*.config.{js,mjs,ts}",
      "**/*.d.ts",
    ],
  },
];
