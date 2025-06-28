import type { Prisma } from "@prisma/client";

import prisma from "@calcom/prisma";

async function getAppKeysFromSlug(slug: string) {
  const app = await prisma.app.findUnique({ where: { slug } });
  // TODO: Remove debug logging after debugging
  console.log(`[Cal.com DEBUG] getAppKeysFromSlug('${slug}') returned:`, app?.keys);
  return (app?.keys || {}) as Prisma.JsonObject;
}

export default getAppKeysFromSlug;
