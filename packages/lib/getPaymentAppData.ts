import type { z } from "zod";

import { getEventTypeAppData } from "@calcom/app-store/_utils/getEventTypeAppData";
import type { appDataSchemas } from "@calcom/app-store/apps.schemas.generated";
import type { appDataSchema } from "@calcom/app-store/stripepayment/zod";
import type { paymentOptionEnum } from "@calcom/app-store/stripepayment/zod";
import type { EventTypeAppsList } from "@calcom/app-store/utils";
import type { BookerEvent } from "@calcom/features/bookings/types";
import type { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/prisma/zod-utils";

export function getPaymentAppData(
  _eventType: Pick<BookerEvent, "price" | "currency"> & {
    metadata: z.infer<typeof EventTypeMetaDataSchema>;
  },
  forcedGet?: boolean
) {
  const eventType = {
    ..._eventType,
    metadata: eventTypeMetaDataSchemaWithTypedApps.parse(_eventType.metadata),
  };
  const metadataApps = eventType.metadata?.apps;
  if (!metadataApps) {
    return {
      enabled: false,
      price: 0,
      currency: "usd",
      appId: null,
      paymentOption: "ON_BOOKING" as const,
      credentialId: undefined,
      refundPolicy: undefined,
      refundDaysCount: undefined,
      refundCountCalendarDays: undefined,
    };
  }
  type appId = keyof typeof metadataApps;
  // @TODO: a lot of unknowns types here can be improved later
  const paymentAppIds = (Object.keys(metadataApps) as Array<keyof typeof appDataSchemas>).filter(
    (app) =>
      (metadataApps[app as appId] as unknown as z.infer<typeof appDataSchema>)?.price &&
      (metadataApps[app as appId] as unknown as z.infer<typeof appDataSchema>)?.enabled
  );

  // Event type should only have one payment app data
  let paymentAppData: {
    enabled: boolean;
    price: number;
    currency: string;
    appId: EventTypeAppsList | null;
    paymentOption: z.infer<typeof paymentOptionEnum>;
    credentialId?: number;
    refundPolicy?: string;
    refundDaysCount?: number;
    refundCountCalendarDays?: boolean;
  } | null = null;
  for (const appId of paymentAppIds) {
    const appData = getEventTypeAppData(eventType, appId, forcedGet);
    if (appData && paymentAppData === null) {
      paymentAppData = {
        ...appData,
        appId,
      };
    }
  }
  // This is the current expectation of system to have price and currency set always(using DB Level defaults).
  // Newly added apps code should assume that their app data might not be set.
  const result = paymentAppData || {
    enabled: false,
    price: 0,
    currency: "usd",
    appId: null,
    paymentOption: "ON_BOOKING",
    credentialId: undefined,
    refundPolicy: undefined,
    refundDaysCount: undefined,
    refundCountCalendarDays: undefined,
  };
  return result;
}

export type PaymentAppData = ReturnType<typeof getPaymentAppData>;
