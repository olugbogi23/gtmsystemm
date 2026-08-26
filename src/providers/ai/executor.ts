/**
 * AI execution wrapper — Stage 6.
 *
 * Wraps a single AIProvider.qualifyCompany() call and automatically captures:
 *   - Wall-clock latency
 *   - Gateway identifier (extracted from provider.id)
 *   - Token counts (from QualificationResult)
 *   - USD cost (looked up in the centralized pricing registry)
 *
 * This is the single place responsible for wiring a provider call to the
 * pricing engine.  Callers (EscalationRouter, workflow tasks) receive an
 * ExecutionResult that already contains everything needed for DB persistence
 * — no manual cost math, no gateway string parsing.
 *
 * When the provider's model is not in the pricing registry, costUsd is null
 * and a warning is emitted so the gap is observable in logs.
 */
import type { AIProvider } from "../types";
import type { QualificationInput, QualificationResult } from "../../domain/types";
import { extractGateway, makePriceKey, estimateCost } from "./pricing";

// ── Result type ───────────────────────────────────────────────────────────────

export interface ExecutionResult {
  /** Full qualification result from the provider. */
  result: QualificationResult;
  /** Gateway extracted from provider.id, e.g. "anthropic-direct" or "openrouter". */
  gateway: string | null;
  /** Pricing registry key used for cost lookup ("gateway:model"), or null. */
  priceKey: string | null;
  /** Wall-clock milliseconds for this single provider call. */
  latencyMs: number;
  /** Input token count (0 when result omits it). */
  inputTokens: number;
  /** Output token count (0 when result omits it). */
  outputTokens: number;
  /** Computed USD cost, or null when the model is not in the pricing registry. */
  costUsd: number | null;
}

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Execute a single AI qualification call with automatic observability capture.
 *
 * No real API calls are made here — the provider is responsible for that.
 * This function only wraps the call and enriches the result.
 */
export async function executeQualification(
  provider: AIProvider,
  input: QualificationInput,
): Promise<ExecutionResult> {
  const gateway = extractGateway(provider.id);

  const startMs = Date.now();
  const result = await provider.qualifyCompany(input);
  const latencyMs = Date.now() - startMs;

  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;

  const priceKey = gateway ? makePriceKey(gateway, result.model) : null;
  const estimate = priceKey ? estimateCost(priceKey, inputTokens, outputTokens) : null;

  if (priceKey && !estimate) {
    console.warn(`[executor] No pricing entry for "${priceKey}" — cost_usd will be null`);
  }

  return {
    result,
    gateway,
    priceKey,
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: estimate?.totalCostUsd ?? null,
  };
}
