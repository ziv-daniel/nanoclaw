---
name: litellm-fallback-chain-optimization
description: |
  Optimize LiteLLM multi-provider fallback chains by distinguishing quota exhaustion
  from transient rate limits. Prevents wasting 10+ seconds retrying on permanently
  exhausted quotas (e.g., Gemini free tier daily limit).

  Use when:
  - (1) LiteLLM fallback chain is slow because it retries on exhausted quotas
  - (2) "RESOURCE_EXHAUSTED" or "quota exceeded" errors from Gemini/Google AI
  - (3) 429 rate limit errors that should skip vs retry
  - (4) Building multi-model fallback chains with free tier providers
  - (5) Need to optimize latency in LLM provider switching

  Covers: Gemini, Groq, Anthropic, Cohere fallback patterns with LiteLLM.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# LiteLLM Fallback Chain Optimization

## Problem
When using multiple free-tier LLM providers in a fallback chain, transient rate limits
(429 Too Many Requests) and permanent quota exhaustion produce similar errors. Retrying
on an exhausted daily quota wastes 10+ seconds per request before falling back, causing
noticeable user-facing latency.

## Context / Trigger Conditions
- Using LiteLLM with multiple providers (Gemini, Groq, Anthropic, Cohere)
- Primary provider hits daily/monthly quota limit
- Responses become slow (10-30s) because of unnecessary retries
- Error messages contain "quota exceeded", "RESOURCE_EXHAUSTED", "429"
- Free tier providers with hard daily limits (Gemini: ~1500 RPD, Groq: 100K TPD)

## Solution

### Key Insight
Distinguish between two types of rate-limiting:

1. **Transient rate limits** (429): Too many requests per minute/second. Worth retrying
   after a short wait (10s). Will succeed.
2. **Quota exhaustion**: Daily/monthly limit reached. Will NOT succeed until the quota
   resets (next day/month). Skip retry, fall back immediately.

### Implementation Pattern

```python
import asyncio
import litellm

MODELS = [
    "gemini/gemini-2.0-flash",    # Free, high quota
    "groq/llama-3.3-70b",         # Free, 100K TPD
    "anthropic/claude-haiku",      # Paid, reliable
    "cohere/command-r-plus",       # Free, 1K/month
]

MAX_RATE_LIMIT_RETRIES = 1
RATE_LIMIT_WAIT_SECONDS = 10

async def call_llm(messages, tools=None):
    last_error = None

    for model in MODELS:
        for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
            try:
                response = await litellm.acompletion(
                    model=model,
                    messages=messages,
                    tools=tools,
                )
                return response
            except Exception as e:
                last_error = e
                error_str = str(e)

                # Detect rate limit vs quota exhaustion
                is_rate_limit = (
                    "429" in error_str
                    or "RateLimitError" in error_str
                    or "RESOURCE_EXHAUSTED" in error_str
                )
                is_quota_exhausted = "quota exceeded" in error_str.lower()

                if is_rate_limit and not is_quota_exhausted:
                    # Transient rate limit: retry once after wait
                    if attempt < MAX_RATE_LIMIT_RETRIES:
                        await asyncio.sleep(RATE_LIMIT_WAIT_SECONDS)
                        continue

                # Quota exhausted OR non-rate-limit error OR max retries:
                # Skip to next provider immediately
                break

    raise last_error
```

### Provider-Specific Error Patterns

| Provider | Transient Rate Limit | Quota Exhaustion |
|----------|---------------------|------------------|
| Gemini | `429` + `RESOURCE_EXHAUSTED` | `quota exceeded` in message |
| Groq | `429` + `RateLimitError` | `rate_limit_exceeded` + daily reset |
| Anthropic | `429` + `overloaded` | `credit balance` errors |
| Cohere | `429` + `TooManyRequestsError` | Monthly limit message |

### Detection Logic

```python
def classify_error(error_str: str) -> str:
    """Returns 'quota', 'rate_limit', or 'other'."""
    error_lower = error_str.lower()

    # Quota exhaustion indicators (skip retry)
    quota_indicators = [
        "quota exceeded",
        "daily limit",
        "monthly limit",
        "credit balance",
        "billing",
    ]
    if any(indicator in error_lower for indicator in quota_indicators):
        return "quota"

    # Transient rate limit indicators (worth retrying)
    rate_indicators = ["429", "ratelimiterror", "resource_exhausted", "overloaded"]
    if any(indicator in error_lower for indicator in rate_indicators):
        return "rate_limit"

    return "other"
```

## Verification
- Monitor fallback latency: quota-exhausted providers should add <1s (not 10s+)
- Log which provider served each request to verify chain is working
- Check that transient rate limits still get one retry (they often succeed)

## Example

Before optimization:
```
Request → Gemini (quota exhausted) → wait 10s → retry → fail → Groq → success
Total: ~12s
```

After optimization:
```
Request → Gemini (quota exhausted, skip retry) → Groq → success
Total: ~2s
```

## Notes
- Gemini free tier resets at midnight Pacific time
- Groq free tier resets at midnight UTC
- Consider adding per-provider usage tracking to proactively skip exhausted providers
- LiteLLM has built-in fallback (`model_list` with `fallbacks`), but it doesn't
  distinguish quota vs rate limit — this custom logic is more efficient
- Log provider selection for debugging: helps identify when quotas reset
