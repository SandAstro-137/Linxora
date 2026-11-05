import { strict as assert } from "node:assert";
import { reviewJobContent } from "../content-filter";

const clean = reviewJobContent("Build a portfolio site", "Create a responsive site for my design work.");
assert.equal(clean.needsReview, false, "clean job content should not be flagged");

const profanity = reviewJobContent("Build a damn website", "Create a responsive portfolio site.");
assert.equal(profanity.needsReview, true, "profanity should require moderator review");

const slur = reviewJobContent("Design a site", "Create a page with a n1gger slur in the text.");
assert.equal(slur.needsReview, true, "common obfuscated slurs should require moderator review");

const harmfulRequest = reviewJobContent("Build a phishing kit", "Create a tool to steal login credentials.");
assert.equal(harmfulRequest.needsReview, true, "explicit harmful requests should require moderator review");

const benignSecurityWork = reviewJobContent("Secure my app", "Audit the login flow and fix phishing, malware, password, hack, and account-security risks.");
assert.equal(benignSecurityWork.needsReview, false, "legitimate security work mentioning risk terms should not be flagged");

const oldKeywordMatches = reviewJobContent("Build a password reset page", "The project is about fraud prevention and reporting scam attempts.");
assert.equal(oldKeywordMatches.needsReview, false, "legacy keyword matches without harmful intent should not trigger review");

const spam = reviewJobContent("Build my small ecommerce site", "Please use a responsive design and clear product pages.");
assert.equal(spam.needsReview, false, "ordinary job text should not be flagged based on formatting heuristics");

console.log("Job content review checks passed");
