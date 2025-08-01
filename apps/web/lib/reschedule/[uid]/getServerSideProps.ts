// page can be a server component
import type { GetServerSidePropsContext } from "next";
import { URLSearchParams } from "url";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getFullName } from "@calcom/features/form-builder/utils";
import { buildEventUrlFromBooking } from "@calcom/lib/bookings/buildEventUrlFromBooking";
import { getDefaultEvent } from "@calcom/lib/defaultEvents";
import { getSafe } from "@calcom/lib/getSafe";
import { maybeGetBookingUidFromSeat } from "@calcom/lib/server/maybeGetBookingUidFromSeat";
import { UserRepository } from "@calcom/lib/server/repository/user";
import prisma, { bookingMinimalSelect } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/client";

const querySchema = z.object({
  uid: z.string(),
  seatReferenceUid: z.string().optional(),
  rescheduledBy: z.string().optional(),
  allowRescheduleForCancelledBooking: z
    .string()
    .transform((value) => value === "true")
    .optional(),
});

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getServerSession({ req: context.req });

  const {
    uid: bookingUid,
    seatReferenceUid,
    rescheduledBy,
    /**
     * This is for the case of request-reschedule where the booking is cancelled
     */
    allowRescheduleForCancelledBooking,
  } = querySchema.parse(context.query);

  const coepFlag = context.query["flag.coep"];
  const {
    uid,
    seatReferenceUid: maybeSeatReferenceUid,
    bookingSeat,
  } = await maybeGetBookingUidFromSeat(prisma, bookingUid);

  const booking = await prisma.booking.findUnique({
    where: {
      uid,
    },
    select: {
      ...bookingMinimalSelect,
      responses: true,
      eventType: {
        select: {
          users: {
            select: {
              username: true,
            },
          },
          slug: true,
          allowReschedulingPastBookings: true,
          disableRescheduling: true,
          allowReschedulingCancelledBookings: true,
          team: {
            select: {
              parentId: true,
              slug: true,
            },
          },
          seatsPerTimeSlot: true,
          userId: true,
          owner: {
            select: {
              id: true,
            },
          },
          hosts: {
            select: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      dynamicEventSlugRef: true,
      dynamicGroupSlugRef: true,
      user: true,
      status: true,
    },
  });
  const dynamicEventSlugRef = booking?.dynamicEventSlugRef || "";

  if (!booking) {
    return {
      notFound: true,
    } as const;
  }

  const eventType = booking.eventType ? booking.eventType : getDefaultEvent(dynamicEventSlugRef);

  const enrichedBookingUser = booking.user
    ? await UserRepository.enrichUserWithItsProfile({ user: booking.user })
    : null;

  const eventUrl = await buildEventUrlFromBooking({
    eventType,
    dynamicGroupSlugRef: booking.dynamicGroupSlugRef ?? null,
    profileEnrichedBookingUser: enrichedBookingUser,
  });

  const isForcedRescheduleForCancelledBooking = allowRescheduleForCancelledBooking;
  // If booking is already REJECTED, we can't reschedule this booking. Take the user to the booking page which would show it's correct status and other details.
  // If the booking is CANCELLED and allowRescheduleForCancelledBooking is false, we redirect the user to the original event link.
  // A booking that has been rescheduled to a new booking will also have a status of CANCELLED
  const isDisabledRescheduling = booking.eventType?.disableRescheduling;
  // This comes from query param and thus is considered forced
  const canBookThroughCancelledBookingRescheduleLink = booking.eventType?.allowReschedulingCancelledBookings;
  const isNonRescheduleableBooking =
    booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.REJECTED;

  if (isDisabledRescheduling) {
    return {
      redirect: {
        destination: `/booking/${uid}`,
        permanent: false,
      },
    };
  }

  if (isNonRescheduleableBooking && !isForcedRescheduleForCancelledBooking) {
    const canReschedule =
      booking.status === BookingStatus.CANCELLED && canBookThroughCancelledBookingRescheduleLink;
    return {
      redirect: {
        destination: canReschedule ? eventUrl : `/booking/${uid}`,
        permanent: false,
      },
    };
  }

  if (!booking?.eventType && !booking?.dynamicEventSlugRef) {
    // TODO: Show something in UI to let user know that this booking is not rescheduleable
    return {
      notFound: true,
    } as {
      notFound: true;
    };
  }

  const isBookingInPast = booking.endTime && new Date(booking.endTime) < new Date();
  if (isBookingInPast && !eventType.allowReschedulingPastBookings) {
    const destinationUrlSearchParams = new URLSearchParams();
    const responses = bookingSeat ? getSafe<string>(bookingSeat.data, ["responses"]) : booking.responses;
    const name = getFullName(getSafe<string | { firstName: string; lastName?: string }>(responses, ["name"]));
    const email = getSafe<string>(responses, ["email"]);

    if (name) destinationUrlSearchParams.set("name", name);
    if (email) destinationUrlSearchParams.set("email", email);

    const searchParamsString = destinationUrlSearchParams.toString();
    return {
      redirect: {
        destination: searchParamsString ? `${eventUrl}?${searchParamsString}` : eventUrl,
        permanent: false,
      },
    };
  }

  // if booking event type is for a seated event and no seat reference uid is provided, throw not found
  if (booking?.eventType?.seatsPerTimeSlot && !maybeSeatReferenceUid) {
    const userId = session?.user?.id;

    if (!userId && !seatReferenceUid) {
      return {
        redirect: {
          destination: `/auth/login?callbackUrl=/reschedule/${bookingUid}`,
          permanent: false,
        },
      };
    }
    const userIsHost = booking?.eventType.hosts.find((host) => {
      if (host.user.id === userId) return true;
    });

    const userIsOwnerOfEventType = booking?.eventType.owner?.id === userId;

    if (!userIsHost && !userIsOwnerOfEventType) {
      return {
        notFound: true,
      } as {
        notFound: true;
      };
    }
  }

  const destinationUrlSearchParams = new URLSearchParams();

  destinationUrlSearchParams.set("rescheduleUid", seatReferenceUid || bookingUid);

  if (allowRescheduleForCancelledBooking) {
    destinationUrlSearchParams.set("allowRescheduleForCancelledBooking", "true");
  }

  // TODO: I think we should just forward all the query params here including coep flag
  if (coepFlag) {
    destinationUrlSearchParams.set("flag.coep", coepFlag as string);
  }

  const currentUserEmail = rescheduledBy ?? session?.user?.email;

  if (currentUserEmail) {
    destinationUrlSearchParams.set("rescheduledBy", currentUserEmail);
  }

  return {
    redirect: {
      destination: `${eventUrl}?${destinationUrlSearchParams.toString()}${
        eventType.seatsPerTimeSlot ? "&bookingUid=null" : ""
      }`,
      permanent: false,
    },
  };
}
