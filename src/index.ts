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

const server = new Server(
  {
    name: "trigvale",
    version: "0.1.0",
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "validate_idea") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = ValidateIdeaArgsSchema.parse(request.params.arguments ?? {});

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

  // Return both the structured object (for agent reasoning) and a
  // human-readable summary block (for chat clients that just render text).
  return {
    content: [
      {
        type: "text",
        text: summarize(body),
      },
      {
        type: "text",
        text: "```json\n" + JSON.stringify(body, null, 2) + "\n```",
      },
    ],
  };
});

interface AgentEvaluateResponse {
  ideaObject: { title: string };
  scorecard: { vrs: number; confidence: string };
  verdict: { verdict: string; reasons: string[] };
  founderAdjustments?: { dimension: string; delta: number; reason: string }[];
  archetypeAssignments?: { archetype: string; confidence: string; rationale: string }[];
  saved?: { ideaId: string } | null;
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
