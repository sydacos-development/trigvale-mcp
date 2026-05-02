#!/usr/bin/env node
/**
 * Trigvale MCP server. Exposes the validate-idea endpoint to MCP-aware
 * build agents (Cursor, Claude Code, Codex, ChatGPT-with-MCP). Thin wrapper
 * over POST /agent/v1/evaluate — same auth (agent token), same downstream
 * persistence, same scorecard + verdict + founder-fit + archetype output.
 *
 * Distributed as `npx -y @trigvale/mcp` so consumers don't need a global
 * install. Authenticates via TRIGVALE_AGENT_TOKEN environment variable;
 * defaults to the dev API but accepts TRIGVALE_API_BASE_URL for prod or
 * self-hosted deployments.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ARCHETYPES, getArchetype } from "./archetype-catalog.js";

// Public installs hit prod by default. Internal dev work overrides via
// TRIGVALE_API_BASE_URL=https://api-dev.trigvale.com.
const DEFAULT_API_BASE = "https://api.trigvale.com";

const apiBase = (process.env.TRIGVALE_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
const agentToken = process.env.TRIGVALE_AGENT_TOKEN;

if (!agentToken) {
  console.error(
    "[trigvale-mcp] TRIGVALE_AGENT_TOKEN is required. Issue one at https://trigvale.com/settings (Integrate plan).",
  );
  process.exit(1);
}

// Schema for arguments to validate_idea. Mirrors the request schema in
// packages/functions/src/agent-v1-evaluate. Kept small so build agents can
// produce it without a separate fetch of the schema.
const ValidateIdeaArgsSchema = z.object({
  rawIdea: z
    .string()
    .min(5)
    .max(4000)
    .describe(
      "The idea to validate. Free-form text; mess is fine — Trigvale normalizes it. Be specific about who has the pain, who pays, and why now.",
    ),
  save: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "When true, persist the brief to the user's vault so they can revisit it at trigvale.com/ideas/{id}. Default true. Set false for ephemeral checks.",
    ),
});

// Schema for validate_url. Wraps the public POST /api/try-url endpoint
// — Jina reader extracts the page text, Haiku rewrites as a founder
// pitch, Sonnet 4.6 scores it. Returns a sharable URL whose dynamic OG
// card the agent can hand back to the user. IP-rate-limited 3/day.
const ValidateUrlArgsSchema = z.object({
  url: z
    .string()
    .url()
    .min(12)
    .max(2048)
    .describe(
      "The URL of a startup landing page, Producthunt launch, GitHub README, or blog post to validate. Must be publicly reachable (no auth-walled URLs).",
    ),
});

// Schema for get_archetype_cautions. Pure local catalog lookup — no
// API call, no token cost. Returns the catalog entry's structural
// cautions for one cluster, OR a list-all when no id is provided.
const GetArchetypeCautionsArgsSchema = z.object({
  archetypeId: z
    .string()
    .optional()
    .describe(
      "Catalog id of the archetype to look up (e.g. 'vertical-ai-saas', 'ai-wrapper'). Omit to receive the full 16-cluster catalog with descriptions only (no per-cluster cautions, to keep the response small).",
    ),
});

// MCP v2 — three new lightweight tools that share a common arg shape
// (just `rawIdea`). Each calls a dedicated /agent/v1/* endpoint.
const RawIdeaArgsSchema = z.object({
  rawIdea: z
    .string()
    .min(5)
    .max(4000)
    .describe(
      "The idea to validate. Free-form text; mess is fine. Be specific about who has the pain, who pays, and why now.",
    ),
});

const server = new Server(
  {
    name: "trigvale",
    version: "0.4.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "validate_idea",
      description:
        "Validate a startup idea before scaffolding code for it. Returns a scorecard (10-dimension Venture Readiness Score, 0–100), an evidence brief tagged by source (observed / inferred / AI / claim), a kill / pivot / test / build verdict, founder-fit calibration deltas if a skill graph is on file, and 1–3 archetype assignments with structural cautions for that cluster. Call this BEFORE writing project scaffolding when the user is greenfield-building from a raw idea.",
      inputSchema: {
        type: "object",
        properties: {
          rawIdea: {
            type: "string",
            minLength: 5,
            maxLength: 4000,
            description:
              "The idea to validate. Free-form text; mess is fine — Trigvale normalizes it. Be specific about who has the pain, who pays, and why now.",
          },
          save: {
            type: "boolean",
            default: true,
            description:
              "When true, persist the brief to the user's vault so they can revisit it at trigvale.com/ideas/{id}. Default true. Set false for ephemeral checks.",
          },
        },
        required: ["rawIdea"],
      },
    },
    {
      name: "validate_url",
      description:
        "Validate a startup idea given a URL (landing page, Producthunt launch, GitHub README, blog post). Trigvale fetches the page, extracts the implied founder pitch with Haiku, scores it against the rubric, and returns a verdict (kill / pivot / test / build) plus a sharable URL whose dynamic OG card unfurls on Slack/X/LinkedIn — useful for replying to a tweet about a launch with a verdict the original poster can see. Call this when the user gives you a URL to evaluate (their own competitor's site, a launch they saw on X, etc.) instead of typing the pitch out by hand. Rate-limited to 3 calls per day per IP. Auth-walled URLs (Twitter, LinkedIn) are NOT supported.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            format: "uri",
            minLength: 12,
            maxLength: 2048,
            description:
              "The URL of a startup landing page, Producthunt launch, GitHub README, or blog post to validate. Must be publicly reachable (no auth-walled URLs).",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "quick_verdict",
      description:
        "Sub-second pre-build signal. Returns a 5-field shape (verdict, vrs, confidence, fatalAssumption, oneLineReason) — perfect for inline calls inside an agent loop where you need 'should I keep building?' fast and cheap. Sonnet-only, no archetype/evidence side-fetches. Use this DEFAULT for quick checks; reach for validate_idea when you need the full brief.",
      inputSchema: {
        type: "object",
        properties: {
          rawIdea: {
            type: "string",
            minLength: 5,
            maxLength: 4000,
            description:
              "The idea to score. Free-form text; mess is fine. Be specific about who has the pain, who pays, and why now.",
          },
        },
        required: ["rawIdea"],
      },
    },
    {
      name: "detect_fatal_assumption",
      description:
        "Returns ONLY the single most load-bearing assumption — what would have to be true for the idea to work, plus why it's load-bearing. Useful when an agent has decided to build but wants a brutal one-line 'what would kill this' check before diving in. Same Sonnet cost as quick_verdict; different focus.",
      inputSchema: {
        type: "object",
        properties: {
          rawIdea: {
            type: "string",
            minLength: 5,
            maxLength: 4000,
            description: "The idea to inspect. Free-form text; mess is fine.",
          },
        },
        required: ["rawIdea"],
      },
    },
    {
      name: "classify_archetype",
      description:
        "Map an idea to 1–3 of Trigvale's 16 startup archetypes (e.g. 'ai-wrapper', 'vertical-ai-saas', 'marketplace') and return each cluster's known failure modes from the catalog. Two cheap Haiku calls. Useful for agents that want to know 'what shape is this?' before deciding whether to invest in a full validation. Distinct from get_archetype_cautions (which is a static catalog lookup) — this one runs the actual classifier on the idea text.",
      inputSchema: {
        type: "object",
        properties: {
          rawIdea: {
            type: "string",
            minLength: 5,
            maxLength: 4000,
            description: "The idea to classify. Free-form text; mess is fine.",
          },
        },
        required: ["rawIdea"],
      },
    },
    {
      name: "get_archetype_cautions",
      description:
        "Return the structural cautions Trigvale surfaces for a startup-idea archetype. Useful BEFORE calling validate_idea — read the cautions for the cluster you think the idea fits, then sharpen the pitch to address those gaps before scoring. Pure local catalog lookup, no API call, no token cost, no rate limit. Pass an archetypeId to get one cluster's full cautions (3 per archetype); omit to get the full 16-archetype catalog index (id + label + description, no cautions, for browsing). Catalog ids: 'solo-dev-tools', 'vertical-ai-saas', 'ai-wrapper', 'agentic-workflow', 'api-first-saas', 'horizontal-b2b-saas', 'consumer-mobile', 'consumer-web', 'marketplace', 'creator-tools', 'compliance-saas', 'data-pipeline', 'productized-service', 'browser-extension', 'content-platform', 'niche-other'.",
      inputSchema: {
        type: "object",
        properties: {
          archetypeId: {
            type: "string",
            description:
              "Catalog id of the archetype to look up. Omit to receive the full catalog index.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "validate_idea") {
    return await callValidateIdea(request.params.arguments ?? {});
  }
  if (request.params.name === "validate_url") {
    return await callValidateUrl(request.params.arguments ?? {});
  }
  if (request.params.name === "quick_verdict") {
    return await callMcpV2("quick-verdict", request.params.arguments ?? {});
  }
  if (request.params.name === "detect_fatal_assumption") {
    return await callMcpV2("detect-fatal-assumption", request.params.arguments ?? {});
  }
  if (request.params.name === "classify_archetype") {
    return await callMcpV2("classify-archetype", request.params.arguments ?? {});
  }
  if (request.params.name === "get_archetype_cautions") {
    return callGetArchetypeCautions(request.params.arguments ?? {});
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

/**
 * Common dispatcher for the three MCP v2 tools — each shares the same
 * `{ rawIdea }` argument shape and POSTs to a /agent/v1/<endpoint>
 * route. The summary pulls headline fields based on the response shape;
 * the second content block is always the raw JSON for agents that want
 * to programmatically consume it.
 */
async function callMcpV2(endpoint: string, rawArgs: unknown) {
  const args = RawIdeaArgsSchema.parse(rawArgs);
  const res = await fetch(`${apiBase}/agent/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${agentToken}`,
    },
    body: JSON.stringify({ rawIdea: args.rawIdea }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trigvale API ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    content: [
      { type: "text" as const, text: summarizeMcpV2(endpoint, body) },
      { type: "text" as const, text: "```json\n" + JSON.stringify(body, null, 2) + "\n```" },
    ],
  };
}

function summarizeMcpV2(endpoint: string, body: Record<string, unknown>): string {
  if (endpoint === "quick-verdict") {
    const verdict = String(body.verdict ?? "?").toUpperCase();
    const vrs = body.vrs ?? "?";
    const conf = body.confidence ?? "?";
    return [
      `**${verdict}** · VRS ${vrs}/100 · ${conf} confidence`,
      "",
      `_${body.oneLineReason ?? ""}_`,
      "",
      `**Fatal assumption:** ${body.fatalAssumption ?? ""}`,
    ].join("\n");
  }
  if (endpoint === "detect-fatal-assumption") {
    return [
      `**Most load-bearing assumption** (${body.confidence ?? "?"} confidence):`,
      "",
      String(body.assumption ?? ""),
      "",
      `**Why it's critical:** ${body.whyCritical ?? ""}`,
    ].join("\n");
  }
  if (endpoint === "classify-archetype") {
    const assignments = (body.assignments as Array<Record<string, unknown>>) ?? [];
    const lines: string[] = ["# Archetype assignments", ""];
    for (const a of assignments) {
      lines.push(`## ${a.label ?? a.archetype} (${a.confidence ?? "?"} confidence)`);
      lines.push(String(a.rationale ?? ""));
      const failures = (a.knownFailureModes as string[]) ?? [];
      if (failures.length > 0) {
        lines.push("");
        lines.push("**Known failure modes for this cluster:**");
        for (const f of failures) lines.push(`- ${f}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  return JSON.stringify(body, null, 2);
}

function callGetArchetypeCautions(rawArgs: unknown) {
  const args = GetArchetypeCautionsArgsSchema.parse(rawArgs);
  if (args.archetypeId) {
    const meta = getArchetype(args.archetypeId);
    if (!meta) {
      const known = ARCHETYPES.map((a) => a.id).join(", ");
      throw new Error(`Unknown archetypeId "${args.archetypeId}". Known ids: ${known}`);
    }
    const lines: string[] = [];
    lines.push(`# ${meta.label} (${meta.id})`);
    lines.push("");
    lines.push(meta.description);
    lines.push("");
    lines.push("## Structural cautions");
    for (const gap of meta.commonGaps) lines.push(`- ${gap}`);
    return {
      content: [
        { type: "text", text: lines.join("\n") },
        { type: "text", text: "```json\n" + JSON.stringify(meta, null, 2) + "\n```" },
      ],
    };
  }
  // No id passed — return the catalog index (lightweight; no cautions).
  const index = ARCHETYPES.map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
  }));
  const lines = [
    "# Trigvale archetype catalog (16 clusters)",
    "",
    "Pass `archetypeId` to get the structural cautions for one cluster.",
    "",
    ...index.map((a) => `- **${a.id}** — ${a.label}: ${a.description}`),
  ];
  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: "```json\n" + JSON.stringify(index, null, 2) + "\n```" },
    ],
  };
}

async function callValidateIdea(rawArgs: unknown) {
  const args = ValidateIdeaArgsSchema.parse(rawArgs);

  const res = await fetch(`${apiBase}/agent/v1/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${agentToken}`,
    },
    body: JSON.stringify({ rawIdea: args.rawIdea, save: args.save }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trigvale API ${res.status}: ${text || res.statusText}`);
  }

  const body = (await res.json()) as AgentEvaluateResponse;

  return {
    content: [
      { type: "text", text: summarize(body) },
      { type: "text", text: "```json\n" + JSON.stringify(body, null, 2) + "\n```" },
    ],
  };
}

async function callValidateUrl(rawArgs: unknown) {
  const args = ValidateUrlArgsSchema.parse(rawArgs);

  // /api/try-url is a public Next.js route — token-less, IP-rate-limited.
  // It lives on the web origin (trigvale.com), not the API Gateway base
  // (api.trigvale.com). Default web base derives from whether the API
  // base points at dev or prod; override via TRIGVALE_WEB_BASE_URL for
  // local / self-hosted setups.
  const tryUrlBase =
    process.env.TRIGVALE_WEB_BASE_URL ??
    (apiBase.includes("api-dev")
      ? "https://trigvale-git-dev-sydacos.vercel.app"
      : "https://trigvale.com");

  const res = await fetch(`${tryUrlBase}/api/try-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: args.url }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trigvale API ${res.status}: ${text || res.statusText}`);
  }

  const body = (await res.json()) as TryUrlResponse;

  return {
    content: [
      { type: "text", text: summarizeUrl(body) },
      { type: "text", text: "```json\n" + JSON.stringify(body, null, 2) + "\n```" },
    ],
  };
}

interface AgentEvaluateResponse {
  ideaObject: { title: string };
  scorecard: { vrs: number; confidence: string };
  verdict: { verdict: string; reasons: string[] };
  founderAdjustments?: { dimension: string; delta: number; reason: string }[];
  archetypeAssignments?: { archetype: string; confidence: string; rationale: string }[];
  saved?: { ideaId: string } | null;
}

interface TryUrlResponse {
  vrs: number;
  verdict: "kill" | "pivot" | "test" | "build";
  title: string;
  oneLineReason: string;
  weakestAssumptions: string[];
  sourceUrl: string;
  sourceTitle: string | null;
  shareUrl: string | null;
  shareToken: string | null;
  remaining: number;
}

function summarizeUrl(body: TryUrlResponse): string {
  const lines: string[] = [];
  lines.push(`# ${body.title}`);
  lines.push("");
  lines.push(`**Verdict: ${body.verdict.toUpperCase()}** · VRS ${body.vrs}/100`);
  lines.push("");
  lines.push(
    `Extracted from: ${body.sourceTitle ? `${body.sourceTitle} (${body.sourceUrl})` : body.sourceUrl}`,
  );
  lines.push("");
  if (body.oneLineReason) {
    lines.push(body.oneLineReason);
    lines.push("");
  }
  if (body.weakestAssumptions?.length) {
    lines.push("Weakest assumptions:");
    for (const a of body.weakestAssumptions) lines.push(`- ${a}`);
    lines.push("");
  }
  if (body.shareUrl) {
    lines.push(`Sharable verdict: ${body.shareUrl}`);
    lines.push(
      "(Reply to the original post with this URL — Slack/X/LinkedIn unfurl a Trigvale OG card with the verdict.)",
    );
    lines.push("");
  }
  if (typeof body.remaining === "number") {
    lines.push(
      `Daily quota: ${body.remaining} URL evaluation${body.remaining === 1 ? "" : "s"} left today on this IP.`,
    );
  }
  return lines.join("\n");
}

function summarize(body: AgentEvaluateResponse): string {
  const lines: string[] = [];
  lines.push(`# ${body.ideaObject.title}`);
  lines.push("");
  lines.push(
    `**Verdict: ${body.verdict.verdict.toUpperCase()}** · VRS ${body.scorecard.vrs}/100 · ${body.scorecard.confidence} confidence`,
  );
  lines.push("");
  if (body.verdict.reasons?.length) {
    for (const r of body.verdict.reasons) lines.push(`- ${r}`);
    lines.push("");
  }
  if (body.archetypeAssignments?.length) {
    const top = body.archetypeAssignments[0]!;
    lines.push(`Archetype: **${top.archetype}** (${top.confidence}) — ${top.rationale}`);
    lines.push("");
  }
  if (body.founderAdjustments?.length) {
    lines.push("Founder-fit calibration applied:");
    for (const a of body.founderAdjustments) {
      lines.push(`- ${a.dimension}: ${a.delta > 0 ? "+" : ""}${a.delta} (${a.reason})`);
    }
    lines.push("");
  }
  if (body.saved?.ideaId) {
    lines.push(`Saved to vault: https://trigvale.com/ideas/${body.saved.ideaId}`);
  }
  return lines.join("\n");
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[trigvale-mcp] ready (stdio transport)");
