/**
 * End-to-end check of the image upload flow.
 *
 *   1. Apply sql/008_storage_buckets.sql in the Supabase SQL editor
 *   2. node main.js                     (in another terminal)
 *   3. node scripts/test_upload_flow.js
 *
 * Admin credentials come from SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD. If no
 * admin exists yet the script bootstraps the first one.
 *
 * It walks the real flow for both buckets:
 *
 *   admin uploads a driver photo → public URL is fetchable → driver created
 *   customer books + pays → order created → admin assigns the driver
 *   driver uploads pickup/delivery proof → private keys returned
 *   → the raw key is NOT publicly readable
 *   → complete-pickup/complete-delivery accept the keys and reject foreign ones
 *   → tracking + order history hand back short-lived signed URLs that work
 *   → GET /api/images/orders/:id (and the list endpoints) return the same
 *     pictures as { url, expiresAt }, and reject callers who don't own the order
 *
 * Side effects: two test drivers, one test customer, one booking, one order and
 * one test-mode Stripe payment. Nothing is charged for real.
 */
require('dotenv').config();
const Stripe = require('stripe');

const BASE = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 5000}`;
const SUPABASE_URL = process.env.SUPABASE_URL;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Smallest valid 1x1 PNG. Real bytes matter: the upload endpoint sniffs magic
// numbers rather than trusting the declared Content-Type.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

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

/** Multipart POST. `files` is [{ buffer, name, type }]. */
const upload = async (path, files, { token, field = 'files' } = {}) => {
  const form = new FormData();
  for (const file of files) {
    form.append(field, new Blob([file.buffer], { type: file.type }), file.name);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};

const headStatus = async (url) => {
  try {
    const res = await fetch(url);
    return res.status;
  } catch (err) {
    return `network error: ${err.message}`;
  }
};

const stamp = Date.now();
const phone = (n) => `+4477${String(stamp).slice(-7)}${n}`;

(async () => {
  console.log(`\nYourWays image upload flow test → ${BASE}\n`);

  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
    console.error('A Stripe TEST key is required in .env — aborting');
    process.exit(1);
  }

  // ——— 0. Preflight ———
  console.log('0) Preflight');
  const limits = await call('GET', '/api/uploads/limits');
  check(
    'GET /api/uploads/limits reports the server-side rules',
    limits.status === 200 && limits.body?.data?.allowedMimeTypes?.includes('image/png'),
    JSON.stringify(limits.body)
  );

  // ——— 1. Admin ———
  console.log('\n1) Admin session');
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL || 'admin@yourways.test';
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'Admin123!';

  let adminToken = null;
  const login = await call('POST', '/api/admin/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  if (login.status === 200) {
    adminToken = login.body.data.token;
    console.log(`     logged in as ${adminEmail}`);
  } else {
    const bootstrap = await call('POST', '/api/admin/register', {
      body: { name: 'Upload Test Admin', email: adminEmail, password: adminPassword },
    });
    adminToken = bootstrap.body?.data?.token || null;
    console.log(`     bootstrapped ${adminEmail} (status ${bootstrap.status})`);
  }
  check('admin token obtained', Boolean(adminToken), 'set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD');
  if (!adminToken) return finish();

  // ——— 2. Driver photo → public bucket ———
  console.log('\n2) Upload a driver photo (public bucket)');
  const photo = await upload('/api/uploads/driver-photo', [
    { buffer: PNG_1X1, name: 'driver.png', type: 'image/png' },
  ], { token: adminToken, field: 'file' });
  check('upload accepted', photo.status === 201, JSON.stringify(photo.body));
  if (photo.status !== 201) return finish();

  const photoUrl = photo.body.data.url;
  console.log(`     ${photoUrl}`);
  check('a permanent public URL came back', typeof photoUrl === 'string' && photoUrl.startsWith('http'));
  check(
    'the public URL is readable without auth (bucket is public)',
    (await headStatus(photoUrl)) === 200,
    'run sql/008_storage_buckets.sql — driver-photos must be public'
  );

  // ——— 3. What must be refused ———
  console.log('\n3) Uploads that must be refused');
  const notAnImage = await upload('/api/uploads/driver-photo', [
    { buffer: Buffer.from('#!/bin/sh\necho pwned\n'), name: 'evil.png', type: 'image/png' },
  ], { token: adminToken, field: 'file' });
  check('a script disguised as image/png is rejected', notAnImage.status === 400, `got ${notAnImage.status}`);

  const noAuth = await upload('/api/uploads/driver-photo', [
    { buffer: PNG_1X1, name: 'x.png', type: 'image/png' },
  ], { field: 'file' });
  check('unauthenticated upload rejected', noAuth.status === 401, `got ${noAuth.status}`);

  const tooBig = await upload('/api/uploads/driver-photo', [
    { buffer: Buffer.alloc(11 * 1024 * 1024, 1), name: 'big.png', type: 'image/png' },
  ], { token: adminToken, field: 'file' });
  check('oversized file rejected with 413', tooBig.status === 413, `got ${tooBig.status}`);

  // ——— 4. Register + approve two drivers ———
  console.log('\n4) Register the driver with that URL');
  const makeDriver = async (label, suffix) => {
    const created = await call('POST', '/api/admin/drivers', {
      token: adminToken,
      body: {
        name: `Upload Test Driver ${label}`,
        email: `driver${suffix}+${stamp}@yourways.test`,
        phone: phone(suffix),
        profilePictureUrl: photoUrl,
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

  const driverA = await makeDriver('A', '1');
  check('driver created with the uploaded photo URL', driverA.created.status === 201, JSON.stringify(driverA.created.body));
  check('driver logged in', Boolean(driverA.token));
  if (!driverA.id || !driverA.token) return finish();

  const noPhoto = await call('POST', '/api/admin/drivers', {
    token: adminToken,
    body: { name: 'No Photo', email: `nophoto+${stamp}@yourways.test`, phone: phone('9') },
  });
  check('driver without a photo URL is rejected', noPhoto.status !== 201, `got ${noPhoto.status}`);

  const driverB = await makeDriver('B', '2');
  check('second driver ready (for the ownership check)', Boolean(driverB.token));

  // ——— 5. A real, paid order ———
  console.log('\n5) Customer books and pays (needed for an order to attach proof to)');
  const register = await call('POST', '/api/users/register', {
    body: {
      name: 'Upload Test User',
      email: `uploadtest+${stamp}@yourways.test`,
      phone: phone('0'),
      address: 'London',
    },
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
      fullName: 'Upload Test User',
      email: `uploadtest+${stamp}@yourways.test`,
      mobileNumber: phone('0'),
      acceptTerms: true,
      manpowerRequired: '2 Man Team',
      items: [
        { itemId: '1', category: 'Bedroom - Beds & Mattresses', itemName: 'Double Bed & Mattress', quantity: 1, modifiers: {} },
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
  console.log(`     order ${confirm.body.data.order.orderId} (${orderId})`);

  const assign = await call('POST', `/api/admin/orders/${orderId}/assign-driver`, {
    token: adminToken,
    body: { driverId: driverA.id },
  });
  check('driver assigned to the order', assign.status === 200, JSON.stringify(assign.body));

  // ——— 6. Proof upload → private bucket ———
  console.log('\n6) Driver uploads pickup proof (private bucket)');
  const pickup = await upload(`/api/uploads/order-proof/${orderId}?kind=pickup`, [
    { buffer: PNG_1X1, name: 'p1.png', type: 'image/png' },
    { buffer: PNG_1X1, name: 'p2.png', type: 'image/png' },
  ], { token: driverA.token });
  check('two pickup photos accepted', pickup.status === 201, JSON.stringify(pickup.body));
  if (pickup.status !== 201) return finish();

  const pickupKeys = pickup.body.data.storageKeys;
  console.log(`     ${pickupKeys.join('\n     ')}`);
  check(
    'keys are scoped to this order in the private bucket',
    pickupKeys.every((k) => k.startsWith(`order-proofs/${orderId}/pickup/`)),
    pickupKeys.join(', ')
  );
  check(
    'a usable preview URL came back for the driver app',
    (await headStatus(pickup.body.data.files[0].previewUrl)) === 200
  );

  const objectPath = pickupKeys[0].replace('order-proofs/', '');
  const publicAttempt = await headStatus(`${SUPABASE_URL}/storage/v1/object/public/order-proofs/${objectPath}`);
  check(
    'the same object is NOT readable without a signature (bucket is private)',
    publicAttempt !== 200,
    `public read returned ${publicAttempt}`
  );

  // ——— 7. Who may attach proof ———
  console.log('\n7) Proof uploads that must be refused');
  const foreignDriver = await upload(`/api/uploads/order-proof/${orderId}?kind=pickup`, [
    { buffer: PNG_1X1, name: 'x.png', type: 'image/png' },
  ], { token: driverB.token });
  check("another driver cannot add proof to someone else's order", foreignDriver.status === 403, `got ${foreignDriver.status}`);

  const customerProof = await upload(`/api/uploads/order-proof/${orderId}?kind=pickup`, [
    { buffer: PNG_1X1, name: 'x.png', type: 'image/png' },
  ], { token: userToken });
  check('a customer cannot add proof', customerProof.status === 403, `got ${customerProof.status}`);

  const badKind = await upload(`/api/uploads/order-proof/${orderId}?kind=selfie`, [
    { buffer: PNG_1X1, name: 'x.png', type: 'image/png' },
  ], { token: driverA.token });
  check('an unknown kind is rejected', badKind.status === 400, `got ${badKind.status}`);

  // ——— 8. Attaching the proof to the order ———
  console.log('\n8) Complete pickup with those keys');
  const spoofed = await call('POST', `/api/drivers/${driverA.id}/orders/${orderId}/complete-pickup`, {
    token: driverA.token,
    body: { photos: ['order-proofs/some-other-order/pickup/1.png'] },
  });
  check('a reference to another order is rejected', spoofed.status !== 200, `got ${spoofed.status}`);

  const completedPickup = await call('POST', `/api/drivers/${driverA.id}/orders/${orderId}/complete-pickup`, {
    token: driverA.token,
    body: { photos: pickupKeys, comment: 'All items collected' },
  });
  check('complete-pickup accepted the storage keys', completedPickup.status === 200, JSON.stringify(completedPickup.body));

  console.log('\n9) Upload delivery proof + signature, then complete delivery');
  const delivery = await upload(`/api/uploads/order-proof/${orderId}?kind=delivery`, [
    { buffer: PNG_1X1, name: 'd1.png', type: 'image/png' },
  ], { token: driverA.token });
  const sign = await upload(`/api/uploads/order-proof/${orderId}?kind=deliverySignature`, [
    { buffer: PNG_1X1, name: 'sig.png', type: 'image/png' },
  ], { token: driverA.token });
  check('delivery photo stored', delivery.status === 201, JSON.stringify(delivery.body));
  check('signature stored', sign.status === 201, JSON.stringify(sign.body));

  const twoSignatures = await upload(`/api/uploads/order-proof/${orderId}?kind=deliverySignature`, [
    { buffer: PNG_1X1, name: 'a.png', type: 'image/png' },
    { buffer: PNG_1X1, name: 'b.png', type: 'image/png' },
  ], { token: driverA.token });
  check('only one file allowed for a signature', twoSignatures.status === 400, `got ${twoSignatures.status}`);

  const completed = await call('POST', `/api/drivers/${driverA.id}/orders/${orderId}/complete-delivery`, {
    token: driverA.token,
    body: {
      photos: delivery.body.data.storageKeys,
      signature: sign.body.data.storageKeys[0],
      deliveryWaiverAccepted: true,
      comment: 'Delivered to customer',
    },
  });
  check('complete-delivery accepted', completed.status === 200, JSON.stringify(completed.body));

  // ——— 10. Reads: the whole point of the exercise ———
  console.log('\n10) Reading the images back');
  const tracking = await call('GET', `/api/orders/${orderId}/tracking`);
  const trackedPhotos = tracking.body?.data?.deliveryPhotos || [];
  check('tracking returns the delivery photos', trackedPhotos.length > 0, JSON.stringify(tracking.body?.data?.deliveryPhotos));
  check(
    'they arrive as signed URLs, not raw keys',
    trackedPhotos.every((url) => typeof url === 'string' && url.startsWith('http') && url.includes('token=')),
    trackedPhotos.join(', ')
  );
  if (trackedPhotos[0]) {
    check('a signed URL from tracking actually loads', (await headStatus(trackedPhotos[0])) === 200);
  }
  check(
    'the signature is signed too',
    typeof tracking.body?.data?.deliverySignature === 'string' &&
      tracking.body.data.deliverySignature.includes('token='),
    String(tracking.body?.data?.deliverySignature)
  );
  check(
    "the driver's photo is still a plain public URL",
    tracking.body?.data?.driver?.photoUrl === photoUrl,
    String(tracking.body?.data?.driver?.photoUrl)
  );

  const history = await call('GET', `/api/orders/user/${userId}`, { token: userToken });
  const historyOrder = (history.body?.data || []).find((o) => o.id === orderId);
  check('customer order history includes the order', Boolean(historyOrder), `got ${history.status}`);
  check(
    'order history photos are signed as well',
    (historyOrder?.deliveryPhotos || []).every((u) => typeof u === 'string' && u.includes('token=')),
    JSON.stringify(historyOrder?.deliveryPhotos)
  );

  const adminView = await call('GET', `/api/admin/orders/${orderId}`, { token: adminToken });
  const adminPhotos = adminView.body?.data?.deliveryPhotos || [];
  check(
    'admin sees signed photos too',
    adminPhotos.length > 0 && adminPhotos.every((u) => typeof u === 'string' && u.includes('token=')),
    JSON.stringify(adminPhotos)
  );

  // ——— 11. Dedicated GET /api/images/* ———
  console.log('\n11) Dedicated GET image endpoints');
  const driverPic = await call('GET', `/api/images/drivers/${driverA.id}`);
  check('GET /api/images/drivers/:id returns the public photo', driverPic.status === 200, JSON.stringify(driverPic.body));
  check(
    'driver photo.url matches what was uploaded',
    driverPic.body?.data?.photo?.url === photoUrl,
    JSON.stringify(driverPic.body?.data)
  );

  const adminList = await call('GET', '/api/images/drivers', { token: adminToken });
  check(
    'admin can list every driver photo',
    adminList.status === 200 && (adminList.body?.data?.drivers || []).some((d) => d.driverId === driverA.id),
    JSON.stringify(adminList.body?.data)
  );

  const anonOrderImages = await call('GET', `/api/images/orders/${orderId}`);
  check('order images require a token', anonOrderImages.status === 401, `got ${anonOrderImages.status}`);

  const stranger = await call('GET', `/api/images/orders/${orderId}`, { token: driverB.token });
  check(
    'a driver who is not assigned cannot read the proofs',
    stranger.status === 403,
    `got ${stranger.status}`
  );

  const orderImages = await call('GET', `/api/images/orders/${orderId}`, { token: userToken });
  const img = orderImages.body?.data || {};
  check('the customer can read their order images', orderImages.status === 200, JSON.stringify(orderImages.body));
  check(
    'driverPhoto is the public URL',
    img.driverPhoto?.url === photoUrl,
    JSON.stringify(img.driverPhoto)
  );
  check(
    'deliveryPhotos arrive as signed URLs',
    (img.deliveryPhotos || []).length > 0 &&
      img.deliveryPhotos.every((p) => typeof p?.url === 'string' && p.url.includes('token=')),
    JSON.stringify(img.deliveryPhotos)
  );
  check(
    'deliverySignature is signed too',
    typeof img.deliverySignature?.url === 'string' && img.deliverySignature.url.includes('token='),
    JSON.stringify(img.deliverySignature)
  );
  if (img.deliveryPhotos?.[0]?.url) {
    check('a signed URL from GET /api/images actually loads', (await headStatus(img.deliveryPhotos[0].url)) === 200);
  }

  const pickupOnly = await call('GET', `/api/images/orders/${orderId}?kind=pickup`, { token: userToken });
  check(
    '?kind=pickup returns pickup photos and omits delivery',
    pickupOnly.status === 200 &&
      Array.isArray(pickupOnly.body?.data?.pickupPhotos) &&
      pickupOnly.body.data.deliveryPhotos === undefined,
    JSON.stringify(pickupOnly.body?.data)
  );

  const historyImages = await call('GET', `/api/images/users/${userId}/orders`, { token: userToken });
  check(
    'customer history endpoint includes this order',
    historyImages.status === 200 &&
      (historyImages.body?.data?.orders || []).some((o) => o.orderUuid === orderId),
    JSON.stringify(historyImages.body?.data)
  );

  const otherUserHistory = await call('GET', `/api/images/users/${userId}/orders`, { token: driverA.token });
  check(
    'a driver token cannot list a customer\'s history photos',
    otherUserHistory.status === 403,
    `got ${otherUserHistory.status}`
  );

  const driverJobs = await call('GET', `/api/images/drivers/${driverA.id}/orders`, { token: driverA.token });
  check(
    'the assigned driver can list job photos',
    driverJobs.status === 200 &&
      (driverJobs.body?.data?.orders || []).some((o) => o.orderUuid === orderId),
    JSON.stringify(driverJobs.body?.data)
  );

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
