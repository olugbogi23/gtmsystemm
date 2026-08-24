/**
 * Claude AIProvider — the default intelligence layer. Uses the official
 * Anthropic SDK, Opus 4.8, adaptive thinking, and structured outputs so the
 * qualification verdict is guaranteed-parseable JSON (never free text).
 */
import Anthropic from "@anthropic-ai/sdk";
import { ENV_KEYS, optionalEnv, requireEnv } from "../../config/env";
import type { QualificationInput, QualificationResult } from "../../domain/types";
import type { AIProvider } from "../types";
import {
  buildQualificationPrompt,
  QUALIFICATION_SCHEMA,
  QUALIFICATION_SYSTEM,
} from "./qualification-prompt";

const MODEL = "claude-opus-4-8";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv(ENV_KEYS.anthropicApiKey) });
  return client;
}

export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly capability = "ai" as const;

  isConfigured(): boolean {
    return optionalEnv(ENV_KEYS.anthropicApiKey) !== undefined;
  }

  async qualifyCompany(input: QualificationInput): Promise<QualificationResult> {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: QUALIFICATION_SYSTEM,
      // Structured output — response text is guaranteed to match the schema.
      output_config: { format: { type: "json_schema", schema: QUALIFICATION_SCHEMA } },
      messages: [{ role: "user", content: buildQualificationPrompt(input) }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("qualifyCompany: no text block in response");
    }
    const parsed = JSON.parse(textBlock.text) as Omit<
      QualificationResult,
      "model" | "qualifiedAt"
    >;
    return { ...parsed, model: MODEL, qualifiedAt: new Date().toISOString() };
  }
}
