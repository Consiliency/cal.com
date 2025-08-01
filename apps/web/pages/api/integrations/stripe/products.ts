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
    let credential = null;

    if (credentialId) {
      // If credentialId is provided, try to find it but don't fail if not found
      // This handles the case where frontend passes credentialId for manual configs
      credential = await prisma.credential.findFirst({
        where: {
          id: parseInt(credentialId as string),
          type: "stripe_payment",
        },
      });

      if (!credential) {
        log.warn("Credential not found with ID, checking for manual configuration", { credentialId });
      }
    } else {
      // No credentialId provided, try to find user's credential
      credential = await prisma.credential.findFirst({
        where: {
          userId,
          type: "stripe_payment",
        },
      });
    }

    let stripeUserId: string | undefined;
    let isManuallyConfigured = false;

    if (credential && credential.key) {
      const credentialKey = credential.key as {
        stripe_user_id?: string;
        manual_config?: boolean;
        client_secret?: string;
      };
      stripeUserId = credentialKey.stripe_user_id;

      // Check if this is a manually configured credential (no stripe_user_id)
      if (!stripeUserId && (credentialKey.manual_config || credentialKey.client_secret)) {
        isManuallyConfigured = true;
        log.info("Found manually configured Stripe credential");
      }
    }

    // First check if Stripe is configured via admin (manual configuration)
    // This takes precedence over OAuth credentials to handle cases where
    // credentialId is passed but doesn't exist or is invalid
    const stripeApp = await prisma.app.findUnique({
      where: { slug: "stripe" },
    });

    let stripeApiKey: string | undefined;

    // If we have app keys configured, use them (manual configuration)
    // This ALWAYS takes precedence - we ignore any credentialId when manual config exists
    if (stripeApp?.keys && stripeApp.enabled) {
      const appKeys = stripeApp.keys as { client_secret?: string };
      if (appKeys.client_secret) {
        stripeApiKey = appKeys.client_secret;
        isManuallyConfigured = true;

        // Log that we're ignoring credentialId if one was passed
        if (credentialId) {
          log.info("Ignoring credentialId parameter - using manually configured Stripe app keys", {
            credentialId,
            reason: "Manual configuration takes precedence",
          });
        } else {
          log.info("Using manually configured Stripe app keys");
        }

        // Reset credential-related variables since we're using manual config
        credential = null;
        stripeUserId = undefined;
      }
    }

    // If no manual configuration, check for OAuth credentials
    if (!stripeApiKey && credential && stripeUserId) {
      // Use environment variable for OAuth connections
      stripeApiKey = process.env.STRIPE_PRIVATE_KEY;
      log.info("Using OAuth Stripe connection");
    }

    // If still no API key, we can't proceed
    if (!stripeApiKey) {
      log.error("No Stripe configuration found", {
        hasAppKeys: !!stripeApp?.keys,
        hasCredential: !!credential,
        hasStripeUserId: !!stripeUserId,
        credentialId,
        userId,
      });
      return res
        .status(404)
        .json({ error: "Stripe not connected. Please connect via OAuth or configure in admin settings." });
    }

    log.info("Fetching Stripe products", {
      stripeUserId,
      credentialId: credential?.id,
      userId: credential?.userId || userId,
      teamId: credential?.teamId,
      isManuallyConfigured,
      apiKeyLength: stripeApiKey?.length,
      apiKeyPrefix: stripeApiKey?.substring(0, 7) + "...",
    });

    // Initialize Stripe with the appropriate key
    let stripe: Stripe;
    try {
      stripe = new Stripe(stripeApiKey, {
        apiVersion: "2025-06-30.basil" as const,
      });
      log.info("Stripe client initialized successfully");
    } catch (initError: any) {
      log.error("Failed to initialize Stripe client", {
        error: initError.message,
        stack: initError.stack,
      });
      return res.status(500).json({ 
        error: "Failed to initialize Stripe client",
        details: isDebug ? {
          message: initError.message,
        } : undefined
      });
    }

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

    let products, prices;
    try {
      [products, prices] = await Promise.all([
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
    } catch (stripeError: any) {
      log.error("Stripe API error", {
        error: stripeError.message,
        type: stripeError.type,
        code: stripeError.code,
        statusCode: stripeError.statusCode,
        requestId: stripeError.requestId,
        stack: stripeError.stack,
        raw: stripeError.raw,
      });
      
      // Check if it's an API version error
      if (stripeError.message?.includes('API version')) {
        log.error("API Version mismatch detected", {
          providedVersion: "2025-06-30.basil",
          errorMessage: stripeError.message,
        });
      }
      
      return res.status(500).json({ 
        error: "Failed to fetch products",
        details: isDebug ? {
          message: stripeError.message,
          type: stripeError.type,
          code: stripeError.code,
          statusCode: stripeError.statusCode,
        } : undefined
      });
    }

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
