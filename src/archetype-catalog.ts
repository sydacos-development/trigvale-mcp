/**
 * Static archetype catalog. Mirrors `packages/core/src/ai/archetypes.ts`
 * and `apps/web/src/lib/archetypes-catalog.ts`. Bundled into the
 * @trigvale/mcp tarball so the get_archetype_cautions tool doesn't
 * need an API round-trip — pure local lookup.
 *
 * Keep in sync — `docs/trigvale-durability-guide.md` §3.2 governs the
 * cluster definitions.
 */

export interface ArchetypeMeta {
  id: string;
  label: string;
  description: string;
  /** What ideas in this cluster commonly underweight or get wrong. */
  commonGaps: string[];
}

export const ARCHETYPES: ArchetypeMeta[] = [
  {
    id: "solo-dev-tools",
    label: "Solo dev tools",
    description: "CLI, library, plugin, or SaaS targeted at individual developers.",
    commonGaps: [
      "Distribution beyond Hacker News and Twitter — the dev-tools niche is colder than it feels.",
      "Willingness to pay — devs balk at paid tools when an OSS alternative does 80% of the job.",
      "Differentiation from existing OSS that the founder hasn't audited.",
    ],
  },
  {
    id: "vertical-ai-saas",
    label: "Vertical AI SaaS",
    description: "AI-first SaaS targeting a specific industry niche.",
    commonGaps: [
      "Domain expertise required to actually pass buyer scrutiny in a regulated vertical.",
      "Sales cycle length — vertical B2B is rarely self-serve and rarely fast.",
      "Distinctive moat vs. a generalist tool plus the buyer's own custom prompts.",
    ],
  },
  {
    id: "ai-wrapper",
    label: "AI wrapper",
    description: "Thin product layer over a frontier model API.",
    commonGaps: [
      "Defensibility once the underlying model adds the same feature (often within 6 months).",
      "Pricing margin compression as token costs fall and providers ship competing features.",
      "Switching cost — wrappers usually have none beyond UI familiarity.",
    ],
  },
  {
    id: "agentic-workflow",
    label: "Agentic workflow",
    description: "Multi-step automation orchestrating LLMs + tools to complete tasks autonomously.",
    commonGaps: [
      "Reliability — agentic flows fail in long-tail ways that demos don't expose.",
      "Trust + audit — buyers won't approve unattended agents in mission-critical paths.",
      "Cost predictability — token budgets balloon when tools loop or retry.",
    ],
  },
  {
    id: "api-first-saas",
    label: "API-first SaaS",
    description: "Backend API or data product consumed primarily by other software.",
    commonGaps: [
      "Developer marketing — APIs need docs, SDKs, examples, and reachable champions inside customer eng teams.",
      "Pricing model — usage-based pricing is hard to communicate and easy to game.",
      "Onboarding to first call — every step of friction halves activation.",
    ],
  },
  {
    id: "horizontal-b2b-saas",
    label: "Horizontal B2B SaaS",
    description: "Generic B2B SaaS not tied to a specific industry.",
    commonGaps: [
      "Crowded category — incumbents and competitors are well-funded.",
      "Feature breadth required to displace an existing tool the team already pays for.",
      "Switching cost (data migration, training) is the buyer's main objection — not features.",
    ],
  },
  {
    id: "consumer-mobile",
    label: "Consumer mobile",
    description: "Mobile-first app for individual consumers.",
    commonGaps: [
      "App Store discovery is essentially dead for new entrants without external pull.",
      "Retention — consumer apps die at 7-day, not at install.",
      "Average consumer ARPU is low; freemium needs scale most solos can't reach.",
    ],
  },
  {
    id: "consumer-web",
    label: "Consumer web",
    description: "Web-first product for individual consumers.",
    commonGaps: [
      "Reachable channel — consumer SEO and paid acquisition are both expensive and slow for new entrants.",
      "Consumers expect free; conversion is brutal.",
      "Habit-forming hook — the product needs a reason to come back this week.",
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Multi-sided platform connecting two or more user types.",
    commonGaps: [
      "Cold start — both sides usually need bootstrapping, often manually, for many months.",
      "Disintermediation — once both sides know each other, they leave.",
      "Take-rate vs. value — too high kills supply, too low kills the business.",
    ],
  },
  {
    id: "creator-tools",
    label: "Creator tools",
    description: "Tools for content creators, streamers, influencers.",
    commonGaps: [
      "Top-of-funnel volatility — creator income spikes and crashes; subscriptions get cancelled fast.",
      "Influencer-led GTM is a tax — partnerships feel cheap until you scale them.",
      "Adjacent free tools (CapCut, Notion, Canva) keep raising the free-tier bar.",
    ],
  },
  {
    id: "compliance-saas",
    label: "Compliance SaaS",
    description: "B2B product whose value is regulatory or audit posture.",
    commonGaps: [
      "Buyer is the security/legal team, not the user — a different sales motion than feature-led B2B.",
      "Certifications and audits are themselves a year of investment before serious buyers engage.",
      "Procurement-heavy buying cycle — solos usually underweight the time cost.",
    ],
  },
  {
    id: "data-pipeline",
    label: "Data pipeline",
    description: "ETL, ingest, transform, sync, or reverse-ETL between systems.",
    commonGaps: [
      "Edge cases in source/sink schemas — every customer has a quirk, and quirks compound.",
      "Reliability bar is stratospheric — silent data loss kills the relationship.",
      "Categories are crowded with VC-backed incumbents (Fivetran, Airbyte, Census, Hightouch).",
    ],
  },
  {
    id: "productized-service",
    label: "Productized service",
    description: "Service work packaged with a software wrapper or fixed pricing.",
    commonGaps: [
      "Founder is the product — scaling beyond yourself usually breaks margins or quality.",
      "Word-of-mouth is the channel; SEO and ads rarely return on the unit economics.",
      "Operational complexity grows non-linearly with each new client.",
    ],
  },
  {
    id: "browser-extension",
    label: "Browser extension",
    description: "Chrome / Firefox / Edge extension as the primary surface.",
    commonGaps: [
      "Distribution — Chrome Web Store search is poor, install friction is real.",
      "Platform risk — store policy changes can ban your category overnight.",
      "Monetization — most users expect extensions to be free or one-time-paid.",
    ],
  },
  {
    id: "content-platform",
    label: "Content platform",
    description: "Newsletter, course, community, or media product where content IS the product.",
    commonGaps: [
      "Content cadence — solos consistently underestimate the per-week effort to keep it alive.",
      "Audience-building IS distribution — there's no substitute and no shortcut.",
      "Monetization is downstream of audience size; takes longer than budgets allow.",
    ],
  },
  {
    id: "niche-other",
    label: "Niche / other",
    description: "Doesn't fit cleanly into the catalog.",
    commonGaps: [
      "If the idea doesn't resemble any common archetype, that's either rare insight or under-specification.",
      "Lack of comparable category prior makes it hard to anchor pricing, distribution, or buyer expectations.",
      "Re-examine whether the idea actually maps to a named archetype once it's sharper.",
    ],
  },
];

const BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(id: string): ArchetypeMeta | undefined {
  return BY_ID.get(id);
}
