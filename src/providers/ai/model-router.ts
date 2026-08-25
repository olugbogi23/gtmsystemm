import type { AIProvider } from "../types";
import { makeProvider, type ProviderName } from "./provider-registry";

export type TaskType =
  | "icp_qualification"   // Full ICP analysis — structured output + deep reasoning
  | "icp_prefilter"       // High-volume first pass before expensive qualification
  | "personalization"     // Personalised opening lines (line_1)
  | "reply_classify"      // Classify inbound replies: interested / not-interested / auto-reply
  | "text_normalize"      // Name / title cleaning and normalisation
  | "campaign_strategy";  // Deep strategic output — campaign plans, lead magnets

export interface FallbackConfig {
  provider: ProviderName;
  model: string;
}

export interface RouteConfig {
  /** Primary provider to use for this task type. */
  provider: ProviderName;
  /** Model identifier in that provider's format. */
  model: string;
  /**
   * Ordered fallback chain. ModelRouter.route() walks this list and returns
   * the first provider whose isConfigured() returns true.
   * Exception-based runtime fallback (Stage 9) will also use this list.
   */
  fallbacks: FallbackConfig[];
}

/**
 * Routing table — the single place to change which model handles which task.
 *
 * Primary assignments:
 *   - anthropic-direct for tasks that require guaranteed structured output
 *     (icp_qualification, campaign_strategy) — native json_schema enforcement.
 *   - openrouter for high-volume / cost-sensitive tasks where cross-provider
 *     flexibility matters more than native SDK features.
 *
 * Fallback chain for anthropic-direct tasks: OpenRouter with the same model
 * first, then OpenRouter with GPT-4o, so there is always a path if Anthropic
 * is unavailable.
 */
const ROUTES: Record<TaskType, RouteConfig> = {
  icp_qualification: {
    provider: "anthropic-direct",
    model: "claude-opus-4-8",
    fallbacks: [
      { provider: "openrouter", model: "anthropic/claude-opus-4-8" },
      { provider: "openrouter", model: "openai/gpt-4o" },
    ],
  },
  campaign_strategy: {
    provider: "anthropic-direct",
    model: "claude-opus-4-8",
    fallbacks: [
      { provider: "openrouter", model: "anthropic/claude-opus-4-8" },
      { provider: "openrouter", model: "openai/gpt-4o" },
    ],
  },
  icp_prefilter: {
    provider: "openrouter",
    model: "openrouter/auto",
    fallbacks: [
      { provider: "openrouter", model: "anthropic/claude-haiku-4-5-20251001" },
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
    ],
  },
  personalization: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-6",
    fallbacks: [
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
    ],
  },
  reply_classify: {
    provider: "openrouter",
    model: "anthropic/claude-haiku-4-5-20251001",
    fallbacks: [
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
    ],
  },
  text_normalize: {
    provider: "openrouter",
    model: "anthropic/claude-haiku-4-5-20251001",
    fallbacks: [
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
    ],
  },
};

export class ModelRouter {
  /**
   * Returns the first configured AIProvider for the given task type.
   *
   * Walk order: primary → fallbacks[0] → fallbacks[1] → …
   * "Configured" means the required env var is present (isConfigured() === true).
   * Throws if no provider in the chain is configured.
   *
   * The return type is AIProvider (the interface), never a concrete class.
   * Callers must not depend on which implementation they receive.
   */
  static route(taskType: TaskType): AIProvider {
    const config = ROUTES[taskType];

    const primary = makeProvider(config.provider, config.model);
    if (primary.isConfigured()) return primary;

    for (const fb of config.fallbacks) {
      const candidate = makeProvider(fb.provider, fb.model);
      if (candidate.isConfigured()) return candidate;
    }

    throw new Error(
      `No AI provider configured for task "${taskType}". ` +
        `Set ANTHROPIC_API_KEY (primary) or OPENROUTER_API_KEY (fallback) in .env.`,
    );
  }

  /** Expose the routing config for logging / auditing without making a call. */
  static routeConfig(taskType: TaskType): Readonly<RouteConfig> {
    return ROUTES[taskType];
  }
}
