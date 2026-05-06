---
name: ha-dashboard-builder
description: Create and modify Home Assistant Lovelace dashboards programmatically.
---

# Home Assistant Dashboard Builder

## Overview

Build Lovelace dashboards for Home Assistant using YAML configurations. This skill provides patterns for creating views, cards, and layouts that can be applied via HA's dashboard configuration.

## Dashboard Structure

```yaml
views:
  - title: Tab Name
    path: tab-path
    icon: mdi:icon-name
    badges: []
    cards:
      - type: card-type
        # card configuration
```

## Common Card Types

### Entities Card
```yaml
type: entities
title: Section Title
entities:
  - entity: sensor.example
    name: Custom Name
    icon: mdi:thermometer
  - entity: switch.example
    secondary_info: last-changed
```

### Vertical Stack
```yaml
type: vertical-stack
cards:
  - type: markdown
    content: "## Header"
  - type: entities
    entities:
      - entity: sensor.example
```

### Horizontal Stack
```yaml
type: horizontal-stack
cards:
  - type: gauge
    entity: sensor.cpu
  - type: gauge
    entity: sensor.memory
```

### Conditional Card
```yaml
type: conditional
conditions:
  - condition: state
    entity: binary_sensor.problem
    state: "on"
card:
  type: markdown
  content: "Warning: Issue detected!"
```

### Grid Layout
```yaml
type: grid
columns: 3
square: false
cards:
  - type: button
    entity: switch.light1
  - type: button
    entity: switch.light2
  - type: button
    entity: switch.light3
```

### Iframe Card
```yaml
type: iframe
url: http://192.168.68.136:8099
aspect_ratio: 100%
```

### Mushroom Cards (Custom)

#### Entity Card
```yaml
type: custom:mushroom-entity-card
entity: sensor.temperature
primary_info: state
secondary_info: name
icon_color: orange
```

#### Chips Card (Status Bar)
```yaml
type: custom:mushroom-chips-card
chips:
  - type: entity
    entity: sensor.cpu
    icon: mdi:cpu-64-bit
  - type: entity
    entity: sensor.memory
    icon: mdi:memory
```

### Mini Graph Card (Custom)

```yaml
type: custom:mini-graph-card
entities:
  - entity: sensor.cpu_usage
    name: CPU
  - entity: sensor.memory_usage
    name: Memory
hours_to_show: 24
points_per_hour: 4
line_width: 2
show:
  labels: true
  points: false
```

## Color Coding Patterns

### Status-Based Colors
```yaml
type: custom:mushroom-entity-card
entity: sensor.status
icon_color: |
  {% if is_state(entity, 'critical') %}
    red
  {% elif is_state(entity, 'warning') %}
    orange
  {% else %}
    green
  {% endif %}
```

### Threshold-Based (Gauge)
```yaml
type: gauge
entity: sensor.battery
min: 0
max: 100
severity:
  green: 50
  yellow: 20
  red: 0
```

## Device Health Dashboard Pattern

### Health Status Summary Card
```yaml
type: entities
title: Device Health Summary
entities:
  - entity: sensor.critical_devices_count
    name: Critical Issues
    icon: mdi:alert-circle
  - entity: sensor.warning_devices_count
    name: Warnings
    icon: mdi:alert
  - entity: sensor.healthy_devices_count
    name: Healthy
    icon: mdi:check-circle
```

### Grouped by Status
```yaml
type: vertical-stack
cards:
  - type: conditional
    conditions:
      - condition: numeric_state
        entity: sensor.critical_count
        above: 0
    card:
      type: markdown
      content: |
        ## Critical Issues
        {{ states('sensor.critical_devices_list') }}
  - type: entities
    title: Warning
    entities:
      - entity: sensor.device1
      - entity: sensor.device2
```

## Container Monitoring Cards

### Container Status Card
```yaml
type: entities
title: Docker Containers
show_header_toggle: false
entities:
  - entity: sensor.waha_status
    name: WAHA (WhatsApp)
    icon: mdi:whatsapp
  - entity: sensor.zigbee2mqtt_status
    name: Zigbee2MQTT
    icon: mdi:zigbee
  - entity: sensor.glances_status
    name: Glances
    icon: mdi:monitor-dashboard
```

### Container Details Table (Markdown)
```yaml
type: markdown
title: Container Details
content: |
  | Container | Version | Status | Memory |
  |-----------|---------|--------|--------|
  | {{ states.sensor.waha_container.attributes.image }} | {{ states.sensor.waha_container.state }} | {{ states.sensor.waha_container.attributes.memory }} |
```

## Action Buttons with Confirmation

### Mushroom Template Card with Confirmation (Recommended)

Best for container management and destructive actions:

```yaml
type: custom:mushroom-template-card
primary: Update WAHA
secondary: Pull latest & recreate
icon: mdi:whatsapp
icon_color: green
tap_action:
  action: call-service
  service: script.update_container
  data:
    container_name: waha
  confirmation:
    text: "Update WAHA container? This will pull the latest image and recreate the container."
```

### Container Management Button Row

Complete set of container action buttons:

```yaml
type: horizontal-stack
cards:
  - type: custom:mushroom-template-card
    primary: Update WAHA
    secondary: Pull latest & recreate
    icon: mdi:whatsapp
    icon_color: green
    tap_action:
      action: call-service
      service: script.update_container
      data:
        container_name: waha
      confirmation:
        text: "Update WAHA container? This will pull the latest image and recreate the container."
  - type: custom:mushroom-template-card
    primary: Update Zigbee2MQTT
    secondary: Pull latest & recreate
    icon: mdi:zigbee
    icon_color: amber
    tap_action:
      action: call-service
      service: script.update_container
      data:
        container_name: zigbee2mqtt
      confirmation:
        text: "Update Zigbee2MQTT container? This will pull the latest image and recreate the container."
  - type: custom:mushroom-template-card
    primary: Update Glances
    secondary: Pull latest & recreate
    icon: mdi:monitor-dashboard
    icon_color: blue
    tap_action:
      action: call-service
      service: script.update_container
      data:
        container_name: glances
      confirmation:
        text: "Update Glances container? This will pull the latest image and recreate the container."
```

### Color-Coded Status Buttons

Dynamic colors based on container state:

```yaml
type: custom:mushroom-template-card
entity: sensor.zigbee2mqtt_status
primary: Zigbee2MQTT
secondary: "{{ states(entity) }}"
icon: mdi:zigbee
icon_color: |
  {% if is_state(entity, 'running') %}
    green
  {% elif is_state(entity, 'stopped') %}
    red
  {% else %}
    orange
  {% endif %}
tap_action:
  action: call-service
  service: script.restart_container
  data:
    container_name: zigbee2mqtt
  confirmation:
    text: "Restart Zigbee2MQTT?"
```

### Button Card (Native)
```yaml
type: button
name: Restart Container
icon: mdi:restart
tap_action:
  action: call-service
  service: script.turn_on
  service_data:
    entity_id: script.restart_waha
```

### Button Row in Entities Card
```yaml
type: entities
entities:
  - type: button
    name: Check Updates
    icon: mdi:update
    action_name: CHECK
    tap_action:
      action: call-service
      service: script.check_container_updates
```

## HA Scripts for Container Actions

Scripts called by dashboard buttons (in `scripts.yaml` or via HA UI):

```yaml
# Update a container - publishes to MQTT for Node-RED to execute
update_container:
  alias: Update Container
  mode: single
  fields:
    container_name:
      description: Name of the container to update
      example: waha
  sequence:
    - action: mqtt.publish
      data:
        topic: pie5/container/update
        payload: "{{ container_name }}"

# Restart a container
restart_container:
  alias: Restart Container
  mode: single
  fields:
    container_name:
      description: Name of the container to restart
      example: zigbee2mqtt
  sequence:
    - action: mqtt.publish
      data:
        topic: pie5/container/restart
        payload: "{{ container_name }}"

# Stop a container
stop_container:
  alias: Stop Container
  mode: single
  fields:
    container_name:
      description: Name of the container to stop
      example: glances
  sequence:
    - action: mqtt.publish
      data:
        topic: pie5/container/stop
        payload: "{{ container_name }}"
```

## Tab/View Definitions

### System Monitoring Tab
```yaml
- title: System Health
  path: system-health
  icon: mdi:server
  badges: []
  cards:
    - type: vertical-stack
      cards:
        - type: custom:mushroom-title-card
          title: System Health Overview
        - type: horizontal-stack
          cards:
            - type: gauge
              entity: sensor.pie5_cpu_usage
              name: CPU
            - type: gauge
              entity: sensor.pie5_memory_usage
              name: Memory
            - type: gauge
              entity: sensor.pie5_disk_usage
              name: Disk
```

### Zigbee Network Tab
```yaml
- title: Zigbee Network
  path: zigbee-network
  icon: mdi:zigbee
  badges: []
  cards:
    - type: vertical-stack
      cards:
        - type: entities
          title: Network Status
          entities:
            - entity: sensor.zigbee2mqtt_coordinator_version
            - entity: binary_sensor.zigbee2mqtt_connection_state
            - entity: switch.zigbee2mqtt_permit_join
```

## Integration with hass-mcp

When creating dashboards, use hass-mcp tools to:
1. `search_entities_tool` - Find entities to display
2. `list_entities` - Get all entities of a domain
3. `get_entity` - Check entity attributes for card configuration
4. `call_service_tool` - Test service calls before adding buttons

## UI Editing Tips (Chrome DevTools)

When editing dashboards via browser automation:

1. **Navigate to dashboard edit mode**: Click 3-dot menu → Edit Dashboard
2. **Add card via UI**: Click "+ ADD CARD" → Manual → paste YAML
3. **YAML in code editor**: The editor is a `ha-code-editor` inside shadow DOM
4. **JavaScript to set YAML** (when fill command fails):
   ```javascript
   const editor = document.querySelector('ha-dialog ha-code-editor');
   if (editor && editor.shadowRoot) {
     const cm = editor.shadowRoot.querySelector('.cm-content');
     if (cm) cm.innerText = yamlContent;
   }
   ```

## References

- [Home Assistant Actions Documentation](https://www.home-assistant.io/dashboards/actions/)
- [Mushroom Cards GitHub](https://github.com/piitaya/lovelace-mushroom)
- [Mini Graph Card](https://github.com/kalkih/mini-graph-card)
- See `references/custom-cards.md` for advanced custom card configurations.
- See `references/template-sensors.md` for creating template sensors to power dashboards.
