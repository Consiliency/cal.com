import type { IdentityProvider, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Adapter } from "next-auth/adapters";

import type { PrismaClient } from "@calcom/prisma";

import { identityProviderNameMap } from "./identityProviderNameMap";

/** @return { import("next-auth/adapters").Adapter } */

export default function CalComAdapter(prismaClient: PrismaClient): Adapter {
  return {
    createUser: async (user: any) => {
      const createdUser = await prismaClient.user.create({
        data: user as any,
      });
      return { ...createdUser, id: createdUser.id.toString() };
    },
    getUser: async (id: string) => {
      const user = await prismaClient.user.findUnique({
        where: { id: parseInt(id) },
      });
      return user ? { ...user, id: user.id.toString() } : null;
    },
    getUserByEmail: async (email: string) => {
      const user = await prismaClient.user.findUnique({
        where: { email },
      });
      return user ? { ...user, id: user.id.toString() } : null;
    },
    async getUserByAccount(providerAccountId: any) {
      let _account;
      const account = await prismaClient.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: providerAccountId.provider,
            providerAccountId: providerAccountId.providerAccountId,
          },
        },
        select: { user: true },
      });
      if (account) {
        const user = account?.user;
        return user ? { ...user, id: user.id.toString() } : null;
      }

      // NOTE: this code it's our fallback to users without Account but credentials in User Table
      // We should remove this code after all googles tokens have expired
      const provider = (providerAccountId?.provider as string).toUpperCase() as IdentityProvider;
      if (["GOOGLE", "SAML"].indexOf(provider) < 0) {
        return null;
      }
      const obtainProvider = identityProviderNameMap[provider].toUpperCase() as IdentityProvider;
      const user = await prismaClient.user.findFirst({
        where: {
          identityProviderId: providerAccountId?.providerAccountId,
          identityProvider: obtainProvider,
        },
      });
      return user ? { ...user, id: user.id.toString() } : null;
    },
    updateUser: async (user: any) => {
      const { id, ...data } = user;
      const updatedUser = await prismaClient.user.update({
        where: { id: parseInt(id) },
        data: data as any,
      });
      return { ...updatedUser, id: updatedUser.id.toString() };
    },
    deleteUser: async (userId: string) => {
      await prismaClient.user.delete({
        where: { id: parseInt(userId) },
      });
    },
    async createVerificationToken(verificationToken: any) {
      const { id: _, ...token } = await prismaClient.verificationToken.create({
        data: verificationToken as any,
      });
      return token;
    },
    async useVerificationToken(identifier_token: Prisma.VerificationTokenIdentifierTokenCompoundUniqueInput) {
      try {
        const { id: _, ...verificationToken } = await prismaClient.verificationToken.delete({
          where: { identifier_token },
        });
        return verificationToken;
      } catch (error) {
        // If token already used/deleted, just return null
        // https://www.prisma.io/docs/reference/api-reference/error-reference#p2025
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === "P2025") return null;
        }
        throw error;
      }
    },
    linkAccount: async (account: any) => {
      await prismaClient.account.create({
        data: account as any,
      });
    },
    unlinkAccount: async (providerAccountId: any) => {
      await prismaClient.account.delete({
        where: {
          provider_providerAccountId: {
            provider: providerAccountId.provider,
            providerAccountId: providerAccountId.providerAccountId,
          },
        },
      });
    },
    createSession: async (session: any) => {
      const createdSession = await prismaClient.session.create({ data: session as any });
      return { ...createdSession, userId: createdSession.userId.toString() };
    },
    getSessionAndUser: async (sessionToken: string) => {
      const sessionAndUser = await prismaClient.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!sessionAndUser) return null;
      return {
        session: { ...sessionAndUser, userId: sessionAndUser.userId.toString() },
        user: { ...sessionAndUser.user!, id: sessionAndUser.user!.id.toString() },
      };
    },
    updateSession: async (session: any) => {
      const updatedSession = await prismaClient.session.update({
        where: { sessionToken: session.sessionToken },
        data: session as any,
      });
      return { ...updatedSession, userId: updatedSession.userId.toString() };
    },
    deleteSession: async (sessionToken: string) => {
      await prismaClient.session.delete({ where: { sessionToken } });
    },
  };
}
