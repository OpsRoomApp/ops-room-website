import { PAYMENT_ENABLED } from '../../config/flags.js';

/**
 * FeatureFlag component.
 *
 * Renders children only when the requested feature flag is enabled.
 * Currently used to gate all future payment and licensing UI.
 *
 * Usage:
 *   <FeatureFlag flag="payments">
 *     <StripeCheckoutButton />
 *   </FeatureFlag>
 */
export default function FeatureFlag({ flag, children }) {
  if (flag === 'payments' && !PAYMENT_ENABLED) {
    return null;
  }
  return children;
}
