/**
 * Offline tests for ProviderRegistry + ModelRouter.
 *
 * No real API calls. Tests verify:
 *   - makeProvider() creates the correct concrete type.
 *   - ModelRouter.route() returns AIProvider (interface, not concrete class).
 *   - Primary provider is selected when its key is configured.
 *   - Fallback provider is selected when primary key is missing.
 *   - An error is thrown when no provider in the chain is configured.
 *   - routeConfig() exposes the routing table without side effects.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { makeProvider } from "../providers/ai/provider-registry";
import { ModelRouter } from "../providers/ai/model-router";
import { AnthropicDirectProvider } from "../providers/ai/anthropic-provider";
import { OpenRouterProvider } from "../providers/ai/openrouter-provider";
import type { AIProvider } from "../providers/types";

// ── Env helpers ─────────────────────────────────────────────────────────────

type EnvSnapshot = Record<string, string | undefined>;

function saveEnv(...keys: string[]): EnvSnapshot {
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let snapshot: EnvSnapshot;

before(() => {
  snapshot = saveEnv("ANTHROPIC_API_KEY", "OPENROUTER_API_KEY");
  // Start each suite with both keys absent so tests control state explicitly.
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: undefined });
});

after(() => {
  restoreEnv(snapshot);
});

// ── makeProvider (ProviderRegistry) ─────────────────────────────────────────

test("makeProvider: anthropic-direct creates AnthropicDirectProvider", () => {
  const p = makeProvider("anthropic-direct", "claude-opus-4-8");
  assert.ok(p instanceof AnthropicDirectProvider);
  assert.equal(p.id, "anthropic-direct:claude-opus-4-8");
});

test("makeProvider: openrouter creates OpenRouterProvider", () => {
  const p = makeProvider("openrouter", "anthropic/claude-haiku-4-5-20251001");
  assert.ok(p instanceof OpenRouterProvider);
  assert.equal(p.id, "openrouter:anthropic/claude-haiku-4-5-20251001");
});

test("makeProvider: both results satisfy AIProvider interface", () => {
  const providers: AIProvider[] = [
    makeProvider("anthropic-direct", "claude-opus-4-8"),
    makeProvider("openrouter", "openrouter/auto"),
  ];
  for (const p of providers) {
    assert.ok(typeof p.qualifyCompany === "function");
    assert.ok(typeof p.isConfigured === "function");
    assert.equal(p.capability, "ai");
  }
});

// ── ModelRouter.route() — primary selection ──────────────────────────────────

test("route icp_qualification: returns AnthropicDirectProvider when ANTHROPIC_API_KEY set", () => {
  setEnv({ ANTHROPIC_API_KEY: "sk-ant-test", OPENROUTER_API_KEY: undefined });
  const provider = ModelRouter.route("icp_qualification");
  assert.ok(provider instanceof AnthropicDirectProvider,
    `Expected AnthropicDirectProvider, got ${provider.constructor.name}`);
});

test("route campaign_strategy: returns AnthropicDirectProvider when ANTHROPIC_API_KEY set", () => {
  setEnv({ ANTHROPIC_API_KEY: "sk-ant-test", OPENROUTER_API_KEY: undefined });
  const provider = ModelRouter.route("campaign_strategy");
  assert.ok(provider instanceof AnthropicDirectProvider);
});

test("route reply_classify: returns OpenRouterProvider when OPENROUTER_API_KEY set", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: "sk-or-test" });
  const provider = ModelRouter.route("reply_classify");
  assert.ok(provider instanceof OpenRouterProvider);
});

test("route personalization: returns OpenRouterProvider when OPENROUTER_API_KEY set", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: "sk-or-test" });
  const provider = ModelRouter.route("personalization");
  assert.ok(provider instanceof OpenRouterProvider);
});

// ── ModelRouter.route() — fallback selection ─────────────────────────────────

test("route icp_qualification: falls back to OpenRouterProvider when only OPENROUTER_API_KEY set", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: "sk-or-test" });
  const provider = ModelRouter.route("icp_qualification");
  assert.ok(provider instanceof OpenRouterProvider,
    `Expected OpenRouterProvider fallback, got ${provider.constructor.name}`);
});

test("route campaign_strategy: falls back to OpenRouterProvider when Anthropic key missing", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: "sk-or-test" });
  const provider = ModelRouter.route("campaign_strategy");
  assert.ok(provider instanceof OpenRouterProvider);
});

// ── ModelRouter.route() — both keys present ───────────────────────────────────

test("route icp_qualification: prefers Anthropic direct when both keys present", () => {
  setEnv({ ANTHROPIC_API_KEY: "sk-ant-test", OPENROUTER_API_KEY: "sk-or-test" });
  const provider = ModelRouter.route("icp_qualification");
  assert.ok(provider instanceof AnthropicDirectProvider,
    "Primary should win when both providers are configured");
});

// ── ModelRouter.route() — no provider configured ────────────────────────────

test("route throws when neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: undefined });
  assert.throws(
    () => ModelRouter.route("icp_qualification"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /No AI provider configured/);
      assert.match(err.message, /ANTHROPIC_API_KEY/);
      return true;
    },
  );
});

test("route throws for every task type when no keys are set", () => {
  setEnv({ ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: undefined });
  const taskTypes = [
    "icp_qualification",
    "icp_prefilter",
    "personalization",
    "reply_classify",
    "text_normalize",
    "campaign_strategy",
  ] as const;
  for (const taskType of taskTypes) {
    assert.throws(
      () => ModelRouter.route(taskType),
      Error,
      `Expected throw for unconfigured task "${taskType}"`,
    );
  }
});

// ── ModelRouter.routeConfig() ────────────────────────────────────────────────

test("routeConfig: returns primary provider and model for icp_qualification", () => {
  const config = ModelRouter.routeConfig("icp_qualification");
  assert.equal(config.provider, "anthropic-direct");
  assert.equal(config.model, "claude-opus-4-8");
  assert.ok(Array.isArray(config.fallbacks));
  assert.ok(config.fallbacks.length > 0);
});

test("routeConfig: icp_qualification fallbacks include openrouter entries", () => {
  const config = ModelRouter.routeConfig("icp_qualification");
  const openrouterFallbacks = config.fallbacks.filter((f) => f.provider === "openrouter");
  assert.ok(openrouterFallbacks.length >= 1,
    "icp_qualification should have at least one openrouter fallback");
});

test("routeConfig: all task types have at least one fallback", () => {
  const taskTypes = [
    "icp_qualification",
    "icp_prefilter",
    "personalization",
    "reply_classify",
    "text_normalize",
    "campaign_strategy",
  ] as const;
  for (const taskType of taskTypes) {
    const config = ModelRouter.routeConfig(taskType);
    assert.ok(config.fallbacks.length > 0,
      `Task "${taskType}" should have at least one fallback`);
  }
});

// ── Return type contract ─────────────────────────────────────────────────────

test("route always returns a value satisfying AIProvider (with a key set)", () => {
  setEnv({ ANTHROPIC_API_KEY: "sk-ant-test", OPENROUTER_API_KEY: "sk-or-test" });
  const taskTypes = [
    "icp_qualification",
    "icp_prefilter",
    "personalization",
    "reply_classify",
    "text_normalize",
    "campaign_strategy",
  ] as const;
  for (const taskType of taskTypes) {
    const provider: AIProvider = ModelRouter.route(taskType);
    assert.equal(provider.capability, "ai", `${taskType} provider.capability should be 'ai'`);
    assert.ok(typeof provider.qualifyCompany === "function");
    assert.ok(typeof provider.isConfigured === "function");
  }
});
