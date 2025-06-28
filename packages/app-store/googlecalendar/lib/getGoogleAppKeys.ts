import { z } from "zod";

import getParsedAppKeysFromSlug from "../../_utils/getParsedAppKeysFromSlug";

const googleAppKeysSchema = z.object({
  client_id: z.string(),
  client_secret: z.string(),
  redirect_uris: z.array(z.string()),
});

export const getGoogleAppKeys = async () => {
  const keys = await getParsedAppKeysFromSlug("google-calendar", googleAppKeysSchema);
  // TODO: Remove debug logging after debugging
  console.log("[Cal.com DEBUG] getGoogleAppKeys parsed keys:", keys);
  return keys;
};
