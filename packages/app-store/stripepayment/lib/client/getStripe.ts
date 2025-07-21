import type { Stripe } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";

export type Maybe<T> = T | undefined | null;

const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || "";
let stripePromise: Promise<Stripe | null>;
const stripeConnectedPromises = new Map<string, Promise<Stripe | null>>();

/**
 * This is a singleton to ensure we only instantiate Stripe once.
 * Now supports connected accounts for embedded checkout.
 */
const getStripe = (userPublicKey?: string, connectedAccount?: string) => {
  const key = userPublicKey || stripePublicKey;

  // For connected accounts, we need a separate instance per account
  if (connectedAccount) {
    const cacheKey = `${key}-${connectedAccount}`;
    if (!stripeConnectedPromises.has(cacheKey)) {
      stripeConnectedPromises.set(
        cacheKey,
        loadStripe(key, {
          stripeAccount: connectedAccount,
        })
      );
    }
    return stripeConnectedPromises.get(cacheKey)!;
  }

  // Regular stripe instance
  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

export default getStripe;
