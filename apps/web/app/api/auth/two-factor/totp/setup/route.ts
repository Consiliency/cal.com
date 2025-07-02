import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { parseRequestData } from "app/api/parseRequestData";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authenticator } from "otplib";
import qrcode from "qrcode";

import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { verifyPassword } from "@calcom/features/auth/lib/verifyPassword";
import { symmetricEncrypt } from "@calcom/lib/crypto";
import prisma from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

async function postHandler(req: NextRequest) {
  console.log("[2FA Setup] Starting request");

  let body;
  try {
    body = await parseRequestData(req);
    console.log("[2FA Setup] Body parsed successfully");
  } catch (error) {
    console.error("[2FA Setup] Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let session;
  try {
    session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
    console.log("[2FA Setup] Session retrieved:", session ? "Session found" : "No session");
  } catch (error) {
    console.error("[2FA Setup] Error getting session:", error);
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }

  if (!session) {
    console.log("[2FA Setup] No session found - returning 401");
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  if (!session.user?.id) {
    console.error("[2FA Setup] Session is missing a user id.");
    return NextResponse.json({ error: ErrorCode.InternalServerError }, { status: 500 });
  }

  console.log("[2FA Setup] Looking up user with ID:", session.user.id);

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: session.user.id }, include: { password: true } });
    console.log("[2FA Setup] User found:", user ? `${user.email} (ID: ${user.id})` : "No user");
  } catch (error) {
    console.error("[2FA Setup] Error fetching user from database:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!user) {
    console.error(`[2FA Setup] Session references user that no longer exists.`);
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  console.log("[2FA Setup] User identity provider:", user.identityProvider);
  console.log("[2FA Setup] Password hash exists:", !!user.password?.hash);

  if (user.identityProvider !== IdentityProvider.CAL && !user.password?.hash) {
    console.log("[2FA Setup] Third party identity provider enabled, no password");
    return NextResponse.json({ error: ErrorCode.ThirdPartyIdentityProviderEnabled }, { status: 400 });
  }

  if (!user.password?.hash) {
    console.log("[2FA Setup] User missing password");
    return NextResponse.json({ error: ErrorCode.UserMissingPassword }, { status: 400 });
  }

  if (user.twoFactorEnabled) {
    console.log("[2FA Setup] 2FA already enabled for user");
    return NextResponse.json({ error: ErrorCode.TwoFactorAlreadyEnabled }, { status: 400 });
  }

  console.log("[2FA Setup] Checking CALENDSO_ENCRYPTION_KEY");
  if (!process.env.CALENDSO_ENCRYPTION_KEY) {
    console.error("[2FA Setup] CALENDSO_ENCRYPTION_KEY not configured!");
    return NextResponse.json({ error: "Encryption key not configured" }, { status: 500 });
  }
  console.log("[2FA Setup] CALENDSO_ENCRYPTION_KEY is set");

  console.log("[2FA Setup] Verifying password");
  let isCorrectPassword;
  try {
    isCorrectPassword = await verifyPassword(body.password, user.password.hash);
    console.log("[2FA Setup] Password verification result:", isCorrectPassword);
  } catch (error) {
    console.error("[2FA Setup] Error verifying password:", error);
    return NextResponse.json({ error: "Password verification error" }, { status: 500 });
  }

  if (!isCorrectPassword) {
    console.log("[2FA Setup] Incorrect password provided");
    return NextResponse.json({ error: ErrorCode.IncorrectPassword }, { status: 400 });
  }

  // This generates a secret 32 characters in length. Do not modify the number of
  // bytes without updating the sanity checks in the enable and login endpoints.
  console.log("[2FA Setup] Generating secret");
  const secret = authenticator.generateSecret(20);

  // Generate backup codes with 10 character length
  console.log("[2FA Setup] Generating backup codes");
  const backupCodes = Array.from(Array(10), () => crypto.randomBytes(5).toString("hex"));

  console.log("[2FA Setup] Updating user in database");
  try {
    await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        backupCodes: symmetricEncrypt(JSON.stringify(backupCodes), process.env.CALENDSO_ENCRYPTION_KEY),
        twoFactorEnabled: false,
        twoFactorSecret: symmetricEncrypt(secret, process.env.CALENDSO_ENCRYPTION_KEY),
      },
    });
    console.log("[2FA Setup] User updated successfully");
  } catch (error) {
    console.error("[2FA Setup] Error updating user:", error);
    return NextResponse.json({ error: "Failed to save 2FA settings" }, { status: 500 });
  }

  const name = user.email || user.username || user.id.toString();
  console.log("[2FA Setup] Generating QR code for:", name);

  try {
    const keyUri = authenticator.keyuri(name, "Cal", secret);
    const dataUri = await qrcode.toDataURL(keyUri);
    console.log("[2FA Setup] QR code generated successfully");
    return NextResponse.json({ secret, keyUri, dataUri, backupCodes });
  } catch (error) {
    console.error("[2FA Setup] Error generating QR code:", error);
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}

export const POST = defaultResponderForAppDir(postHandler, "/api/auth/two-factor/totp/setup");
