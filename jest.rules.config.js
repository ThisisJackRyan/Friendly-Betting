// Firestore rules tests. They need the emulator, so they only run through
// `npm run test:rules` (firebase emulators:exec), never in `npm test`.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/rules/**/*.test.js'],
  testTimeout: 20000,
};
