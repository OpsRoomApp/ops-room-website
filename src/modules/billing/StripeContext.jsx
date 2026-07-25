import { createContext } from 'react';

/**
 * StripeContext placeholder.
 *
 * This module is intentionally minimal. When PAYMENT_ENABLED is true and a
 * VITE_STRIPE_PUBLIC_KEY is provided, this context can be expanded to load the
 * Stripe.js client and provide checkout helpers.
 *
 * Future integration points:
 *  - Stripe checkout sessions for one-time license purchases
 *  - Stripe subscriptions for recurring access
 *  - Stripe customer portal for self-service billing
 *  - License validation after successful payment
 */
const StripeContext = createContext(null);

export default StripeContext;
