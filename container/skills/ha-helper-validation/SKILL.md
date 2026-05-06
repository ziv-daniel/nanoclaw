---
name: ha-helper-validation
description: |
  Validate and troubleshoot Home Assistant helpers (template sensors, threshold sensors,
  derivative sensors, input booleans). Use when: (1) helpers show "unknown" or "unavailable"
  states, (2) template sensors not updating, (3) threshold/derivative sensors behaving
  unexpectedly, (4) need to audit helper configurations, (5) migrating from legacy to
  modern template format. Covers common mistakes, validation checklist, and debugging steps.
author: Claude Code
version: 2.0.0
date: 2026-01-22
---

# Home Assistant Helper Validation

## Problem

Home Assistant helpers can fail silently or produce incorrect results due to configuration
errors, missing entities, incorrect template syntax, or flawed logic/formulas.

## Part 1: Scientific Foundations

### Mold Risk Calculation

**Proper Approach: Dew Point Method**

Mold risk is best calculated using dew point temperature. When surface temperature approaches
dew point, condensation forms and mold can grow.

**Magnus-Tetens Formula (Dew Point):**
```
a = 17.625
b = 243.04  # °C

gamma = ln(RH/100) + (a * T) / (b + T)
dew_point = (b * gamma) / (a - gamma)
```

Where:
- T = temperature in Celsius
- RH = relative humidity in percent (0-100)
- dew_point = dew point temperature in Celsius

**Mold Risk Thresholds:**
- **Safe:** Surface humidity < 70%
- **Warning:** Surface humidity 70-80%
- **High Risk:** Surface humidity > 80%
- **Condensation:** Surface humidity = 100% (surface temp = dew point)

**Home Assistant Built-in Integration:**
Home Assistant has a `mold_indicator` integration that does this correctly:
```yaml
sensor:
  - platform: mold_indicator
    indoor_temp_sensor: sensor.indoor_temperature
    indoor_humidity_sensor: sensor.indoor_humidity
    outdoor_temp_sensor: sensor.outdoor_temperature
    calibration_factor: 2.0  # Adjust based on wall insulation
```

**Simple Critical Point Formula (Alternative):**
```jinja2
{% set critical_humidity = (indoor_temp - outdoor_temp) * 2.5 + 75 %}
{# This approximates when indoor humidity becomes problematic #}
```

### Battery Monitoring Thresholds

**Industry Standard Thresholds:**
- **Good:** > 50%
- **Warning:** 20-50% (notification recommended)
- **Low:** 10-20% (urgent replacement needed)
- **Critical:** < 10% (immediate replacement)

For IoT devices, **20%** is the standard warning threshold.

### Daytime Detection

**Best Approaches:**

1. **Sun Elevation (Most Accurate):**
```jinja2
{{ state_attr('sun.sun', 'elevation') | float > 0 }}
```
- Positive elevation = sun above horizon
- Works globally without timezone issues

2. **Sun State:**
```jinja2
{{ is_state('sun.sun', 'above_horizon') }}
```

3. **Civil Twilight (Better for Lighting):**
```jinja2
{{ state_attr('sun.sun', 'elevation') | float > -6 }}
```
- Civil twilight: -6° to 0°
- Still enough light to see outside

### Temperature Sensor Placement

**Best Practices:**
- Mount 4-5 feet (1.2-1.5m) off the ground
- Center of room, away from walls
- Avoid: direct sunlight, near vents/HVAC, exterior walls, windows
- Ensure good airflow around sensor
- Calibrate against known accurate thermometer

---

## Part 2: Helper Types and Validation

### 1. Input Boolean Helpers

**Purpose:** Manual toggles for modes (guest mode, vacation mode, night mode)

**Validation Checklist:**
- [ ] Entity exists: `input_boolean.<name>`
- [ ] Has meaningful name and icon
- [ ] Initial state set appropriately (or restore previous state)
- [ ] Used in at least one automation condition or trigger

**Common Issues:**
- Forgotten/unused toggles cluttering the system
- No automations actually use them

### 2. Threshold Binary Sensors

**Purpose:** Convert numeric sensor to binary on/off based on threshold

**Validation Checklist:**
- [ ] Source entity exists and has numeric state
- [ ] Threshold value is scientifically/practically correct
- [ ] Hysteresis set to prevent flapping (typically 10-20% of threshold)
- [ ] Upper/lower limits correctly configured

**Threshold Guidelines by Use Case:**

| Use Case | Suggested Threshold | Hysteresis |
|----------|---------------------|------------|
| Water heater active | 50-100W | 10-20W |
| Stove in use | 50-100W (induction: 200W+) | 20-50W |
| Room occupied (motion) | n/a (binary) | n/a |
| High temperature | varies | 1-2°C |
| Low battery | 20% | 5% |

**Configuration Pattern:**
```yaml
binary_sensor:
  - platform: threshold
    name: "Water Heater Active"
    entity_id: sensor.water_heater_power
    upper: 50
    hysteresis: 10
```

### 3. Derivative Sensors

**Purpose:** Calculate rate of change (e.g., temperature rising/falling)

**Validation Checklist:**
- [ ] Source entity exists and updates regularly
- [ ] `time_window` set (prevents spikes and zeros)
- [ ] `unit_time` matches expected output (s, min, h, d)
- [ ] Source updates frequently enough

**Known Issue:** Derivative stays at zero when source value doesn't change.

**Configuration Pattern:**
```yaml
sensor:
  - platform: derivative
    name: "Temperature Change Rate"
    source: sensor.room_temperature
    unit_time: min
    time_window: "00:05:00"
    round: 2
```

**Interpretation:**
- Positive value = increasing (warming)
- Negative value = decreasing (cooling)
- Near zero = stable

### 4. Template Sensors

**Purpose:** Custom sensors with Jinja2 logic

**Validation Checklist:**
- [ ] Uses modern `template:` format
- [ ] All referenced entities exist
- [ ] Uses `states()` function, not direct state access
- [ ] Has `| float(default)` or `| int(default)` for numbers
- [ ] Has `unique_id` for persistence
- [ ] Logic/formulas are scientifically correct
- [ ] State value is under 255 characters

**Common Template Patterns:**

**Anyone Home (Presence):**
```jinja2
{{ is_state('person.user1', 'home') or is_state('person.user2', 'home') }}
```

**Daytime Detection:**
```jinja2
{{ state_attr('sun.sun', 'elevation') | float > 0 }}
```

**Low Battery Count:**
```jinja2
{% set threshold = 20 %}
{% set count = states.sensor
   | selectattr('attributes.device_class', 'eq', 'battery')
   | rejectattr('state', 'in', ['unavailable', 'unknown'])
   | map(attribute='state')
   | map('int', 100)
   | select('lt', threshold)
   | list | count %}
{{ count }}
```

**Mold Risk (Proper Dew Point):**
```jinja2
{% set T = states('sensor.indoor_temp') | float(20) %}
{% set RH = states('sensor.indoor_humidity') | float(50) %}
{% set a = 17.625 %}
{% set b = 243.04 %}
{% set gamma = (RH/100) | log + (a * T) / (b + T) %}
{% set dew_point = (b * gamma) / (a - gamma) %}
{% set outdoor_temp = state_attr('weather.home', 'temperature') | float(15) %}
{# Risk when wall temp approaches dew point #}
{% set wall_temp = outdoor_temp + (T - outdoor_temp) * 0.3 %}
{% if wall_temp <= dew_point + 3 %}high
{% elif wall_temp <= dew_point + 6 %}moderate
{% else %}safe{% endif %}
```

---

## Part 3: Debugging Workflow

### Step 1: Check Entity Exists
```jinja2
{{ states('sensor.my_sensor') }}
{# 'unknown' means entity doesn't exist #}
```

### Step 2: Check Referenced Entities
For template sensors, verify ALL referenced entities:
```jinja2
Indoor temp: {{ states('sensor.indoor_temp') }}
Indoor humidity: {{ states('sensor.indoor_humidity') }}
Outdoor temp: {{ state_attr('weather.home', 'temperature') }}
```

### Step 3: Test Template Logic
Use **Developer Tools > Template** to test Jinja2 code before saving.

### Step 4: Check Logs
**Settings > System > Logs** - filter for your entity name

### Step 5: Reload
**Developer Tools > YAML > Reload Template Entities**

---

## Part 4: Common Mistakes

1. **Wrong entity type for state_attr():**
```jinja2
{# WRONG - sensor doesn't have 'temperature' attribute #}
{{ state_attr('sensor.outdoor_temp', 'temperature') }}

{# RIGHT - weather entity has temperature attribute #}
{{ state_attr('weather.home', 'temperature') }}
```

2. **Missing default values:**
```jinja2
{# WRONG - returns 'unknown' string if entity missing #}
{{ states('sensor.temp') | float }}

{# RIGHT - provides fallback #}
{{ states('sensor.temp') | float(20) }}
```

3. **Comparing strings as numbers:**
```jinja2
{# WRONG #}
{% if states('sensor.temp') > 25 %}

{# RIGHT #}
{% if states('sensor.temp') | float(0) > 25 %}
```

4. **Using deprecated/wrong sensor names:**
- Weather entities: Use `weather.forecast_home` or `weather.home`
- Sun elevation: Use `state_attr('sun.sun', 'elevation')`

---

## References

### Home Assistant Documentation
- [Template Integration](https://www.home-assistant.io/integrations/template/)
- [Threshold Integration](https://www.home-assistant.io/integrations/threshold/)
- [Derivative Integration](https://www.home-assistant.io/integrations/derivative)
- [Mold Indicator Integration](https://www.home-assistant.io/integrations/mold_indicator/)
- [Sun Integration](https://www.home-assistant.io/integrations/sun)

### Scientific References
- [Dew Point Calculator (Magnus Formula)](https://www.omnicalculator.com/physics/dew-point)
- [Temperature vs Humidity for Mold Prevention (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9319059/)
- [Mold Chart for Monitoring](https://energyhandyman.com/knowledge-library/mold-chart-for-temperature-and-humidity-monitors/)
- [IoT Battery Monitoring Best Practices](https://interrupt.memfault.com/blog/monitoring-battery-life)
- [Temperature Sensor Placement Guide](https://www.rikasensor.com/a-the-ultimate-guide-to-installing-and-calibrating-ambient-temperature-sensors.html)
