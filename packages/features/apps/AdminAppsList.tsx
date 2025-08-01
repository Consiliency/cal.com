"use client";

import { zodResolver } from "@hookform/resolvers/zod";
// eslint-disable-next-line no-restricted-imports
import { noop } from "lodash";
import type { FC } from "react";
import { useReducer, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import AppCategoryNavigation from "@calcom/app-store/_components/AppCategoryNavigation";
import { appKeysSchemas } from "@calcom/app-store/apps.keys-schemas.generated";
import AppListCard from "@calcom/features/apps/components/AppListCard";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { AppCategories } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import cs from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import {
  DialogContent,
  DialogFooter,
  DialogClose,
  ConfirmationDialogContent,
} from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { Form } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { List } from "@calcom/ui/components/list";
import { SkeletonButton, SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";
import { showToast } from "@calcom/ui/components/toast";

type App = RouterOutputs["viewer"]["apps"]["listLocal"][number];

const IntegrationContainer = ({
  app,
  category,
  handleModelOpen,
}: {
  app: App;
  category: string;
  handleModelOpen: (data: EditModalState) => void;
}) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [disableDialog, setDisableDialog] = useState(false);

  const showKeyModal = (fromEnabled?: boolean) => {
    // FIXME: This is preventing the modal from opening for apps that has null keys
    if (app.keys) {
      handleModelOpen({
        dirName: app.dirName,
        keys: app.keys,
        slug: app.slug,
        type: app.type,
        isOpen: "editKeys",
        fromEnabled,
        appName: app.name,
      });
    }
  };

  const enableAppMutation = trpc.viewer.apps.toggle.useMutation({
    onSuccess: (enabled) => {
      utils.viewer.apps.listLocal.invalidate({ category });
      setDisableDialog(false);
      showToast(
        enabled ? t("app_is_enabled", { appName: app.name }) : t("app_is_disabled", { appName: app.name }),
        "success"
      );
      if (enabled) {
        showKeyModal();
      }
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  return (
    <li>
      <AppListCard
        logo={app.logo}
        description={app.description}
        title={app.name}
        isTemplate={app.isTemplate}
        actions={
          <div className="flex items-center justify-self-end">
            {app.keys && (
              <Button color="secondary" className="mr-2" onClick={() => showKeyModal()}>
                <Icon name="pencil" />
              </Button>
            )}

            <Switch
              checked={app.enabled}
              onClick={() => {
                if (app.enabled) {
                  setDisableDialog(true);
                } else if (app.keys) {
                  showKeyModal(true);
                } else {
                  enableAppMutation.mutate({ slug: app.slug, enabled: !app.enabled });
                }
              }}
            />
          </div>
        }
      />

      <Dialog open={disableDialog} onOpenChange={setDisableDialog}>
        <ConfirmationDialogContent
          title={t("disable_app")}
          variety="danger"
          onConfirm={() => {
            enableAppMutation.mutate({ slug: app.slug, enabled: !app.enabled });
          }}>
          {t("disable_app_description")}
        </ConfirmationDialogContent>
      </Dialog>
    </li>
  );
};

const querySchema = z.object({
  category: z
    .nativeEnum({ ...AppCategories, conferencing: "conferencing" })
    .optional()
    .default(AppCategories.calendar),
});

const AdminAppsList = ({
  baseURL,
  className,
  useQueryParam = false,
  classNames,
  onSubmit = noop,
  ...rest
}: {
  baseURL: string;
  classNames?: {
    form?: string;
    appCategoryNavigationRoot?: string;
    appCategoryNavigationContainer?: string;
    verticalTabsItem?: string;
  };
  className?: string;
  useQueryParam?: boolean;
  onSubmit?: () => void;
} & Omit<JSX.IntrinsicElements["form"], "onSubmit">) => {
  return (
    <form
      {...rest}
      className={
        classNames?.form ?? "bg-default max-w-80 mb-4 rounded-md px-0 pt-0 md:max-w-full md:px-8 md:pt-10"
      }
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}>
      <AppCategoryNavigation
        baseURL={baseURL}
        useQueryParam={useQueryParam}
        classNames={{
          root: className,
          verticalTabsItem: classNames?.verticalTabsItem,
          container: cs("min-w-0 w-full", classNames?.appCategoryNavigationContainer ?? "max-w-[500px]"),
        }}>
        <AdminAppsListContainer />
      </AppCategoryNavigation>
    </form>
  );
};

const EditKeysModal: FC<{
  dirName: string;
  slug: string;
  type: string;
  isOpen: boolean;
  keys: App["keys"];
  handleModelClose: () => void;
  fromEnabled?: boolean;
  appName?: string;
}> = (props) => {
  const utils = trpc.useUtils();
  const { t } = useLocale();
  const { dirName, slug, type, isOpen, keys, handleModelClose, fromEnabled, appName } = props;
  // Use slug for schema lookup as the generated schemas use appId (slug) as key
  const appKeySchema = appKeysSchemas[slug as keyof typeof appKeysSchemas];

  if (!appKeySchema) {
    console.error(`No key schema found for app: ${slug}`);
  }

  const formMethods = useForm({
    resolver: appKeySchema ? zodResolver(appKeySchema) : undefined,
  });

  const saveKeysMutation = trpc.viewer.apps.saveKeys.useMutation({
    onSuccess: () => {
      showToast(fromEnabled ? t("app_is_enabled", { appName }) : t("keys_have_been_saved"), "success");
      utils.viewer.apps.listLocal.invalidate();
      handleModelClose();
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  // Helper function to get user-friendly labels for app keys
  const getKeyLabel = (key: string, appSlug: string) => {
    // Special labels for Stripe platform account keys
    if (appSlug === "stripe") {
      switch (key) {
        case "client_id":
          return "OAuth Client ID (optional - only for Connect apps)";
        case "client_secret":
          return "Stripe Secret Key (sk_...)";
        case "public_key":
          return "Stripe Publishable Key (pk_...)";
        case "webhook_secret":
          return "Webhook Signing Secret (whsec_...)";
        default:
          return key;
      }
    }
    // Default to the key name for other apps
    return key;
  };

  // Helper function to get helper text for app keys
  const getKeyHelperText = (key: string, appSlug: string) => {
    if (appSlug === "stripe") {
      switch (key) {
        case "client_id":
          return "Leave empty for platform account. Only needed for Stripe Connect OAuth.";
        case "client_secret":
          return "Your Stripe secret key from the API keys section";
        case "public_key":
          return "Your Stripe publishable key from the API keys section";
        case "webhook_secret":
          return "Signing secret from your webhook endpoint settings";
        default:
          return undefined;
      }
    }
    return undefined;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleModelClose}>
      <DialogContent title={t("edit_keys")} type="creation">
        {!!keys && typeof keys === "object" && (
          <Form
            id="edit-keys"
            form={formMethods}
            handleSubmit={(values) =>
              saveKeysMutation.mutate({
                slug,
                type,
                keys: values,
                dirName,
                fromEnabled,
              })
            }
            className="px-4 pb-4">
            {Object.keys(keys).map((key) => (
              <Controller
                name={key}
                key={key}
                control={formMethods.control}
                defaultValue={keys && keys[key] ? keys?.[key] : ""}
                render={({ field: { value } }) => (
                  <TextField
                    label={getKeyLabel(key, slug)}
                    key={key}
                    name={key}
                    value={value}
                    hint={getKeyHelperText(key, slug)}
                    onChange={(e) => {
                      formMethods.setValue(key, e?.target.value || "");
                    }}
                  />
                )}
              />
            ))}
          </Form>
        )}
        <DialogFooter showDivider className="mt-8">
          <DialogClose onClick={handleModelClose} />
          <Button form="edit-keys" type="submit">
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface EditModalState extends Pick<App, "keys"> {
  isOpen: "none" | "editKeys" | "disableKeys";
  dirName: string;
  type: string;
  slug: string;
  fromEnabled?: boolean;
  appName?: string;
}

const AdminAppsListContainer = () => {
  const searchParams = useCompatSearchParams();
  const { t } = useLocale();
  const category = searchParams?.get("category") || AppCategories.calendar;

  const { data: apps, isPending } = trpc.viewer.apps.listLocal.useQuery(
    { category },
    { enabled: searchParams !== null }
  );

  const [modalState, setModalState] = useReducer(
    (data: EditModalState, partialData: Partial<EditModalState>) => ({ ...data, ...partialData }),
    {
      keys: null,
      isOpen: "none",
      dirName: "",
      type: "",
      slug: "",
    }
  );

  const handleModelClose = () =>
    setModalState({ keys: null, isOpen: "none", dirName: "", slug: "", type: "" });

  const handleModelOpen = (data: EditModalState) => setModalState({ ...data });

  if (isPending) return <SkeletonLoader />;

  if (!apps || apps.length === 0) {
    return (
      <EmptyScreen
        Icon="circle-alert"
        headline={t("no_available_apps")}
        description={t("no_available_apps_description")}
      />
    );
  }

  return (
    <>
      <List>
        {apps.map((app) => (
          <IntegrationContainer
            handleModelOpen={handleModelOpen}
            app={app}
            key={app.name}
            category={category}
          />
        ))}
      </List>
      {modalState.isOpen === "editKeys" && (
        <EditKeysModal
          keys={modalState.keys}
          dirName={modalState.dirName}
          handleModelClose={handleModelClose}
          isOpen={modalState.isOpen === "editKeys"}
          slug={modalState.slug}
          type={modalState.type}
          fromEnabled={modalState.fromEnabled}
          appName={modalState.appName}
        />
      )}
    </>
  );
};

export default AdminAppsList;

const SkeletonLoader = () => {
  return (
    <SkeletonContainer className="w-[30rem] pr-10">
      <div className="mb-8 mt-6 space-y-6">
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />

        <SkeletonButton className="mr-6 h-8 w-20 rounded-md p-5" />
      </div>
    </SkeletonContainer>
  );
};
