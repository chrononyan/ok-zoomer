module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: ["!.*.cjs", "!.*.js", "!package.json"],
  plugins: ["json-files", "simple-import-sort"],
  extends: [
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:node/recommended",
    "plugin:prettier/recommended",
  ],
  rules: {
    "no-process-exit": "off",
    "no-prototype-builtins": "off",
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_$",
      },
    ],
    "prefer-const": "error",
    "json-files/sort-package-json": "error",
    // rule was last updated 2019, not really a concern for Node >= 16
    "node/no-unsupported-features/es-syntax": "off",
  },
};
