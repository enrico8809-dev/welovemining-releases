/**
 * Covers the part of this app that isn't the shared engine: the file the books
 * live in. The engine's own tests run in wlm-accounting, against the same
 * sources this app imports.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/electron/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { strict: true, esModuleInterop: true, types: ["jest", "node"] } },
    ],
  },
};
