import type { Params } from "app/_types";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";

import { getRequestedSlugError } from "@calcom/app-store/stripepayment/lib/team-billing";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import stripe from "@calcom/features/ee/payments/server/stripe";
import { WEBAPP_URL, IS_SELF_HOSTED } from "@calcom/lib/constants";
import { HttpError } from "@calcom/lib/http-error";
import prisma from "@calcom/prisma";
import { teamMetadataSchema } from "@calcom/prisma/zod-utils";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const querySchema = z.object({
  team: z.string().transform((val) => parseInt(val)),
  session_id: z.string().min(1).optional(),
  self_hosted: z.string().optional(),
});

async function getHandler(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const {
      team: id,
      session_id,
      self_hosted,
    } = querySchema.parse({
      team: (await params).team,
      session_id: searchParams.get("session_id"),
      self_hosted: searchParams.get("self_hosted"),
    });

    // Handle self-hosted instances
    if (IS_SELF_HOSTED || self_hosted) {
      const team = await prisma.team.findFirstOrThrow({ where: { id } });

      // Update team metadata to mark as "paid" for self-hosted
      await prisma.team.update({
        where: { id },
        data: {
          metadata: {
            ...teamMetadataSchema.parse(team.metadata),
            paymentId: "self-hosted",
            subscriptionId: "self-hosted",
            subscriptionItemId: "self-hosted",
          },
        },
      });

      const redirectUrl = team?.isOrganization
        ? `${WEBAPP_URL}/settings/organizations/profile?upgraded=true`
        : `${WEBAPP_URL}/settings/teams/${team.id}/profile?upgraded=true`;

      return NextResponse.redirect(redirectUrl);
    }

    if (!session_id) {
      throw new HttpError({ statusCode: 400, message: "Session ID required for non-self-hosted" });
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });
    if (!checkoutSession) {
      throw new HttpError({ statusCode: 404, message: "Checkout session not found" });
    }

    const subscription = checkoutSession.subscription as Stripe.Subscription;
    if (checkoutSession.payment_status !== "paid") {
      throw new HttpError({ statusCode: 402, message: "Payment required" });
    }

    let team = await prisma.team.findFirst({
      where: { metadata: { path: ["paymentId"], equals: checkoutSession.id } },
    });

    let metadata;

    if (!team) {
      const prevTeam = await prisma.team.findFirstOrThrow({ where: { id } });

      metadata = teamMetadataSchema.safeParse(prevTeam.metadata);
      if (!metadata.success) {
        throw new HttpError({ statusCode: 400, message: "Invalid team metadata" });
      }

      const { requestedSlug, ...newMetadata } = metadata.data || {};
      team = await prisma.team.update({
        where: { id },
        data: {
          metadata: {
            ...newMetadata,
            paymentId: checkoutSession.id,
            subscriptionId: subscription.id || null,
            subscriptionItemId: subscription.items.data[0].id || null,
          },
        },
      });

      const slug = prevTeam.slug || requestedSlug;
      if (slug) {
        try {
          team = await prisma.team.update({ where: { id }, data: { slug } });
        } catch (error) {
          const { message, statusCode } = getRequestedSlugError(error, slug);
          return NextResponse.json({ message }, { status: statusCode });
        }
      }
    }

    if (!metadata) {
      metadata = teamMetadataSchema.safeParse(team.metadata);
      if (!metadata.success) {
        throw new HttpError({ statusCode: 400, message: "Invalid team metadata" });
      }
    }

    const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

    if (!session) {
      return NextResponse.json({ message: "Team upgraded successfully" });
    }

    const redirectUrl = team?.isOrganization
      ? `${WEBAPP_URL}/settings/organizations/profile?upgraded=true`
      : `${WEBAPP_URL}/settings/teams/${team.id}/profile?upgraded=true`;

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const GET = defaultResponderForAppDir(getHandler);
