import { expect, test } from 'bun:test';
import childProcess from 'node:child_process';
import path from 'node:path';

test('service package main can be loaded by a CommonJS loader', () => {
  const serviceRoot = path.join(import.meta.dir, '..');

  const result = childProcess.spawnSync(
    'node',
    [
      '-e',
      `
        process.chdir(${JSON.stringify(serviceRoot)});
        const path = require('node:path');
        const pkg = require(path.join(${JSON.stringify(serviceRoot)}, 'package.json'));
        require(path.join(${JSON.stringify(serviceRoot)}, pkg.main));
        setTimeout(() => process.exit(0), 50);
      `,
    ],
    {
      cwd: serviceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        BILI_SERVICE_DISABLE_NETWORK_SERVERS: '1',
      },
      timeout: 1000,
    },
  );

  expect(result.status).toBe(0);
});
