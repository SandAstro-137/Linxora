import { strict as assert } from "node:assert";
import { getVerificationAppUrl, getVerificationRequestOrigin } from "../resend-client";

const envKeys = ["NODE_ENV", "APP_BASE_URL", "PORT", "REPLIT_DEV_DOMAIN"] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

try {
  assert.equal(getVerificationRequestOrigin("http", "localhost:3000", 5006), "http://localhost:5006");
  assert.equal(getVerificationRequestOrigin("http", "localhost:5006", 5006), "http://localhost:5006");
  assert.equal(getVerificationRequestOrigin("https", "linxova.com", 5006), "https://linxova.com");
  assert.equal(getVerificationRequestOrigin("https", "linxova.com:8443", 5006), "https://linxova.com:8443");

  delete process.env.APP_BASE_URL;
  delete process.env.REPLIT_DEV_DOMAIN;
  process.env.NODE_ENV = "development";
  assert.equal(getVerificationAppUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(getVerificationAppUrl("http://localhost:5006"), "http://localhost:5006");
  assert.equal(getVerificationAppUrl("https://linxova.com"), "https://linxova.com");
  assert.equal(getVerificationAppUrl("https://linxova.com:8443/"), "https://linxova.com:8443");
  assert.equal(getVerificationAppUrl("not a valid origin"), "http://localhost:5006");

  process.env.APP_BASE_URL = "http://localhost:3000/";
  assert.equal(getVerificationAppUrl("http://localhost:5006"), "http://localhost:5006");
  assert.equal(getVerificationAppUrl(), "http://localhost:3000/");
  delete process.env.APP_BASE_URL;

  process.env.NODE_ENV = "production";
  assert.equal(getVerificationAppUrl("http://localhost:3000"), "https://linxova.com");
  process.env.APP_BASE_URL = "https://staging.linxova.com/";
  assert.equal(getVerificationAppUrl("http://localhost:3000"), "https://staging.linxova.com/");
  process.env.APP_BASE_URL = "http://localhost:3000";
  assert.equal(getVerificationAppUrl("https://linxova.com"), "https://linxova.com");

  process.env.NODE_ENV = "development";
  delete process.env.APP_BASE_URL;
  process.env.REPLIT_DEV_DOMAIN = "app.example.replit.dev";
  assert.equal(getVerificationAppUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(getVerificationAppUrl("https://external.example"), "https://external.example");
} finally {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

console.log("Verification app URL regression checks passed");
