import type { NextApiRequest, NextApiResponse } from "next";

import prisma from "@calcom/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing booking ID" });
  }

  try {
    const bookingId = parseInt(id as string);

    // Find all payments for this booking
    const payments = await prisma.payment.findMany({
      where: {
        bookingId: bookingId,
      },
      select: {
        id: true,
        uid: true,
        externalId: true,
        amount: true,
        currency: true,
        success: true,
        data: true,
        createdAt: true,
      },
    });

    // Also find the booking itself
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        uid: true,
        title: true,
        status: true,
        paid: true,
        payment: {
          select: {
            id: true,
            externalId: true,
            success: true,
          },
        },
      },
    });

    return res.status(200).json({
      bookingId,
      booking,
      payments,
      paymentsCount: payments.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch payment data",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
