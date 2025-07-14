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
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get credentialId from query params if provided
    const { credentialId } = req.query;
    
    // Get the Stripe credentials - either specific credential by ID or user's credentials
    const credential = await prisma.credential.findFirst({
      where: credentialId
        ? {
            id: parseInt(credentialId as string),
            type: "stripe_payment",
          }
        : {
            userId: session.user.id,
            type: "stripe_payment",
          },
    });

    if (!credential || !credential.key) {
      return res.status(404).json({ error: "Stripe not connected" });
    }

    const credentialKey = credential.key as any;
    const stripeUserId = credentialKey.stripe_user_id;

    if (!stripeUserId) {
      return res.status(400).json({ error: "Invalid Stripe credentials" });
    }

    // Initialize Stripe with the platform's key
    const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
      apiVersion: "2020-08-27",
    });

    // Fetch products and prices from the connected account
    const [products, prices] = await Promise.all([
      stripe.products.list(
        {
          active: true,
          limit: 100,
        },
        {
          stripeAccount: stripeUserId,
        }
      ),
      stripe.prices.list(
        {
          active: true,
          limit: 100,
          expand: ["data.product"],
        },
        {
          stripeAccount: stripeUserId,
        }
      ),
    ]);

    // Group prices by product
    const pricesByProduct = prices.data.reduce((acc, price) => {
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      if (!acc[productId]) {
        acc[productId] = [];
      }
      acc[productId].push(price);
      return acc;
    }, {} as Record<string, Stripe.Price[]>);

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

    return res.status(200).json({ products: formattedProducts });
  } catch (error) {
    log.error("Failed to fetch Stripe products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
}
