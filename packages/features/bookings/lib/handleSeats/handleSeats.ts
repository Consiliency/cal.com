// eslint-disable-next-line no-restricted-imports
import dayjs from "@calcom/dayjs";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import { scheduleWorkflowReminders } from "@calcom/features/ee/workflows/lib/reminders/reminderScheduler";
import type { EventPayloadType } from "@calcom/features/webhooks/lib/sendPayload";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import prisma from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import { createLoggerWithEventDetails } from "../handleNewBooking/logger";
import createNewSeat from "./create/createNewSeat";
import rescheduleSeatedBooking from "./reschedule/rescheduleSeatedBooking";
import type { NewSeatedBookingObject, SeatedBooking, HandleSeatsResultBooking } from "./types";

const handleSeats = async (newSeatedBookingObject: NewSeatedBookingObject) => {
  const {
    eventType,
    reqBodyUser,
    rescheduleUid,
    reqBookingUid,
    invitee,
    bookerEmail,
    smsReminderNumber,
    eventTypeInfo,
    uid,
    originalRescheduledBooking,
    reqBodyMetadata,
    eventTypeId,
    subscriberOptions,
    eventTrigger,
    evt,
    workflows,
    rescheduledBy,
    rescheduleReason,
    isDryRun = false,
  } = newSeatedBookingObject;
  // TODO: We could allow doing more things to support good dry run for seats
  if (isDryRun) return;
  const loggerWithEventDetails = createLoggerWithEventDetails(eventType.id, reqBodyUser, eventType.slug);

  let resultBooking: HandleSeatsResultBooking = null;

  const seatedBooking: SeatedBooking | null = await prisma.booking.findFirst({
    where: {
      AND: [
        {
          OR: [
            {
              uid: rescheduleUid || reqBookingUid,
            },
            {
              eventTypeId: eventType.id,
              startTime: new Date(evt.startTime),
            },
          ],
        },
        {
          status: BookingStatus.ACCEPTED,
        },
        {
          // Only find bookings that are either paid or don't require payment
          OR: [
            { paid: true },
            { 
              payment: {
                none: {} // No payment record means payment wasn't required
              }
            }
          ]
        }
      ]
    },
    select: {
      uid: true,
      id: true,
      attendees: { include: { bookingSeat: true } },
      userId: true,
      references: true,
      startTime: true,
      user: true,
      status: true,
      smsReminderNumber: true,
      endTime: true,
      paid: true,
      payment: {
        select: {
          id: true,
          success: true
        }
      }
    },
  });

  if (!seatedBooking && rescheduleUid) {
    throw new HttpError({ statusCode: 404, message: ErrorCode.BookingNotFound });
  }

  // We might be trying to create a new booking
  if (!seatedBooking) {
    return;
  }

  // See if attendee is already signed up for timeslot
  if (
    seatedBooking.attendees.find((attendee) => {
      return attendee.email === invitee[0].email;
    }) &&
    dayjs.utc(seatedBooking.startTime).format() === evt.startTime
  ) {
    throw new HttpError({ statusCode: 409, message: ErrorCode.AlreadySignedUpForBooking });
  }

  // There are two paths here, reschedule a booking with seats and booking seats without reschedule
  if (rescheduleUid) {
    resultBooking = await rescheduleSeatedBooking(
      // Assert that the rescheduleUid is defined
      { ...newSeatedBookingObject, rescheduleUid },
      seatedBooking,
      resultBooking,
      loggerWithEventDetails
    );
  } else {
    resultBooking = await createNewSeat(newSeatedBookingObject, seatedBooking, reqBodyMetadata);
  }

  // If the resultBooking is defined we should trigger workflows else, trigger in handleNewBooking
  if (resultBooking) {
    const metadata = {
      ...(typeof resultBooking.metadata === "object" && resultBooking.metadata),
      ...reqBodyMetadata,
    };
    try {
      await scheduleWorkflowReminders({
        workflows,
        smsReminderNumber: smsReminderNumber || null,
        calendarEvent: {
          ...evt,
          rescheduleReason,
          ...{
            metadata,
            eventType: {
              slug: eventType.slug,
              schedulingType: eventType.schedulingType,
              hosts: eventType.hosts,
            },
          },
        },
        isNotConfirmed: evt.requiresConfirmation || false,
        isRescheduleEvent: !!rescheduleUid,
        isFirstRecurringEvent: true,
        emailAttendeeSendToOverride: bookerEmail,
        seatReferenceUid: evt.attendeeSeatId,
        isDryRun,
      });
    } catch (error) {
      loggerWithEventDetails.error("Error while scheduling workflow reminders", JSON.stringify({ error }));
    }

    const webhookData: EventPayloadType = {
      ...evt,
      ...eventTypeInfo,
      uid: resultBooking?.uid || uid,
      bookingId: seatedBooking?.id,
      attendeeSeatId: resultBooking?.seatReferenceUid,
      rescheduleUid,
      rescheduleStartTime: originalRescheduledBooking?.startTime
        ? dayjs(originalRescheduledBooking?.startTime).utc().format()
        : undefined,
      rescheduleEndTime: originalRescheduledBooking?.endTime
        ? dayjs(originalRescheduledBooking?.endTime).utc().format()
        : undefined,
      metadata,
      eventTypeId,
      status: "ACCEPTED",
      smsReminderNumber: seatedBooking?.smsReminderNumber || undefined,
      rescheduledBy,
    };

    await handleWebhookTrigger({ subscriberOptions, eventTrigger, webhookData, isDryRun });
  }

  return resultBooking;
};

export default handleSeats;
