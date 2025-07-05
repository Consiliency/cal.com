import type { PrismaClient as PrismaClientType } from "@prisma/client";

// Re-export all Prisma types
export * from "@prisma/client";

// Export the extended PrismaClient type
export type PrismaClient = PrismaClientType;

// Export prisma instance
declare const prisma: PrismaClient;
export default prisma;

// Export other instances
export declare const readonlyPrisma: PrismaClient;
export declare const customPrisma: (options?: any) => PrismaClient;

// Export transaction type
export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Export selects
export * from "./selects";
