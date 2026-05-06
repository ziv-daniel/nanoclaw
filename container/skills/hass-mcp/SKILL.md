---
name: hass-mcp
description: Interact with Home Assistant via MCP tools. Use when querying entity states, controlling devices, searching entities, troubleshooting, or gathering context for Node-RED automation development.
---

# Home Assistant MCP Skill

## Overview

Enable efficient interaction with Home Assistant through MCP tools. Query states, control devices, explore the smart home system, and gather entity context for Node-RED automation development.

## Tool Selection Quick Reference

| Goal | Tool | When to Use |
|------|------|-------------|
| First exploration | `system_overview` | Starting point for unfamiliar HA instance |
| Domain overview | `domain_summary_tool` | Get counts/states before listing entities |
| Find entities | `search_entities_tool` | Know partial name/keyword |
| List by domain | `list_entities` | Need all entities of a type |
| Get entity state | `get_entity` | Know exact entity_id |
| Control device | `entity_action` | Turn on/off/toggle with params |
| Custom service | `call_service_tool` | Domain-specific operations |
| Entity history | `get_history` | Troubleshoot state changes |
| Debug errors | `get_error_log` | System troubleshooting |

## Tool Usage Patterns

### 1. System Exploration (Start Here)
```
system_overview → domain_summary_tool(domain) → list_entities(domain)
```
Use `system_overview` first to understand what's available, then drill down.

### 2. Entity State Queries

**Lean query (default)** - Most token-efficient:
```python
get_entity(entity_id="light.living_room")
# Returns: state only
```

**Specific fields** - When you need attributes:
```python
get_entity(entity_id="climate.living_room_ac", 
           fields=["state", "attr.temperature", "attr.current_temperature"])
```

**Detailed** - Full inspection (use sparingly):
```python
get_entity(entity_id="cover.parents_cover_cover_0", detailed=True)
```

### 3. Entity Search Strategies

**By keyword**:
```python
search_entities_tool(query="temperature", limit=20)
# Returns: matches with domain counts
```

**By domain**:
```python
list_entities(domain="climate")  # All AC units
list_entities(domain="cover")    # All covers
list_entities(domain="person")   # Presence tracking
```

**Combined search**:
```python
list_entities(domain="sensor", search_query="battery")
```

### 4. Device Control

**Simple on/off/toggle**:
```python
entity_action(entity_id="switch.living_room_light_switch", action="on")
entity_action(entity_id="switch.stove_light", action="toggle")
```

**With parameters**:
```python
# Light with brightness
entity_action(entity_id="light.parents_bathroom_light", action="on",
              params={"brightness": 255, "color_temp": 400})

# Climate control
entity_action(entity_id="climate.living_room_ac", action="on",
              params={"temperature": 24, "hvac_mode": "cool"})

# Cover position
entity_action(entity_id="cover.parents_cover_cover_0", action="on",
              params={"position": 50})
```

### 5. Service Calls (Advanced)

Use `call_service_tool` for operations not covered by `entity_action`:

```python
# Cover specific position
call_service_tool(domain="cover", service="set_cover_position",
                  data={"entity_id": "cover.kitchen_cover_cover_0", "position": 75})

# Climate fan mode
call_service_tool(domain="climate", service="set_fan_mode",
                  data={"entity_id": "climate.office_ac", "fan_mode": "auto"})

# Script execution
call_service_tool(domain="script", service="turn_on",
                  data={"entity_id": "script.send_critical_telegram"})
```

### 6. History & Troubleshooting

```python
# 24-hour history (default)
get_history(entity_id="sensor.living_room_1_temperature_sensor_temperature")

# Extended history
get_history(entity_id="climate.kids_room_ac", hours=72)

# Error log analysis
get_error_log()
# Returns: error_count, warning_count, integration_mentions
```

## Entity Naming Conventions

### Common Patterns in This System

| Device Type | Pattern | Examples |
|-------------|---------|----------|
| Shelly Covers | `cover.{room}_cover_cover_0` | `cover.parents_cover_cover_0`, `cover.kitchen_cover_cover_0` |
| Shelly Switches | `switch.{room}_light_switch` or `switch.{room}_light_switch_0` | `switch.living_room_light_switch` |
| Tuya Switches | `switch.{room}_light` | `switch.office_light`, `switch.benaya_light` |
| Kitchen Lights | `switch.kitchen_light_{zone}` | `switch.kitchen_light_sink`, `switch.kitchen_light_spots` |
| Gree AC | `climate.{room}_ac` | `climate.living_room_air_conditioner`, `climate.parents_room_ac` |
| Temperature | `sensor.{room}_temperature_sensor_temperature` | `sensor.kitchen_temperature_sensor_temperature` |
| Humidity | `sensor.{room}_temperature_sensor_humidity` | `sensor.guest_temperature_sensor_humidity` |
| Motion | `binary_sensor.{room}_motion_detection_occupancy` | `binary_sensor.office_motion_detection_occupancy` |
| Presence | `person.{name}` | `person.ziv`, `person.adaya` |
| Outdoor | `switch.front_yard_light_switch_0`, `switch.backyard_lights_*` | Front/backyard variations |

## Domain Quick Reference

### switch
Actions: `on`, `off`, `toggle`
```python
entity_action(entity_id="switch.stairs_lights", action="on")
```

### cover
Actions: `on` (open), `off` (close), `toggle`
Params: `position` (0-100, 0=closed)
```python
entity_action(entity_id="cover.dining_room_cover_cover_0", action="on",
              params={"position": 100})  # Fully open
```

### climate
Actions: `on`, `off`
Params: `temperature`, `hvac_mode` (cool/heat/auto/fan_only/dry/off)
```python
entity_action(entity_id="climate.guest_room_ac", action="on",
              params={"temperature": 23, "hvac_mode": "cool"})
```

### light
Actions: `on`, `off`, `toggle`
Params: `brightness` (0-255), `color_temp`, `rgb_color`, `transition`
```python
entity_action(entity_id="light.parents_bathroom_light", action="on",
              params={"brightness": 200})
```

### sensor / binary_sensor
Read-only - use `get_entity` to check state
```python
get_entity(entity_id="sensor.home_temperature")
get_entity(entity_id="binary_sensor.jewish_calendar_issur_melacha_in_effect")
```

### person
Read-only presence tracking
States: `home`, `not_home`, or zone name
```python
get_entity(entity_id="person.ziv")  # Check if home
```

## Node-RED Integration Patterns

### Gathering Context for Automation Development

Before creating Node-RED flows, gather relevant entity information:

**1. Identify available entities**:
```python
# For a room-based automation
list_entities(domain="switch", search_query="kitchen")
list_entities(domain="sensor", search_query="kitchen")
```

**2. Check current states**:
```python
get_entity(entity_id="switch.kitchen_light_spots")
get_entity(entity_id="sensor.kitchen_temperature_sensor_temperature")
```

**3. Verify entity attributes for Node-RED nodes**:
```python
get_entity(entity_id="climate.living_room_ac", detailed=True)
# Use attributes in call-service nodes
```

### Entity IDs for Node-RED Nodes

When configuring Node-RED nodes, use exact entity_ids:

| Node Type | Entity Pattern | Example |
|-----------|---------------|---------|
| `events: state` | Any entity | `binary_sensor.office_motion_detection_occupancy` |
| `call-service` (switch) | `switch.*` | `switch.outdoor_pool_switch` |
| `call-service` (cover) | `cover.*` | `cover.living_room_cover_cover_0` |
| `call-service` (climate) | `climate.*` | `climate.parents_room_ac` |
| `current-state` | Any entity | `person.ziv`, `person.adaya` |

### Jewish Calendar Entities

For Shabbat-aware automations:
```python
get_entity(entity_id="binary_sensor.jewish_calendar_issur_melacha_in_effect")
get_entity(entity_id="sensor.jewish_calendar_upcoming_candle_lighting")
get_entity(entity_id="sensor.jewish_calendar_upcoming_havdalah")
get_entity(entity_id="sensor.jewish_calendar_shkia")  # Sunset
get_entity(entity_id="sensor.jewish_calendar_hanetz_hachama")  # Sunrise
```

## Common Tasks

### Check if anyone is home
```python
get_entity(entity_id="person.ziv")
get_entity(entity_id="person.adaya")
# Or use input_number helper:
get_entity(entity_id="input_number.home_occupancy_count")
```

### Get all room temperatures
```python
list_entities(domain="sensor", search_query="temperature")
```

### Control all covers in a room
```python
search_entities_tool(query="cover living room")
# Then control each
entity_action(entity_id="cover.living_room_cover_cover_0", action="off")  # Close
```

### Check AC status across home
```python
list_entities(domain="climate")
# Returns all AC units with current states
```

### Find all battery-powered devices
```python
list_entities(domain="sensor", search_query="battery")
```

## Token Efficiency Guidelines

1. **Start lean**: Use `list_entities` without `detailed=True`
2. **Use field filtering**: Specify only needed fields with `fields=[]`
3. **Domain first**: Filter by domain before searching
4. **Limit results**: Use `limit` parameter in searches
5. **Avoid repeated calls**: Cache entity IDs when working on related tasks
6. **Skip detailed for state checks**: Basic `get_entity` is sufficient for on/off checks

## Error Handling

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| Entity not found | Wrong entity_id | Use `search_entities_tool` to find correct ID |
| Service not found | Wrong domain/service | Check `call_service_tool` params |
| Unavailable entity | Device offline | Check `get_error_log` for connectivity issues |
| Action failed | Device-specific | Check entity attributes with `detailed=True` |

### Debugging Steps
1. Verify entity exists: `search_entities_tool(query="partial_name")`
2. Check entity state: `get_entity(entity_id, detailed=True)`
3. Review error log: `get_error_log()`
4. Check history: `get_history(entity_id, hours=24)`

## Resources

### references/
- `service_params.md` - Complete service parameters by domain
- `entity_patterns.md` - Entity discovery and naming patterns
- `troubleshooting.md` - Common issues and solutions
