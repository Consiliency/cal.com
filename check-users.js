const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    // Check all users
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, emailVerified: true },
      orderBy: { createdDate: "desc" },
    });

    console.log("All users in database:");
    users.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Email Verified: ${user.emailVerified}`);
      console.log("---");
    });

    // Check for any users with similar email patterns
    const similarUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: "jenner" } },
          { email: { contains: "consiliency" } },
          { email: { contains: "frontier" } },
        ],
      },
      select: { id: true, email: true, name: true, role: true },
    });

    console.log("\nUsers with similar email patterns:");
    similarUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log("---");
    });
  } catch (error) {
    console.error("Error checking users:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
