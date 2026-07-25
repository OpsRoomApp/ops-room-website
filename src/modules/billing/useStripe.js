import { useContext } from 'react';
import StripeContext from './StripeContext.jsx';

/**
 * useStripe hook.
 *
 * Returns the current Stripe context value. When payment features are disabled,
 * this will simply return { ready: false }.
 */
export default function useStripe() {
  return useContext(StripeContext);
}
