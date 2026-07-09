import type { Config } from 'jest';

/**
 * Config Jest séparée de jest.config.ts (tests unitaires, mockés, sans
 * Docker) — celle-ci démarre la vraie AppModule contre une base Postgres
 * réelle (docker-compose.yml, base ajvpay_test). Voir test/global-setup.ts
 * et test/env.setup.ts.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/test/env.setup.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30_000,
};

export default config;
