import { PrismaClient } from "./packages/prisma/client";

const prisma = new PrismaClient();

async function checkBookings() {
  try {
    // Get bookings for eventTypeId 22
    const bookings = await prisma.booking.findMany({
      where: {
        eventTypeId: 22
      },
      select: {
        id: true,
        uid: true,
        title: true,
        status: true,
        paid: true,
        createdAt: true,
        eventTypeId: true,
        startTime: true,
        endTime: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log("Bookings for Test event type (ID: 22):");
    console.log(JSON.stringify(bookings, null, 2));

    // Count unpaid bookings
    const unpaidCount = await prisma.booking.count({
      where: {
        eventTypeId: 22,
        paid: false
      }
    });

    console.log(`\nTotal unpaid bookings: ${unpaidCount}`);

    // Check event type payment configuration
    const eventType = await prisma.eventType.findUnique({
      where: { id: 22 },
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        currency: true,
        metadata: true
      }
    });

    console.log("\nEvent Type Configuration:");
    console.log(JSON.stringify(eventType, null, 2));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookings();