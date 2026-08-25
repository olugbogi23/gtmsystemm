import { OpenRouterProvider } from "./openrouter-provider";

export type TaskType =
  | "icp_qualification"   // Full ICP analysis — structured output + deep reasoning
  | "icp_prefilter"       // High-volume first pass before expensive qualification
  | "personalization"     // Personalised opening lines (line_1)
  | "reply_classify"      // Classify inbound replies: interested / not-interested / auto-reply
  | "text_normalize"      // Name / title cleaning and normalisation
  | "campaign_strategy";  // Deep strategic output — campaign plans, lead magnets

interface RouteConfig {
  model: string;
  fallbacks: string[];
}

/** Routing table — edit here to swap models without touching any task code. */
const ROUTES: Record<TaskType, RouteConfig> = {
  icp_qualification: {
    model: "anthropic/claude-opus-4-8",
    fallbacks: ["openai/gpt-4o", "anthropic/claude-sonnet-4-6"],
  },
  icp_prefilter: {
    // Let OpenRouter pick the cheapest capable model for bulk filtering.
    model: "openrouter/auto",
    fallbacks: ["anthropic/claude-haiku-4-5-20251001", "openai/gpt-4o-mini"],
  },
  personalization: {
    model: "anthropic/claude-sonnet-4-6",
    fallbacks: ["openai/gpt-4o-mini", "anthropic/claude-haiku-4-5-20251001"],
  },
  reply_classify: {
    model: "anthropic/claude-haiku-4-5-20251001",
    fallbacks: ["openai/gpt-4o-mini"],
  },
  text_normalize: {
    model: "anthropic/claude-haiku-4-5-20251001",
    fallbacks: ["openai/gpt-4o-mini"],
  },
  campaign_strategy: {
    model: "anthropic/claude-opus-4-8",
    fallbacks: ["openai/gpt-4o"],
  },
};

export class ModelRouter {
  /** Returns a fully configured OpenRouterProvider for the given task type. */
  static route(taskType: TaskType): OpenRouterProvider {
    const config = ROUTES[taskType];
    return new OpenRouterProvider({
      model: config.model,
      fallbacks: config.fallbacks,
    });
  }

  /** Expose the routing table for logging / debugging. */
  static routeConfig(taskType: TaskType): Readonly<RouteConfig> {
    return ROUTES[taskType];
  }
}
