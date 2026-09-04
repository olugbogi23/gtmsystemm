/**
 * Outreach provider abstraction — Stage 16.
 *
 * All campaign-sending platforms (Smartlead, Instantly, PlusVibe) implement
 * this interface. The campaign operations control plane depends only on this
 * contract — never on a vendor SDK directly.
 *
 * Stage 16 scope: READ-ONLY operations only.
 * Mutation operations (pause campaign, update sequence, enroll lead) are Stage 18+.
 *
 * Provider IDs must be stable — they appear in the database (campaigns.platform).
 */

/** Stable identifiers matching campaigns.platform values in the database. */
export type OutreachProviderId = "smartlead" | "instantly" | "plusvibe";

// ── Campaign health ───────────────────────────────────────────────────────────

export interface CampaignStats {
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
}

export interface CampaignHealthResult {
  /** Provider's own campaign ID (platform_campaign_id in our DB). */
  platformCampaignId: string;
  /** Provider-reported campaign status. */
  status: "active" | "paused" | "completed" | "draft" | "unknown";
  stats: CampaignStats;
  /** Open rate 0–100, derived from stats if not provided natively. */
  openRatePct: number;
  /** Reply rate 0–100. */
  replyRatePct: number;
  /** Hard bounce rate 0–100. */
  bounceRatePct: number;
  /** ISO timestamp of when this snapshot was taken. */
  fetchedAt: string;
}

// ── Domain health ─────────────────────────────────────────────────────────────

export type DomainReputationTier = "excellent" | "good" | "fair" | "poor" | "unknown";

export interface InboxSummary {
  inboxId: string;
  email: string;
  warmupStatus: string;
  warmupReputation: DomainReputationTier;
  smtpOk: boolean;
  imapOk: boolean;
  isWarmupBlocked: boolean;
  dailySendLimit: number;
  dailySentCount: number;
}

export interface DomainHealthResult {
  domain: string;
  /** Total inboxes on this domain. */
  inboxCount: number;
  /** Inboxes where SMTP connection is healthy. */
  healthyInboxCount: number;
  /** Inboxes currently blocked from warmup. */
  blockedInboxCount: number;
  /** Aggregate view of inboxes. */
  inboxes: InboxSummary[];
  fetchedAt: string;
}

// ── Inbox (email account) health ──────────────────────────────────────────────

export interface InboxHealthResult {
  /** Provider's own inbox ID. */
  platformInboxId: string;
  email: string;
  fromName: string;
  warmupStatus: "active" | "inactive" | "paused" | "unknown";
  warmupReputation: DomainReputationTier;
  smtpOk: boolean;
  imapOk: boolean;
  isWarmupBlocked: boolean;
  dailySendLimit: number;
  dailySentCount: number;
  totalWarmupSent: number;
  tags: string[];
  fetchedAt: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface OutreachProvider {
  /** Stable platform identifier. Matches campaigns.platform in the database. */
  readonly id: OutreachProviderId;

  /**
   * Whether this adapter has valid credentials and can make API calls.
   * A provider that returns false here must throw OutreachCredentialError
   * on any actual API call rather than silently returning empty data.
   */
  isConfigured(): boolean;

  /**
   * Retrieve health metrics for one campaign.
   *
   * @param platformCampaignId — the provider's own campaign ID
   *   (stored in campaigns.platform_campaign_id in our DB)
   * @throws OutreachNotFoundError if the campaign doesn't exist
   * @throws OutreachCredentialError if credentials are invalid
   * @throws OutreachRateLimitError on 429
   * @throws OutreachTimeoutError on network timeout
   * @throws OutreachMalformedResponseError on unexpected response shape
   */
  getCampaignHealth(platformCampaignId: string): Promise<CampaignHealthResult>;

  /**
   * Retrieve aggregate health for all inboxes on a domain.
   *
   * Smartlead does not expose a native per-domain endpoint; this is derived
   * by filtering email-accounts by domain. Other providers may support it
   * natively.
   *
   * @param domain — bare domain, e.g. "example.com"
   */
  getDomainHealth(domain: string): Promise<DomainHealthResult>;

  /**
   * Retrieve health for one inbox (email account).
   *
   * @param platformInboxId — provider's own inbox/account ID
   */
  getInboxHealth(platformInboxId: string): Promise<InboxHealthResult>;
}
