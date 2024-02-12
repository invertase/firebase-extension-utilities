const packageJson = require("./package.json");

module.exports = {
  name: packageJson.name,
  displayName: packageJson.name,
  preset: "ts-jest",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "firebase-admin/eventarc":
      "<rootDir>/node_modules/firebase-admin/lib/eventarc",
    "firebase-admin/auth": "<rootDir>/node_modules/firebase-admin/lib/auth",
    "firebase-admin/app": "<rootDir>/node_modules/firebase-admin/lib/app",
    "firebase-admin/database":
      "<rootDir>/node_modules/firebase-admin/lib/database",
    "firebase-admin/firestore":
      "<rootDir>/node_modules/firebase-admin/lib/firestore",
    "firebase-admin/functions":
      "<rootDir>/node_modules/firebase-admin/lib/functions",
    "firebase-functions/v2": "<rootDir>/node_modules/firebase-functions/lib/v2",
    "firebase-admin/extensions":
      "<rootDir>/node_modules/firebase-admin/lib/extensions",
  },
};
