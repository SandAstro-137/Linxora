import { strict as assert } from "node:assert";
import { getJobFundingRequirement, getJobFundingShortfall } from "../job-funding";

assert.equal(getJobFundingRequirement(125, 600), 0, "a reduced budget needs no additional funding");
assert.equal(getJobFundingShortfall(125, 0, 600), 0, "funds already escrowed cover the reduced budget");
assert.equal(getJobFundingRequirement(700, 600), 100, "only the budget increase needs new funding");
assert.equal(getJobFundingShortfall(700, 75, 600), 25, "the error reports only the unfunded increase");
assert.equal(getJobFundingShortfall(125, 200, 600), 0, "available balance does not create a shortfall when escrow covers the total");
assert.equal(getJobFundingShortfall(125, 0, 0), 125, "a new job requires its full budget");
