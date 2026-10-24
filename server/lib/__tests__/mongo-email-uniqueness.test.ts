import { strict as assert } from "node:assert";
import { MongoStorage } from "../mongo-storage";
import { findEmailAccount, resolveGoogleEmailAccount } from "../email-uniqueness";

function matches(document: any, filter: any): boolean {
  return Object.entries(filter ?? {}).every(([key, condition]: [string, any]) => {
    if (key === "$or") return condition.some((clause: any) => matches(document, clause));
    const value = document[key];
    if (condition && typeof condition === "object") {
      if ("$ne" in condition) return String(value) !== String(condition.$ne);
      if ("$regex" in condition) return new RegExp(condition.$regex, condition.$options ?? "").test(String(value));
      if ("$in" in condition) return condition.$in.some((item: any) => String(item) === String(value));
      if ("$nin" in condition) return !condition.$nin.some((item: any) => String(item) === String(value));
    }
    return String(value) === String(condition);
  });
}

function makeCollection(initial: any[] = []) {
  const documents = initial;
  return {
    documents,
      async findOne(filter: any = {}) { return documents.find(document => matches(document, filter)) ?? null; },
    find(filter: any = {}) {
      const cursor = {
        sort() { return cursor; },
        async toArray() { return documents.filter(document => matches(document, filter)); },
      };
      return cursor;
    },
    async findOneAndDelete(filter: any) {
      const index = documents.findIndex(document => matches(document, filter));
      if (index === -1) return null;
      return documents.splice(index, 1)[0];
    },
    async insertOne(document: any) {
      documents.push(document);
      return { insertedId: document._id };
    },
    async updateOne(filter: any, update: any, options: any = {}) {
      const document = documents.find(item => matches(item, filter));
      if (document || !options.upsert) return { upsertedCount: 0 };
      documents.push({ _id: filter._id, ...update.$setOnInsert });
      return { upsertedCount: 1 };
    },
    async findOneAndUpdate(filter: any, update: any) {
      const document = documents.find(item => matches(item, filter));
      if (!document) return null;
      Object.assign(document, update.$set);
      return document;
    },
    async deleteMany(filter: any) {
      for (let i = documents.length - 1; i >= 0; i--) {
        if (matches(documents[i], filter)) documents.splice(i, 1);
      }
    },
  };
}

const storage = new MongoStorage("mongodb://127.0.0.1:27017/test");
const internals = storage as any;
const users = makeCollection();
const emailClaims = makeCollection();
internals.users = users;
internals.emailClaims = emailClaims;
internals.counters = makeCollection();
internals.client = { close: async () => {} };
internals.db = { collection: () => makeCollection() };
let nextUserId = 1;
internals.getNextUserId = async () => nextUserId++;

const owner = await storage.createUser({
  discordId: "mongo-email-owner",
  username: "Email Owner",
  email: "Owner@Example.com",
  emailVerified: true,
});
// Simulate an older duplicate entry whose Google subject matches but which
// also incorrectly claims the same email; the original account is older.
users.documents.push({
  _id: new (await import("mongodb")).ObjectId(),
  discordId: "mongo-email-duplicate-subject",
  userId: 2,
  username: "Legacy Duplicate",
  email: "owner@example.com",
  emailVerified: true,
  createdAt: new Date(Date.now() + 1000),
});
await assert.rejects(
  storage.createUser({
    discordId: "mongo-email-duplicate",
    username: "Duplicate",
    email: " owner@example.com ",
  }),
  { name: "EmailAlreadyInUseError" },
  "MongoStorage rejects duplicate normalized email addresses",
);

const originalEmailOwner = findEmailAccount(await storage.getUsers(), " owner@example.com ");
assert.equal(
  originalEmailOwner?.id,
  owner.id,
  "MongoStorage resolves an email to the oldest account already using the address",
);
const legacyDuplicate = await storage.getUserByDiscordId("mongo-email-duplicate-subject");
assert.equal(
  resolveGoogleEmailAccount(legacyDuplicate, originalEmailOwner, "owner@example.com")?.id,
  owner.id,
  "Google login selects the original account despite a matching subject on a legacy duplicate",
);

const otherUser = await storage.createUser({ discordId: "mongo-email-other", username: "Other User" });
await assert.rejects(
  storage.updateUser(otherUser.id, { pendingEmail: "OWNER@example.com" }),
  { name: "EmailAlreadyInUseError" },
  "MongoStorage reserves a current address against another user's pending email",
);

assert.equal(
  findEmailAccount(await storage.getUsers(), "other@example.com"),
  undefined,
  "MongoStorage does not resolve an email without a matching account",
);

console.log("MongoStorage email uniqueness regression checks passed");
