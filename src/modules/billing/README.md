# OPS ROOM Billing Module

This directory contains the future billing and licensing infrastructure for OPS ROOM.

## Status

Payment functionality is **disabled by default** and all UI is hidden behind the
`VITE_PAYMENT_ENABLED` feature flag.

## Files

- `FeatureFlag.jsx`: renders children only when the `payments` flag is enabled.
- `StripeContext.jsx`: placeholder context for Stripe.js integration.

## Environment Variables

```
VITE_PAYMENT_ENABLED=false
VITE_STRIPE_PUBLIC_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Future Integration Points

1. **Checkout**: Create Stripe Checkout sessions for one-time license purchases.
2. **Subscriptions**: Create Stripe Subscription sessions for recurring plans.
3. **Customer Portal**: Redirect users to the Stripe customer portal to manage
   payment methods and subscriptions.
4. **License Validation**: After a successful payment, validate the license
   key server-side before enabling premium features in the OPS ROOM desktop app.

## Important

Do not expose `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in the frontend.
Secret keys must only be used in a secure server context.
