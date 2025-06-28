const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkRateLimits() {
  try {
    console.log("=== Checking Rate Limits for jenner@frontierstrategies.ai ===");

    const email = "jenner@frontierstrategies.ai";

    // Check if user is locked
    console.log("\n--- User Lock Status ---");
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, locked: true, role: true },
    });

    if (user) {
      console.log(`User ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`User locked: ${user.locked ? "YES" : "NO"}`);

      if (user.locked) {
        console.log("⚠️  User account is locked due to rate limiting!");
        console.log("   - This is preventing login");
        console.log("   - You need to unlock the account or wait for auto-unlock");
      }
    } else {
      console.log("❌ User not found!");
    }

    // Check for any recent password reset attempts that might indicate login issues
    console.log("\n--- Recent Password Reset Activity ---");
    const recentResets = await prisma.resetPasswordRequest.findMany({
      where: {
        email,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(`Password reset requests in last 24h: ${recentResets.length}`);
    recentResets.forEach((reset, index) => {
      console.log(`  ${index + 1}. ID: ${reset.id}`);
      console.log(`     Created: ${reset.createdAt}`);
      console.log(`     Expires: ${reset.expires}`);
      console.log(`     Expired: ${new Date() > reset.expires ? "YES" : "NO"}`);
      console.log("");
    });

    // Check for any recent sessions to see if login attempts are working
    console.log("\n--- Recent Session Activity ---");
    const recentSessions = await prisma.session.findMany({
      where: {
        userId: user?.id,
        expires: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { expires: "desc" },
    });

    console.log(`Active sessions in last 24h: ${recentSessions.length}`);
    if (recentSessions.length === 0) {
      console.log("   - No active sessions found");
      console.log("   - This confirms login attempts are not creating sessions");
    } else {
      recentSessions.forEach((session, index) => {
        console.log(`  ${index + 1}. Session ID: ${session.id}`);
        console.log(`     Expires: ${session.expires}`);
        console.log(`     Active: ${new Date() < session.expires ? "YES" : "NO"}`);
      });
    }

    // Analysis
    console.log("\n--- Analysis ---");
    if (user?.locked) {
      console.log("🔴 ACCOUNT IS LOCKED");
      console.log("   - This is why you cannot log in");
      console.log("   - The account was likely locked due to too many failed login attempts");
      console.log("   - Solutions:");
      console.log("     1. Wait 30 minutes for auto-unlock");
      console.log("     2. Use the password reset link to set a new password");
      console.log("     3. Contact support to unlock the account");
    } else if (recentSessions.length === 0) {
      console.log("🟡 NO ACTIVE SESSIONS");
      console.log("   - Login attempts are not creating sessions");
      console.log("   - This suggests the password is incorrect or there's an authentication error");
      console.log("   - Solutions:");
      console.log("     1. Use the password reset link to set a new password");
      console.log("     2. Check if you're using the correct password");
    } else {
      console.log("✅ SESSIONS EXIST");
      console.log("   - Login attempts are working");
      console.log("   - Check if you're accessing the right URL or have session issues");
    }
  } catch (error) {
    console.error("Error checking rate limits:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRateLimits();
