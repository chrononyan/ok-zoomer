module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: ["dist/", "node_modules/", "tmp/", "package-lock.json"],
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
  ],
  rules: {
    "prefer-const": "error",
  },
};
