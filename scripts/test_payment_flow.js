/**
 * End-to-end check of the Stripe pay-before-order flow.
 *
 *   1. node main.js            (in another terminal)
 *   2. node scripts/test_payment_flow.js
 *
 * Requires sql/007_payments.sql to have been applied and STRIPE_SECRET_KEY to
 * be a **test** key. It walks the real flow:
 *
 *   register user → draft booking → quote → submit (expect 402, unpaid)
 *   → create PaymentIntent → pay it with Stripe's pm_card_visa test card
 *   → POST /api/payments/confirm → assert the order exists and matches the
 *     amount actually charged
 *
 * Side effects: creates one test user, one booking, one order and one real
 * (test-mode) Stripe payment. Nothing is charged for real.
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

(async () => {
  console.log(`\nYourWays payment flow test → ${BASE}\n`);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY missing from .env — aborting');
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test')) {
    console.error('Refusing to run against a LIVE Stripe key — use a test key');
    process.exit(1);
  }

  // ——— 0. Server + Stripe reachable ———
  console.log('0) Preflight');
  const config = await call('GET', '/api/payments/config');
  check('GET /api/payments/config returns the publishable key', config.status === 200 && Boolean(config.body?.data?.publishableKey), `status ${config.status}`);

  // ——— 1. Test customer ———
  console.log('\n1) Register a test customer');
  const stamp = Date.now();
  const register = await call('POST', '/api/users/register', {
    body: {
      name: 'Payment Test User',
      email: `paytest+${stamp}@yourways.test`,
      phone: `+4477009${String(stamp).slice(-5)}`,
      address: 'London',
    },
  });
  check('user registered', register.status === 201, JSON.stringify(register.body));
  if (register.status !== 201) return finish();

  const token = register.body.data.token;
  const userId = register.body.data.user.id;
  console.log(`     userId=${userId}`);

  // ——— 2. Draft booking ———
  console.log('\n2) Create a draft booking');
  const booking = await call('POST', '/api/bookings/create', {
    token,
    body: {
      userId,
      collectionAddress: '42 Baker Street, Flat 4',
      collectionPostcode: 'SW1A 1AA',
      deliveryAddress: '10 Downing Street',
      deliveryPostcode: 'E1 6AN',
      fullName: 'Payment Test User',
      email: `paytest+${stamp}@yourways.test`,
      mobileNumber: `+4477009${String(stamp).slice(-5)}`,
      acceptTerms: true,
      manpowerRequired: '2 Man Team',
      items: [
        { itemId: '1', category: 'Bedroom - Beds & Mattresses', itemName: 'Double Bed & Mattress', quantity: 1, modifiers: {} },
      ],
    },
  });
  check('booking created as draft', booking.status === 201 && booking.body?.data?.status === 'draft', JSON.stringify(booking.body));
  if (booking.status !== 201) return finish();

  const bookingId = booking.body.data.id;
  console.log(`     bookingId=${bookingId}`);

  // ——— 3. Quote ———
  console.log('\n3) Calculate the quote');
  const quote = await call('POST', `/api/bookings/${bookingId}/calculate-price`, { token });
  check('price calculated', quote.status === 200 && quote.body?.data?.calculatedPrice > 0, JSON.stringify(quote.body));
  console.log(`     quoted £${quote.body?.data?.calculatedPrice}`);

  // ——— 4. The gate ———
  console.log('\n4) Try to submit WITHOUT paying (this must be refused)');
  const earlySubmit = await call('POST', `/api/bookings/${bookingId}/submit`, { token });
  check('unpaid submit rejected with 402', earlySubmit.status === 402, `got ${earlySubmit.status}: ${earlySubmit.body?.error}`);

  // ——— 5. Client-supplied price must be ignored ———
  console.log('\n5) Try to overwrite the price from the client (must be ignored)');
  await call('PUT', `/api/bookings/${bookingId}`, { token, body: { calculatedPrice: 1, status: 'submitted' } });
  const afterTamper = await call('GET', `/api/bookings/${bookingId}`, { token });
  check(
    'client cannot set calculatedPrice',
    afterTamper.body?.data?.calculatedPrice !== 1,
    `price is now ${afterTamper.body?.data?.calculatedPrice}`
  );
  check(
    'client cannot set booking status',
    afterTamper.body?.data?.status === 'draft',
    `status is now ${afterTamper.body?.data?.status}`
  );

  // ——— 6. PaymentIntent ———
  console.log('\n6) Create the PaymentIntent');
  const intentRes = await call('POST', '/api/payments/create-intent', { token, body: { bookingId } });
  check('intent created', intentRes.status === 201, JSON.stringify(intentRes.body));
  if (intentRes.status !== 201) return finish();

  const { paymentIntentId, amount, amountMinor, clientSecret } = intentRes.body.data;
  console.log(`     ${paymentIntentId} for £${amount} (${amountMinor} pence)`);
  check('amount is in pence and matches the GBP amount', amountMinor === Math.round(amount * 100));
  check('clientSecret returned for the frontend', Boolean(clientSecret));

  console.log('     calling create-intent again (should reuse, not duplicate)');
  const intentAgain = await call('POST', '/api/payments/create-intent', { token, body: { bookingId } });
  check('same intent reused on retry', intentAgain.body?.data?.paymentIntentId === paymentIntentId, `got ${intentAgain.body?.data?.paymentIntentId}`);

  // ——— 7. Pay it (stands in for the Stripe SDK on web/Flutter) ———
  console.log('\n7) Pay the intent with the pm_card_visa test card');
  const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: 'pm_card_visa',
    return_url: 'https://yourways.test/return',
  });
  check('Stripe reports succeeded', confirmedIntent.status === 'succeeded', `status ${confirmedIntent.status}`);

  // ——— 8. Fulfillment ———
  console.log('\n8) Confirm with the backend (creates the order)');
  const confirmRes = await call('POST', '/api/payments/confirm', { token, body: { paymentIntentId } });
  check('confirm succeeded', confirmRes.status === 200, JSON.stringify(confirmRes.body));

  const order = confirmRes.body?.data?.order;
  check('payment marked succeeded', confirmRes.body?.data?.paymentStatus === 'succeeded');
  check('order was created', Boolean(order?.orderId), JSON.stringify(confirmRes.body?.data));
  if (order) {
    console.log(`     order ${order.orderId} status=${order.status} paymentStatus=${order.paymentStatus}`);
    check('order total equals the amount charged', Number(order.totalPrice) === Number(amount), `order £${order.totalPrice} vs charged £${amount}`);
    check('order marked paid', order.paymentStatus === 'succeeded');
    check('order starts as pending (awaiting driver assignment)', order.status === 'pending');
  }

  // ——— 9. Idempotency ———
  console.log('\n9) Confirm a second time (must not create a second order)');
  const confirmTwice = await call('POST', '/api/payments/confirm', { token, body: { paymentIntentId } });
  check('second confirm is idempotent', confirmTwice.status === 200 && confirmTwice.body?.data?.order?.orderId === order?.orderId, JSON.stringify(confirmTwice.body?.data?.order?.orderId));

  // ——— 10. Final state ———
  console.log('\n10) Final state');
  const status = await call('GET', `/api/payments/booking/${bookingId}`, { token });
  check('booking reports isPaid', status.body?.data?.isPaid === true, JSON.stringify(status.body?.data));
  check('booking converted to order', status.body?.data?.bookingStatus === 'converted_to_order', status.body?.data?.bookingStatus);
  check('receipt URL stored', Boolean(status.body?.data?.receiptUrl));

  const paidAgain = await call('POST', '/api/payments/create-intent', { token, body: { bookingId } });
  check('cannot pay an already-paid booking', paidAgain.status === 409, `got ${paidAgain.status}`);

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
