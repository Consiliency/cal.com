import type { CalendarEvent } from "@calcom/types/Calendar";

import { getReplyToEmail } from "./getReplyToEmail";

export function getReplyToHeader(
  calEvent: CalendarEvent,
  additionalEmails?: string | string[],
  excludeOrganizerEmail?: boolean,
  useFromAsReplyTo?: boolean,
  fromEmail?: string
) {
  if (calEvent.hideOrganizerEmail) return {};

  // Check if we should use from address as replyTo (either explicitly set or via env var)
  const shouldUseFromAsReplyTo = useFromAsReplyTo || process.env.EMAIL_USE_FROM_AS_REPLYTO === "true";

  // If shouldUseFromAsReplyTo is true and fromEmail is provided, use it as replyTo
  if (shouldUseFromAsReplyTo && fromEmail) {
    return { replyTo: fromEmail };
  }

  const replyToEmail = getReplyToEmail(calEvent, excludeOrganizerEmail);
  const emailArray: string[] = [];

  if (additionalEmails) {
    if (Array.isArray(additionalEmails)) {
      emailArray.push(...additionalEmails);
    } else {
      emailArray.push(additionalEmails);
    }
  }

  if (replyToEmail) {
    emailArray.push(replyToEmail);
  }

  if (emailArray.length === 0) {
    return {};
  }

  const replyTo = emailArray.length === 1 ? emailArray[0] : emailArray;
  return { replyTo };
}
