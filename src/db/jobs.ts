/**
 * Typed helpers for the existing `jobs` table (the orchestration/job-queue
 * record). These are the create/read/update/complete primitives the
 * Trigger.dev tasks use to record their own progress in Supabase.
 *
 * Aligned to the LIVE schema (inspected via PostgREST) — no columns invented.
 */
import { getSupabaseAdmin } from "./supabase";

const TABLE = "jobs";

/** Mirror of the live `jobs` row. */
export interface JobRow {
  id: string;
  job_type: string;
  status: string;
  provider: string | null;
  list_id: string | null;
  campaign_id: string | null;
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  input_data: unknown | null;
  output_data: unknown | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  jobType: string;
  provider?: string;
  totalItems?: number;
  inputData?: unknown;
}

export interface UpdateJobPatch {
  status?: string;
  provider?: string;
  processedItems?: number;
  successfulItems?: number;
  failedItems?: number;
  outputData?: unknown;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string;
}

export async function createJob(input: CreateJobInput): Promise<JobRow> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      job_type: input.jobType,
      status: "pending",
      provider: input.provider ?? null,
      total_items: input.totalItems ?? 0,
      processed_items: 0,
      successful_items: 0,
      failed_items: 0,
      input_data: input.inputData ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createJob failed: ${error.message}`);
  return data as JobRow;
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getJob failed: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function updateJob(id: string, patch: UpdateJobPatch): Promise<JobRow> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.provider !== undefined) row.provider = patch.provider;
  if (patch.processedItems !== undefined) row.processed_items = patch.processedItems;
  if (patch.successfulItems !== undefined) row.successful_items = patch.successfulItems;
  if (patch.failedItems !== undefined) row.failed_items = patch.failedItems;
  if (patch.outputData !== undefined) row.output_data = patch.outputData;
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateJob failed: ${error.message}`);
  return data as JobRow;
}

/** Convenience: mark a job finished with final counts + output. */
export async function completeJob(
  id: string,
  opts: { successfulItems?: number; failedItems?: number; outputData?: unknown } = {},
): Promise<JobRow> {
  return updateJob(id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    ...opts,
  });
}

/** Used to clean up connectivity-test rows so business data stays clean. */
export async function deleteJob(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`deleteJob failed: ${error.message}`);
}
