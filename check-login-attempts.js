const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkLoginAttempts() {
  try {
    console.log("=== Checking Recent Sessions ===");

    // Check for recent sessions for the admin user
    const sessions = await prisma.session.findMany({
      where: {
        userId: 1, // Admin user ID
        expires: {
          gte: new Date(),
        },
      },
      orderBy: {
        expires: "desc",
      },
      take: 5,
    });

    console.log(`Active sessions for admin user: ${sessions.length}`);
    sessions.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session.id}`);
      console.log(`   Expires: ${session.expires}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log("---");
    });

    console.log("\n=== Checking Recent Sessions (All Users) ===");

    // Check for any recent sessions
    const allSessions = await prisma.session.findMany({
      where: {
        expires: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
      orderBy: {
        expires: "desc",
      },
      take: 10,
    });

    console.log(`Recent sessions (last 24h): ${allSessions.length}`);
    allSessions.forEach((session, index) => {
      console.log(`${index + 1}. User: ${session.user?.email || "Unknown"}`);
      console.log(`   Session ID: ${session.id}`);
      console.log(`   Expires: ${session.expires}`);
      console.log("---");
    });

    console.log("\n=== Checking User Authentication Status ===");

    // Check the admin user's authentication details
    const adminUser = await prisma.user.findUnique({
      where: { email: "jenner@frontierstrategies.ai" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        password: true,
        identityProvider: true,
        identityProviderId: true,
      },
    });

    if (adminUser) {
      console.log("Admin user details:");
      console.log(`ID: ${adminUser.id}`);
      console.log(`Email: ${adminUser.email}`);
      console.log(`Name: ${adminUser.name}`);
      console.log(`Role: ${adminUser.role}`);
      console.log(`Email Verified: ${adminUser.emailVerified}`);
      console.log(`Has Password: ${adminUser.password ? "Yes" : "No"}`);
      console.log(`Identity Provider: ${adminUser.identityProvider || "None"}`);
      console.log(`Identity Provider ID: ${adminUser.identityProviderId || "None"}`);
    }

    console.log("\n=== Checking Recent Password Reset Requests ===");

    // Check recent password reset requests
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

    console.log(`Recent password reset requests: ${resetRequests.length}`);
    resetRequests.forEach((request, index) => {
      console.log(`${index + 1}. ID: ${request.id}`);
      console.log(`   Created: ${request.createdAt}`);
      console.log(`   Expires: ${request.expires}`);
      console.log(`   Expired: ${new Date() > request.expires}`);
      console.log("---");
    });
  } catch (error) {
    console.error("Error checking login attempts:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLoginAttempts();
