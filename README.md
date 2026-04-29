# @trigvale/mcp

[![npm version](https://img.shields.io/npm/v/@trigvale/mcp.svg)](https://www.npmjs.com/package/@trigvale/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**MCP server for [Trigvale](https://trigvale.com) — validate startup ideas before your build agent scaffolds code.**

This is the official Model Context Protocol server for Trigvale. It exposes one tool, `validate_idea`, to MCP-aware build agents (Cursor, Claude Code, Codex, Claude Desktop). The intended UX is straightforward: your agent calls `validate_idea` _before_ it writes a single line of scaffolding. A green or amber verdict greenlights coding; a red verdict surfaces the assumption you should test first.

## What `validate_idea` returns

- **10-dimension scorecard** — Venture Readiness Score (VRS, 0–100), computed deterministically in code from the model's per-dimension scores against published anchors. The model never picks the VRS itself.
- **Evidence brief** — every item tagged by `sourceKind` ∈ { `observed`, `inferred`, `missing`, `ai`, `user-claim` } so you know what's grounded vs assumed.
- **Verdict** — `kill`, `pivot`, `test`, or `build`. Build is rare by construction.
- **Founder-fit calibration** — per-dimension deltas applied from the user's declared skill graph (declared inputs only — never extrapolates from past failures).
- **1–3 archetype assignments** — clusters the idea into known patterns (e.g. "vertical-ai-saas", "agentic-workflow") with structural cautions for the cluster.
- **Live evidence** — real-time pull from Reddit, GitHub, Hacker News, Stack Overflow, and dev.to for the idea's dominant archetype, refreshed every 6 hours.

Full output schema and methodology: <https://trigvale.com/methodology>

## Install

```bash
npx -y @trigvale/mcp
```

You'll need a Trigvale agent token (Integrate plan, $99/mo). Get one at <https://trigvale.com/settings>.

## Configuration

Drop this into your MCP client's config (`mcpServers` block):

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "trigvale": {
      "command": "npx",
      "args": ["-y", "@trigvale/mcp"],
      "env": {
        "TRIGVALE_AGENT_TOKEN": "tvk_xxx"
      }
    }
  }
}
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS)

Same shape — replace `tvk_xxx` with your token from /settings.

### Claude Code

Add the snippet to `.mcp.json` at the repo root, or use `claude mcp add` to register it interactively.

### Self-hosted / dev environments

Override the API base via env:

```bash
TRIGVALE_API_BASE_URL=https://api-dev.trigvale.com npx -y @trigvale/mcp
```

Default base is `https://api.trigvale.com` (production).

## Example usage in an agent prompt

> "Before you scaffold this project, call `validate_idea` with the user's pitch. If the verdict is `kill` or `pivot`, surface the weakest assumption and ask the user whether to proceed anyway. If `test`, suggest the validation sprint Trigvale recommends before any code."

## Why a separate validation step?

Building has gotten cheap. The bottleneck is no longer execution — it's deciding what to execute. Most ideas should be killed, pivoted, or tested before code is written. `validate_idea` makes that decision an explicit, repeatable step in your agent flow, with a deterministic verdict and source-tagged evidence you can show the user.

## Pricing & plans

| Plan          | Monthly | Includes                                                |
| ------------- | ------- | ------------------------------------------------------- |
| Free          | $0      | 1 verdict / month, lite preview                         |
| Starter       | $12     | 10 verdicts / month, full brief                         |
| Validate      | $39     | Live evidence pipeline + sharpening + sprint generator  |
| **Integrate** | **$99** | **Everything above + agent tokens for this MCP server** |

The agent token required by this MCP is gated to the Integrate plan. Per-call entitlement is re-checked server-side on every `/agent/v1/evaluate` call — downgrades take effect immediately.

Full pricing: <https://trigvale.com/pricing>

## Source

This is a **read-only mirror** of the MCP server source from Trigvale's private monorepo (the rest of which contains the proprietary rubric, infrastructure, and billing logic). Releases are cut on the private side and synced here. PRs are welcome — please open issues at <https://trigvale.com/contact> instead of GitHub Issues so we route them through the support workflow.

## License

[MIT](LICENSE) — sydacos GmbH, 2026.

## Links

- Homepage: <https://trigvale.com>
- Integration docs: <https://trigvale.com/integrations>
- Methodology: <https://trigvale.com/methodology>
- Sample brief: <https://trigvale.com/sample>
- Contact: <https://trigvale.com/contact>
- npm: <https://www.npmjs.com/package/@trigvale/mcp>
