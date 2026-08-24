/**
 * Capability interfaces. The rest of the system depends on THESE, never on a
 * vendor SDK. Concrete adapters (ApifyProvider, ExaProvider, ...) implement
 * them and are the only files that import a provider's SDK/API.
 *
 * `isConfigured()` is a cheap, no-network check (are the credentials present?)
 * used by the waterfall to skip providers that aren't set up.
 */
import type {
  CompanyRecord,
  PersonRecord,
  QualificationInput,
  QualificationResult,
  SearchQuery,
} from "../domain/types";

export type Capability = "lead-source" | "enrichment" | "ai";

interface BaseProvider {
  /** Stable id, e.g. "apify", "exa", "parallel", "claude". */
  readonly id: string;
  readonly capability: Capability;
  isConfigured(): boolean;
}

/** Finds companies (and optionally people) matching a query. */
export interface LeadSourceProvider extends BaseProvider {
  readonly capability: "lead-source";
  searchCompanies(query: SearchQuery): Promise<CompanyRecord[]>;
  /** Optional — not every source can find people. */
  searchPeople?(query: SearchQuery): Promise<PersonRecord[]>;
}

/** Adds detail to an existing company (website info, size, signals, ...). */
export interface EnrichmentProvider extends BaseProvider {
  readonly capability: "enrichment";
  enrichCompany(company: CompanyRecord): Promise<Partial<CompanyRecord> & { signals?: string[] }>;
}

/** Turns company + ICP into a structured qualification verdict. */
export interface AIProvider extends BaseProvider {
  readonly capability: "ai";
  qualifyCompany(input: QualificationInput): Promise<QualificationResult>;
}
