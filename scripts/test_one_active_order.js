/**
 * End-to-end check of the "many bookings, one active order" rule.
 *
 *   1. node main.js                          (in another terminal)
 *   2. node scripts/test_one_active_order.js
 *
 * Requires a Stripe **test** key. Optionally set SMOKE_ADMIN_EMAIL /
 * SMOKE_ADMIN_PASSWORD to also cover the admin-only direct-create path and its
 * documented override; those checks are skipped when they aren't set.
 *
 * What it proves:
 *
 *   three bookings for one customer all succeed (bookings are unlimited)
 *   → paying the first creates an order
 *   → paying a second booking is refused with 409 naming the blocking order
 *   → the other bookings are untouched and still listed
 *   → cancelling the order releases the rule
 *   → the second booking can then be paid and becomes an order
 *
 * Side effects: one test customer, three bookings, two orders and two
 * test-mode Stripe payments. Both orders are cancelled at the end.
 */
require('dotenv').config();
const Stripe = require('stripe');

const BASE = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 5000}`;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const email = `oneorder+${stamp}@yourways.test`;
const phone = `+4477008${String(stamp).slice(-5)}`;

/** Pay a booking end to end and return the created order. */
const payBooking = async (token, bookingId) => {
  const intent = await call('POST', '/api/payments/create-intent', { token, body: { bookingId } });
  if (intent.status !== 201) return { intent, order: null };

  await stripe.paymentIntents.confirm(intent.body.data.paymentIntentId, {
    payment_method: 'pm_card_visa',
    return_url: 'https://yourways.test/return',
  });
  const confirm = await call('POST', '/api/payments/confirm', {
    token,
    body: { paymentIntentId: intent.body.data.paymentIntentId },
  });
  return { intent, order: confirm.body?.data?.order || null };
};

(async () => {
  console.log(`\nYourWays one-active-order rule test → ${BASE}\n`);

  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
    console.error('A Stripe TEST key is required in .env — aborting');
    process.exit(1);
  }

  // ——— 1. Customer ———
  console.log('1) Register a test customer');
  const register = await call('POST', '/api/users/register', {
    body: { name: 'One Order User', email, phone, address: 'London' },
  });
  check('customer registered', register.status === 201, JSON.stringify(register.body));
  if (register.status !== 201) return finish();

  const token = register.body.data.token;
  const userId = register.body.data.user.id;

  // ——— 2. Bookings are unlimited ———
  console.log('\n2) Create THREE bookings for the same customer');
  const bookingIds = [];
  for (const [index, route] of [
    ['SW1A 1AA', 'E1 6AN'],
    ['E1 6AN', 'N1 9GU'],
    ['N1 9GU', 'SW1A 1AA'],
  ].entries()) {
    const created = await call('POST', '/api/bookings/create', {
      token,
      body: {
        userId,
        collectionAddress: `${index + 1} Test Street`,
        collectionPostcode: route[0],
        deliveryAddress: `${index + 10} Sample Road`,
        deliveryPostcode: route[1],
        fullName: 'One Order User',
        email,
        mobileNumber: phone,
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
    check(`booking ${index + 1} created`, created.status === 201, JSON.stringify(created.body));
    if (created.body?.data?.id) bookingIds.push(created.body.data.id);
  }
  check('all three bookings exist (bookings are not rationed)', bookingIds.length === 3);
  if (bookingIds.length !== 3) return finish();

  const list = await call('GET', `/api/bookings/user/${userId}`, { token });
  check(
    'the customer can list all three as their booking list',
    (list.body?.data || []).length === 3,
    `got ${(list.body?.data || []).length}`
  );

  for (const id of bookingIds) {
    await call('POST', `/api/bookings/${id}/calculate-price`, { token });
  }

  // ——— 3. First payment creates the order ———
  console.log('\n3) Pay the first booking');
  const first = await payBooking(token, bookingIds[0]);
  check('first booking could be paid', first.intent.status === 201, JSON.stringify(first.intent.body));
  check('first payment produced an order', Boolean(first.order?.orderId), JSON.stringify(first.order));
  if (!first.order?.orderId) return finish();
  // `_id` is the UUID; `id` is the human ORD-… code.
  const firstOrderId = first.order._id;
  console.log(`     order ${first.order.orderId} status=${first.order.status}`);

  // ——— 4. The rule ———
  console.log('\n4) Try to pay a SECOND booking while that order is live');
  const blocked = await call('POST', '/api/payments/create-intent', {
    token,
    body: { bookingId: bookingIds[1] },
  });
  check('second payment refused with 409', blocked.status === 409, `got ${blocked.status}`);
  check(
    'the error names the order that is blocking',
    typeof blocked.body?.error === 'string' && blocked.body.error.includes(first.order.orderId),
    String(blocked.body?.error)
  );

  const stillThere = await call('GET', `/api/bookings/user/${userId}`, { token });
  const drafts = (stillThere.body?.data || []).filter((b) => b.status === 'draft');
  check(
    'the refused booking is left alone, still a draft',
    drafts.some((b) => b.id === bookingIds[1]),
    `drafts: ${drafts.length}`
  );
  check('no second order was created', drafts.length === 2, `expected 2 drafts, got ${drafts.length}`);

  // ——— 5. Admin paths (only if credentials were provided) ———
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
  let adminToken = null;
  if (adminEmail && adminPassword) {
    console.log('\n5) Admin direct-create respects the rule (and can override it)');
    const login = await call('POST', '/api/admin/login', {
      body: { email: adminEmail, password: adminPassword },
    });
    adminToken = login.body?.data?.token || null;
    check('admin logged in', Boolean(adminToken), `status ${login.status}`);

    if (adminToken) {
      const manual = {
        userId,
        serviceName: 'Phone Booking',
        pickupLocation: '1 Test Street, SW1A 1AA',
        deliveryLocation: '10 Sample Road, E1 6AN',
        customerName: 'One Order User',
        customerEmail: email,
        customerPhone: phone,
        items: [],
      };

      const refused = await call('POST', '/api/orders/create', { token: adminToken, body: manual });
      check('admin direct-create also refused with 409', refused.status === 409, `got ${refused.status}`);

      const forced = await call('POST', '/api/orders/create', {
        token: adminToken,
        body: { ...manual, allowConcurrentOrder: true },
      });
      check('admin can override deliberately', forced.status === 201, JSON.stringify(forced.body));

      const forcedId = forced.body?.data?._id;
      if (forcedId) {
        const undo = await call('POST', `/api/orders/${forcedId}/cancel`, {
          token: adminToken,
          body: { cancellationReason: 'Test cleanup' },
        });
        check('override order cleaned up', undo.status === 200, JSON.stringify(undo.body));
      }
    }
  } else {
    console.log('\n5) Admin checks skipped (set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD to include them)');
  }

  // ——— 6. Finishing the order releases the rule ———
  console.log('\n6) Cancel the live order, then pay the second booking');
  const cancel = await call('POST', `/api/orders/${firstOrderId}/cancel`, {
    token,
    body: { cancellationReason: 'Customer changed their mind' },
  });
  check('order cancelled', cancel.status === 200, JSON.stringify(cancel.body));

  const second = await payBooking(token, bookingIds[1]);
  check(
    'the second booking can now be paid',
    second.intent.status === 201,
    JSON.stringify(second.intent.body)
  );
  check('it became an order', Boolean(second.order?.orderId), JSON.stringify(second.order));
  if (second.order?.orderId) {
    console.log(`     order ${second.order.orderId} status=${second.order.status}`);
    check(
      'and it is a different order from the first',
      second.order.orderId !== first.order.orderId
    );
  }

  // ——— 7. Third booking is blocked again ———
  console.log('\n7) The rule applies again for the third booking');
  const blockedAgain = await call('POST', '/api/payments/create-intent', {
    token,
    body: { bookingId: bookingIds[2] },
  });
  check('third booking refused while order two is live', blockedAgain.status === 409, `got ${blockedAgain.status}`);

  // ——— 8. Completing (not just cancelling) also releases the rule ———
  const secondOrderId = second.order?._id;
  let thirdOrderId = null;

  if (adminToken && secondOrderId) {
    console.log('\n8) Mark order two COMPLETED — the customer should be free to order again');
    const complete = await call('PATCH', `/api/admin/orders/${secondOrderId}/status`, {
      token: adminToken,
      body: { status: 'completed' },
    });
    check('order two completed', complete.status === 200, JSON.stringify(complete.body));

    const third = await payBooking(token, bookingIds[2]);
    check(
      'the third booking can be paid after completion',
      third.intent.status === 201,
      JSON.stringify(third.intent.body)
    );
    check('it became an order', Boolean(third.order?.orderId), JSON.stringify(third.order));
    thirdOrderId = third.order?._id || null;
  } else {
    console.log('\n8) Completion check skipped (needs SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD)');
  }

  // ——— Cleanup ———
  for (const id of [secondOrderId, thirdOrderId].filter(Boolean)) {
    await call('POST', `/api/orders/${id}/cancel`, {
      token,
      body: { cancellationReason: 'Test cleanup' },
    });
  }

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
