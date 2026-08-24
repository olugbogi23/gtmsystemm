/**
 * Persist an AI qualification into the existing `enrichment_runs` table (one row
 * per provider operation, per the Master Plan). Optionally records the score on
 * companies.icp_score. NEVER changes companies.status — promotion review→approved
 * is a human decision.
 */
import type { CompanyRecord, QualificationInput, QualificationResult } from "../domain/types";
import { getSupabaseAdmin } from "./supabase";

/** Compact, provider-agnostic snapshot of what the AI saw (for provenance). */
function inputSnapshot(input: QualificationInput) {
  const c: CompanyRecord = input.company;
  return {
    company: {
      name: c.name,
      domain: c.domain ?? null,
      industry: c.industry ?? null,
      city: c.city ?? null,
      region: c.region ?? null,
      country: c.country ?? null,
      employeeCount: c.employeeCount ?? null,
    },
    icp: input.icp,
    signals: input.signals ?? [],
  };
}

export interface StoreQualificationOptions {
  /** Also write the score to companies.icp_score (does NOT touch status). */
  updateIcpScore?: boolean;
}

export async function storeQualification(
  companyId: string,
  input: QualificationInput,
  result: QualificationResult,
  startedAt: string,
  opts: StoreQualificationOptions = {},
): Promise<{ enrichmentRunId: string }> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("enrichment_runs")
    .insert({
      company_id: companyId,
      provider: result.model, // e.g. "claude-opus-4-8"
      operation: "ai_qualification",
      status: "completed",
      input_data: inputSnapshot(input),
      output_data: result,
      started_at: startedAt,
      completed_at: result.qualifiedAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`storeQualification failed: ${error.message}`);

  if (opts.updateIcpScore) {
    const { error: upErr } = await db
      .from("companies")
      .update({ icp_score: result.score, updated_at: new Date().toISOString() })
      .eq("id", companyId);
    if (upErr) throw new Error(`icp_score update failed: ${upErr.message}`);
  }

  return { enrichmentRunId: (data as { id: string }).id };
}
