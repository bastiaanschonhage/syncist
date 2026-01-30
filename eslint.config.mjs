import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        window: "readonly",
      },
    },
    rules: {
      // Allow Todoist as a brand name in UI text
      "obsidianmd/ui/sentence-case": ["warn", { brands: ["Todoist", "Inbox"] }],
      // Disable unsafe any rules for loadData/saveData which return any
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
]);
