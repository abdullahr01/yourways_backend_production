/**
 * Smoke test for push notifications (Firebase FCM).
 *
 *   1. node main.js                         (in another terminal)
 *   2. node scripts/test_notifications.js
 *
 * Point it at staging instead with
 *   SMOKE_BASE=https://yourwaysbackendproduction-staging.up.railway.app
 * It refuses to run against the production URL.
 *
 * Optional:
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD  cover the admin test-push endpoint
 *   SMOKE_FCM_TOKEN   a real phone's FCM token — the phone should show a
 *                     "YourWays test notification" (needs FIREBASE_SERVICE_ACCOUNT
 *                     on the server and the admin login above)
 *
 * What it proves:
 *
 *   the server exposes /api/notifications
 *   → device-token registration validates token, platform and app, and a
 *     customer login can only register from the customer app
 *   → registering is idempotent, removing works once
 *   → the arrival endpoint needs a driver login
 *   → the test-push endpoint is admin-only, validates its input, and either
 *     sends (FCM configured) or answers 503 (not configured)
 *
 * Side effects: one test customer. Its fake device token is removed at the end.
 */
require('dotenv').config();

const BASE = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 5000}`;

let passed = 0;
let failed = 0;

const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};

const stamp = Date.now();
const email = `notify+${stamp}@yourways.test`;
const phone = `+4477009${String(stamp).slice(-5)}`;
const fakeToken = `smoke-test-token-${stamp}-${'x'.repeat(60)}`;

(async () => {
  console.log(`\nYourWays push notification smoke test → ${BASE}\n`);

  if (BASE.includes('production-production') && process.env.SMOKE_ALLOW_PRODUCTION !== '1') {
    console.error('This is the production URL — aborting (set SMOKE_ALLOW_PRODUCTION=1 to override)');
    process.exit(1);
  }

  // ——— 1. Server ———
  console.log('1) Server exposes the notifications API');
  const health = await call('GET', '/');
  check('health lists /api/notifications', health.body?.endpoints?.notifications === '/api/notifications', JSON.stringify(health.body?.endpoints));

  // ——— 2. Customer ———
  console.log('\n2) Register a test customer');
  const register = await call('POST', '/api/users/register', {
    body: { name: 'Notify Smoke User', email, phone, address: 'London' },
  });
  check('customer registered', register.status === 201, JSON.stringify(register.body));
  if (register.status !== 201) return finish();
  const token = register.body.data.token;
  const userId = register.body.data.user.id;

  // ——— 3. Device token rules ———
  console.log('\n3) Device token registration');
  const device = (body, auth = token) => call('POST', '/api/notifications/device-token', { token: auth, body });

  let r = await device({ token: fakeToken, platform: 'android', app: 'customer' }, null);
  check('no login → 401', r.status === 401, `status ${r.status}`);
  r = await device({ token: 'short', platform: 'android', app: 'customer' });
  check('token too short → 400', r.status === 400, `status ${r.status}`);
  r = await device({ token: fakeToken, platform: 'windows', app: 'customer' });
  check('unknown platform → 400', r.status === 400, `status ${r.status}`);
  r = await device({ token: fakeToken, platform: 'android', app: 'driver' });
  check('customer login from the driver app → 403', r.status === 403, `status ${r.status}`);
  r = await device({ token: fakeToken, platform: 'android', app: 'customer' });
  check('valid registration → 200', r.status === 200 && r.body?.data?.registered === true, JSON.stringify(r.body));
  r = await device({ token: fakeToken, platform: 'android', app: 'customer' });
  check('registering the same phone again → 200', r.status === 200, `status ${r.status}`);

  // ——— 4. Arrival endpoint ———
  console.log('\n4) Driver arrival endpoint');
  r = await call('POST', `/api/drivers/${userId}/orders/${userId}/arrived`, { body: { stage: 'pickup' } });
  check('no login → 401', r.status === 401, `status ${r.status}`);
  r = await call('POST', `/api/drivers/${userId}/orders/${userId}/arrived`, { token, body: { stage: 'pickup' } });
  check('customer login → 403', r.status === 403, `status ${r.status}`);

  // ——— 5. Admin test push ———
  console.log('\n5) Admin test push');
  r = await call('POST', '/api/notifications/test', { token, body: { recipientType: 'user', recipientId: userId } });
  check('customer login → 403', r.status === 403, `status ${r.status}`);

  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const login = await call('POST', '/api/admin/login', { body: { email: adminEmail, password: adminPassword } });
    const adminToken = login.body?.data?.token || null;
    check('admin logged in', Boolean(adminToken), `status ${login.status}`);

    if (adminToken) {
      const probe = await call('POST', '/api/notifications/test', {
        token: adminToken,
        body: { recipientType: 'user', recipientId: userId, dryRun: true },
      });
      const fcmOn = probe.status !== 503;
      console.log(`     (server reports FCM ${fcmOn ? 'configured' : 'NOT configured'})`);

      if (!fcmOn) {
        check('FCM not configured → 503 with a clear message', /not configured/i.test(probe.body?.error || ''), JSON.stringify(probe.body));
      } else {
        r = await call('POST', '/api/notifications/test', { token: adminToken, body: { recipientType: 'nobody', recipientId: userId } });
        check('bad recipientType → 400', r.status === 400, `status ${r.status}`);
        r = await call('POST', '/api/notifications/test', { token: adminToken, body: { recipientType: 'user', recipientId: 'abc' } });
        check('bad recipientId → 400', r.status === 400, `status ${r.status}`);
        // The fake token is rejected by FCM, so this proves the round trip and
        // the dead-token cleanup rather than a delivery.
        check('dry run to the test customer reached FCM', probe.status === 200 && ['sent', 'failed'].includes(probe.body?.data?.status), JSON.stringify(probe.body));

        if (process.env.SMOKE_FCM_TOKEN) {
          r = await call('POST', '/api/notifications/test', {
            token: adminToken,
            body: { token: process.env.SMOKE_FCM_TOKEN, body: `Smoke test ${new Date().toLocaleTimeString()}` },
          });
          check('real phone accepted the push (check the phone)', r.body?.data?.status === 'sent', JSON.stringify(r.body));
        } else {
          console.log('     (set SMOKE_FCM_TOKEN to send a real push to a phone)');
        }
      }
    }
  } else {
    console.log('     (admin checks skipped — set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD to include them)');
  }

  // ——— 6. Logout removes the device ———
  console.log('\n6) Removing the device token');
  r = await call('DELETE', '/api/notifications/device-token', { token, body: {} });
  check('missing token → 400', r.status === 400, `status ${r.status}`);
  r = await call('DELETE', '/api/notifications/device-token', { token, body: { token: fakeToken } });
  const removedNow = r.body?.data?.removed;
  check('remove → 200', r.status === 200, JSON.stringify(r.body));
  r = await call('DELETE', '/api/notifications/device-token', { token, body: { token: fakeToken } });
  check('second remove finds nothing', r.status === 200 && r.body?.data?.removed === false, JSON.stringify(r.body));
  if (removedNow === false) console.log('     (already gone — FCM reported the fake token as dead and it was cleaned up)');

  finish();
})().catch((err) => {
  console.error(`\nUNEXPECTED ERROR: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

function finish() {
  console.log(`\n${'-'.repeat(52)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log(`${'-'.repeat(52)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}
