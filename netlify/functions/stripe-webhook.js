// Stripe webhook to grant/revoke Pro entitlements in Firestore
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, FIREBASE_SERVICE_ACCOUNT

import Stripe from 'stripe';
import { getAdmin } from './_firebase-admin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// Utility: map a Stripe Price ID → plan string we store
function mapPriceToPlan(priceId) {
  if (!priceId) return 'pro_monthly';
  if (priceId === process.env.STRIPE_PRICE_YEARLY) return 'pro_yearly';
  return 'pro_monthly';
}

async function planFromSubscriptionId(subId) {
  if (!subId) return 'pro_monthly';
  const sub = await stripe.subscriptions.retrieve(subId);
  return mapPriceToPlan(sub.items.data[0]?.price?.id);
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sig = event.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET');
      return { statusCode: 500, body: 'Webhook misconfigured' };
    }

    // Netlify provides raw string body in event.body (do not JSON.parse)
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    const { db } = getAdmin();

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const s = stripeEvent.data.object;
        const uid   = s.metadata?.uid || null;
        const email = s.customer_details?.email || s.customer_email || null;
        const customerId = s.customer;
        const plan = s.mode === 'subscription'
          ? await planFromSubscriptionId(s.subscription)
          : 'pro_monthly';

        if (uid) {
          await db.collection('users').doc(uid).set({
            email,
            plan,
            stripeCustomerId: customerId,
            updatedAt: Date.now(),
          }, { merge: true });
        } else if (email) {
          // Optional fallback: store/merge by email if you aren't passing uid
          const ref = db.collection('users').doc(`email:${email}`);
          await ref.set({ email, plan, stripeCustomerId: customerId, updatedAt: Date.now() }, { merge: true });
        }
        console.log('✅ checkout.session.completed', { uid, email, plan });
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = stripeEvent.data.object;
        const sub = await stripe.subscriptions.retrieve(inv.subscription);
        const plan = mapPriceToPlan(sub.items.data[0]?.price?.id);
        const customerId = inv.customer;

        // Update by stripeCustomerId
        const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
        for (const doc of snap.docs) {
          await doc.ref.set({ plan, updatedAt: Date.now() }, { merge: true });
        }
        console.log('✅ invoice.payment_succeeded', { customerId, plan });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        const customerId = sub.customer;

        const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
        for (const doc of snap.docs) {
          await doc.ref.set({ plan: 'free', updatedAt: Date.now() }, { merge: true });
        }
        console.log('⚠️ subscription canceled', { customerId });
        break;
      }

      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return { statusCode: 500, body: 'Webhook handler error' };
  }
};
