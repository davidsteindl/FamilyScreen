import { and, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, users } from "@/db/schema";

export async function getContacts(userId: string) {
  return db
    .select({ userId: users.id, name: users.name })
    .from(contacts)
    .innerJoin(
      users,
      eq(
        users.id,
        sql<string>`case when ${contacts.userAId} = ${userId} then ${contacts.userBId} else ${contacts.userAId} end`,
      ),
    )
    .where(or(eq(contacts.userAId, userId), eq(contacts.userBId, userId)))
    .orderBy(users.createdAt, users.id);
}

export async function canCommunicate(a: string, b: string) {
  if (a === b) {
    return false;
  }

  const [userAId, userBId] = [a, b].sort();

  const [row] = await db
    .select({ userAId: contacts.userAId })
    .from(contacts)
    .where(and(eq(contacts.userAId, userAId), eq(contacts.userBId, userBId)))
    .limit(1);

  return row !== undefined;
}
