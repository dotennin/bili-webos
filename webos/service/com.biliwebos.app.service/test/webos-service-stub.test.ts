import { expect, test } from 'bun:test';
import WebOSServiceStub from '../src/webos-service-stub.ts';

test('WebOSServiceStub stores registrations and invokes activity callbacks', () => {
  WebOSServiceStub.__instances.length = 0;
  const service = new WebOSServiceStub('com.biliwebos.test');
  let activityPayload = null;
  const handler = () => 'pong';

  service.activityManager.create('activity-1', (payload) => {
    activityPayload = payload;
  });
  service.register('ping', handler);

  expect(service.name).toBe('com.biliwebos.test');
  expect(service.handlers.ping).toBe(handler);
  expect(activityPayload).toEqual({});
  expect(WebOSServiceStub.__instances.at(-1)).toBe(service);
});
