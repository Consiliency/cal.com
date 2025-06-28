import type Zod from "zod";
import type z from "zod";

import getAppKeysFromSlug from "./getAppKeysFromSlug";

export async function getParsedAppKeysFromSlug<T extends Zod.Schema>(
  slug: string,
  schema: T
): Promise<z.infer<T>> {
  const appKeys = await getAppKeysFromSlug(slug);
  // TODO: Remove debug logging after debugging
  console.log(`[Cal.com DEBUG] getParsedAppKeysFromSlug('${slug}') raw appKeys:`, appKeys);
  try {
    const parsed = schema.parse(appKeys);
    // TODO: Remove debug logging after debugging
    console.log(`[Cal.com DEBUG] getParsedAppKeysFromSlug('${slug}') parsed:`, parsed);
    return parsed;
  } catch (e) {
    // TODO: Remove debug logging after debugging
    console.error(`[Cal.com DEBUG] getParsedAppKeysFromSlug('${slug}') Zod parse error:`, e);
    throw e;
  }
}

export default getParsedAppKeysFromSlug;
