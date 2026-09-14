/** Tests cover the pure accounting engine — no React Native runtime needed. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/lib/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { strict: true, esModuleInterop: true, types: ["jest", "node"] } },
    ],
  },
};
