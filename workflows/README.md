# agent-media Lobster Workflows

Typed workflow pipelines for [OpenClaw](https://openclaw.ai)'s Lobster runtime. These workflows provide guided, multi-step UGC video generation with approval gates.

## Workflows

### `generate.lobster` — Guided UGC Video Generation

Step-by-step UGC video flow:
1. Check credit balance
2. List available actors
3. **Approval gate** — confirm script, actor, and style before spending credits
4. Generate UGC video with `--sync`
5. Download result

```json
{
  "action": "run",
  "pipeline": "workflows/generate.lobster",
  "argsJson": "{\"script\":\"Stop scrolling! This product changed my morning routine.\",\"actor\":\"adaeze\",\"style\":\"hormozi\"}"
}
```

### `batch-generate.lobster` — Batch UGC Generation

Submit multiple scripts with the same actor:
1. Check credit balance
2. **Approval gate** — preview the full batch before spending credits
3. Submit all jobs in parallel
4. List completed results

```json
{
  "action": "run",
  "pipeline": "workflows/batch-generate.lobster",
  "argsJson": "{\"scripts\":[\"Script one about productivity\",\"Script two about fitness\",\"Script three about cooking\"],\"actor\":\"kemi\",\"style\":\"hormozi\"}"
}
```

## Setup

Enable Lobster in your OpenClaw config:

```json
{
  "tools": {
    "alsoAllow": ["lobster"]
  }
}
```

Then trigger via the Lobster tool or from any connected chat platform.

## Why Approval Gates

Approval gates pause the workflow before any credit-spending action. This keeps side effects explicit — no accidental charges from a misunderstood prompt.
