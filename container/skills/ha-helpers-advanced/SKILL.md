---
name: ha-helpers-advanced
description: HA helpers guide - template sensors, thresholds, schedules, entity filtering.
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# Home Assistant Helpers - Advanced Guide

## Overview & Quick Reference

### Helper Type Reference Table

| Helper Type | Use Case | Config Location | UI Create? |
|-------------|----------|-----------------|------------|
| `template` binary_sensor | Derived states (presence, appliance active) | `configuration.yaml` or `/config/templates/` | No |
| `template` sensor | Calculated values (rates, aggregations) | `configuration.yaml` or `/config/templates/` | No |
| `threshold` | Simple above/below triggers | UI or `binary_sensor:` | Yes |
| `trend` | Rising/falling detection | UI or `binary_sensor:` | Yes |
| `derivative` | Rate of change | UI or `sensor:` | Yes |
| `group` | Combine entities | UI or `group:` | Yes |
| `schedule` | Time-based states | UI only | Yes |
| `input_boolean` | Manual toggles/flags | UI or `input_boolean:` | Yes |

### File Organization

```
/config/
├── configuration.yaml      # Main config with !include
├── templates.yaml          # All template sensors (single file)
└── templates/              # OR split by category
    ├── presence.yaml
    ├── appliances.yaml
    ├── environment.yaml
    └── monitoring.yaml
```

**In configuration.yaml:**
```yaml
# Single file approach:
template: !include templates.yaml

# OR directory approach:
template: !include_dir_merge_list templates/
```

---

## Core Helper Patterns

### 1. Presence Detection (Anyone Home)

```yaml
template:
  - binary_sensor:
      - name: "Anyone Home"
        unique_id: anyone_home
        state: >
          {{ is_state('person.ziv', 'home') or is_state('person.adaya', 'home') }}
        device_class: presence
        icon: >
          {% if this.state == 'on' %}mdi:home-account
          {% else %}mdi:home-outline{% endif %}
```

### 2. Appliance Active (Power Threshold)

```yaml
template:
  - binary_sensor:
      - name: "Water Heater Active"
        unique_id: water_heater_active
        state: "{{ states('sensor.dude_power') | float(0) > 50 }}"
        device_class: running
        delay_off: "00:01:00"
        icon: mdi:water-boiler

      - name: "Stove In Use"
        unique_id: stove_in_use
        state: "{{ states('sensor.stove_light_power') | float(0) > 20 }}"
        device_class: heat
        delay_off: "00:02:00"
        icon: mdi:stove
```

### 3. Daytime Helper (Sunrise-Sunset)

```yaml
template:
  - binary_sensor:
      - name: "Daytime"
        unique_id: daytime_hours
        state: "{{ is_state('sun.sun', 'above_horizon') }}"
        device_class: light
```

> **Jewish Calendar**: For Shabbat-aware times, use `sensor.jewish_calendar_upcoming_candle_lighting` and `sensor.jewish_calendar_upcoming_havdalah` from Jewish Calendar integration, or Node-RED `jewishtimer` node.

### 4. Shabbat Mode

```yaml
template:
  - binary_sensor:
      - name: "Shabbat Mode"
        unique_id: shabbat_mode
        state: "{{ is_state('binary_sensor.jewish_calendar_issur_melacha_in_effect', 'on') }}"
        icon: >
          {% if this.state == 'on' %}mdi:candle
          {% else %}mdi:candle-off{% endif %}
```

### 5. Mold Risk Indicator

```yaml
template:
  - sensor:
      - name: "Mold Risk Parents Room"
        unique_id: mold_risk_parents_room
        state: >
          {% set indoor_temp = states('sensor.parents_temperature_sensor_temperature') | float(25) %}
          {% set indoor_humidity = states('sensor.parents_temperature_sensor_humidity') | float(50) %}
          {% set outdoor_temp = states('sensor.home_temperature') | float(25) %}
          {% set critical = (indoor_temp - outdoor_temp) * 2.5 + 75 %}
          {% if indoor_humidity >= critical %}high
          {% elif indoor_humidity >= critical - 10 %}moderate
          {% else %}safe{% endif %}
        icon: >
          {% if this.state == 'high' %}mdi:alert-circle
          {% elif this.state == 'moderate' %}mdi:alert
          {% else %}mdi:check-circle{% endif %}
        attributes:
          indoor_temp: "{{ states('sensor.parents_temperature_sensor_temperature') }}"
          indoor_humidity: "{{ states('sensor.parents_temperature_sensor_humidity') }}"
          outdoor_temp: "{{ states('sensor.home_temperature') }}"
```

### 6. All Covers Closed

```yaml
template:
  - binary_sensor:
      - name: "All Covers Closed"
        unique_id: all_covers_closed
        state: >
          {{ is_state('cover.parents_cover_cover_0', 'closed') and
             is_state('cover.living_room_cover_cover_0', 'closed') and
             is_state('cover.dining_room_cover_cover_0', 'closed') and
             is_state('cover.kitchen_cover_cover_0', 'closed') and
             is_state('cover.kids_room_cover_cover_0', 'closed') and
             is_state('cover.benaya_room_cover_cover_0', 'closed') and
             is_state('cover.guest_room_cover_cover_0', 'closed') }}
        device_class: window
```

### 7. Any AC Running

```yaml
template:
  - binary_sensor:
      - name: "Any AC Running"
        unique_id: any_ac_running
        state: >
          {{ states.climate
             | selectattr('state', 'in', ['cool', 'heat', 'heat_cool', 'fan_only'])
             | list | length > 0 }}
        device_class: running
        icon: mdi:air-conditioner
```

---

## Entity Filtering Strategies

Template sensors that iterate over entities often catch unwanted items. This section covers proper filtering techniques.

### The Problem

- Battery sensors matching phone/tablet batteries instead of IoT devices
- Power sensors matching by name pattern instead of actual battery levels
- Self-referential loops (sensor counting itself)
- Using `'battery' in entity_id` catches power/cycle sensors

### Strategy 1: Use device_class Instead of String Matching

**Bad - catches false positives:**
```jinja2
{% if 'battery' in state.entity_id %}
```

**Good - only actual battery sensors:**
```jinja2
{% if state.attributes.device_class == 'battery' %}
```

### Strategy 2: Exclusion List Pattern

Filter out device categories like phones, tablets, laptops:

```jinja2
{% set excluded = ['phone', 'tablet', 'ipad', 'iphone', 'android', 'mobile', 'laptop'] %}
{% set entity_lower = state.entity_id | lower %}
{% set name_lower = state.name | lower %}
{% set is_excluded = excluded | select('in', entity_lower) | list | count > 0
                  or excluded | select('in', name_lower) | list | count > 0 %}
{% if not is_excluded %}
  {# Process entity #}
{% endif %}
```

### Strategy 3: Whitelist Approach

For stricter control, use inclusion instead of exclusion:

```jinja2
{% set included_patterns = ['fingerbot', 'motion', 'door', 'window', 'temperature', 'zigbee'] %}
{% set is_included = included_patterns | select('in', entity_lower) | list | count > 0 %}
{% if is_included %}
  {# Process entity #}
{% endif %}
```

### Common device_class Values

| device_class | Use Case |
|-------------|----------|
| `battery` | Battery level percentage |
| `temperature` | Temperature sensors |
| `humidity` | Humidity sensors |
| `motion` | Motion detection |
| `door` | Door open/closed |
| `window` | Window open/closed |
| `power` | Power consumption (W) |
| `energy` | Energy usage (kWh) |
| `presence` | Occupancy/presence |
| `running` | Appliance running state |
| `heat` | Heat/stove detection |
| `light` | Daylight/light level |
| `cold` | Cooling detection |

### Low Battery Monitor (Basic)

Simple version without filtering (may catch phones):

```yaml
template:
  - sensor:
      - name: "Low Battery Devices"
        unique_id: low_battery_devices
        state: >
          {% set threshold = 20 %}
          {% set ns = namespace(low=[]) %}
          {% for state in states.sensor if 'battery' in state.entity_id
             and state.state | int(100) < threshold
             and state.state | int(-1) >= 0 %}
            {% set ns.low = ns.low + [state.name | replace(' Battery', '')] %}
          {% endfor %}
          {{ ns.low | length }}
        unit_of_measurement: "devices"
        icon: >
          {% if this.state | int(0) > 0 %}mdi:battery-alert
          {% else %}mdi:battery-check{% endif %}
        attributes:
          devices: >
            {% set threshold = 20 %}
            {% set ns = namespace(low=[]) %}
            {% for state in states.sensor if 'battery' in state.entity_id
               and state.state | int(100) < threshold
               and state.state | int(-1) >= 0 %}
              {% set ns.low = ns.low + [state.name ~ ': ' ~ state.state ~ '%'] %}
            {% endfor %}
            {{ ns.low }}
```

### Low Battery Monitor (Advanced with Filtering)

IoT devices only, excludes phones/tablets:

```yaml
template:
  - sensor:
      - name: "Low Battery Devices"
        unique_id: low_battery_devices
        unit_of_measurement: "devices"
        state: >
          {% set threshold = 20 %}
          {% set excluded = ['phone', 'tablet', 'ipad', 'iphone', 'android', 'mobile'] %}
          {% set ns = namespace(count=0) %}
          {% for state in states.sensor %}
            {% set entity_lower = state.entity_id | lower %}
            {% set name_lower = state.name | lower %}
            {% set is_excluded = excluded | select('in', entity_lower) | list | count > 0
                              or excluded | select('in', name_lower) | list | count > 0 %}
            {% if state.attributes.device_class == 'battery'
               and state.state not in ['unavailable', 'unknown']
               and state.state | int(100) < threshold
               and not is_excluded %}
              {% set ns.count = ns.count + 1 %}
            {% endif %}
          {% endfor %}
          {{ ns.count }}
        icon: >
          {% if this.state | int(0) > 0 %}mdi:battery-alert
          {% else %}mdi:battery-check{% endif %}
        attributes:
          devices: >
            {% set threshold = 20 %}
            {% set excluded = ['phone', 'tablet', 'ipad', 'iphone', 'android', 'mobile'] %}
            {% set ns = namespace(devices=[]) %}
            {% for state in states.sensor %}
              {% set entity_lower = state.entity_id | lower %}
              {% set name_lower = state.name | lower %}
              {% set is_excluded = excluded | select('in', entity_lower) | list | count > 0
                                or excluded | select('in', name_lower) | list | count > 0 %}
              {% if state.attributes.device_class == 'battery'
                 and state.state not in ['unavailable', 'unknown']
                 and state.state | int(100) < threshold
                 and not is_excluded %}
                {% set ns.devices = ns.devices + [state.name ~ ': ' ~ state.state ~ '%'] %}
              {% endif %}
            {% endfor %}
            {{ ns.devices }}
```

### Filtering Notes

- The `select('in', string)` pattern checks if any list item is a substring of the string
- Always check both `entity_id` and `name` for comprehensive filtering
- Use `| lower` to make matching case-insensitive
- The namespace pattern (`ns = namespace(...)`) is required for mutable variables in Jinja2 loops
- Consider adding integration-specific exclusions (e.g., `companion_app` for HA mobile app)

---

## Complex Calculations

### Temperature Trend (AC Effectiveness)

```yaml
template:
  - binary_sensor:
      - name: "Parents Room Temp Falling"
        unique_id: parents_room_temp_falling
        state: >
          {% set current = states('sensor.parents_temperature_sensor_temperature') | float %}
          {% set target = state_attr('climate.parents_room_ac', 'temperature') | float(24) %}
          {{ current > target and is_state('climate.parents_room_ac', 'cool') }}
        device_class: cold
```

### Room Occupancy Count

```yaml
template:
  - sensor:
      - name: "People Home Count"
        unique_id: people_home_count
        state: >
          {% set count = 0 %}
          {% if is_state('person.ziv', 'home') %}{% set count = count + 1 %}{% endif %}
          {% if is_state('person.adaya', 'home') %}{% set count = count + 1 %}{% endif %}
          {{ count }}
        unit_of_measurement: "people"
        icon: mdi:account-group
```

### Mold Risk Formula

The mold risk calculation uses this formula:
```
critical_humidity = (indoor_temp - outdoor_temp) * 2.5 + 75
```

- **High risk**: humidity >= critical
- **Moderate risk**: humidity >= critical - 10
- **Safe**: humidity < critical - 10

---

## Decision Matrix: Helper vs Node-RED

### Create Helper When:

| Scenario | Reason |
|----------|--------|
| State needed by multiple flows/automations | Single source of truth |
| Simple logic (threshold, presence, group) | Less overhead than flow |
| Want entity in HA UI/dashboards | Direct visibility |
| Replacing duplicated Node-RED logic | Consolidation |
| Need delay_on/delay_off debouncing | Built-in capability |
| State change history in Recorder | Automatic tracking |

### Keep in Node-RED When:

| Scenario | Reason |
|----------|--------|
| Complex conditional logic | More flexible coding |
| Timing sequences (delays, schedules) | Flow control nodes |
| External integrations (Telegram, MQTT) | Direct connectors |
| One-off automations | Not worth helper overhead |
| Requires external API calls | Node-RED HTTP nodes |
| Complex state machines | Easier to visualize |

### Migration Priority

| Priority | Old Node-RED Pattern | Replace With Helper |
|----------|---------------------|---------------------|
| 1 | Multiple "person home" checks | `binary_sensor.anyone_home` |
| 2 | Power threshold comparisons | `binary_sensor.water_heater_active` |
| 3 | Daytime/nighttime conditions | `binary_sensor.daytime` |
| 4 | Battery level iteration | `sensor.low_battery_devices` |
| 5 | Multiple cover state checks | `binary_sensor.all_covers_closed` |

---

## Node-RED Integration Patterns

### Migration Examples

**Before: Multiple Person Checks**
```json
{
  "type": "api-current-state",
  "entity_id": "person.ziv",
  "halt_if": "home",
  "halt_if_type": "is"
}
```
Then another node for `person.adaya`, with complex routing.

**After: Single Helper Check**
```json
{
  "type": "api-current-state",
  "entity_id": "binary_sensor.anyone_home",
  "halt_if": "on",
  "halt_if_type": "is"
}
```

### Common Flow Pattern Updates

**Presence-Gated Automation:**
```
Before: [Trigger] -> [Check Ziv Home?] -> [Check Adaya Home?] -> [Either home?] -> [Action]
After:  [Trigger] -> [Check binary_sensor.anyone_home] -> [Action]
```

**Outdoor Lights Daytime Control:**
```
Before: [Time trigger] -> [Chronos filter nighttime] -> [Turn off lights]
After:  [Time trigger] -> [Check binary_sensor.daytime = on] -> [Turn off lights]
```

**Battery Alert Flow:**
```
Before: [Daily trigger] -> [Get all entities] -> [Filter battery < 20%] -> [Build list] -> [Notify]
After:  [Daily trigger] -> [Get sensor.low_battery_devices] -> [If state > 0] -> [Read devices attr] -> [Notify]
```

### Node Configuration Examples

See `references/node-red-integration.md` for complete JSON examples of:
- Current State Node (v6/v7) configuration
- Events State Node (Watch Helper Changes)
- Flow update step-by-step process

---

## Verification & Reload

### Check Configuration

```bash
ha core check
```

Or via SSH:
```bash
docker exec homeassistant ha core check
```

### Reload Without Restart

**Developer Tools -> YAML -> Reload Template Entities**

Or call service:
```yaml
service: homeassistant.reload_config_entry
```

### Verification Steps

1. **Check sensor state**: Developer Tools > States > `sensor.low_battery_devices`
2. **Verify attributes**: Confirm `devices` attribute contains only expected device types
3. **Test filtering**: Ensure phones/tablets are not in the list
4. **Debug threshold**: Temporarily lower threshold to catch more devices

### Testing Checklist

After creating helpers and updating flows:

- [ ] Helper appears in Developer Tools -> States
- [ ] Helper state updates correctly when source entities change
- [ ] Node-RED flow receives correct state from helper
- [ ] Automation triggers as expected
- [ ] Old redundant nodes removed
- [ ] Flow exported and backed up

---

## UI-Only Helpers

These are best created via Settings -> Helpers:

### Schedule Helper
- Name: "Quiet Hours"
- Time blocks: 22:00-07:00 daily

### Threshold (Generic Binary Sensor)
- Entity: `sensor.parents_temperature_sensor_temperature`
- Upper limit: 28
- Hysteresis: 1

### Derivative Sensor
- Entity: `sensor.living_room_1_temperature_sensor_temperature`
- Time window: 10 minutes
- Unit: C/h

---

## References

- `references/yaml-templates.md` - Complete YAML configurations for all helpers
- `references/node-red-integration.md` - Flow migration patterns and examples
- [Home Assistant Template Integration](https://www.home-assistant.io/integrations/template/)
- [Home Assistant Sensor Device Classes](https://www.home-assistant.io/integrations/sensor/#device-class)
- [Jinja2 Template Designer Documentation](https://jinja.palletsprojects.com/en/3.1.x/templates/)
