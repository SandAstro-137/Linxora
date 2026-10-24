import { strict as assert } from "node:assert";
import { MemStorage } from "../../storage";
import { EmailAlreadyInUseError, findEmailAccount, resolveGoogleEmailAccount } from "../email-uniqueness";

const storage = new MemStorage();
const firstUser = await storage.createUser({
  discordId: "email-owner",
  username: "Email Owner",
  email: " Owner@Example.com ",
});
const secondUser = await storage.createUser({
  discordId: "email-second-user",
  username: "Second User",
});

await assert.rejects(
  storage.createUser({
    discordId: "email-duplicate",
    username: "Duplicate",
    email: "owner@example.com",
  }),
  EmailAlreadyInUseError,
  "email uniqueness is case-insensitive and ignores surrounding whitespace",
);

await assert.rejects(
  storage.updateUser(secondUser.id, { pendingEmail: "OWNER@example.com" }),
  EmailAlreadyInUseError,
  "a pending email reserves the address too",
);

await storage.updateUser(firstUser.id, { pendingEmail: "owner@example.com" });
assert.equal((await storage.getUser(firstUser.id))?.pendingEmail, "owner@example.com");

const verifiedOwner = await storage.createUser({
  discordId: "verified-google-subject",
  username: "Verified Google Owner",
  email: "rylan@example.com",
  emailVerified: true,
});
assert.equal(
  findEmailAccount(await storage.getUsers(), " RYLAN@example.com ")?.id,
  verifiedOwner.id,
  "a verified matching email resolves to the existing account regardless of Google subject",
);
assert.equal(
  findEmailAccount(await storage.getUsers(), "unverified@example.com"),
  undefined,
  "a Google email without a matching stored account does not select a user",
);
const secondLegacyDuplicate = {
  id: "legacy-duplicate",
  email: "rylan@example.com",
};
assert.equal(
  resolveGoogleEmailAccount(secondLegacyDuplicate, verifiedOwner, "rylan@example.com")?.id,
  verifiedOwner.id,
  "a matching verified email selects the original email owner even if another legacy duplicate matches Google subject",
);
assert.equal(
  resolveGoogleEmailAccount({ ...secondLegacyDuplicate, email: "different@example.com" }, verifiedOwner, "rylan@example.com")?.id,
  "legacy-duplicate",
  "a different account email does not override the Google subject identity",
);

console.log("Email uniqueness regression checks passed");
