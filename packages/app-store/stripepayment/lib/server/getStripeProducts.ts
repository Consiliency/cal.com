import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { getOptions } from "@calcom/features/auth/lib/next-auth-options";
import prisma from "@calcom/prisma";

export async function getStripeProducts(usePlatformAccount = false) {
  // Get session server-side
  const session = await getServerSession(getOptions());
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // Get Stripe app configuration
  const stripeApp = await prisma.app.findUnique({
    where: { slug: "stripe" },
    select: {
      enabled: true,
      keys: true,
    },
  });

  if (!stripeApp || !stripeApp.enabled) {
    throw new Error("Stripe app is not enabled");
  }

  let stripeApiKey: string | null = null;

  // If using platform account, use the app's keys
  if (usePlatformAccount && stripeApp.keys && typeof stripeApp.keys === "object") {
    const appKeys = stripeApp.keys as { client_secret?: string };
    if (appKeys.client_secret) {
      stripeApiKey = appKeys.client_secret;
    }
  } else {
    // Otherwise, try to get user's OAuth credentials
    const credential = await prisma.credential.findFirst({
      where: {
        userId,
        type: "stripe_payment",
        invalid: false,
      },
      select: { key: true },
    });

    if (credential && credential.key && typeof credential.key === "object") {
      const credentialKey = credential.key as { stripe_user_id?: string };
      if (credentialKey.stripe_user_id) {
        // For OAuth connections, we'd need to use the OAuth access token
        // This is a simplified version - full implementation would use the OAuth token
        throw new Error("OAuth connections require additional setup");
      }
    }
  }

  if (!stripeApiKey) {
    throw new Error("No valid Stripe API key found");
  }

  // Initialize Stripe with the API key
  const stripe = new Stripe(stripeApiKey, {
    apiVersion: "2025-06-30.basil" as const,
  });

  // Fetch products and prices
  const [products, prices] = await Promise.all([
    stripe.products.list({ limit: 100, active: true }),
    stripe.prices.list({ limit: 100, active: true, expand: ["data.product"] }),
  ]);

  // Transform the data
  const productsWithPrices = products.data.map((product) => {
    const productPrices = prices.data.filter((price) => {
      const priceProduct = typeof price.product === "string" ? price.product : price.product?.id;
      return priceProduct === product.id;
    });

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      prices: productPrices.map((price) => ({
        id: price.id,
        currency: price.currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring,
      })),
    };
  });

  return {
    products: productsWithPrices,
    debug: {
      message: "Using platform account configuration",
      productsCount: products.data.length,
      pricesCount: prices.data.length,
    },
  };
}