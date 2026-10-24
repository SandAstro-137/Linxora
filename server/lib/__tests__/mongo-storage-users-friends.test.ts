import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { MongoStorage } from "../mongo-storage";

function matches(document: any, filter: any): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  return Object.entries(filter).every(([key, condition]: [string, any]) => {
    if (key === "$or") return condition.some((clause: any) => matches(document, clause));
    const value = document[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("$type" in condition) return condition.$type === "number" ? typeof value === "number" : false;
      if ("$not" in condition) return !matches({ [key]: value }, { [key]: condition.$not });
      if ("$in" in condition) return condition.$in.includes(value);
      if ("$ne" in condition) return value !== condition.$ne;
      return Object.entries(condition).every(([operator, expected]) => operator === "$exists"
        ? expected ? value !== undefined : value === undefined
        : false);
    }
    return value === condition;
  });
}

function makeCollection(initial: any[] = []) {
  const documents = initial;
  const collection: any = {
    async createIndex() { return "mock-index"; },
    find(filter: any = {}) {
      let result = documents.filter(document => matches(document, filter));
      const cursor: any = {
        sort(spec: Record<string, 1 | -1>) {
          const [[field, direction]] = Object.entries(spec);
          result = [...result].sort((a, b) => (a[field] - b[field]) * direction);
          return cursor;
        },
        limit(count: number) { result = result.slice(0, count); return cursor; },
        project(projection: Record<string, 0 | 1>) {
          result = result.map(document => Object.fromEntries(Object.keys(projection)
            .filter(field => projection[field] && field in document)
            .map(field => [field, document[field]])));
          return cursor;
        },
        async next() { return result[0] ?? null; },
        async toArray() { return [...result]; },
        async *[Symbol.asyncIterator]() { for (const document of result) yield document; },
      };
      return cursor;
    },
    async findOne(filter: any = {}, options: any = {}) {
      let result = documents.filter(document => matches(document, filter));
      if (options.sort) {
        const [[field, direction]] = Object.entries(options.sort) as [string, number][];
        result.sort((a, b) => ((a[field]?.getTime?.() ?? 0) - (b[field]?.getTime?.() ?? 0)) * direction);
      }
      return result[0] ?? null;
    },
    async insertOne(document: any) {
      const stored = { ...document, _id: document._id ?? randomBytes(12).toString("hex") };
      documents.push(stored);
      return { insertedId: stored._id };
    },
    async updateOne(filter: any, update: any, options: any = {}) {
      let document = documents.find(item => matches(item, filter));
      if (!document && options.upsert) {
        document = { _id: filter._id };
        documents.push(document);
      }
      if (!document) return { matchedCount: 0, modifiedCount: 0 };
      if (Array.isArray(update)) {
        for (const stage of update) {
          if (stage.$set?.sequence) {
            const expression = stage.$set.sequence;
            if (expression.$max) document.sequence = Math.max(...expression.$max.map((item: any) =>
              item.$ifNull ? (document.sequence ?? item.$ifNull[1]) : item));
            else if (expression.$add) document.sequence = expression.$add.reduce((sum: number, item: any) =>
              sum + (typeof item === "string" ? Number(item) : item), 0);
          }
        }
      } else if (update.$set) {
        Object.assign(document, update.$set);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter: any, update: any) {
      let document = documents.find(item => matches(item, filter));
      if (!document) {
        document = { _id: filter._id, sequence: 0 };
        documents.push(document);
      }
      if (update.$inc) {
        for (const [field, amount] of Object.entries(update.$inc)) document[field] = (document[field] ?? 0) + Number(amount);
      }
      if (update.$set) Object.assign(document, update.$set);
      return document;
    },
    async deleteMany(filter: any) {
      const before = documents.length;
      for (let index = documents.length - 1; index >= 0; index--) {
        if (matches(documents[index], filter)) documents.splice(index, 1);
      }
      return { deletedCount: before - documents.length };
    },
  };
  return { collection, documents };
}

const users = makeCollection([
  { _id: randomBytes(12).toString("hex"), userId: 7, discordId: "demo-user", username: "Demo" },
  { _id: randomBytes(12).toString("hex"), userId: 12, discordId: "another-demo", username: "Another Demo" },
  { _id: randomBytes(12).toString("hex"), discordId: "legacy-user", username: "Legacy User" },
]);
const counters = makeCollection();
const friends = makeCollection();
const friendRequests = makeCollection();
const collections = new Map<string, any>();
const storage = new MongoStorage("mongodb://127.0.0.1:27017/test");
const internals = storage as any;
internals.client = { async connect() {}, async close() {} };
internals.db = {
  async command() { return { ok: 1 }; },
  collection(name: string) {
    if (!collections.has(name)) collections.set(name, makeCollection().collection);
    return collections.get(name);
  },
};
internals.createIndexes = async () => {};
internals.users = users.collection;
internals.counters = counters.collection;
internals.friends = friends.collection;
internals.friendRequests = friendRequests.collection;

await storage.connect();
const repaired = users.documents.find(user => user.discordId === "legacy-user");
assert.equal(repaired?.userId, 13, "legacy accounts without a numeric ID should be repaired at startup");

const newUser = await storage.createUser({ discordId: "new-google-user", username: "New User" });
assert.equal(newUser.userId, 14, "new account receives the next sequential numeric ID");
assert.equal((await storage.getUserByUserId(14))?.id, newUser.id, "the new numeric ID resolves to the account");
assert.deepEqual((await storage.searchUsersByUserId(14)).map(user => user.id), [newUser.id]);

const request = await storage.createFriendRequest({ fromUserId: newUser.id, toUserId: users.documents[0]._id, status: "pending" });
assert.equal((await storage.getIncomingFriendRequests(users.documents[0]._id))[0]?.id, request.id);
assert.equal((await storage.getFriendRequestsByUser(newUser.id))[0]?.toUserId, users.documents[0]._id);
assert.equal((await storage.updateFriendRequest(request.id, { status: "accepted" }))?.status, "accepted");
await storage.createFriendship(newUser.id, users.documents[0]._id);
assert.equal(await storage.areFriends(newUser.id, users.documents[0]._id), true);
assert.equal((await storage.getFriends(newUser.id)).length, 1);
assert.equal((await storage.getFriends(users.documents[0]._id)).length, 1);
await storage.removeFriendship(newUser.id, users.documents[0]._id);
assert.equal(await storage.areFriends(newUser.id, users.documents[0]._id), false);

console.log("MongoStorage user ID and friend interaction regression checks passed");
