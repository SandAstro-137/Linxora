import { strict as assert } from "node:assert";
import { shouldRestoreGoogleCustomerRole } from "../google-auth-role";

assert.equal(shouldRestoreGoogleCustomerRole("freelancer", 0, 0, false, true), true); // deleted and recreated Google account with no work history
assert.equal(shouldRestoreGoogleCustomerRole("freelancer", null, undefined, false, true), true);
assert.equal(shouldRestoreGoogleCustomerRole("freelancer", 1, 0, false, true), false);
assert.equal(shouldRestoreGoogleCustomerRole("freelancer", 0, 1, false, true), false);
assert.equal(shouldRestoreGoogleCustomerRole("freelancer", 0, 0, true, true), false);
assert.equal(shouldRestoreGoogleCustomerRole("freelancer", 0, 0, false, false), false);
assert.equal(shouldRestoreGoogleCustomerRole("customer", 0, 0, false, true), false);
assert.equal(shouldRestoreGoogleCustomerRole("moderator", 0, 0, false, true), false);
assert.equal(shouldRestoreGoogleCustomerRole("founder", 0, 0, false, true), false);

console.log("Google role regression checks passed");
