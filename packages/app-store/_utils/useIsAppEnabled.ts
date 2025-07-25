import { useState } from "react";

import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";

import type { EventTypeAppCardApp } from "../types";

function useIsAppEnabled(app: EventTypeAppCardApp, teamId?: number | null) {
  const { getAppData, setAppData } = useAppContextWithSchema();
  const [enabled, setEnabled] = useState(() => {
    const isAppEnabled = getAppData("enabled");

    if (!app.credentialOwner) {
      return isAppEnabled ?? false; // Default to false if undefined
    }

    const credentialId = getAppData("credentialId");
    const isAppEnabledForCredential =
      isAppEnabled &&
      (app.userCredentialIds.some((id) => id === credentialId) ||
        app.credentialOwner.credentialId === credentialId);
    return isAppEnabledForCredential ?? false; // Default to false if undefined
  });

  const updateEnabled = (newValue: boolean) => {
    if (!newValue) {
      setAppData("credentialId", undefined);
    }

    if (newValue) {
      // Check for team credentials - cast to any to handle missing type definition
      const teamCredentials = (app as any).teams || [];

      // If this is a team event and we have team credentials, use them
      if (teamId && teamCredentials.length > 0) {
        const teamCredential = teamCredentials.find(
          (t: { teamId: number; credentialId: number }) => t.teamId === teamId
        );
        if (teamCredential) {
          setAppData("credentialId", teamCredential.credentialId);
        } else {
          // Fallback to first team credential if specific team not found
          setAppData("credentialId", teamCredentials[0].credentialId);
        }
      } else if (app.credentialOwner?.credentialId) {
        setAppData("credentialId", app.credentialOwner.credentialId);
      } else if (app.userCredentialIds?.length) {
        setAppData("credentialId", app.userCredentialIds[0]);
      }
    }
    setEnabled(newValue);
  };

  return { enabled, updateEnabled };
}

export default useIsAppEnabled;
