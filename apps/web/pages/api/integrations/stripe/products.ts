import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import { getSession } from "@calcom/features/auth/lib/getSession";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

const log = logger.getSubLogger({ prefix: ["stripe-products-api"] });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getSession({ req });
  const userId = session?.user && "id" in session.user ? session.user.id : null;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get query params
    const { credentialId, debug, usePlatformAccount } = req.query;
    const isDebug = debug === "true";
    const shouldUsePlatformAccount = usePlatformAccount === "true";

    // Get the Stripe credentials - either specific credential by ID or user's credentials
    // First try to find a credential (OAuth connection)
    const credential = await prisma.credential.findFirst({
      where: credentialId
        ? {
            id: parseInt(credentialId as string),
            type: "stripe_payment",
          }
        : {
            userId,
            type: "stripe_payment",
          },
    });

    let stripeUserId: string | undefined;
    let isManuallyConfigured = false;

    if (credential && credential.key) {
      const credentialKey = credential.key as any;
      stripeUserId = credentialKey.stripe_user_id;

      // Check if this is a manually configured credential (no stripe_user_id)
      if (!stripeUserId && (credentialKey.manual_config || credentialKey.client_secret)) {
        isManuallyConfigured = true;
        log.info("Found manually configured Stripe credential");
      }
    }

    // If no credential or credential without stripe_user_id, check if Stripe is configured via admin
    if (!credential || !stripeUserId) {
      const stripeApp = await prisma.app.findUnique({
        where: { slug: "stripe" },
      });

      if (!stripeApp || !stripeApp.keys || !stripeApp.enabled) {
        log.error("Stripe not configured", { credentialId, userId });
        return res
          .status(404)
          .json({ error: "Stripe not connected. Please connect via OAuth or configure in admin settings." });
      }

      isManuallyConfigured = true;
      log.info("Using platform account for manually configured Stripe app");
    }

    log.info("Fetching Stripe products", {
      stripeUserId,
      credentialId: credential?.id,
      userId: credential?.userId || userId,
      teamId: credential?.teamId,
      isManuallyConfigured,
    });

    // Initialize Stripe with the platform's key
    const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
      apiVersion: "2025-06-30.basil" as const,
    });

    // Get platform account info
    let platformAccountId = "unknown";
    try {
      const platformAccount = await stripe.accounts.retrieve();
      platformAccountId = platformAccount.id;
    } catch (e) {
      log.warn("Could not retrieve platform account info", e);
    }

    // Determine which account to use
    // If no stripeUserId (manual config), always use platform account
    const accountToQuery = shouldUsePlatformAccount || !stripeUserId ? undefined : stripeUserId;
    const accountType = shouldUsePlatformAccount || !stripeUserId ? "platform" : "connected";

    log.info("Account comparison", {
      platformAccountId,
      connectedAccountId: stripeUserId,
      queryingAccount: accountToQuery || platformAccountId,
      accountType,
      isUsingConnectedAccount: !shouldUsePlatformAccount && !!stripeUserId,
      areSameAccount: platformAccountId === stripeUserId,
      isManuallyConfigured: !stripeUserId,
    });

    // Fetch products and prices from the appropriate account
    const stripeOptions = shouldUsePlatformAccount || !stripeUserId ? {} : { stripeAccount: stripeUserId };

    const [products, prices] = await Promise.all([
      stripe.products.list(
        {
          active: true,
          limit: 100,
        },
        stripeOptions
      ),
      stripe.prices.list(
        {
          active: true,
          limit: 100,
          expand: ["data.product"],
        },
        stripeOptions
      ),
    ]);

    log.info("Stripe API results", {
      productsCount: products.data.length,
      pricesCount: prices.data.length,
      productIds: products.data.map((p) => p.id),
      priceIds: prices.data.map((p) => p.id),
    });

    // Group prices by product
    const pricesByProduct = prices.data.reduce((acc, price) => {
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      if (!acc[productId]) {
        acc[productId] = [];
      }
      acc[productId].push(price);
      return acc;
    }, {} as Record<string, Stripe.Price[]>);

    // Count products filtered out
    const productsWithoutPrices = products.data.filter((product) => !pricesByProduct[product.id]);
    if (productsWithoutPrices.length > 0) {
      log.info("Products without prices", {
        count: productsWithoutPrices.length,
        productIds: productsWithoutPrices.map((p) => p.id),
      });
    }

    // Format the response
    const formattedProducts = products.data
      .filter((product) => pricesByProduct[product.id]) // Only include products with prices
      .map((product) => {
        const productPrices = pricesByProduct[product.id] || [];
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active,
          prices: productPrices.map((price) => ({
            id: price.id,
            currency: price.currency,
            unit_amount: price.unit_amount,
            nickname: price.nickname,
            recurring: price.recurring,
            type: price.type,
          })),
        };
      })
      .filter((product) => product.prices.length > 0); // Ensure product has at least one price

    log.info("Formatted products", {
      count: formattedProducts.length,
      products: formattedProducts.map((p) => ({ id: p.id, name: p.name, priceCount: p.prices.length })),
    });

    // If debug mode, include raw data
    if (isDebug) {
      return res.status(200).json({
        products: formattedProducts,
        debug: {
          accounts: {
            platformAccountId,
            connectedAccountId: stripeUserId,
            queriedAccount: accountToQuery || platformAccountId,
            accountType,
            isUsingConnectedAccount: !shouldUsePlatformAccount,
            areSameAccount: platformAccountId === stripeUserId,
          },
          credential: credential
            ? {
                id: credential.id,
                userId: credential.userId,
                teamId: credential.teamId,
              }
            : null,
          isManuallyConfigured: !stripeUserId,
          results: {
            rawProductsCount: products.data.length,
            rawPricesCount: prices.data.length,
            formattedProductsCount: formattedProducts.length,
            productsWithoutPrices: productsWithoutPrices.map((p) => ({ id: p.id, name: p.name })),
          },
        },
      });
    }

    return res.status(200).json({ products: formattedProducts });
  } catch (error) {
    log.error("Failed to fetch Stripe products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
}
