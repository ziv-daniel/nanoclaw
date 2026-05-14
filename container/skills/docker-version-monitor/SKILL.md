---
name: docker-version-monitor
description: |
  Monitor Docker container versions and check for available updates.
  Use when: (1) tracking container image versions, (2) checking Docker Hub for updates,
  (3) comparing current vs latest versions, (4) creating update notification systems,
  (5) building Node-RED flows for version checking, (6) setting up HA sensors for
  version tracking. Works with pie5-ssh for container inspection.
---

# Docker Version Monitor

## Overview

Track Docker container versions and detect available updates using Docker Hub Registry API, Node-RED flows, and Home Assistant sensors.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Node-RED Flow  │────▶│ Docker Hub API   │────▶│ HA Sensors      │
│  (Daily Cron)   │     │ Registry         │     │ (Version Data)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                               │
        ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│ SSH to PIE5     │                            │ Dashboard Cards │
│ (Current Ver)   │                            │ + Indicators    │
└─────────────────┘                            └─────────────────┘
```

## Data Model

```yaml
# Per-container tracking
container:
  name: string           # e.g., "waha"
  image: string          # e.g., "devlikeapro/waha"
  tag: string            # e.g., "arm"
  current_digest: string # SHA256 of current image
  latest_digest: string  # SHA256 of latest image
  update_available: bool # true if digests differ
  last_checked: datetime # ISO timestamp
```

## Docker Hub Registry API

### Get Image Manifest (Check Digest)
```javascript
// Node-RED HTTP Request node
const image = "devlikeapro/waha";
const tag = "arm";
const url = `https://hub.docker.com/v2/repositories/${image}/tags/${tag}`;

// Response contains:
// {
//   "digest": "sha256:abc123...",
//   "last_updated": "2024-01-15T10:00:00Z",
//   "images": [...]
// }
```

### Multi-Architecture Images
```javascript
// For multi-arch images, check specific architecture
const url = `https://hub.docker.com/v2/repositories/${image}/tags/${tag}`;
// Filter response.images for architecture match (arm64, amd64, etc.)
```

## SSH Commands for Current Version

### Get Current Image Digest
```bash
# Get digest of running container's image
docker inspect --format='{{.Image}}' CONTAINER_NAME

# Get full image info
docker inspect --format='{{json .Config.Image}}' CONTAINER_NAME

# Get image digest (if pulled with digest)
docker images --digests --format "{{.Repository}}:{{.Tag}} {{.Digest}}" | grep IMAGE_NAME
```

### Get Container Details
```bash
# Full container info as JSON
docker inspect CONTAINER_NAME

# Specific fields
docker inspect --format='{{.Config.Image}}' waha
docker inspect --format='{{.Created}}' waha
```

## Node-RED Flow Pattern

### Daily Version Check Flow

```json
[
  {
    "id": "cron-trigger",
    "type": "inject",
    "name": "Daily 6AM",
    "repeat": "",
    "crontab": "0 6 * * *",
    "wires": [["get-current-versions"]]
  },
  {
    "id": "get-current-versions",
    "type": "exec",
    "command": "ssh admin@192.168.68.136 'docker inspect --format=\"{{.Config.Image}}\" waha zigbee2mqtt glances'",
    "wires": [["parse-current"], [], []]
  },
  {
    "id": "parse-current",
    "type": "function",
    "name": "Parse Current Versions",
    "func": "// Parse SSH output into container objects\nconst lines = msg.payload.trim().split('\\n');\nmsg.containers = {\n  waha: lines[0],\n  zigbee2mqtt: lines[1],\n  glances: lines[2]\n};\nreturn msg;",
    "wires": [["check-dockerhub"]]
  },
  {
    "id": "check-dockerhub",
    "type": "http request",
    "method": "GET",
    "url": "https://hub.docker.com/v2/repositories/devlikeapro/waha/tags/arm",
    "wires": [["compare-versions"]]
  },
  {
    "id": "compare-versions",
    "type": "function",
    "name": "Compare & Update HA",
    "func": "// Compare digests and set update_available\nconst latestDigest = msg.payload.digest;\nconst currentDigest = msg.containers.waha_digest;\nmsg.payload = {\n  entity_id: 'sensor.waha_update_available',\n  state: latestDigest !== currentDigest ? 'Update Available' : 'Up to Date',\n  attributes: {\n    current_digest: currentDigest,\n    latest_digest: latestDigest,\n    last_checked: new Date().toISOString()\n  }\n};\nreturn msg;",
    "wires": [["ha-sensor"]]
  },
  {
    "id": "ha-sensor",
    "type": "api-call-service",
    "server": "ha-server",
    "domain": "input_text",
    "service": "set_value",
    "wires": [[]]
  }
]
```

## Home Assistant Sensors

### Input Helpers for Version Data
```yaml
input_text:
  waha_current_version:
    name: WAHA Current Version
    initial: "unknown"
  waha_latest_version:
    name: WAHA Latest Version
    initial: "unknown"
  zigbee2mqtt_current_version:
    name: Zigbee2MQTT Current Version
    initial: "unknown"
  zigbee2mqtt_latest_version:
    name: Zigbee2MQTT Latest Version
    initial: "unknown"
```

### Template Sensors for Update Status
```yaml
template:
  - sensor:
      - name: "WAHA Update Available"
        state: >
          {% if states('input_text.waha_current_version') != states('input_text.waha_latest_version') %}
            Update Available
          {% else %}
            Up to Date
          {% endif %}
        icon: >
          {% if is_state('sensor.waha_update_available', 'Update Available') %}
            mdi:package-up
          {% else %}
            mdi:package-check
          {% endif %}
        attributes:
          current: "{{ states('input_text.waha_current_version') }}"
          latest: "{{ states('input_text.waha_latest_version') }}"

      - name: "Container Updates Count"
        state: >
          {% set count = 0 %}
          {% if is_state('sensor.waha_update_available', 'Update Available') %}
            {% set count = count + 1 %}
          {% endif %}
          {% if is_state('sensor.zigbee2mqtt_update_available', 'Update Available') %}
            {% set count = count + 1 %}
          {% endif %}
          {{ count }}
        icon: mdi:package-variant
```

## Dashboard Integration

### Update Badge
```yaml
type: custom:mushroom-chips-card
chips:
  - type: conditional
    conditions:
      - condition: numeric_state
        entity: sensor.container_updates_count
        above: 0
    chip:
      type: entity
      entity: sensor.container_updates_count
      icon: mdi:package-up
      icon_color: orange
```

### Update Availability Card
```yaml
type: entities
title: Container Updates
show_header_toggle: false
entities:
  - entity: sensor.waha_update_available
    secondary_info: attribute
    attribute: current → latest
  - entity: sensor.zigbee2mqtt_update_available
    secondary_info: attribute
    attribute: current → latest
  - type: button
    name: Check Now
    icon: mdi:refresh
    tap_action:
      action: call-service
      service: script.check_container_updates
```

## PIE5 Container Images

| Container | Image | Tag | Registry |
|-----------|-------|-----|----------|
| waha | devlikeapro/waha | arm | Docker Hub |
| zigbee2mqtt | koenkk/zigbee2mqtt | latest | Docker Hub |
| glances | nicolargo/glances | latest-full | Docker Hub |

## Check Docker Hub Manually

```bash
# WAHA latest
curl -s "https://hub.docker.com/v2/repositories/devlikeapro/waha/tags/arm" | jq '.last_updated, .digest'

# Zigbee2MQTT latest
curl -s "https://hub.docker.com/v2/repositories/koenkk/zigbee2mqtt/tags/latest" | jq '.last_updated, .digest'

# Glances latest
curl -s "https://hub.docker.com/v2/repositories/nicolargo/glances/tags/latest-full" | jq '.last_updated, .digest'
```

## References

See `references/dockerhub-api.md` for full Docker Hub API documentation.
See `references/nodered-flows.md` for complete Node-RED flow examples.
