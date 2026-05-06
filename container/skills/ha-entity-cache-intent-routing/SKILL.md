---
name: ha-entity-cache-intent-routing
description: |
  Dynamic Home Assistant entity cache for intent-based routing in AI agents.
  Auto-detects smart home intents by caching HA entity names and matching
  against user messages. Solves the problem of static keyword lists missing
  new devices.

  Use when:
  - (1) AI agent fails to detect smart home intent for newly added HA entities
  - (2) Need dynamic intent classification that adapts to HA device changes
  - (3) Building WhatsApp/chat bot that controls Home Assistant
  - (4) Static keyword lists keep missing new devices or entity names
  - (5) "toggle/press/activate [device]" commands not routed to smart_home tools

  Pattern: Fetch HA entities on startup, extract keywords from entity_ids and
  friendly_names, match against messages with action verb detection.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# Dynamic HA Entity Cache for Intent Routing

## Problem
AI agents that route user messages to tool categories (intents) using static keyword
lists fail when new Home Assistant devices are added. The agent doesn't know about
"tami 4" or "finger bot" unless you manually add those keywords. This creates a
maintenance burden and poor user experience.

## Context / Trigger Conditions
- User says "toggle the tami 4" but agent routes to general chat instead of smart_home
- New HA entity added but agent doesn't recognize commands for it
- Intent router uses static keyword regex patterns
- Agent has access to Home Assistant API (ha_client)

## Solution

### Architecture
Two-layer intent detection:
1. **Static keywords**: Fast regex patterns for known intents (Hebrew + English)
2. **Dynamic entity cache**: Fetches all HA entities, extracts keywords, matches messages

### Entity Cache Implementation

```python
import asyncio
import re
import time
from typing import Set

# Domains that represent controllable devices
CONTROLLABLE_DOMAINS = {
    "switch", "light", "cover", "fan", "climate",
    "input_boolean", "automation", "button", "script",
    "media_player", "lock", "vacuum",
}

# Action verbs that indicate device control intent
ACTION_VERBS_HE = {"תלחץ", "לחץ", "הפעל", "כבה", "הדלק", "כבה", "פתח", "סגור", "שנה", "הגבר", "הנמך"}
ACTION_VERBS_EN = {"toggle", "press", "activate", "turn on", "turn off", "switch", "open", "close"}
ACTION_VERBS = ACTION_VERBS_HE | ACTION_VERBS_EN

# Words to exclude from keyword extraction (too generic)
STOP_WORDS = {"the", "a", "an", "is", "in", "on", "off", "my", "all", "new", "old", "home", "room"}

REFRESH_INTERVAL = 1800  # 30 minutes


class EntityCache:
    def __init__(self):
        self._keywords: Set[str] = set()
        self._entity_ids: Set[str] = set()
        self._friendly_names: Set[str] = set()
        self._last_refresh: float = 0
        self._lock = asyncio.Lock()
        self.loaded = False

    async def refresh(self):
        """Fetch all HA entities and extract searchable keywords."""
        async with self._lock:
            from your_ha_client import HAClient  # Your HA integration
            ha = HAClient()
            states = await ha.get_states()

            keywords = set()
            entity_ids = set()
            friendly_names = set()

            for entity in states:
                entity_id = entity.get("entity_id", "")
                domain = entity_id.split(".")[0] if "." in entity_id else ""

                if domain not in CONTROLLABLE_DOMAINS:
                    continue

                entity_ids.add(entity_id)

                friendly_name = entity.get("attributes", {}).get("friendly_name", "")
                if friendly_name:
                    friendly_names.add(friendly_name.lower())

                # Extract keywords from entity_id (after domain.)
                name_part = entity_id.split(".", 1)[1] if "." in entity_id else ""
                for word in re.split(r"[_\s]+", name_part):
                    word = word.lower().strip()
                    if len(word) > 2 and word not in STOP_WORDS:
                        keywords.add(word)

                # Extract keywords from friendly name
                for word in re.split(r"[\s_]+", friendly_name):
                    word = word.lower().strip()
                    if len(word) > 2 and word not in STOP_WORDS:
                        keywords.add(word)

            self._keywords = keywords
            self._entity_ids = entity_ids
            self._friendly_names = friendly_names
            self._last_refresh = time.time()
            self.loaded = True

    async def ensure_fresh(self):
        """Refresh if stale (older than REFRESH_INTERVAL)."""
        if time.time() - self._last_refresh > REFRESH_INTERVAL:
            await self.refresh()

    def message_mentions_entity(self, message: str) -> bool:
        """Check if message mentions a known HA entity."""
        if not self.loaded:
            return False

        msg_lower = message.lower()

        # Check 1: Exact entity_id mention
        for eid in self._entity_ids:
            if eid in msg_lower:
                return True

        # Check 2: Friendly name mention
        for name in self._friendly_names:
            if name in msg_lower:
                return True

        # Check 3: Keyword + action verb combo
        has_action = any(verb in msg_lower for verb in ACTION_VERBS)
        if has_action:
            for kw in self._keywords:
                if kw in msg_lower:
                    return True

        return False


# Singleton
entity_cache = EntityCache()
```

### Integration with Intent Router

```python
def classify_intent(message: str) -> list[str]:
    matched = []

    # 1. Static keyword matching (fast)
    for intent, pattern in PATTERNS.items():
        if pattern.search(message):
            matched.append(intent)

    # 2. Dynamic entity cache (catches new devices)
    if "smart_home" not in matched:
        if entity_cache.loaded and entity_cache.message_mentions_entity(message):
            matched.append("smart_home")

    return matched or ["chat"]
```

### Startup Integration

```python
# In your app startup (FastAPI lifespan, etc.)
async def startup():
    try:
        await entity_cache.refresh()
        logger.info(f"Loaded {len(entity_cache._entity_ids)} entities")
    except Exception as e:
        logger.warning(f"Entity cache failed: {e}")
        # Non-fatal: static keywords still work
```

## Verification
1. Add a new device to Home Assistant
2. Wait 30 minutes (or restart agent to force refresh)
3. Send a message mentioning the new device with an action verb
4. Verify it routes to smart_home intent (check logs)

## Example

Without entity cache:
```
User: "תלחץ על הtami 4"
Intent: ["chat"]  # Missed! "tami" not in static keywords
```

With entity cache (HA has `switch.tami_4_finger_bot`):
```
User: "תלחץ על הtami 4"
Entity cache: keyword "tami" matched + action verb "תלחץ" detected
Intent: ["smart_home"]  # Correct!
```

## Notes
- The cache is non-blocking: if refresh fails, static keywords still work
- Keywords are extracted from both `entity_id` (snake_case parts) and `friendly_name`
- Only controllable domains are cached (no sensors, binary_sensors, etc.)
- Action verb requirement prevents false positives (mentioning "kitchen" in cooking context)
- Hebrew action verbs are essential for Hebrew-speaking users
- Stop words prevent generic terms like "room", "home" from triggering matches
- Consider logging cache matches separately from static matches for debugging
