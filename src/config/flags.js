/**
 * Feature flags for OPS ROOM public website.
 *
 * These flags are evaluated at build time from Vite environment variables.
 * They should never contain secrets. Payment features are disabled by default.
 */

export const PAYMENT_ENABLED = import.meta.env.VITE_PAYMENT_ENABLED === 'true';

export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';

export const FEATURES = {
  payments: PAYMENT_ENABLED,
  customerPortal: false,
  licenseManagement: false,
};
