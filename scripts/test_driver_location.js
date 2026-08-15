/**
 * End-to-end check of the two driver-location read endpoints.
 *
 *   1. node main.js                          (in another terminal)
 *   2. node scripts/test_driver_location.js
 *
 * Needs a Stripe **test** key (an order only exists once a booking is paid).
 * Creating a driver and assigning one to an order needs an admin, so set
 * SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD to cover those; without them the
 * script still runs everything a customer can reach and skips the rest.
 *
 * What it proves:
 *
 *   GET /api/drivers/:id/location
 *     needs a token, refuses one driver reading another driver's position,
 *     lets the admin read any driver, reports hasLocation=false before the
 *     first ping, and reports fresh coordinates with a small ageSeconds after
 *     POST /update-location
 *
 *   GET /api/orders/:id/driver-location
 *     returns driverAssigned=false (not an error) while the order is
 *     unassigned, returns the driver's live coordinates once assigned, never
 *     leaks the driverId, and 404s on an unknown order
 *
 * Side effects: two test drivers, one test customer, one booking, one order and
 * one test-mode Stripe payment. The order is cancelled at the end.
 */
require('dotenv').config();
const Stripe = require('stripe');

const BASE = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 5000}`;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let passed = 0;
let failed = 0;
let skipped = 0;

const skip = (label) => {
  skipped += 1;
  console.log(`  SKIP  ${label} (no admin credentials)`);
};

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
const phone = (suffix) => `+4477${String(stamp).slice(-7)}${suffix}`;
const email = (prefix) => `${prefix}+${stamp}@yourways.test`;

const LAT = 51.5074;
const LNG = -0.1278;

const finish = () => {
  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed === 0 ? 0 : 1);
};

(async () => {
  console.log(`\nYourWays driver-location endpoints test → ${BASE}\n`);

  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
    console.error('A Stripe TEST key is required in .env — aborting');
    process.exit(1);
  }

  // ——— 1. Admin ———
  console.log('1) Admin session');
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL || 'admin@yourways.test';
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'Admin123!';

  let adminToken = null;
  const login = await call('POST', '/api/admin/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  if (login.status === 200) {
    adminToken = login.body?.data?.token;
  } else {
    const bootstrap = await call('POST', '/api/admin/register', {
      body: { name: 'Location Test Admin', email: adminEmail, password: adminPassword },
    });
    adminToken = bootstrap.body?.data?.token || null;
  }
  if (adminToken) {
    check('admin token obtained', true);
  } else {
    console.log('  NOTE  no admin session — driver-side checks will be skipped');
    console.log('        set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD to run them');
  }

  // ——— 2. Two drivers ———
  console.log('\n2) Create + approve + log in two drivers');
  const makeDriver = async (label, suffix) => {
    const created = await call('POST', '/api/admin/drivers', {
      token: adminToken,
      body: {
        name: `Location Test Driver ${label}`,
        email: email(`locdriver${suffix}`),
        phone: phone(suffix),
        profilePictureUrl: 'https://example.test/photo.png',
        licenseNumber: `DL${stamp}${suffix}`,
        vehicleType: 'Van',
        vehicleNumber: `YW${suffix}${String(stamp).slice(-4)}`,
      },
    });
    const id = created.body?.data?.id || created.body?.data?.driver?.id;
    if (id) await call('PUT', `/api/admin/drivers/${id}/approve`, { token: adminToken });
    const session = await call('POST', '/api/drivers/login', { body: { phone: phone(suffix) } });
    return { created, id, token: session.body?.data?.token || null };
  };

  let driverA = { id: null, token: null };
  let driverB = { token: null };
  if (adminToken) {
    driverA = await makeDriver('A', '1');
    driverB = await makeDriver('B', '2');
    check('driver A ready', Boolean(driverA.id && driverA.token), JSON.stringify(driverA.created.body));
    check('driver B ready', Boolean(driverB.token));
    if (!driverA.id || !driverA.token || !driverB.token) return finish();
  } else {
    skip('two drivers');
  }

  // ——— 3. GET /api/drivers/:id/location ———
  console.log('\n3) GET /api/drivers/:id/location');
  const someDriverId = driverA.id || '00000000-0000-0000-0000-000000000000';
  const anon = await call('GET', `/api/drivers/${someDriverId}/location`);
  check(
    'no token is rejected before the id is even looked up (a driver is not publicly followable)',
    anon.status === 401,
    `got ${anon.status}`
  );

  if (!adminToken) {
    skip('driver-side location reads');
    return runCustomerChecks({ adminToken, driverA });
  }

  const crossDriver = await call('GET', `/api/drivers/${driverA.id}/location`, { token: driverB.token });
  check('driver B cannot read driver A', crossDriver.status === 403, `got ${crossDriver.status}`);

  const beforePing = await call('GET', `/api/drivers/${driverA.id}/location`, { token: driverA.token });
  check('driver reads their own row', beforePing.status === 200, JSON.stringify(beforePing.body));
  check(
    'a driver that never pinged reports hasLocation=false, not an error',
    beforePing.body?.data?.hasLocation === false && beforePing.body?.data?.latitude === null,
    JSON.stringify(beforePing.body?.data)
  );
  check(
    'and is flagged stale so the map draws no marker',
    beforePing.body?.data?.isStale === true,
    JSON.stringify(beforePing.body?.data)
  );

  console.log('   …driver pings its position');
  const ping = await call('POST', `/api/drivers/${driverA.id}/update-location`, {
    token: driverA.token,
    body: { latitude: LAT, longitude: LNG },
  });
  check('location update accepted', ping.status === 200, JSON.stringify(ping.body));

  const afterPing = await call('GET', `/api/drivers/${driverA.id}/location`, { token: driverA.token });
  const loc = afterPing.body?.data || {};
  check('the ping is readable back', afterPing.status === 200 && loc.hasLocation === true, JSON.stringify(loc));
  check(
    'coordinates match what was sent',
    loc.latitude === LAT && loc.longitude === LNG,
    `got ${loc.latitude},${loc.longitude}`
  );
  check('a fresh fix is not stale', loc.isStale === false, JSON.stringify(loc));
  check(
    'ageSeconds reflects a just-now fix',
    typeof loc.ageSeconds === 'number' && loc.ageSeconds < 30,
    `got ${loc.ageSeconds}`
  );
  check(
    'the Realtime channel is advertised so clients can push instead of poll',
    loc.realtimeChannel === `driver-${driverA.id}`,
    String(loc.realtimeChannel)
  );

  const adminRead = await call('GET', `/api/drivers/${driverA.id}/location`, { token: adminToken });
  check(
    'admin can read any driver (fleet map)',
    adminRead.status === 200 && adminRead.body?.data?.latitude === LAT,
    JSON.stringify(adminRead.body?.data)
  );

  return runCustomerChecks({ adminToken, driverA });
})().catch((err) => {
  console.error(`\nUnexpected failure: ${err.message}`);
  process.exit(1);
});

/**
 * Everything reachable from the customer's tracking screen. Split out so it
 * still runs when there is no admin session to create/assign a driver with —
 * an unassigned order exercises most of the endpoint anyway.
 */
async function runCustomerChecks({ adminToken, driverA }) {
  // ——— 4. A paid order ———
  console.log('\n4) Customer books and pays so an order exists');
  const register = await call('POST', '/api/users/register', {
    body: { name: 'Location Test User', email: email('locuser'), phone: phone('0'), address: 'London' },
  });
  const userToken = register.body?.data?.token;
  const userId = register.body?.data?.user?.id;
  check('customer registered', register.status === 201, JSON.stringify(register.body));
  if (!userToken) return finish();

  const booking = await call('POST', '/api/bookings/create', {
    token: userToken,
    body: {
      userId,
      collectionAddress: '42 Baker Street, Flat 4',
      collectionPostcode: 'SW1A 1AA',
      deliveryAddress: '10 Downing Street',
      deliveryPostcode: 'E1 6AN',
      fullName: 'Location Test User',
      email: email('locuser'),
      mobileNumber: phone('0'),
      acceptTerms: true,
      manpowerRequired: '2 Man Team',
      items: [
        {
          itemId: '1',
          category: 'Bedroom - Beds & Mattresses',
          itemName: 'Double Bed & Mattress',
          quantity: 1,
          modifiers: {},
        },
      ],
    },
  });
  const bookingId = booking.body?.data?.id;
  check('booking created', booking.status === 201, JSON.stringify(booking.body));
  if (!bookingId) return finish();

  await call('POST', `/api/bookings/${bookingId}/calculate-price`, { token: userToken });
  const intent = await call('POST', '/api/payments/create-intent', { token: userToken, body: { bookingId } });
  const { paymentIntentId } = intent.body?.data || {};
  if (!paymentIntentId) {
    check('payment intent created', false, JSON.stringify(intent.body));
    return finish();
  }
  await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: 'pm_card_visa',
    return_url: 'https://yourways.test/return',
  });
  const confirm = await call('POST', '/api/payments/confirm', { token: userToken, body: { paymentIntentId } });
  // `_id` is the UUID the order endpoints take; `id` is the human ORD-… code.
  const orderId = confirm.body?.data?.order?._id;
  check('paid order created', Boolean(orderId), JSON.stringify(confirm.body?.data?.order));
  if (!orderId) return finish();

  // ——— 5. GET /api/orders/:id/driver-location ———
  console.log('\n5) GET /api/orders/:id/driver-location');
  const unassigned = await call('GET', `/api/orders/${orderId}/driver-location`, { token: userToken });
  check('unassigned order answers 200, not an error', unassigned.status === 200, JSON.stringify(unassigned.body));
  check(
    'it says driverAssigned=false with no location',
    unassigned.body?.data?.driverAssigned === false && unassigned.body?.data?.location === null,
    JSON.stringify(unassigned.body?.data)
  );

  if (!adminToken || !driverA.id) {
    skip('assigned-order location reads');
    return cleanup(orderId, userToken);
  }

  const assign = await call('POST', `/api/admin/orders/${orderId}/assign-driver`, {
    token: adminToken,
    body: { driverId: driverA.id },
  });
  check('driver assigned to the order', assign.status === 200, JSON.stringify(assign.body));

  const assigned = await call('GET', `/api/orders/${orderId}/driver-location`, { token: userToken });
  const orderLoc = assigned.body?.data?.location || {};
  check(
    'the customer now gets the driver’s live position',
    assigned.body?.data?.driverAssigned === true && orderLoc.latitude === LAT && orderLoc.longitude === LNG,
    JSON.stringify(assigned.body?.data)
  );
  check('freshness travels with it', orderLoc.isStale === false && typeof orderLoc.ageSeconds === 'number');
  check(
    'the driverId is NOT exposed to the customer',
    orderLoc.driverId === undefined && orderLoc.realtimeChannel === undefined,
    JSON.stringify(orderLoc)
  );
  check(
    'the order Realtime channel is still returned for status pushes',
    assigned.body?.data?.realtimeChannel === `order-${orderId}`,
    String(assigned.body?.data?.realtimeChannel)
  );

  const moved = await call('POST', `/api/drivers/${driverA.id}/update-location`, {
    token: driverA.token,
    body: { latitude: 52.4862, longitude: -1.8904 },
  });
  const afterMove = await call('GET', `/api/orders/${orderId}/driver-location`, { token: userToken });
  check(
    'a later ping is visible on the next poll (the marker moves)',
    moved.status === 200 && afterMove.body?.data?.location?.latitude === 52.4862,
    JSON.stringify(afterMove.body?.data?.location)
  );

  return cleanup(orderId, userToken);
}

async function cleanup(orderId, userToken) {
  const missing = await call('GET', '/api/orders/00000000-0000-0000-0000-000000000000/driver-location');
  check('unknown order is 404', missing.status === 404, `got ${missing.status}`);

  // ——— 6. Cleanup ———
  console.log('\n6) Cleanup');
  const cancelled = await call('POST', `/api/orders/${orderId}/cancel`, {
    token: userToken,
    body: { cancellationReason: 'location endpoint test cleanup' },
  });
  check('test order cancelled', cancelled.status === 200, JSON.stringify(cancelled.body));

  finish();
}
