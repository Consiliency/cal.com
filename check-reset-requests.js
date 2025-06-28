const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkResetRequests() {
  try {
    // Check for recent password reset requests
    const resetRequests = await prisma.resetPasswordRequest.findMany({
      where: {
        email: "jenner@frontierstrategies.ai",
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    console.log("Recent password reset requests:");
    resetRequests.forEach((request, index) => {
      console.log(`${index + 1}. ID: ${request.id}`);
      console.log(`   Email: ${request.email}`);
      console.log(`   Created: ${request.createdAt}`);
      console.log(`   Expires: ${request.expires}`);
      console.log(`   Expired: ${new Date() > request.expires}`);
      console.log("---");
    });

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: "jenner@frontierstrategies.ai" },
      select: { id: true, email: true, name: true, role: true },
    });

    console.log("\nUser details:");
    if (user) {
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.name}`);
      console.log(`Role: ${user.role}`);
    } else {
      console.log("User not found!");
    }
  } catch (error) {
    console.error("Error checking reset requests:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkResetRequests();
