# CAMPAIGN_LEADS

## 1. What is this table?

`campaign_leads` is the junction between campaigns and contacts — it records which contacts have been added to which campaign, and tracks their sending status and reply outcome.

## 2. Why does this table exist?

A campaign can have hundreds of leads; a contact might be in multiple campaigns over time. This table is the roster of who's in each campaign, and what happened to each of them (sent, replied, bounced, unsubscribed).

**Important note on schema certainty:** The `campaign_leads` table is not referenced by any TypeScript code found in `src/db/` and has no migration file in this repository. It may have been created via the Supabase Dashboard, or it may be a planned table not yet implemented. The columns below are inferred from the campaign workflow documentation and the pattern of other tables in this system. Verify in the Supabase Dashboard before writing queries against it.

## 3. What data does it store?

Based on the campaign workflow documentation:

| Column | Type | What it means |
|--------|------|---------------|
| `id` | uuid | Unique identifier |
| `campaign_id` | uuid | Which campaign (→ campaigns.id) |
| `contact_id` | uuid | Which contact (→ contacts.id) |
| `company_id` | uuid | Which company this contact belongs to (→ companies.id) |
| `client_id` | uuid | Which client (→ clients.id) |
| `status` | text | Current status in this campaign: `queued` | `sent` | `replied` | `bounced` | `unsubscribed` |
| `steps_sent` | int | How many emails in the sequence have been sent |
| `last_sent_at` | timestamptz | When the most recent email to this contact was sent |
| `reply_received_at` | timestamptz | When a reply was received (null if no reply) |
| `reply_classification` | text | `positive` | `negative` | `auto_reply` | `out_of_office` |
| `created_at` | timestamptz | When this contact was added to the campaign |

## 4. Primary Key

`id` — UUID (presumed).

## 5. Foreign Keys (inferred)

- `campaign_id → campaigns(id)`
- `contact_id → contacts(id)`
- `company_id → companies(id)`
- `client_id → clients(id)`

## 6. What comes before it?

- `campaigns` must exist and be active
- `contacts` must exist with verified email addresses
- The Smartlead campaign upload process populates this table (or it's synced from Smartlead's API)

## 7. What comes after it?

- `/positive-reply-scoring` — reads reply_received_at and reply_classification
- `/experiment-design` — reads campaign_leads results to measure campaign performance

## 8. Simple mental model

"campaign_leads = the sending roster for each campaign; who's in, how many emails they got, and what happened."

## 9. SQL to inspect it

```sql
-- Contacts in a specific campaign with their status
SELECT c.full_name, c.email, cl.status, cl.steps_sent, cl.reply_received_at
FROM campaign_leads cl
JOIN contacts c ON c.id = cl.contact_id
WHERE cl.campaign_id = 'your-campaign-id'
ORDER BY cl.last_sent_at DESC;

-- Reply summary for a campaign
SELECT
  reply_classification,
  COUNT(*) AS count
FROM campaign_leads
WHERE campaign_id = 'your-campaign-id'
  AND reply_received_at IS NOT NULL
GROUP BY reply_classification;

-- Companies with positive replies (warm accounts)
SELECT DISTINCT co.name, co.domain
FROM campaign_leads cl
JOIN companies co ON co.id = cl.company_id
WHERE cl.client_id = 'a29f5829-5412-49be-9a77-41c3edf3c14b'
  AND cl.reply_classification = 'positive';
```

**Note:** Verify column names in the Supabase Dashboard before running these queries.
