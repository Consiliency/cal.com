import { useRouter } from "next/navigation";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { Meta } from "@calcom/ui/components/meta";

export default function StripePaymentSetup() {
  const { t } = useLocale();
  const router = useRouter();

  // Check if Stripe is already connected
  const { data: credentials } = trpc.viewer.apps.listLocal.useQuery({ category: "payment" });
  const stripeApp = credentials?.find((app) => app.slug === "stripe");
  const isConnected = stripeApp?.isInstalled || false;

  const handleConnect = () => {
    // Use the Stripe OAuth URL from their app directory
    window.location.href = `${WEBAPP_URL}/api/integrations/stripe/add`;
  };

  return (
    <>
      <Meta title="Stripe Setup" description="Connect your Stripe account" />
      <div className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
          <div className="mb-6 text-center">
            <Icon name="credit-card" className="mx-auto mb-4 h-12 w-12 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isConnected ? t("stripe_already_connected") : t("connect_stripe_account")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {isConnected ? t("stripe_connection_active") : t("connect_stripe_to_accept_payments")}
            </p>
          </div>

          {isConnected ? (
            <>
              <Alert severity="success" title={t("stripe_connected")} className="mb-4" />
              <Button
                onClick={() => router.push("/event-types")}
                className="w-full"
                size="lg"
                StartIcon="arrow-left">
                {t("go_to_event_types")}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleConnect} className="w-full" size="lg" StartIcon="credit-card">
                {t("connect_with_stripe")}
              </Button>
              <p className="mt-4 text-center text-xs text-gray-500">{t("stripe_redirect_notice")}</p>
            </>
          )}

          <div className="mt-6 text-center">
            <Button variant="minimal" onClick={() => router.back()} className="text-sm">
              {t("go_back")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
