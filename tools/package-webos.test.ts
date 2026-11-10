import { expect, test } from 'bun:test';
import { createPackageInfo } from './package-webos';

test('package metadata associates the app with its installed Luna service', () => {
  expect(
    createPackageInfo('com.biliwebos.app', '1.18.0', [
      'com.biliwebos.app.service',
    ]),
  ).toEqual({
    id: 'com.biliwebos.app',
    version: '1.18.0',
    app: 'com.biliwebos.app',
    services: ['com.biliwebos.app.service'],
  });
});

test('package metadata rejects a package without declared services', () => {
  expect(() => createPackageInfo('com.biliwebos.app', '1.18.0', [])).toThrow();
  expect(() => createPackageInfo('', '1.18.0', ['service'])).toThrow();
  expect(() => createPackageInfo('com.biliwebos.app', '', ['service'])).toThrow();
  expect(() => createPackageInfo('com.biliwebos.app', '1.18.0', [''])).toThrow();
});
