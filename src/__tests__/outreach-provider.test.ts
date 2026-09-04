/**
 * Unit tests for Stage 16 outreach provider abstraction.
 *
 * All tests are pure — no network calls, no Supabase, no real credentials.
 * Network calls are intercepted using globalThis.fetch mock overrides.
 *
 * Run: node --import tsx --test "src/__tests__/outreach-provider.test.ts"
 */

import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";

import { SmartleadAdapter } from "../providers/outreach/smartlead.js";
import { OutreachProviderRegistry } from "../providers/outreach/registry.js";
import {
  OutreachCredentialError,
  OutreachNotFoundError,
  OutreachRateLimitError,
  OutreachTimeoutError,
  OutreachMalformedResponseError,
  OutreachProviderError,
} from "../providers/outreach/errors.js";

// ── Mock fetch helper ─────────────────────────────────────────────────────────

type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;

let originalFetch: typeof fetch;

function mockFetch(impl: FetchMock) {
  (globalThis as any).fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function statusResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Error types ───────────────────────────────────────────────────────────────

test("OutreachCredentialError has correct name and provider", () => {
  const err = new OutreachCredentialError("smartlead");
  assert.equal(err.name, "OutreachCredentialError");
  assert.equal(err.provider, "smartlead");
  assert.ok(err instanceof OutreachProviderError);
  assert.ok(err instanceof Error);
});

test("OutreachRateLimitError exposes retryAfterMs", () => {
  const err = new OutreachRateLimitError("smartlead", 5000);
  assert.equal(err.retryAfterMs, 5000);
  assert.equal(err.name, "OutreachRateLimitError");
});

test("OutreachNotFoundError includes resource type and id in message", () => {
  const err = new OutreachNotFoundError("smartlead", "campaign", "12345");
  assert.ok(err.message.includes("12345"));
  assert.ok(err.message.includes("campaign"));
});

// ── SmartleadAdapter.isConfigured() ──────────────────────────────────────────

test("isConfigured() returns false for empty apiKey", () => {
  const adapter = new SmartleadAdapter({ apiKey: "" });
  assert.equal(adapter.isConfigured(), false);
});

test("isConfigured() returns false for whitespace-only apiKey", () => {
  const adapter = new SmartleadAdapter({ apiKey: "   " });
  assert.equal(adapter.isConfigured(), false);
});

test("isConfigured() returns true for non-empty apiKey", () => {
  const adapter = new SmartleadAdapter({ apiKey: "test-key-123" });
  assert.equal(adapter.isConfigured(), true);
});

test("adapter id is 'smartlead'", () => {
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  assert.equal(adapter.id, "smartlead");
});

// ── getCampaignHealth — success ───────────────────────────────────────────────

test("getCampaignHealth parses analytics response correctly", async () => {
  mockFetch(async () =>
    jsonResponse({
      sent_count: 100,
      open_count: 30,
      click_count: 5,
      reply_count: 10,
      bounce_count: 2,
      unsubscribed_count: 1,
      campaign_status: "active",
    }),
  );

  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getCampaignHealth("42");

  assert.equal(result.platformCampaignId, "42");
  assert.equal(result.status, "active");
  assert.equal(result.stats.sent, 100);
  assert.equal(result.stats.opens, 30);
  assert.equal(result.stats.replies, 10);
  assert.equal(result.stats.bounces, 2);
  assert.equal(result.openRatePct, 30);
  assert.equal(result.replyRatePct, 10);
  assert.equal(result.bounceRatePct, 2);
  assert.ok(result.fetchedAt);
});

test("getCampaignHealth returns 0 rates when sent_count is 0", async () => {
  mockFetch(async () =>
    jsonResponse({ sent_count: 0, open_count: 0, reply_count: 0, bounce_count: 0 }),
  );
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getCampaignHealth("1");
  assert.equal(result.openRatePct, 0);
  assert.equal(result.replyRatePct, 0);
  assert.equal(result.bounceRatePct, 0);
});

test("getCampaignHealth maps unknown status to 'unknown'", async () => {
  mockFetch(async () => jsonResponse({ campaign_status: "weird_status" }));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getCampaignHealth("1");
  assert.equal(result.status, "unknown");
});

test("getCampaignHealth maps 'paused' correctly", async () => {
  mockFetch(async () => jsonResponse({ campaign_status: "paused" }));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getCampaignHealth("1");
  assert.equal(result.status, "paused");
});

// ── getCampaignHealth — error handling ───────────────────────────────────────

test("getCampaignHealth throws OutreachCredentialError on 401", async () => {
  mockFetch(async () => statusResponse(401));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  await assert.rejects(
    () => adapter.getCampaignHealth("1"),
    (err: Error) => err instanceof OutreachCredentialError,
  );
});

test("getCampaignHealth throws OutreachCredentialError on 403", async () => {
  mockFetch(async () => statusResponse(403));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  await assert.rejects(
    () => adapter.getCampaignHealth("1"),
    (err: Error) => err instanceof OutreachCredentialError,
  );
});

test("getCampaignHealth throws OutreachNotFoundError on 404", async () => {
  mockFetch(async () => statusResponse(404));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  await assert.rejects(
    () => adapter.getCampaignHealth("999"),
    (err: Error) => err instanceof OutreachNotFoundError,
  );
});

test("getCampaignHealth throws OutreachMalformedResponseError for non-JSON", async () => {
  mockFetch(async () => new Response("not json", { status: 200 }));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  await assert.rejects(
    () => adapter.getCampaignHealth("1"),
    (err: Error) => err instanceof OutreachMalformedResponseError,
  );
});

test("getCampaignHealth throws OutreachCredentialError when not configured", async () => {
  const adapter = new SmartleadAdapter({ apiKey: "" });
  await assert.rejects(
    () => adapter.getCampaignHealth("1"),
    (err: Error) => err instanceof OutreachCredentialError,
  );
});

// ── getInboxHealth — success ──────────────────────────────────────────────────

test("getInboxHealth parses inbox account correctly", async () => {
  mockFetch(async () =>
    jsonResponse({
      id: 101,
      from_email: "hello@example.com",
      from_name: "Eric",
      is_smtp_success: true,
      is_imap_success: true,
      message_per_day: 50,
      daily_sent_count: 20,
      tags: [{ id: 1, name: "active" }],
      warmup_details: {
        status: "active",
        warmup_reputation: "excellent",
        max_email_per_day: 40,
        is_warmup_blocked: false,
        total_sent_count: 500,
      },
    }),
  );

  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getInboxHealth("101");

  assert.equal(result.platformInboxId, "101");
  assert.equal(result.email, "hello@example.com");
  assert.equal(result.fromName, "Eric");
  assert.equal(result.warmupStatus, "active");
  assert.equal(result.warmupReputation, "excellent");
  assert.equal(result.smtpOk, true);
  assert.equal(result.imapOk, true);
  assert.equal(result.isWarmupBlocked, false);
  assert.equal(result.dailySendLimit, 50);
  assert.equal(result.dailySentCount, 20);
  assert.equal(result.totalWarmupSent, 500);
  assert.deepEqual(result.tags, ["active"]);
});

test("getInboxHealth maps poor warmup reputation", async () => {
  mockFetch(async () =>
    jsonResponse({ id: 5, warmup_details: { warmup_reputation: "poor" } }),
  );
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getInboxHealth("5");
  assert.equal(result.warmupReputation, "poor");
});

test("getInboxHealth uses from_email over email field", async () => {
  mockFetch(async () =>
    jsonResponse({ id: 7, from_email: "primary@x.com", email: "fallback@x.com" }),
  );
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getInboxHealth("7");
  assert.equal(result.email, "primary@x.com");
});

// ── getDomainHealth — success ─────────────────────────────────────────────────

test("getDomainHealth filters inboxes by domain", async () => {
  let callCount = 0;
  mockFetch(async (url) => {
    callCount++;
    // Return two inboxes on example.com and one on other.com
    if (url.includes("email-accounts")) {
      return jsonResponse([
        { id: 1, from_email: "a@example.com", is_smtp_success: true, is_imap_success: true, warmup_details: { is_warmup_blocked: false } },
        { id: 2, from_email: "b@example.com", is_smtp_success: false, is_imap_success: false, warmup_details: { is_warmup_blocked: true } },
        { id: 3, from_email: "c@other.com", is_smtp_success: true, is_imap_success: true, warmup_details: { is_warmup_blocked: false } },
      ]);
    }
    return jsonResponse([]);
  });

  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getDomainHealth("example.com");

  assert.equal(result.domain, "example.com");
  assert.equal(result.inboxCount, 2);
  assert.equal(result.healthyInboxCount, 1);
  assert.equal(result.blockedInboxCount, 1);
  assert.equal(result.inboxes.length, 2);
});

test("getDomainHealth returns empty result for unknown domain", async () => {
  mockFetch(async () => jsonResponse([]));
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getDomainHealth("unknown.com");
  assert.equal(result.inboxCount, 0);
  assert.equal(result.healthyInboxCount, 0);
  assert.equal(result.inboxes.length, 0);
});

test("getDomainHealth is case-insensitive for domain matching", async () => {
  mockFetch(async (url) => {
    if (url.includes("offset=0")) {
      return jsonResponse([
        { id: 1, from_email: "a@EXAMPLE.COM", is_smtp_success: true, is_imap_success: true, warmup_details: {} },
      ]);
    }
    return jsonResponse([]);
  });
  const adapter = new SmartleadAdapter({ apiKey: "k" });
  const result = await adapter.getDomainHealth("example.com");
  assert.equal(result.inboxCount, 1);
});

// ── OutreachProviderRegistry ──────────────────────────────────────────────────

test("registry.fromEnv() returns SmartleadAdapter when SMARTLEAD_API_KEY is set", () => {
  const original = process.env.SMARTLEAD_API_KEY;
  try {
    process.env.SMARTLEAD_API_KEY = "test-key";
    const registry = OutreachProviderRegistry.fromEnv();
    const provider = registry.getProvider("smartlead", "client-1");
    assert.equal(provider.id, "smartlead");
    assert.equal(provider.isConfigured(), true);
  } finally {
    if (original === undefined) delete process.env.SMARTLEAD_API_KEY;
    else process.env.SMARTLEAD_API_KEY = original;
  }
});

test("registry.fromEnv() throws OutreachCredentialError when SMARTLEAD_API_KEY missing", () => {
  const original = process.env.SMARTLEAD_API_KEY;
  try {
    delete process.env.SMARTLEAD_API_KEY;
    const registry = OutreachProviderRegistry.fromEnv();
    assert.throws(
      () => registry.getProvider("smartlead", "client-1"),
      (err: Error) => err instanceof OutreachCredentialError,
    );
  } finally {
    if (original !== undefined) process.env.SMARTLEAD_API_KEY = original;
  }
});

test("registry throws OutreachProviderError for unimplemented providers", () => {
  const registry = OutreachProviderRegistry.fromEnv();
  assert.throws(
    () => registry.getProvider("instantly", "client-1"),
    (err: Error) => err instanceof OutreachProviderError,
  );
  assert.throws(
    () => registry.getProvider("plusvibe", "client-1"),
    (err: Error) => err instanceof OutreachProviderError,
  );
});

test("registry supports custom credential resolver for multi-tenant isolation", () => {
  const registry = new OutreachProviderRegistry((providerId, clientId) => {
    if (providerId === "smartlead" && clientId === "client-a") {
      return { apiKey: "key-for-client-a" };
    }
    return undefined;
  });

  const providerA = registry.getProvider("smartlead", "client-a");
  assert.equal(providerA.isConfigured(), true);

  assert.throws(
    () => registry.getProvider("smartlead", "client-b"),
    (err: Error) => err instanceof OutreachCredentialError,
  );
});
