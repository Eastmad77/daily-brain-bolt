// Creates a Stripe Billing Portal session so users can manage/cancel
// Env: STRIPE_SECRET_KEY, SITE_URL, FIREBASE_SERVICE_ACCOUNT

import Stripe from 'stripe';
import { getAdmin } from './_firebase-admin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { uid } = JSON.parse(event.body || '{}');
    if (!uid) return { statusCode: 400, body: 'Missing uid' };

    const { db } = getAdmin();
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    const customerId = data?.stripeCustomerId;
    if (!customerId) return { statusCode: 400, body: 'No Stripe customer on file' };

    const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: siteUrl,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('create-portal-session error:', err);
    return { statusCode: 500, body: 'Portal error' };
  }
};
