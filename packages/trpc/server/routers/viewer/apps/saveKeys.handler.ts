import type { Prisma } from "@prisma/client";

import { appKeysSchemas } from "@calcom/app-store/apps.keys-schemas.generated";
import { getLocalAppMetadata } from "@calcom/app-store/utils";
import type { PrismaClient } from "@calcom/prisma";
import type { AppCategories } from "@calcom/prisma/enums";

// import prisma from "@calcom/prisma";
import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import type { TSaveKeysInputSchema } from "./saveKeys.schema";

type SaveKeysOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TSaveKeysInputSchema;
};

export const saveKeysHandler = async ({ ctx, input }: SaveKeysOptions) => {
  // Use slug for schema lookup as the generated schemas use appId (slug) as key
  const keysSchema = appKeysSchemas[input.slug as keyof typeof appKeysSchemas];

  if (!keysSchema) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No key schema found for app: ${input.slug}`,
    });
  }

  const keys = keysSchema.parse(input.keys);

  // Get app name from metadata
  const localApps = getLocalAppMetadata();
  const appMetadata = localApps.find((localApp) => localApp.slug === input.slug);

  if (!appMetadata?.dirName && appMetadata?.categories)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "App metadata could not be found" });

  await ctx.prisma.app.upsert({
    where: {
      slug: input.slug,
    },
    update: { keys, ...(input.fromEnabled && { enabled: true }) },
    create: {
      slug: input.slug,
      dirName: appMetadata?.dirName || appMetadata?.slug || "",
      categories:
        (appMetadata?.categories as AppCategories[]) ||
        ([appMetadata?.category] as AppCategories[]) ||
        undefined,
      keys: (keys as Prisma.InputJsonObject) || undefined,
      ...(input.fromEnabled && { enabled: true }),
    },
  });

  // For payment apps, also create/update a credential record if needed
  if (appMetadata?.type === "stripe_payment" && input.fromEnabled) {
    // Check if credential already exists
    const existingCredential = await ctx.prisma.credential.findFirst({
      where: {
        userId: ctx.user.id,
        type: "stripe_payment",
      },
    });

    if (!existingCredential) {
      // Create a basic credential for manual configuration
      // Note: This won't have stripe_user_id since it's not OAuth
      await ctx.prisma.credential.create({
        data: {
          type: "stripe_payment",
          key: {
            ...keys,
            manual_config: true,
          } as Prisma.InputJsonObject,
          userId: ctx.user.id,
          appId: input.slug,
        },
      });
    }
  }
};
