import type { DestinationCalendar, User } from "@prisma/client";
// eslint-disable-next-line no-restricted-imports
import { cloneDeep } from "lodash";
import short, { uuid } from "short-uuid";
import { v5 as uuidv5 } from "uuid";

import processExternalId from "@calcom/app-store/_utils/calendars/processExternalId";
import { metadata as GoogleMeetMetadata } from "@calcom/app-store/googlevideo/_metadata";
import {
  getLocationValueForDB,
  MeetLocationType,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { getAppFromSlug } from "@calcom/app-store/utils";
import dayjs from "@calcom/dayjs";
import { scheduleMandatoryReminder } from "@calcom/ee/workflows/lib/reminders/scheduleMandatoryReminder";
import {
  sendAttendeeRequestEmailAndSMS,
  sendOrganizerRequestEmail,
  sendRescheduledEmailsAndSMS,
  sendRoundRobinCancelledEmailsAndSMS,
  sendRoundRobinRescheduledEmailsAndSMS,
  sendRoundRobinScheduledEmailsAndSMS,
  sendScheduledEmailsAndSMS,
} from "@calcom/emails";
import getICalUID from "@calcom/emails/lib/getICalUID";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import { isEventTypeLoggingEnabled } from "@calcom/features/bookings/lib/isEventTypeLoggingEnabled";
import { getShouldServeCache } from "@calcom/features/calendar-cache/lib/getShouldServeCache";
import AssignmentReasonRecorder from "@calcom/features/ee/round-robin/assignmentReason/AssignmentReasonRecorder";
import {
  allowDisablingAttendeeConfirmationEmails,
  allowDisablingHostConfirmationEmails,
} from "@calcom/features/ee/workflows/lib/allowDisablingStandardEmails";
import { scheduleWorkflowReminders } from "@calcom/features/ee/workflows/lib/reminders/reminderScheduler";
import { getFullName } from "@calcom/features/form-builder/utils";
import { UsersRepository } from "@calcom/features/users/users.repository";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import {
  deleteWebhookScheduledTriggers,
  scheduleTrigger,
} from "@calcom/features/webhooks/lib/scheduleTrigger";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import EventManager, { placeholderCreatedEvent } from "@calcom/lib/EventManager";
import { handleAnalyticsEvents } from "@calcom/lib/analyticsManager/handleAnalyticsEvents";
import { shouldIgnoreContactOwner } from "@calcom/lib/bookings/routing/utils";
import { getUsernameList } from "@calcom/lib/defaultEvents";
import {
  enrichHostsWithDelegationCredentials,
  getFirstDelegationConferencingCredentialAppLocation,
} from "@calcom/lib/delegationCredential/server";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { getEventName, updateHostInEventName } from "@calcom/lib/event";
import { extractBaseEmail } from "@calcom/lib/extract-base-email";
import { getBookerBaseUrl } from "@calcom/lib/getBookerUrl/server";
import getOrgIdFromMemberOrTeamId from "@calcom/lib/getOrgIdFromMemberOrTeamId";
import { getPaymentAppData } from "@calcom/lib/getPaymentAppData";
import { getTeamIdFromEventType } from "@calcom/lib/getTeamIdFromEventType";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { handlePayment } from "@calcom/lib/payment/handlePayment";
import { getPiiFreeCalendarEvent, getPiiFreeEventType } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getLuckyUser } from "@calcom/lib/server/getLuckyUser";
import { getTranslation } from "@calcom/lib/server/i18n";
import { BookingRepository } from "@calcom/lib/server/repository/booking";
import { WorkflowRepository } from "@calcom/lib/server/repository/workflow";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import prisma from "@calcom/prisma";
import type { AssignmentReasonEnum } from "@calcom/prisma/enums";
import { BookingStatus, SchedulingType, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { CreationSource } from "@calcom/prisma/enums";
import {
  eventTypeAppMetadataOptionalSchema,
  eventTypeMetaDataSchemaWithTypedApps,
} from "@calcom/prisma/zod-utils";
import { userMetadata as userMetadataSchema } from "@calcom/prisma/zod-utils";
import { getAllWorkflowsFromEventType } from "@calcom/trpc/server/routers/viewer/workflows/util";
import type { AdditionalInformation, AppsStatus, CalendarEvent, Person } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { EventResult, PartialReference } from "@calcom/types/EventManager";

import type { EventPayloadType, EventTypeInfo } from "../../webhooks/lib/sendPayload";
import { getAllCredentialsIncludeServiceAccountKey } from "./getAllCredentialsForUsersOnEvent/getAllCredentials";
import { refreshCredentials } from "./getAllCredentialsForUsersOnEvent/refreshCredentials";
import getBookingDataSchema from "./getBookingDataSchema";
import { addVideoCallDataToEvent } from "./handleNewBooking/addVideoCallDataToEvent";
import { checkActiveBookingsLimitForBooker } from "./handleNewBooking/checkActiveBookingsLimitForBooker";
import { checkBookingAndDurationLimits } from "./handleNewBooking/checkBookingAndDurationLimits";
import { checkIfBookerEmailIsBlocked } from "./handleNewBooking/checkIfBookerEmailIsBlocked";
import { createBooking } from "./handleNewBooking/createBooking";
import type { Booking } from "./handleNewBooking/createBooking";
import { ensureAvailableUsers } from "./handleNewBooking/ensureAvailableUsers";
import { getBookingData } from "./handleNewBooking/getBookingData";
import { getCustomInputsResponses } from "./handleNewBooking/getCustomInputsResponses";
import { getEventType } from "./handleNewBooking/getEventType";
import type { getEventTypeResponse } from "./handleNewBooking/getEventTypesFromDB";
import { getLocationValuesForDb } from "./handleNewBooking/getLocationValuesForDb";
import { getRequiresConfirmationFlags } from "./handleNewBooking/getRequiresConfirmationFlags";
import { getSeatedBooking } from "./handleNewBooking/getSeatedBooking";
import { getVideoCallDetails } from "./handleNewBooking/getVideoCallDetails";
import { handleAppsStatus } from "./handleNewBooking/handleAppsStatus";
import { loadAndValidateUsers } from "./handleNewBooking/loadAndValidateUsers";
import { createLoggerWithEventDetails } from "./handleNewBooking/logger";
import { getOriginalRescheduledBooking } from "./handleNewBooking/originalRescheduledBookingUtils";
import type { BookingType } from "./handleNewBooking/originalRescheduledBookingUtils";
import { scheduleNoShowTriggers } from "./handleNewBooking/scheduleNoShowTriggers";
import type { IEventTypePaymentCredentialType, Invitee, IsFixedAwareUser } from "./handleNewBooking/types";
import { validateBookingTimeIsNotOutOfBounds } from "./handleNewBooking/validateBookingTimeIsNotOutOfBounds";
import { validateEventLength } from "./handleNewBooking/validateEventLength";
import handleSeats from "./handleSeats/handleSeats";

const translator = short();
const log = logger.getSubLogger({ prefix: ["[api] book:user"] });

type IsFixedAwareUserWithCredentials = Omit<IsFixedAwareUser, "credentials"> & {
  credentials: CredentialForCalendarService[];
};

function assertNonEmptyArray<T>(arr: T[]): asserts arr is [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error("Array should have at least one item, but it's empty");
  }
}

function getICalSequence(originalRescheduledBooking: BookingType | null) {
  // If new booking set the sequence to 0
  if (!originalRescheduledBooking) {
    return 0;
  }

  // If rescheduling and there is no sequence set, assume sequence should be 1
  if (!originalRescheduledBooking.iCalSequence) {
    return 1;
  }

  // If rescheduling then increment sequence by 1
  return originalRescheduledBooking.iCalSequence + 1;
}

type BookingDataSchemaGetter =
  | typeof getBookingDataSchema
  | typeof import("@calcom/features/bookings/lib/getBookingDataSchemaForApi").default;

type CreatedBooking = Booking & { appsStatus?: AppsStatus[]; paymentUid?: string; paymentId?: number };
type ReturnTypeCreateBooking = Awaited<ReturnType<typeof createBooking>>;
export const buildDryRunBooking = ({
  eventTypeId,
  organizerUser,
  eventName,
  startTime,
  endTime,
  contactOwnerFromReq,
  contactOwnerEmail,
  allHostUsers,
  isManagedEventType,
}: {
  eventTypeId: number;
  organizerUser: {
    id: number;
    name: string | null;
    username: string | null;
    email: string;
    timeZone: string;
  };
  eventName: string;
  startTime: string;
  endTime: string;
  contactOwnerFromReq: string | null;
  contactOwnerEmail: string | null;
  allHostUsers: { id: number }[];
  isManagedEventType: boolean;
}) => {
  const sanitizedOrganizerUser = {
    id: organizerUser.id,
    name: organizerUser.name,
    username: organizerUser.username,
    email: organizerUser.email,
    timeZone: organizerUser.timeZone,
  };
  const booking = {
    id: -101,
    uid: "DRY_RUN_UID",
    iCalUID: "DRY_RUN_ICAL_UID",
    status: BookingStatus.ACCEPTED,
    eventTypeId: eventTypeId,
    user: sanitizedOrganizerUser,
    userId: sanitizedOrganizerUser.id,
    title: eventName,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    createdAt: new Date(),
    updatedAt: new Date(),
    attendees: [],
    oneTimePassword: null,
    smsReminderNumber: null,
    metadata: {},
    idempotencyKey: null,
    userPrimaryEmail: null,
    description: null,
    customInputs: null,
    responses: null,
    location: null,
    paid: false,
    cancellationReason: null,
    rejectionReason: null,
    dynamicEventSlugRef: null,
    dynamicGroupSlugRef: null,
    fromReschedule: null,
    recurringEventId: null,
    scheduledJobs: [],
    rescheduledBy: null,
    destinationCalendarId: null,
    reassignReason: null,
    reassignById: null,
    rescheduled: false,
    isRecorded: false,
    iCalSequence: 0,
    rating: null,
    ratingFeedback: null,
    noShowHost: null,
    cancelledBy: null,
    creationSource: CreationSource.WEBAPP,
    references: [],
    payment: [],
  } satisfies ReturnTypeCreateBooking;

  /**
   * Troubleshooting data
   */
  const troubleshooterData = {
    organizerUserId: organizerUser.id,
    eventTypeId,
    askedContactOwnerEmail: contactOwnerFromReq,
    usedContactOwnerEmail: contactOwnerEmail,
    allHostUsers: allHostUsers.map((user) => user.id),
    isManagedEventType: isManagedEventType,
  };

  return {
    booking,
    troubleshooterData,
  };
};

const buildDryRunEventManager = () => {
  return {
    create: async () => ({ results: [], referencesToCreate: [] }),
    reschedule: async () => ({ results: [], referencesToCreate: [] }),
  };
};

export const buildEventForTeamEventType = async ({
  existingEvent: evt,
  users,
  organizerUser,
  schedulingType,
  team,
}: {
  existingEvent: Partial<CalendarEvent>;
  users: (Pick<User, "id" | "name" | "timeZone" | "locale" | "email"> & {
    destinationCalendar: DestinationCalendar | null;
    isFixed?: boolean;
  })[];
  organizerUser: { email: string };
  schedulingType: SchedulingType | null;
  team?: {
    id: number;
    name: string;
  } | null;
}) => {
  // not null assertion.
  if (!schedulingType) {
    throw new Error("Scheduling type is required for team event type");
  }
  const teamDestinationCalendars: DestinationCalendar[] = [];
  const fixedUsers = users.filter((user) => user.isFixed);
  const nonFixedUsers = users.filter((user) => !user.isFixed);
  const filteredUsers =
    schedulingType === SchedulingType.ROUND_ROBIN
      ? [...fixedUsers, ...(nonFixedUsers.length > 0 ? [nonFixedUsers[0]] : [])]
      : users;

  // Organizer or user owner of this event type it's not listed as a team member.
  const teamMemberPromises = filteredUsers
    .filter((user) => user.email !== organizerUser.email)
    .map(async (user) => {
      // TODO: Add back once EventManager tests are ready https://github.com/calcom/cal.com/pull/14610#discussion_r1567817120
      // push to teamDestinationCalendars if it's a team event but collective only
      if (schedulingType === "COLLECTIVE" && user.destinationCalendar) {
        teamDestinationCalendars.push({
          ...user.destinationCalendar,
          externalId: processExternalId(user.destinationCalendar),
        });
      }

      return {
        id: user.id,
        email: user.email ?? "",
        name: user.name ?? "",
        firstName: "",
        lastName: "",
        timeZone: user.timeZone,
        language: {
          translate: await getTranslation(user.locale ?? "en", "common"),
          locale: user.locale ?? "en",
        },
      };
    });

  const teamMembers = await Promise.all(teamMemberPromises);

  evt = CalendarEventBuilder.fromEvent(evt)
    .withDestinationCalendar([...(evt.destinationCalendar ?? []), ...teamDestinationCalendars])
    .build();

  return CalendarEventBuilder.fromEvent(evt)
    .withTeam({
      members: teamMembers,
      name: team?.name || "Nameless",
      id: team?.id ?? 0,
    })
    .build();
};

function buildTroubleshooterData({
  eventType,
}: {
  eventType: {
    id: number;
    slug: string;
  };
}) {
  const troubleshooterData: {
    organizerUser: {
      id: number;
    } | null;
    eventType: {
      id: number;
      slug: string;
    };
    allHostUsers: number[];
    luckyUsers: number[];
    luckyUserPool: number[];
    fixedUsers: number[];
    luckyUsersFromFirstBooking: number[];
    usedContactOwnerEmail: string | null;
    askedContactOwnerEmail: string | null;
    isManagedEventType: boolean;
  } = {
    organizerUser: null,
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
    },
    luckyUsers: [],
    luckyUserPool: [],
    fixedUsers: [],
    luckyUsersFromFirstBooking: [],
    usedContactOwnerEmail: null,
    allHostUsers: [],
    askedContactOwnerEmail: null,
    isManagedEventType: false,
  };
  return troubleshooterData;
}

export type PlatformParams = {
  platformClientId?: string;
  platformCancelUrl?: string;
  platformBookingUrl?: string;
  platformRescheduleUrl?: string;
  platformBookingLocation?: string;
  areCalendarEventsEnabled?: boolean;
};

export type BookingHandlerInput = {
  bookingData: Record<string, unknown>;
  userId?: number;
  // These used to come from headers but now we're passing them as params
  hostname?: string;
  forcedSlug?: string;
} & PlatformParams;

async function handler(
  input: BookingHandlerInput,
  bookingDataSchemaGetter: BookingDataSchemaGetter = getBookingDataSchema
) {
  const {
    bookingData: rawBookingData,
    userId,
    platformClientId,
    platformCancelUrl,
    platformBookingUrl,
    platformRescheduleUrl,
    platformBookingLocation,
    hostname,
    forcedSlug,
    areCalendarEventsEnabled = true,
  } = input;

  const isPlatformBooking = !!platformClientId;

  const eventType = await getEventType({
    eventTypeId: Number(rawBookingData.eventTypeId) || 0,
    eventTypeSlug: rawBookingData.eventTypeSlug as string | undefined,
  });

  const bookingDataSchema = bookingDataSchemaGetter({
    view: rawBookingData.rescheduleUid ? "reschedule" : "booking",
    bookingFields: eventType.bookingFields,
  });

  const bookingData = await getBookingData({
    reqBody: rawBookingData,
    eventType,
    schema: bookingDataSchema,
  });

  const {
    recurringCount,
    noEmail,
    eventTypeId,
    eventTypeSlug,
    hasHashedBookingLink,
    language,
    appsStatus: reqAppsStatus,
    name: bookerName,
    attendeePhoneNumber: bookerPhoneNumber,
    email: bookerEmail,
    guests: reqGuests,
    location,
    notes: additionalNotes,
    smsReminderNumber,
    rescheduleReason,
    luckyUsers,
    routedTeamMemberIds,
    reroutingFormResponses,
    routingFormResponseId,
    _isDryRun: isDryRun = false,
    _shouldServeCache,
    ...reqBody
  } = bookingData;

  let troubleshooterData = buildTroubleshooterData({
    eventType,
  });

  const loggerWithEventDetails = createLoggerWithEventDetails(eventTypeId, reqBody.user, eventTypeSlug);

  await checkIfBookerEmailIsBlocked({ loggedInUserId: userId, bookerEmail });

  if (!rawBookingData.rescheduleUid) {
    await checkActiveBookingsLimitForBooker({
      eventTypeId,
      maxActiveBookingsPerBooker: eventType.maxActiveBookingsPerBooker,
      bookerEmail,
      offerToRescheduleLastBooking: eventType.maxActiveBookingPerBookerOfferReschedule,
    });
  }

  if (isEventTypeLoggingEnabled({ eventTypeId, usernameOrTeamName: reqBody.user })) {
    logger.settings.minLevel = 0;
  }

  const fullName = getFullName(bookerName);
  // Why are we only using "en" locale
  const tGuests = await getTranslation("en", "common");

  const dynamicUserList = Array.isArray(reqBody.user) ? reqBody.user : getUsernameList(reqBody.user);
  if (!eventType) throw new HttpError({ statusCode: 404, message: "event_type_not_found" });

  if (eventType.seatsPerTimeSlot && eventType.recurringEvent) {
    throw new HttpError({
      statusCode: 400,
      message: "recurring_event_seats_error",
    });
  }

  const bookingSeat = reqBody.rescheduleUid ? await getSeatedBooking(reqBody.rescheduleUid) : null;
  const rescheduleUid = bookingSeat ? bookingSeat.booking.uid : reqBody.rescheduleUid;

  let originalRescheduledBooking = rescheduleUid
    ? await getOriginalRescheduledBooking(rescheduleUid, !!eventType.seatsPerTimeSlot)
    : null;

  const paymentAppData = getPaymentAppData({
    ...eventType,
    metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata),
  });

  loggerWithEventDetails.debug("Payment app data:", paymentAppData);

  const { userReschedulingIsOwner, isConfirmedByDefault } = await getRequiresConfirmationFlags({
    eventType,
    bookingStartTime: reqBody.start,
    userId,
    originalRescheduledBookingOrganizerId: originalRescheduledBooking?.user?.id,
    paymentAppData,
    bookerEmail,
  });

  // For unconfirmed bookings or round robin bookings with the same attendee and timeslot, return the original booking
  if (
    (!isConfirmedByDefault && !userReschedulingIsOwner) ||
    eventType.schedulingType === SchedulingType.ROUND_ROBIN
  ) {
    const existingBooking = await BookingRepository.getValidBookingFromEventTypeForAttendee({
      eventTypeId,
      bookerEmail,
      bookerPhoneNumber,
      startTime: new Date(dayjs(reqBody.start).utc().format()),
      filterForUnconfirmed: !isConfirmedByDefault,
    });

    if (existingBooking) {
      const bookingResponse = {
        ...existingBooking,
        user: {
          ...existingBooking.user,
          email: null,
        },
        paymentRequired: false,
        seatReferenceUid: "",
      };

      return {
        ...bookingResponse,
        luckyUsers: bookingResponse.userId ? [bookingResponse.userId] : [],
        isDryRun,
        ...(isDryRun ? { troubleshooterData } : {}),
        paymentUid: undefined,
        paymentId: undefined,
      };
    }
  }

  const shouldServeCache = await getShouldServeCache(_shouldServeCache, eventType.team?.id);

  const isTeamEventType =
    !!eventType.schedulingType && ["COLLECTIVE", "ROUND_ROBIN"].includes(eventType.schedulingType);

  loggerWithEventDetails.info(
    `Booking eventType ${eventTypeId} started`,
    safeStringify({
      reqBody: {
        user: reqBody.user,
        eventTypeId,
        eventTypeSlug,
        startTime: reqBody.start,
        endTime: reqBody.end,
        rescheduleUid: reqBody.rescheduleUid,
        location: location,
        timeZone: reqBody.timeZone,
      },
      isTeamEventType,
      eventType: getPiiFreeEventType(eventType),
      dynamicUserList,
      paymentAppData: {
        enabled: paymentAppData.enabled,
        price: paymentAppData.price,
        paymentOption: "paymentOption" in paymentAppData ? paymentAppData.paymentOption : "ON_BOOKING",
        currency: paymentAppData.currency,
        appId: paymentAppData.appId,
      },
    })
  );

  const user = eventType.users.find((user) => user.id === eventType.userId);
  const userSchedule = user?.schedules.find((schedule) => schedule.id === user?.defaultScheduleId);
  const eventTimeZone = eventType.schedule?.timeZone ?? userSchedule?.timeZone;

  await validateBookingTimeIsNotOutOfBounds<typeof eventType>(
    reqBody.start,
    reqBody.timeZone,
    eventType,
    eventTimeZone,
    loggerWithEventDetails
  );

  validateEventLength({
    reqBodyStart: reqBody.start,
    reqBodyEnd: reqBody.end,
    eventTypeMultipleDuration: eventType.metadata?.multipleDuration,
    eventTypeLength: eventType.length,
    logger: loggerWithEventDetails,
  });

  const contactOwnerFromReq = reqBody.teamMemberEmail ?? null;

  const skipContactOwner = shouldIgnoreContactOwner({
    skipContactOwner: reqBody.skipContactOwner ?? null,
    rescheduleUid: reqBody.rescheduleUid ?? null,
    routedTeamMemberIds: routedTeamMemberIds ?? null,
  });

  const contactOwnerEmail = skipContactOwner ? null : contactOwnerFromReq;

  let routingFormResponse = null;

  if (routedTeamMemberIds) {
    //routingFormResponseId could be 0 for dry run. So, we just avoid undefined value
    if (routingFormResponseId === undefined) {
      throw new HttpError({ statusCode: 400, message: "Missing routingFormResponseId" });
    }
    routingFormResponse = await prisma.app_RoutingForms_FormResponse.findUnique({
      where: {
        id: routingFormResponseId,
      },
      select: {
        response: true,
        form: {
          select: {
            routes: true,
            fields: true,
          },
        },
        chosenRouteId: true,
      },
    });
  }

  const { qualifiedRRUsers, additionalFallbackRRUsers, fixedUsers } = await loadAndValidateUsers({
    hostname,
    forcedSlug,
    isPlatform: isPlatformBooking,
    eventType,
    eventTypeId,
    dynamicUserList,
    logger: loggerWithEventDetails,
    routedTeamMemberIds: routedTeamMemberIds ?? null,
    contactOwnerEmail,
    rescheduleUid: reqBody.rescheduleUid || null,
    routingFormResponse,
  });

  // We filter out users but ensure allHostUsers remain same.
  let users = [...qualifiedRRUsers, ...additionalFallbackRRUsers, ...fixedUsers];

  const firstUser = users[0];

  let { locationBodyString, organizerOrFirstDynamicGroupMemberDefaultLocationUrl } = getLocationValuesForDb({
    dynamicUserList,
    users,
    location,
  });

  await checkBookingAndDurationLimits({
    eventType,
    reqBodyStart: reqBody.start,
    reqBodyRescheduleUid: reqBody.rescheduleUid,
  });

  let luckyUserResponse;
  let isFirstSeat = true;

  if (eventType.seatsPerTimeSlot) {
    const booking = await prisma.booking.findFirst({
      where: {
        eventTypeId: eventType.id,
        startTime: new Date(dayjs(reqBody.start).utc().format()),
        status: BookingStatus.ACCEPTED,
      },
      select: {
        userId: true,
        attendees: { select: { email: true } },
      },
    });

    if (booking) {
      isFirstSeat = false;
      if (eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
        const fixedHosts = users.filter((user) => user.isFixed);
        const originalNonFixedHost = users.find((user) => !user.isFixed && user.id === booking.userId);

        if (originalNonFixedHost) {
          users = [...fixedHosts, originalNonFixedHost];
        } else {
          const attendeeEmailSet = new Set(booking.attendees.map((attendee) => attendee.email));

          // In this case, the first booking user is a fixed host, so the chosen non-fixed host is added as an attendee of the booking
          const nonFixedAttendeeHost = users.find(
            (user) => !user.isFixed && attendeeEmailSet.has(user.email)
          );
          users = [...fixedHosts, ...(nonFixedAttendeeHost ? [nonFixedAttendeeHost] : [])];
        }
      }
    }
  }

  //checks what users are available
  if (isFirstSeat) {
    const eventTypeWithUsers: Omit<getEventTypeResponse, "users"> & {
      users: IsFixedAwareUserWithCredentials[];
    } = {
      ...eventType,
      users: users as IsFixedAwareUserWithCredentials[],
      ...(eventType.recurringEvent && {
        recurringEvent: {
          ...eventType.recurringEvent,
          count: recurringCount || eventType.recurringEvent.count,
        },
      }),
    };
    if (input.bookingData.allRecurringDates && input.bookingData.isFirstRecurringSlot) {
      const allRecurringDates = input.bookingData.allRecurringDates as Array<{ start: string; end: string }>;
      const numSlotsToCheckForAvailability = input.bookingData.numSlotsToCheckForAvailability as number;
      const isTeamEvent =
        eventType.schedulingType === SchedulingType.COLLECTIVE ||
        eventType.schedulingType === SchedulingType.ROUND_ROBIN;

      const fixedUsers = isTeamEvent
        ? eventTypeWithUsers.users.filter((user: IsFixedAwareUserWithCredentials) => user.isFixed)
        : [];

      for (let i = 0; i < allRecurringDates.length && i < numSlotsToCheckForAvailability; i++) {
        const start = allRecurringDates[i].start;
        const end = allRecurringDates[i].end;
        if (isTeamEvent) {
          // each fixed user must be available
          for (const key in fixedUsers) {
            await ensureAvailableUsers(
              { ...eventTypeWithUsers, users: [fixedUsers[key]] },
              {
                dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
                dateTo: dayjs(end).tz(reqBody.timeZone).format(),
                timeZone: reqBody.timeZone,
                originalRescheduledBooking: originalRescheduledBooking ?? null,
              },
              loggerWithEventDetails,
              shouldServeCache
            );
          }
        } else {
          eventTypeWithUsers.users[0].credentials;
          await ensureAvailableUsers(
            eventTypeWithUsers,
            {
              dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
              dateTo: dayjs(end).tz(reqBody.timeZone).format(),
              timeZone: reqBody.timeZone,
              originalRescheduledBooking,
            },
            loggerWithEventDetails,
            shouldServeCache
          );
        }
      }
    }

    if (!input.bookingData.allRecurringDates || input.bookingData.isFirstRecurringSlot) {
      let availableUsers: IsFixedAwareUser[] = [];
      try {
        availableUsers = await ensureAvailableUsers(
          { ...eventTypeWithUsers, users: [...qualifiedRRUsers, ...fixedUsers] as IsFixedAwareUser[] },
          {
            dateFrom: dayjs(reqBody.start).tz(reqBody.timeZone).format(),
            dateTo: dayjs(reqBody.end).tz(reqBody.timeZone).format(),
            timeZone: reqBody.timeZone,
            originalRescheduledBooking,
          },
          loggerWithEventDetails,
          shouldServeCache
        );
      } catch {
        if (additionalFallbackRRUsers.length) {
          loggerWithEventDetails.debug(
            "Qualified users not available, check for fallback users",
            safeStringify({
              qualifiedRRUsers: qualifiedRRUsers.map((user) => user.id),
              additionalFallbackRRUsers: additionalFallbackRRUsers.map((user) => user.id),
            })
          );
          // can happen when contact owner not available for 2 weeks or fairness would block at least 2 weeks
          // use fallback instead
          availableUsers = await ensureAvailableUsers(
            {
              ...eventTypeWithUsers,
              users: [...additionalFallbackRRUsers, ...fixedUsers] as IsFixedAwareUser[],
            },
            {
              dateFrom: dayjs(reqBody.start).tz(reqBody.timeZone).format(),
              dateTo: dayjs(reqBody.end).tz(reqBody.timeZone).format(),
              timeZone: reqBody.timeZone,
              originalRescheduledBooking,
            },
            loggerWithEventDetails,
            shouldServeCache
          );
        } else {
          loggerWithEventDetails.debug(
            "Qualified users not available, no fallback users",
            safeStringify({
              qualifiedRRUsers: qualifiedRRUsers.map((user) => user.id),
            })
          );
          throw new Error(ErrorCode.NoAvailableUsersFound);
        }
      }

      const luckyUserPool: IsFixedAwareUser[] = [];
      const fixedUserPool: IsFixedAwareUser[] = [];

      availableUsers.forEach((user) => {
        user.isFixed ? fixedUserPool.push(user) : luckyUserPool.push(user);
      });

      const notAvailableLuckyUsers: typeof users = [];

      loggerWithEventDetails.debug(
        "Computed available users",
        safeStringify({
          availableUsers: availableUsers.map((user) => user.id),
          luckyUserPool: luckyUserPool.map((user) => user.id),
        })
      );

      const luckyUsers: typeof users = [];

      // loop through all non-fixed hosts and get the lucky users
      // This logic doesn't run when contactOwner is used because in that case, luckUsers.length === 1
      while (luckyUserPool.length > 0 && luckyUsers.length < 1 /* TODO: Add variable */) {
        const freeUsers = luckyUserPool.filter(
          (user) => !luckyUsers.concat(notAvailableLuckyUsers).find((existing) => existing.id === user.id)
        );
        // no more freeUsers after subtracting notAvailableLuckyUsers from luckyUsers :(
        if (freeUsers.length === 0) break;
        assertNonEmptyArray(freeUsers); // make sure TypeScript knows it too with an assertion; the error will never be thrown.
        // freeUsers is ensured

        const userIdsSet = new Set(users.map((user) => user.id));
        const firstUserOrgId = await getOrgIdFromMemberOrTeamId({
          memberId: eventTypeWithUsers.users[0].id ?? null,
          teamId: eventType.teamId,
        });
        const newLuckyUser = await getLuckyUser({
          // find a lucky user that is not already in the luckyUsers array
          availableUsers: freeUsers,
          allRRHosts: (
            await enrichHostsWithDelegationCredentials({
              orgId: firstUserOrgId ?? null,
              hosts: eventTypeWithUsers.hosts,
            })
          ).filter((host) => !host.isFixed && userIdsSet.has(host.user.id)),
          eventType,
          routingFormResponse,
          meetingStartTime: new Date(reqBody.start),
        });
        if (!newLuckyUser) {
          break; // prevent infinite loop
        }
        if (
          input.bookingData.isFirstRecurringSlot &&
          eventType.schedulingType === SchedulingType.ROUND_ROBIN
        ) {
          // for recurring round robin events check if lucky user is available for next slots
          try {
            const allRecurringDates = input.bookingData.allRecurringDates as Array<{
              start: string;
              end: string;
            }>;
            const numSlotsToCheckForAvailability = input.bookingData.numSlotsToCheckForAvailability as number;
            for (let i = 0; i < allRecurringDates.length && i < numSlotsToCheckForAvailability; i++) {
              const start = allRecurringDates[i].start;
              const end = allRecurringDates[i].end;

              await ensureAvailableUsers(
                { ...eventTypeWithUsers, users: [newLuckyUser] },
                {
                  dateFrom: dayjs(start).tz(reqBody.timeZone).format(),
                  dateTo: dayjs(end).tz(reqBody.timeZone).format(),
                  timeZone: reqBody.timeZone,
                  originalRescheduledBooking,
                },
                loggerWithEventDetails,
                shouldServeCache
              );
            }
            // if no error, then lucky user is available for the next slots
            luckyUsers.push(newLuckyUser);
          } catch {
            notAvailableLuckyUsers.push(newLuckyUser);
            loggerWithEventDetails.info(
              `Round robin host ${newLuckyUser.name} not available for first two slots. Trying to find another host.`
            );
          }
        } else {
          luckyUsers.push(newLuckyUser);
        }
      }
      // ALL fixed users must be available
      if (fixedUserPool.length !== users.filter((user) => user.isFixed).length) {
        throw new Error(ErrorCode.HostsUnavailableForBooking);
      }
      // Pushing fixed user before the luckyUser guarantees the (first) fixed user as the organizer.
      users = [...fixedUserPool, ...luckyUsers];
      luckyUserResponse = { luckyUsers: luckyUsers.map((u) => u.id) };
      troubleshooterData = {
        ...troubleshooterData,
        luckyUsers: luckyUsers.map((u) => u.id),
        fixedUsers: fixedUserPool.map((u) => u.id),
        luckyUserPool: luckyUserPool.map((u) => u.id),
      };
    } else if (
      input.bookingData.allRecurringDates &&
      eventType.schedulingType === SchedulingType.ROUND_ROBIN
    ) {
      // all recurring slots except the first one
      const luckyUsersFromFirstBooking = luckyUsers
        ? eventTypeWithUsers.users.filter((user) => luckyUsers.find((luckyUserId) => luckyUserId === user.id))
        : [];
      const fixedHosts = eventTypeWithUsers.users.filter((user: IsFixedAwareUser) => user.isFixed);
      users = [...fixedHosts, ...luckyUsersFromFirstBooking];
      troubleshooterData = {
        ...troubleshooterData,
        luckyUsersFromFirstBooking: luckyUsersFromFirstBooking.map((u) => u.id),
        fixedUsers: fixedHosts.map((u) => u.id),
      };
    }
  }

  if (users.length === 0 && eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
    loggerWithEventDetails.error(`No available users found for round robin event.`);
    throw new Error(ErrorCode.NoAvailableUsersFound);
  }

  // If the team member is requested then they should be the organizer
  const organizerUser = reqBody.teamMemberEmail
    ? users.find((user) => user.email === reqBody.teamMemberEmail) ?? users[0]
    : users[0];

  const tOrganizer = await getTranslation(organizerUser?.locale ?? "en", "common");
  const allCredentials = await getAllCredentialsIncludeServiceAccountKey(organizerUser, eventType);

  // If the Organizer himself is rescheduling, the booker should be sent the communication in his timezone and locale.
  const attendeeInfoOnReschedule =
    userReschedulingIsOwner && originalRescheduledBooking
      ? originalRescheduledBooking.attendees.find((attendee) => attendee.email === bookerEmail)
      : null;

  const attendeeLanguage = attendeeInfoOnReschedule ? attendeeInfoOnReschedule.locale : language;
  const attendeeTimezone = attendeeInfoOnReschedule ? attendeeInfoOnReschedule.timeZone : reqBody.timeZone;

  const tAttendees = await getTranslation(attendeeLanguage ?? "en", "common");

  const isManagedEventType = !!eventType.parentId;

  // If location passed is empty , use default location of event
  // If location of event is not set , use host default
  if (locationBodyString.trim().length == 0) {
    if (eventType.locations.length > 0) {
      locationBodyString = eventType.locations[0].type;
    } else {
      locationBodyString = OrganizerDefaultConferencingAppType;
    }
  }

  const organizationDefaultLocation = getFirstDelegationConferencingCredentialAppLocation({
    credentials: firstUser.credentials,
  });

  // use host default
  if (locationBodyString == OrganizerDefaultConferencingAppType) {
    const metadataParseResult = userMetadataSchema.safeParse(organizerUser.metadata);
    const organizerMetadata = metadataParseResult.success ? metadataParseResult.data : undefined;
    if (organizerMetadata?.defaultConferencingApp?.appSlug) {
      const app = getAppFromSlug(organizerMetadata?.defaultConferencingApp?.appSlug);
      locationBodyString = app?.appData?.location?.type || locationBodyString;
      if (isManagedEventType || isTeamEventType) {
        organizerOrFirstDynamicGroupMemberDefaultLocationUrl =
          organizerMetadata?.defaultConferencingApp?.appLink;
      }
    } else if (organizationDefaultLocation) {
      locationBodyString = organizationDefaultLocation;
    } else {
      locationBodyString = "integrations:daily";
    }
  }

  const invitee: Invitee = [
    {
      email: bookerEmail,
      name: fullName,
      phoneNumber: bookerPhoneNumber,
      firstName: (typeof bookerName === "object" && bookerName.firstName) || "",
      lastName: (typeof bookerName === "object" && bookerName.lastName) || "",
      timeZone: attendeeTimezone,
      language: { translate: tAttendees, locale: attendeeLanguage ?? "en" },
    },
  ];

  const blacklistedGuestEmails = process.env.BLACKLISTED_GUEST_EMAILS
    ? process.env.BLACKLISTED_GUEST_EMAILS.split(",")
    : [];

  const guestsRemoved: string[] = [];
  const guests = (reqGuests || []).reduce((guestArray, guest) => {
    const baseGuestEmail = extractBaseEmail(guest).toLowerCase();
    if (blacklistedGuestEmails.some((e) => e.toLowerCase() === baseGuestEmail)) {
      guestsRemoved.push(guest);
      return guestArray;
    }
    // If it's a team event, remove the team member from guests
    if (isTeamEventType && users.some((user) => user.email === guest)) {
      return guestArray;
    }
    guestArray.push({
      email: guest,
      name: "",
      firstName: "",
      lastName: "",
      timeZone: attendeeTimezone,
      language: { translate: tGuests, locale: "en" },
    });
    return guestArray;
  }, [] as Invitee);

  if (guestsRemoved.length > 0) {
    log.info("Removed guests from the booking", guestsRemoved);
  }

  const seed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}:${new Date().getTime()}`;
  const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));

  // For static link based video apps, it would have the static URL value instead of it's type(e.g. integrations:campfire_video)
  // This ensures that createMeeting isn't called for static video apps as bookingLocation becomes just a regular value for them.
  const { bookingLocation, conferenceCredentialId } = organizerOrFirstDynamicGroupMemberDefaultLocationUrl
    ? {
        bookingLocation: organizerOrFirstDynamicGroupMemberDefaultLocationUrl,
        conferenceCredentialId: undefined,
      }
    : getLocationValueForDB(locationBodyString, eventType.locations);

  log.info("locationBodyString", locationBodyString);
  log.info("event type locations", eventType.locations);

  const customInputs = getCustomInputsResponses(reqBody, eventType.customInputs);
  const attendeesList = [...invitee, ...guests];

  const responses = reqBody.responses || null;
  const evtName = !eventType?.isDynamic ? eventType.eventName : responses?.title;
  const eventNameObject = {
    //TODO: Can we have an unnamed attendee? If not, I would really like to throw an error here.
    attendeeName: fullName || "Nameless",
    eventType: eventType.title,
    eventName: evtName,
    // we send on behalf of team if >1 round robin attendee | collective
    teamName: eventType.schedulingType === "COLLECTIVE" || users.length > 1 ? eventType.team?.name : null,
    // TODO: Can we have an unnamed organizer? If not, I would really like to throw an error here.
    host: organizerUser.name || "Nameless",
    location: bookingLocation,
    eventDuration: dayjs(reqBody.end).diff(reqBody.start, "minutes"),
    bookingFields: { ...responses },
    t: tOrganizer,
  };

  const iCalUID = getICalUID({
    event: { iCalUID: originalRescheduledBooking?.iCalUID, uid: originalRescheduledBooking?.uid },
    uid,
  });
  // For bookings made before introducing iCalSequence, assume that the sequence should start at 1. For new bookings start at 0.
  const iCalSequence = getICalSequence(originalRescheduledBooking);
  const organizerOrganizationProfile = await prisma.profile.findFirst({
    where: {
      userId: organizerUser.id,
      username: dynamicUserList[0],
    },
  });

  const organizerOrganizationId = organizerOrganizationProfile?.organizationId;
  const bookerUrl = eventType.team
    ? await getBookerBaseUrl(eventType.team.parentId)
    : await getBookerBaseUrl(organizerOrganizationId ?? null);

  const destinationCalendar = eventType.destinationCalendar
    ? [eventType.destinationCalendar]
    : organizerUser.destinationCalendar
    ? [organizerUser.destinationCalendar]
    : null;

  let organizerEmail = organizerUser.email || "Email-less";
  if (eventType.useEventTypeDestinationCalendarEmail && destinationCalendar?.[0]?.primaryEmail) {
    organizerEmail = destinationCalendar[0].primaryEmail;
  } else if (eventType.secondaryEmailId && eventType.secondaryEmail?.email) {
    organizerEmail = eventType.secondaryEmail.email;
  }

  //update cal event responses with latest location value , later used by webhook
  if (reqBody.calEventResponses)
    reqBody.calEventResponses["location"].value = {
      value: platformBookingLocation ?? bookingLocation,
      optionValue: "",
    };

  const eventName = getEventName(eventNameObject);

  let evt: CalendarEvent = new CalendarEventBuilder()
    .withBasicDetails({
      bookerUrl,
      title: eventName,
      startTime: dayjs(reqBody.start).utc().format(),
      endTime: dayjs(reqBody.end).utc().format(),
      additionalNotes,
    })
    .withEventType({
      slug: eventType.slug,
      description: eventType.description,
      id: eventType.id,
      hideCalendarNotes: eventType.hideCalendarNotes,
      hideCalendarEventDetails: eventType.hideCalendarEventDetails,
      hideOrganizerEmail: eventType.hideOrganizerEmail,
      schedulingType: eventType.schedulingType,
      seatsPerTimeSlot: eventType.seatsPerTimeSlot,
      // if seats are not enabled we should default true
      seatsShowAttendees: eventType.seatsPerTimeSlot ? eventType.seatsShowAttendees : true,
      seatsShowAvailabilityCount: eventType.seatsPerTimeSlot ? eventType.seatsShowAvailabilityCount : true,
      customReplyToEmail: eventType.customReplyToEmail,
    })
    .withOrganizer({
      id: organizerUser.id,
      name: organizerUser.name || "Nameless",
      email: organizerEmail,
      username: organizerUser.username || undefined,
      timeZone: organizerUser.timeZone,
      language: { translate: tOrganizer, locale: organizerUser.locale ?? "en" },
      timeFormat: getTimeFormatStringFromUserTimeFormat(organizerUser.timeFormat),
    })
    .withAttendees(attendeesList)
    .withMetadataAndResponses({
      additionalNotes,
      customInputs,
      responses: reqBody.calEventResponses || null,
      userFieldsResponses: reqBody.calEventUserFieldsResponses || null,
    })
    .withLocation({
      location: platformBookingLocation ?? bookingLocation, // Will be processed by the EventManager later.
      conferenceCredentialId,
    })
    .withDestinationCalendar(destinationCalendar)
    .withIdentifiers({ iCalUID, iCalSequence })
    .withConfirmation({
      requiresConfirmation: !isConfirmedByDefault,
      isConfirmedByDefault,
    })
    .withPlatformVariables({
      platformClientId,
      platformRescheduleUrl,
      platformCancelUrl,
      platformBookingUrl,
    })
    .build();

  if (
    input.bookingData.thirdPartyRecurringEventId &&
    typeof input.bookingData.thirdPartyRecurringEventId === "string"
  ) {
    evt = CalendarEventBuilder.fromEvent(evt)
      .withRecurringEventId(input.bookingData.thirdPartyRecurringEventId)
      .build();
  }

  if (isTeamEventType) {
    evt = await buildEventForTeamEventType({
      existingEvent: evt,
      schedulingType: eventType.schedulingType,
      users,
      team: eventType.team,
      organizerUser,
    });
  }

  // data needed for triggering webhooks
  const eventTypeInfo: EventTypeInfo = {
    eventTitle: eventType.title,
    eventDescription: eventType.description,
    price: paymentAppData.price,
    currency: eventType.currency,
    length: dayjs(reqBody.end).diff(dayjs(reqBody.start), "minutes"),
  };

  const teamId = await getTeamIdFromEventType({ eventType });

  const triggerForUser = !teamId || (teamId && eventType.parentId);

  const organizerUserId = triggerForUser ? organizerUser.id : null;

  const orgId = await getOrgIdFromMemberOrTeamId({ memberId: organizerUserId, teamId });

  const subscriberOptions: GetSubscriberOptions = {
    userId: organizerUserId,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
    teamId,
    orgId,
    oAuthClientId: platformClientId,
  };

  const eventTrigger: WebhookTriggerEvents = rescheduleUid
    ? WebhookTriggerEvents.BOOKING_RESCHEDULED
    : WebhookTriggerEvents.BOOKING_CREATED;

  subscriberOptions.triggerEvent = eventTrigger;

  const subscriberOptionsMeetingEnded = {
    userId: triggerForUser ? organizerUser.id : null,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
    teamId,
    orgId,
    oAuthClientId: platformClientId,
  };

  const subscriberOptionsMeetingStarted = {
    userId: triggerForUser ? organizerUser.id : null,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
    teamId,
    orgId,
    oAuthClientId: platformClientId,
  };

  const workflows = await getAllWorkflowsFromEventType(
    {
      ...eventType,
      metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata),
    },
    organizerUser.id
  );

  // For seats, if the booking already exists then we want to add the new attendee to the existing booking
  if (eventType.seatsPerTimeSlot) {
    const newBooking = await handleSeats({
      rescheduleUid,
      reqBookingUid: reqBody.bookingUid,
      eventType,
      evt: { ...evt, bookerUrl },
      invitee,
      allCredentials,
      organizerUser,
      originalRescheduledBooking,
      bookerEmail,
      bookerPhoneNumber,
      tAttendees,
      bookingSeat,
      reqUserId: input.userId,
      rescheduleReason,
      reqBodyUser: reqBody.user,
      noEmail,
      isConfirmedByDefault,
      additionalNotes,
      reqAppsStatus,
      attendeeLanguage,
      paymentAppData,
      fullName,
      smsReminderNumber,
      eventTypeInfo,
      uid,
      eventTypeId,
      reqBodyMetadata: reqBody.metadata,
      subscriberOptions,
      eventTrigger,
      responses,
      workflows,
      rescheduledBy: reqBody.rescheduledBy,
      isDryRun,
    });

    if (newBooking) {
      const bookingResponse = {
        ...newBooking,
        user: {
          ...newBooking.user,
          email: null,
        },
        paymentRequired: false,
        isDryRun: isDryRun,
        ...(isDryRun ? { troubleshooterData } : {}),
      };
      return {
        ...bookingResponse,
        ...luckyUserResponse,
      };
    } else {
      // Rescheduling logic for the original seated event was handled in handleSeats
      // We want to use new booking logic for the new time slot
      originalRescheduledBooking = null;
      evt = CalendarEventBuilder.fromEvent(evt)
        .withIdentifiers({
          iCalUID: getICalUID({
            attendeeId: bookingSeat?.attendeeId,
          }),
        })
        .build();
    }
  }

  if (reqBody.recurringEventId && eventType.recurringEvent) {
    // Overriding the recurring event configuration count to be the actual number of events booked for
    // the recurring event (equal or less than recurring event configuration count)
    eventType.recurringEvent = Object.assign({}, eventType.recurringEvent, { count: recurringCount });
    evt.recurringEvent = eventType.recurringEvent;
  }

  const changedOrganizer =
    !!originalRescheduledBooking &&
    eventType.schedulingType === SchedulingType.ROUND_ROBIN &&
    originalRescheduledBooking.userId !== evt.organizer.id;

  const isBookingRequestedReschedule =
    !!originalRescheduledBooking &&
    !!originalRescheduledBooking.rescheduled &&
    originalRescheduledBooking.status === BookingStatus.CANCELLED;

  if (
    changedOrganizer &&
    originalRescheduledBooking &&
    originalRescheduledBooking?.user?.name &&
    organizerUser?.name
  ) {
    evt.title = updateHostInEventName(
      originalRescheduledBooking.title,
      originalRescheduledBooking.user.name,
      organizerUser.name
    );
  }

  let results: EventResult<AdditionalInformation & { url?: string; iCalUID?: string }>[] = [];
  let referencesToCreate: PartialReference[] = [];

  let booking: CreatedBooking | null = null;

  loggerWithEventDetails.debug(
    "Going to create booking in DB now",
    safeStringify({
      organizerUser: organizerUser.id,
      attendeesList: attendeesList.map((guest) => ({ timeZone: guest.timeZone })),
      requiresConfirmation: evt.requiresConfirmation,
      isConfirmedByDefault,
      userReschedulingIsOwner,
    })
  );

  let assignmentReason: { reasonEnum: AssignmentReasonEnum; reasonString: string } | undefined;

  try {
    if (!isDryRun) {
      booking = await createBooking({
        uid,
        rescheduledBy: reqBody.rescheduledBy,
        routingFormResponseId: routingFormResponseId,
        reroutingFormResponses: reroutingFormResponses ?? null,
        reqBody: {
          user: reqBody.user,
          metadata: reqBody.metadata,
          recurringEventId: reqBody.recurringEventId,
        },
        eventType: {
          eventTypeData: eventType,
          id: eventTypeId,
          slug: eventTypeSlug,
          organizerUser,
          isConfirmedByDefault,
          paymentAppData,
        },
        input: {
          bookerEmail,
          rescheduleReason,
          smsReminderNumber,
          responses,
        },
        evt,
        originalRescheduledBooking,
        creationSource: input.bookingData.creationSource as CreationSource | undefined,
        tracking: reqBody.tracking,
      });

      if (booking?.userId) {
        const usersRepository = new UsersRepository();
        await usersRepository.updateLastActiveAt(booking.userId);
      }

      // If it's a round robin event, record the reason for the host assignment
      if (eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
        if (reqBody.crmOwnerRecordType && reqBody.crmAppSlug && contactOwnerEmail && routingFormResponseId) {
          assignmentReason = await AssignmentReasonRecorder.CRMOwnership({
            bookingId: booking.id,
            crmAppSlug: reqBody.crmAppSlug,
            teamMemberEmail: contactOwnerEmail,
            recordType: reqBody.crmOwnerRecordType,
            routingFormResponseId,
          });
        } else if (routingFormResponseId && teamId) {
          assignmentReason = await AssignmentReasonRecorder.routingFormRoute({
            bookingId: booking.id,
            routingFormResponseId,
            organizerId: organizerUser.id,
            teamId,
            isRerouting: !!reroutingFormResponses,
            reroutedByEmail: reqBody.rescheduledBy,
          });
        }
      }

      evt = CalendarEventBuilder.fromEvent(evt)
        .withUid(booking.uid ?? null)
        .build();

      evt = CalendarEventBuilder.fromEvent(evt)
        .withOneTimePassword(booking.oneTimePassword ?? null)
        .build();

      if (booking && booking.id && eventType.seatsPerTimeSlot) {
        const responses = input.bookingData.responses as any;
        const currentAttendee = booking.attendees.find(
          (attendee) =>
            attendee.email === responses.email ||
            (responses.attendeePhoneNumber && attendee.phoneNumber === responses.attendeePhoneNumber)
        );

        // Save description to bookingSeat
        const uniqueAttendeeId = uuid();
        await prisma.bookingSeat.create({
          data: {
            referenceUid: uniqueAttendeeId,
            data: {
              description: additionalNotes,
              responses,
            },
            metadata: reqBody.metadata,
            booking: {
              connect: {
                id: booking.id,
              },
            },
            attendee: {
              connect: {
                id: currentAttendee?.id,
              },
            },
          },
        });
        evt.attendeeSeatId = uniqueAttendeeId;
      }
    } else {
      const { booking: dryRunBooking, troubleshooterData: _troubleshooterData } = buildDryRunBooking({
        eventTypeId,
        organizerUser,
        eventName,
        startTime: reqBody.start,
        endTime: reqBody.end,
        contactOwnerFromReq,
        contactOwnerEmail,
        allHostUsers: users,
        isManagedEventType,
      });

      booking = dryRunBooking;
      troubleshooterData = {
        ...troubleshooterData,
        ..._troubleshooterData,
      };
    }
  } catch (_err) {
    const err = getErrorFromUnknown(_err);
    loggerWithEventDetails.error(
      `Booking ${eventTypeId} failed`,
      "Error when saving booking to db",
      err.message
    );
    if (err.code === "P2002") {
      throw new HttpError({ statusCode: 409, message: ErrorCode.BookingConflict });
    }
    throw err;
  }

  // After polling videoBusyTimes, credentials might have been changed due to refreshment, so query them again.
  const credentials = await refreshCredentials(allCredentials);
  const apps = eventTypeAppMetadataOptionalSchema.parse(eventType?.metadata?.apps);
  const eventManager = !isDryRun
    ? new EventManager({ ...organizerUser, credentials }, apps)
    : buildDryRunEventManager();

  let videoCallUrl;

  //this is the actual rescheduling logic
  if (!eventType.seatsPerTimeSlot && originalRescheduledBooking?.uid) {
    log.silly("Rescheduling booking", originalRescheduledBooking.uid);
    // cancel workflow reminders from previous rescheduled booking
    await WorkflowRepository.deleteAllWorkflowReminders(originalRescheduledBooking.workflowReminders);

    evt = addVideoCallDataToEvent(originalRescheduledBooking.references, evt);
    evt.rescheduledBy = reqBody.rescheduledBy;

    // If organizer is changed in RR event then we need to delete the previous host destination calendar events
    const previousHostDestinationCalendar = originalRescheduledBooking?.destinationCalendar
      ? [originalRescheduledBooking?.destinationCalendar]
      : [];

    if (changedOrganizer) {
      // location might changed and will be new created in eventManager.create (organizer default location)
      evt.videoCallData = undefined;
      // To prevent "The requested identifier already exists" error while updating event, we need to remove iCalUID
      evt.iCalUID = undefined;
    }

    const updateManager = await eventManager.reschedule(
      evt,
      originalRescheduledBooking.uid,
      undefined,
      changedOrganizer,
      previousHostDestinationCalendar,
      isBookingRequestedReschedule
    );
    // This gets overridden when updating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    results = updateManager.results;
    referencesToCreate = updateManager.referencesToCreate;

    videoCallUrl = evt.videoCallData && evt.videoCallData.url ? evt.videoCallData.url : null;

    // This gets overridden when creating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    const { metadata: videoMetadata, videoCallUrl: _videoCallUrl } = getVideoCallDetails({
      results,
    });

    let metadata: AdditionalInformation = {};
    metadata = videoMetadata;
    videoCallUrl = _videoCallUrl;

    const isThereAnIntegrationError = results && results.some((res) => !res.success);

    if (isThereAnIntegrationError) {
      const error = {
        errorCode: "BookingReschedulingMeetingFailed",
        message: "Booking Rescheduling failed",
      };

      loggerWithEventDetails.error(
        `EventManager.reschedule failure in some of the integrations ${organizerUser.username}`,
        safeStringify({ error, results })
      );
    } else {
      if (results.length) {
        // Handle Google Meet results
        // We use the original booking location since the evt location changes to daily
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          // Find index of google_calendar inside createManager.referencesToCreate
          const googleCalIndex = updateManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            loggerWithEventDetails.warn("Google Calendar not installed but using Google Meet as location");
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: [tOrganizer("google_meet_warning")],
            });
          }

          const googleHangoutLink = Array.isArray(googleCalResult?.updatedEvent)
            ? googleCalResult.updatedEvent[0]?.hangoutLink
            : googleCalResult?.updatedEvent?.hangoutLink ?? googleCalResult?.createdEvent?.hangoutLink;

          if (googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            // Add google_meet to referencesToCreate in the same index as google_calendar
            updateManager.referencesToCreate[googleCalIndex] = {
              ...updateManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleHangoutLink,
            };

            // Also create a new referenceToCreate with type video for google_meet
            updateManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleHangoutLink,
              uid: googleCalResult.uid,
              credentialId: updateManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
        const createdOrUpdatedEvent = Array.isArray(results[0]?.updatedEvent)
          ? results[0]?.updatedEvent[0]
          : results[0]?.updatedEvent ?? results[0]?.createdEvent;
        metadata.hangoutLink = createdOrUpdatedEvent?.hangoutLink;
        metadata.conferenceData = createdOrUpdatedEvent?.conferenceData;
        metadata.entryPoints = createdOrUpdatedEvent?.entryPoints;
        evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);
        videoCallUrl =
          metadata.hangoutLink ||
          createdOrUpdatedEvent?.url ||
          organizerOrFirstDynamicGroupMemberDefaultLocationUrl ||
          getVideoCallUrlFromCalEvent(evt) ||
          videoCallUrl;
      }

      const calendarResult = results.find((result) => result.type.includes("_calendar"));

      evt.iCalUID = Array.isArray(calendarResult?.updatedEvent)
        ? calendarResult?.updatedEvent[0]?.iCalUID
        : calendarResult?.updatedEvent?.iCalUID || undefined;
    }

    evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);

    if (noEmail !== true && isConfirmedByDefault) {
      const copyEvent = cloneDeep(evt);
      const copyEventAdditionalInfo = {
        ...copyEvent,
        additionalInformation: metadata,
        additionalNotes, // Resets back to the additionalNote input and not the override value
        cancellationReason: `$RCH$${rescheduleReason ? rescheduleReason : ""}`, // Removable code prefix to differentiate cancellation from rescheduling for email
      };
      const cancelledRRHostEvt = cloneDeep(copyEventAdditionalInfo);
      loggerWithEventDetails.debug("Emails: Sending rescheduled emails for booking confirmation");

      /*
        handle emails for round robin
          - if booked rr host is the same, then rescheduling email
          - if new rr host is booked, then cancellation email to old host and confirmation email to new host
      */
      if (eventType.schedulingType === SchedulingType.ROUND_ROBIN) {
        const originalBookingMemberEmails: Person[] = [];

        for (const user of originalRescheduledBooking.attendees) {
          const translate = await getTranslation(user.locale ?? "en", "common");
          originalBookingMemberEmails.push({
            name: user.name,
            email: user.email,
            timeZone: user.timeZone,
            phoneNumber: user.phoneNumber,
            language: { translate, locale: user.locale ?? "en" },
          });
        }
        if (originalRescheduledBooking.user) {
          const translate = await getTranslation(originalRescheduledBooking.user.locale ?? "en", "common");
          const originalOrganizer = originalRescheduledBooking.user;

          originalBookingMemberEmails.push({
            ...originalRescheduledBooking.user,
            name: originalRescheduledBooking.user.name || "",
            language: { translate, locale: originalRescheduledBooking.user.locale ?? "en" },
          });

          if (changedOrganizer) {
            cancelledRRHostEvt.title = originalRescheduledBooking.title;
            cancelledRRHostEvt.startTime =
              dayjs(originalRescheduledBooking?.startTime).utc().format() ||
              copyEventAdditionalInfo.startTime;
            cancelledRRHostEvt.endTime =
              dayjs(originalRescheduledBooking?.endTime).utc().format() || copyEventAdditionalInfo.endTime;
            cancelledRRHostEvt.organizer = {
              email: originalOrganizer.email,
              name: originalOrganizer.name || "",
              timeZone: originalOrganizer.timeZone,
              language: { translate, locale: originalOrganizer.locale || "en" },
            };
          }
        }

        const newBookingMemberEmails: Person[] =
          copyEvent.team?.members
            .map((member) => member)
            .concat(copyEvent.organizer)
            .concat(copyEvent.attendees) || [];

        const matchOriginalMemberWithNewMember = (originalMember: Person, newMember: Person) => {
          return originalMember.email === newMember.email;
        };

        // scheduled Emails
        const newBookedMembers = newBookingMemberEmails.filter(
          (member) =>
            !originalBookingMemberEmails.find((originalMember) =>
              matchOriginalMemberWithNewMember(originalMember, member)
            )
        );
        // cancelled Emails
        const cancelledMembers = originalBookingMemberEmails.filter(
          (member) =>
            !newBookingMemberEmails.find((newMember) => matchOriginalMemberWithNewMember(member, newMember))
        );
        // rescheduled Emails
        const rescheduledMembers = newBookingMemberEmails.filter((member) =>
          originalBookingMemberEmails.find((orignalMember) =>
            matchOriginalMemberWithNewMember(orignalMember, member)
          )
        );

        if (!isDryRun) {
          sendRoundRobinRescheduledEmailsAndSMS(
            copyEventAdditionalInfo,
            rescheduledMembers,
            eventType.metadata
          );
          sendRoundRobinScheduledEmailsAndSMS({
            calEvent: copyEventAdditionalInfo,
            members: newBookedMembers,
            eventTypeMetadata: eventType.metadata,
          });
          sendRoundRobinCancelledEmailsAndSMS(cancelledRRHostEvt, cancelledMembers, eventType.metadata);
        }
      } else {
        if (!isDryRun) {
          // send normal rescheduled emails (non round robin event, where organizers stay the same)
          await sendRescheduledEmailsAndSMS(
            {
              ...copyEvent,
              additionalInformation: metadata,
              additionalNotes, // Resets back to the additionalNote input and not the override value
              cancellationReason: `$RCH$${rescheduleReason ? rescheduleReason : ""}`, // Removable code prefix to differentiate cancellation from rescheduling for email
            },
            eventType?.metadata
          );
        }
      }
    }
    // If it's not a reschedule, doesn't require confirmation and there's no price,
    // Create a booking
  } else if (isConfirmedByDefault) {
    // Use EventManager to conditionally use all needed integrations.
    const createManager = areCalendarEventsEnabled ? await eventManager.create(evt) : placeholderCreatedEvent;
    if (evt.location) {
      booking.location = evt.location;
    }
    // This gets overridden when creating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    results = createManager.results;
    referencesToCreate = createManager.referencesToCreate;
    videoCallUrl = evt.videoCallData && evt.videoCallData.url ? evt.videoCallData.url : null;

    if (results.length > 0 && results.every((res) => !res.success)) {
      const error = {
        errorCode: "BookingCreatingMeetingFailed",
        message: "Booking failed",
      };

      loggerWithEventDetails.error(
        `EventManager.create failure in some of the integrations ${organizerUser.username}`,
        safeStringify({ error, results })
      );
    } else {
      const additionalInformation: AdditionalInformation = {};

      if (results.length) {
        // Handle Google Meet results
        // We use the original booking location since the evt location changes to daily
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          // Find index of google_calendar inside createManager.referencesToCreate
          const googleCalIndex = createManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            loggerWithEventDetails.warn("Google Calendar not installed but using Google Meet as location");
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: [tOrganizer("google_meet_warning")],
            });
          }

          if (googleCalResult?.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            // Add google_meet to referencesToCreate in the same index as google_calendar
            createManager.referencesToCreate[googleCalIndex] = {
              ...createManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
            };

            // Also create a new referenceToCreate with type video for google_meet
            createManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
              uid: googleCalResult.uid,
              credentialId: createManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleCalResult.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
        // TODO: Handle created event metadata more elegantly
        additionalInformation.hangoutLink = results[0].createdEvent?.hangoutLink;
        additionalInformation.conferenceData = results[0].createdEvent?.conferenceData;
        additionalInformation.entryPoints = results[0].createdEvent?.entryPoints;
        evt.appsStatus = handleAppsStatus(results, booking, reqAppsStatus);
        videoCallUrl =
          additionalInformation.hangoutLink ||
          organizerOrFirstDynamicGroupMemberDefaultLocationUrl ||
          videoCallUrl;

        if (!isDryRun && evt.iCalUID !== booking.iCalUID) {
          // The eventManager could change the iCalUID. At this point we can update the DB record
          await prisma.booking.update({
            where: {
              id: booking.id,
            },
            data: {
              iCalUID: evt.iCalUID || booking.iCalUID,
            },
          });
        }
      }
      if (noEmail !== true) {
        let isHostConfirmationEmailsDisabled = false;
        let isAttendeeConfirmationEmailDisabled = false;

        isHostConfirmationEmailsDisabled =
          eventType.metadata?.disableStandardEmails?.confirmation?.host || false;
        isAttendeeConfirmationEmailDisabled =
          eventType.metadata?.disableStandardEmails?.confirmation?.attendee || false;

        if (isHostConfirmationEmailsDisabled) {
          isHostConfirmationEmailsDisabled = allowDisablingHostConfirmationEmails(workflows);
        }

        if (isAttendeeConfirmationEmailDisabled) {
          isAttendeeConfirmationEmailDisabled = allowDisablingAttendeeConfirmationEmails(workflows);
        }

        loggerWithEventDetails.debug(
          "Emails: Sending scheduled emails for booking confirmation",
          safeStringify({
            calEvent: getPiiFreeCalendarEvent(evt),
          })
        );

        if (!isDryRun) {
          await sendScheduledEmailsAndSMS(
            {
              ...evt,
              additionalInformation,
              additionalNotes,
              customInputs,
            },
            eventNameObject,
            isHostConfirmationEmailsDisabled,
            isAttendeeConfirmationEmailDisabled,
            eventType.metadata
          );
        }
      }
    }
  } else {
    // If isConfirmedByDefault is false, then booking can't be considered ACCEPTED and thus EventManager has no role to play. Booking is created as PENDING
    loggerWithEventDetails.debug(
      `EventManager doesn't need to create or reschedule event for booking ${organizerUser.username}`,
      safeStringify({
        calEvent: getPiiFreeCalendarEvent(evt),
        isConfirmedByDefault,
        paymentValue: paymentAppData.price,
      })
    );
  }

  const bookingRequiresPayment =
    !Number.isNaN(paymentAppData.price) &&
    paymentAppData.price > 0 &&
    !originalRescheduledBooking?.paid &&
    !!booking;

  loggerWithEventDetails.debug("Payment check:", {
    price: paymentAppData.price,
    isNaN: Number.isNaN(paymentAppData.price),
    priceGreaterThanZero: paymentAppData.price > 0,
    originalBookingPaid: originalRescheduledBooking?.paid,
    hasBooking: !!booking,
    bookingRequiresPayment,
  });

  if (!isConfirmedByDefault && noEmail !== true && !bookingRequiresPayment) {
    loggerWithEventDetails.debug(
      `Emails: Booking ${organizerUser.username} requires confirmation, sending request emails`,
      safeStringify({
        calEvent: getPiiFreeCalendarEvent(evt),
      })
    );
    if (!isDryRun) {
      await sendOrganizerRequestEmail({ ...evt, additionalNotes }, eventType.metadata);
      await sendAttendeeRequestEmailAndSMS({ ...evt, additionalNotes }, attendeesList[0], eventType.metadata);
    }
  }

  if (booking.location?.startsWith("http")) {
    videoCallUrl = booking.location;
  }

  const metadata = videoCallUrl
    ? {
        videoCallUrl: getVideoCallUrlFromCalEvent(evt) || videoCallUrl,
      }
    : undefined;

  const webhookData: EventPayloadType = {
    ...evt,
    ...eventTypeInfo,
    bookingId: booking?.id,
    rescheduleId: originalRescheduledBooking?.id || undefined,
    rescheduleUid,
    rescheduleStartTime: originalRescheduledBooking?.startTime
      ? dayjs(originalRescheduledBooking?.startTime).utc().format()
      : undefined,
    rescheduleEndTime: originalRescheduledBooking?.endTime
      ? dayjs(originalRescheduledBooking?.endTime).utc().format()
      : undefined,
    metadata: { ...metadata, ...reqBody.metadata },
    eventTypeId,
    status: "ACCEPTED",
    smsReminderNumber: booking?.smsReminderNumber || undefined,
    rescheduledBy: reqBody.rescheduledBy,
    ...(assignmentReason ? { assignmentReason: [assignmentReason] } : {}),
  };

  if (bookingRequiresPayment) {
    loggerWithEventDetails.debug(`Booking ${organizerUser.username} requires payment`);
    // Load credentials.app.categories
    const credentialPaymentAppCategories = await prisma.credential.findMany({
      where: {
        ...("credentialId" in paymentAppData && paymentAppData.credentialId
          ? { id: paymentAppData.credentialId }
          : { userId: organizerUser.id }),
        app: {
          categories: {
            hasSome: ["payment"],
          },
        },
      },
      select: {
        key: true,
        appId: true,
        app: {
          select: {
            categories: true,
            dirName: true,
          },
        },
      },
    });
    let eventTypePaymentAppCredential = credentialPaymentAppCategories.find((credential) => {
      return credential.appId === paymentAppData.appId;
    });

    // If no user credentials found, check for manual Stripe configuration
    if (!eventTypePaymentAppCredential && paymentAppData.appId === "stripe") {
      loggerWithEventDetails.debug("No user credentials found, checking for manual Stripe configuration");
      
      const stripeApp = await prisma.app.findFirst({
        where: { slug: "stripe" },
        select: { keys: true }
      });

      if (stripeApp?.keys && typeof stripeApp.keys === "object") {
        const appKeys = stripeApp.keys as { client_secret?: string; public_key?: string };
        
        if (appKeys.client_secret && appKeys.public_key) {
          loggerWithEventDetails.debug("Found manual Stripe configuration, creating virtual credential");
          
          // Create a virtual credential for manual configuration
          // Transform app keys to match the expected credential format
          eventTypePaymentAppCredential = {
            key: {
              // For platform accounts, we don't have a stripe_user_id
              // The PaymentService will use the platform account when stripe_user_id is missing
              stripe_publishable_key: appKeys.public_key,
              default_currency: "usd", // Default currency for platform accounts
              // Include the secret key for platform account usage
              platform_secret_key: appKeys.client_secret
            } as any,
            appId: "stripe",
            app: {
              categories: ["payment" as any],
              dirName: "stripepayment"
            }
          };
        }
      }
    }

    if (!eventTypePaymentAppCredential) {
      throw new HttpError({ statusCode: 400, message: "Missing payment credentials" });
    }

    // Convert type of eventTypePaymentAppCredential to appId: EventTypeAppList
    if (!booking.user) booking.user = organizerUser;

    let payment;
    try {
      payment = await handlePayment({
        evt,
        selectedEventType: eventType,
        paymentAppCredentials: eventTypePaymentAppCredential as IEventTypePaymentCredentialType,
        booking,
        bookerName: fullName,
        bookerEmail,
        bookerPhoneNumber,
        isDryRun,
      });
    } catch (error) {
      loggerWithEventDetails.error("Payment creation failed", safeStringify(error));
      if (error instanceof Error && error.message === "payment_not_created_error") {
        throw new HttpError({
          statusCode: 402, // Payment Required
          message: "Payment could not be created. Please try again.",
          cause: error,
        });
      }
      throw new HttpError({
        statusCode: 400,
        message: "Payment processing failed",
        cause: error as Error,
      });
    }
    const subscriberOptionsPaymentInitiated: GetSubscriberOptions = {
      userId: triggerForUser ? organizerUser.id : null,
      eventTypeId,
      triggerEvent: WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED,
      teamId,
      orgId,
      oAuthClientId: platformClientId,
    };
    await handleWebhookTrigger({
      subscriberOptions: subscriberOptionsPaymentInitiated,
      eventTrigger: WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED,
      webhookData: {
        ...webhookData,
        paymentId: payment?.id,
      },
      isDryRun,
    });

    // TODO: Refactor better so this booking object is not passed
    // all around and instead the individual fields are sent as args.
    const bookingResponse = {
      ...booking,
      user: {
        ...booking.user,
        email: null,
      },
      videoCallUrl: metadata?.videoCallUrl,
      // Ensure seatReferenceUid is properly typed as string | null
      seatReferenceUid: evt.attendeeSeatId,
    };

    const finalResponse = {
      ...bookingResponse,
      ...luckyUserResponse,
      message: "Payment required",
      paymentRequired: true,
      paymentUid: payment?.uid,
      paymentId: payment?.id,
      // Include payment data for SYNC_BOOKING to enable embedded checkout
      ...(payment?.paymentOption === "SYNC_BOOKING" && payment?.data && typeof payment.data === "object"
        ? {
            clientSecret: (payment.data as { client_secret?: string }).client_secret,
            stripePublishableKey: (payment.data as { stripe_publishable_key?: string })
              .stripe_publishable_key,
            sessionId: (payment.data as { sessionId?: string }).sessionId,
          }
        : {}),
      isDryRun,
      ...(isDryRun ? { troubleshooterData } : {}),
    };

    loggerWithEventDetails.debug("Returning payment response:", {
      paymentUid: payment?.uid,
      paymentId: payment?.id,
      paymentRequired: true,
      bookingUid: booking?.uid,
      hasSyncBookingData: payment?.paymentOption === "SYNC_BOOKING",
    });

    return finalResponse;
  }

  loggerWithEventDetails.debug(`Booking ${organizerUser.username} completed`);

  // We are here so, booking doesn't require payment and booking is also created in DB already, through createBooking call
  if (isConfirmedByDefault) {
    const subscribersMeetingEnded = await getWebhooks(subscriberOptionsMeetingEnded);
    const subscribersMeetingStarted = await getWebhooks(subscriberOptionsMeetingStarted);

    let deleteWebhookScheduledTriggerPromise: Promise<unknown> = Promise.resolve();
    const scheduleTriggerPromises = [];

    if (rescheduleUid && originalRescheduledBooking) {
      //delete all scheduled triggers for meeting ended and meeting started of booking
      deleteWebhookScheduledTriggerPromise = deleteWebhookScheduledTriggers({
        booking: originalRescheduledBooking,
        isDryRun,
      });
    }

    if (booking && booking.status === BookingStatus.ACCEPTED) {
      const bookingWithCalEventResponses = {
        ...booking,
        responses: reqBody.calEventResponses,
      };
      for (const subscriber of subscribersMeetingEnded) {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking: bookingWithCalEventResponses,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
            isDryRun,
          })
        );
      }

      for (const subscriber of subscribersMeetingStarted) {
        scheduleTriggerPromises.push(
          scheduleTrigger({
            booking: bookingWithCalEventResponses,
            subscriberUrl: subscriber.subscriberUrl,
            subscriber,
            triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
            isDryRun,
          })
        );
      }
    }

    await Promise.all([deleteWebhookScheduledTriggerPromise, ...scheduleTriggerPromises]).catch((error) => {
      loggerWithEventDetails.error(
        "Error while scheduling or canceling webhook triggers",
        JSON.stringify({ error })
      );
    });

    // Send Webhook call if hooked to BOOKING_CREATED & BOOKING_RESCHEDULED
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger,
      webhookData,
      isDryRun,
    });
  } else {
    // if eventType requires confirmation we will trigger the BOOKING REQUESTED Webhook
    const eventTrigger: WebhookTriggerEvents = WebhookTriggerEvents.BOOKING_REQUESTED;
    subscriberOptions.triggerEvent = eventTrigger;
    webhookData.status = "PENDING";
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger,
      webhookData,
      isDryRun,
    });
  }

  try {
    if (hasHashedBookingLink && reqBody.hashedLink && !isDryRun) {
      await prisma.hashedLink.delete({
        where: {
          link: reqBody.hashedLink as string,
        },
      });
    }
  } catch (error) {
    loggerWithEventDetails.error("Error while updating hashed link", JSON.stringify({ error }));
  }

  if (!booking) throw new HttpError({ statusCode: 400, message: "Booking failed" });

  try {
    if (!isDryRun) {
      await prisma.booking.update({
        where: {
          uid: booking.uid,
        },
        data: {
          location: evt.location,
          metadata: { ...(typeof booking.metadata === "object" && booking.metadata), ...metadata },
          references: {
            createMany: {
              data: referencesToCreate,
            },
          },
        },
      });
    }
  } catch (error) {
    loggerWithEventDetails.error("Error while creating booking references", JSON.stringify({ error }));
  }

  const evtWithMetadata = {
    ...evt,
    rescheduleReason,
    metadata,
    eventType: { slug: eventType.slug, schedulingType: eventType.schedulingType, hosts: eventType.hosts },
    bookerUrl,
  };

  if (!eventType.metadata?.disableStandardEmails?.all?.attendee) {
    await scheduleMandatoryReminder({
      evt: evtWithMetadata,
      workflows,
      requiresConfirmation: !isConfirmedByDefault,
      hideBranding: !!eventType.owner?.hideBranding,
      seatReferenceUid: evt.attendeeSeatId,
      isPlatformNoEmail: noEmail && Boolean(platformClientId),
      isDryRun,
    });
  }

  try {
    await scheduleWorkflowReminders({
      workflows,
      smsReminderNumber: smsReminderNumber || null,
      calendarEvent: evtWithMetadata,
      isNotConfirmed: rescheduleUid ? false : !isConfirmedByDefault,
      isRescheduleEvent: !!rescheduleUid,
      isFirstRecurringEvent: input.bookingData.allRecurringDates
        ? !!input.bookingData.isFirstRecurringSlot
        : undefined,
      hideBranding: !!eventType.owner?.hideBranding,
      seatReferenceUid: evt.attendeeSeatId,
      isDryRun,
    });
  } catch (error) {
    loggerWithEventDetails.error("Error while scheduling workflow reminders", JSON.stringify({ error }));
  }

  try {
    if (isConfirmedByDefault) {
      await scheduleNoShowTriggers({
        booking: { startTime: booking.startTime, id: booking.id, location: booking.location },
        triggerForUser,
        organizerUser: { id: organizerUser.id },
        eventTypeId,
        teamId,
        orgId,
        isDryRun,
      });
    }
  } catch (error) {
    loggerWithEventDetails.error("Error while scheduling no show triggers", JSON.stringify({ error }));
  }

  if (!isDryRun) {
    await handleAnalyticsEvents({
      credentials: allCredentials,
      rawBookingData,
      bookingInfo: {
        name: fullName,
        email: bookerEmail,
        eventName: "Cal.com lead",
      },
      isTeamEventType,
    });
  }

  // TODO: Refactor better so this booking object is not passed
  // all around and instead the individual fields are sent as args.
  const bookingResponse = {
    ...booking,
    user: {
      ...booking.user,
      email: null,
    },
    paymentRequired: false,
  };

  return {
    ...bookingResponse,
    ...luckyUserResponse,
    isDryRun,
    ...(isDryRun ? { troubleshooterData } : {}),
    references: referencesToCreate,
    seatReferenceUid: evt.attendeeSeatId,
    videoCallUrl: metadata?.videoCallUrl,
  };
}

export default handler;
