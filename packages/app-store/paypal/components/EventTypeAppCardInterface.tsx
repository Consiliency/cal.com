import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import AppCard from "@calcom/app-store/_components/AppCard";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";

import checkForMultiplePaymentApps from "../../_utils/payments/checkForMultiplePaymentApps";
import useIsAppEnabled from "../../_utils/useIsAppEnabled";
import type { appDataSchema } from "../zod";
import EventTypeAppSettingsInterface from "./EventTypeAppSettingsInterface";

const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({
  app,
  eventType,
  eventTypeFormMetadata,
}) {
  const searchParams = useSearchParams();
  /** TODO "pathname" no longer contains square-bracket expressions. Rewrite the code relying on them if required. **/
  const pathname = usePathname();
  const asPath = useMemo(
    () => `${pathname}${searchParams ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams]
  );
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const { enabled, updateEnabled } = useIsAppEnabled(app);
  const otherPaymentAppEnabled = checkForMultiplePaymentApps(eventTypeFormMetadata);
  const { t } = useLocale();

  const shouldDisableSwitch = !enabled && otherPaymentAppEnabled;

  return (
    <AppCard
      returnTo={WEBAPP_URL + asPath}
      app={app}
      switchChecked={enabled}
      switchOnClick={(e) => {
        updateEnabled(e);
      }}
      description={<>Add Paypal payment to your events</>}
      teamId={eventType.team?.id || undefined}
      disableSwitch={shouldDisableSwitch}
      switchTooltip={shouldDisableSwitch ? t("other_payment_app_enabled") : undefined}>
      <>
        <EventTypeAppSettingsInterface
          eventType={eventType}
          slug={app.slug}
          disabled={disabled}
          getAppData={getAppData}
          setAppData={setAppData}
        />
      </>
    </AppCard>
  );
};

export default EventTypeAppCard;
