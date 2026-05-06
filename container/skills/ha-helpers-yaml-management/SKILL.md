---
name: ha-helpers-yaml-management
description: |
  Complete workflow for Home Assistant YAML helper management: create, configure includes, upload, and verify.
  Use when: (1) creating template sensors/binary_sensors that need YAML files, (2) confusion about
  !include vs !include_dir_merge_list syntax, (3) need to upload YAML to HA remotely, (4) template
  sensors not appearing after restart, (5) "Invalid config" errors with template includes,
  (6) setting up modular YAML configuration with separate files.
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# Home Assistant YAML Helpers Management

## Overview

This skill covers the complete workflow for managing Home Assistant YAML-based helpers:

1. **Create** - Write properly formatted YAML files locally
2. **Configure Includes** - Set up configuration.yaml with correct include syntax
3. **Upload** - Transfer files to Home Assistant via Samba, SSH, or pie5-ssh
4. **Verify** - Validate configuration and reload entities

## When to Use This Skill

- Creating template sensors with Jinja2 templates (UI doesn't support these)
- Template sensors don't appear after HA restart
- "Invalid config for [template]" errors
- Confusion about `!include` vs `!include_dir_merge_list`
- Moving inline template sensors to separate files
- Need to upload configuration files to /config/helpers/ directory
- File Editor automation fails due to iframe issues
- Batch-uploading multiple YAML configuration files

---

## Part 1: YAML Include Syntax

### The Core Problem

When creating separate YAML files for template sensors and including them in configuration.yaml,
the file format must match how they're included. A common mistake is wrapping content in
`template:` when the file is already being included as a list item under `template:`.

### Understanding Include Types

| Include Type | Use Case | File Format |
|-------------|----------|-------------|
| `!include file.yaml` | Single file as list item | Direct content (no wrapper) |
| `!include_dir_list dir/` | Directory of files, each as list item | Direct content per file |
| `!include_dir_merge_list dir/` | Merge all files into single list | Direct content per file |
| `!include_dir_named dir/` | Files as named keys | Content with unique keys |

### Correct Format for Template Includes

**configuration.yaml:**
```yaml
template:
  - !include helpers/template_sensors.yaml
  - !include helpers/mold_indicators.yaml
```

**helpers/template_sensors.yaml (CORRECT - no wrapper):**
```yaml
# Direct content - no template: wrapper needed
binary_sensor:
  - name: "Anyone Home"
    unique_id: anyone_home
    state: >
      {{ is_state('person.john', 'home') }}

sensor:
  - name: "Battery Count"
    unique_id: low_battery_count
    state: "{{ states.sensor | selectattr('attributes.device_class', 'eq', 'battery') | list | count }}"
```

**WRONG - with wrapper:**
```yaml
# This is WRONG when included as list item
template:
  binary_sensor:
    - name: "Anyone Home"
      # ...
```

### Why This Format Matters

The `template:` integration in HA expects a list of template configurations:

```yaml
template:
  - binary_sensor: [...]    # First list item
  - sensor: [...]           # Second list item
  - trigger: [...]          # Third list item (trigger-based)
```

When you use `!include`, the file content becomes that list item. So the file should
contain what goes INSIDE the list item, not the parent key.

### Directory-Based Organization

For larger setups, use directory includes:

**configuration.yaml:**
```yaml
template: !include_dir_merge_list helpers/templates/
```

**helpers/templates/presence.yaml:**
```yaml
binary_sensor:
  - name: "Anyone Home"
    state: "{{ is_state('group.family', 'home') }}"
```

**helpers/templates/environment.yaml:**
```yaml
sensor:
  - name: "Average Temperature"
    state: "{{ states.sensor | selectattr('attributes.device_class', 'eq', 'temperature') | map(attribute='state') | map('float') | average }}"
```

### Example: Complete Migration

**Before (inline in configuration.yaml):**
```yaml
template:
  - binary_sensor:
      - name: "Daytime"
        state: "{{ state_attr('sun.sun', 'elevation') > 0 }}"
```

**After (separate file):**

configuration.yaml:
```yaml
template:
  - !include helpers/daytime.yaml
```

helpers/daytime.yaml:
```yaml
binary_sensor:
  - name: "Daytime"
    unique_id: daytime_sensor
    state: "{{ state_attr('sun.sun', 'elevation') > 0 }}"
    icon: >
      {% if this.state %}
        mdi:weather-sunny
      {% else %}
        mdi:weather-night
      {% endif %}
```

---

## Part 2: Uploading YAML Files

Some Home Assistant helpers require YAML files that cannot be created via the UI. The File Editor
add-on uses nested iframes that are difficult to automate with Playwright/browser tools.

### Method 1: Samba Share (Recommended)

**Prerequisites:**
- Samba add-on installed in Home Assistant
- Credentials in .env file or environment

**Using smbclient (Windows/Linux/Mac):**
```bash
# Single file upload
smbclient //${HA_IP}/config -U ${HA_USERNAME}%${HA_PASSWORD} -c "put local_file.yaml helpers/remote_file.yaml"

# Multiple files
smbclient //${HA_IP}/config -U ${HA_USERNAME}%${HA_PASSWORD} << EOF
mkdir helpers
put template_sensors.yaml helpers/template_sensors.yaml
put mold_indicators.yaml helpers/mold_indicators.yaml
exit
EOF

# Windows with net use
net use \\${HA_IP}\config /user:${HA_USERNAME} ${HA_PASSWORD}
copy template_sensors.yaml \\${HA_IP}\config\helpers\
```

### Method 2: SSH/SFTP

**Prerequisites:**
- SSH add-on installed with authorized_keys configured

```bash
# Using sftp
sftp root@${HA_IP}:/config/helpers/ << EOF
put template_sensors.yaml
put mold_indicators.yaml
EOF

# Using scp
scp *.yaml root@${HA_IP}:/config/helpers/
```

### Method 3: pie5-ssh MCP (Docker/Container installations)

If using hass-mcp with pie5-ssh for container-based HA:

```bash
# Use the pie5-ssh MCP tool to execute commands on the HA host
# Then copy files to the container's config volume
docker cp local_file.yaml homeassistant:/config/helpers/
```

### Environment File Template

Create `.env` file in your working directory:
```env
HA_IP=192.168.x.x
HA_USERNAME=your_username
HA_PASSWORD=your_password
HA_URL=https://your-ha-url/
```

### Post-Upload: Update configuration.yaml

After uploading YAML files, you MUST update configuration.yaml with include statements:

```yaml
# Add these lines to configuration.yaml
template: !include_dir_merge_list helpers/
sensor: !include_dir_merge_list helpers/
binary_sensor: !include helpers/thresholds.yaml
input_boolean: !include helpers/input_booleans.yaml
```

### Complete Upload Workflow Script

```bash
# 1. Load environment
source .env

# 2. Create helpers directory if needed
smbclient //${HA_IP}/config -U ${HA_USERNAME}%${HA_PASSWORD} -c "mkdir helpers" 2>/dev/null

# 3. Upload all YAML files
for file in *.yaml; do
  smbclient //${HA_IP}/config -U ${HA_USERNAME}%${HA_PASSWORD} -c "put $file helpers/$file"
  echo "Uploaded: $file"
done

# 4. Remind user to update configuration.yaml and reload
echo "Files uploaded. Now:"
echo "1. Update configuration.yaml with include statements"
echo "2. Check configuration in Developer Tools"
echo "3. Reload entities or restart HA"
```

---

## Part 3: Post-Upload Verification

### Step 1: Validate Configuration

- Go to **Developer Tools** > **YAML** > **Check Configuration**
- Should show "Configuration will not prevent Home Assistant from starting!"

### Step 2: Reload or Restart

| Entity Type | Reload Method |
|-------------|---------------|
| Template entities | Developer Tools > YAML > Reload Template Entities |
| Input booleans | Developer Tools > YAML > Reload Input Booleans |
| Threshold/Derivative sensors | Requires full restart |
| Structural changes (new includes) | Requires restart |

### Step 3: Verify Entities Exist

1. **Check entities:**
   - Settings > Devices & Services > Entities
   - Search for your new sensor names

2. **Verify states:**
   - Developer Tools > States
   - Filter by entity_id prefix (e.g., `binary_sensor.anyone_home`)
   - Check state is not "unavailable" or "unknown"

3. **Test functionality:**
   - Change underlying state and verify helper updates

---

## Troubleshooting

### Include Syntax Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Template sensors don't appear | File has `template:` wrapper | Remove wrapper, use direct content |
| "Invalid config for [template]" | Wrong include type or file format | Match file format to include type |
| Entities show "unavailable" | Jinja2 template error | Check template syntax in Developer Tools > Template |

### Upload Issues

| Issue | Solution |
|-------|----------|
| "NT_STATUS_ACCESS_DENIED" | Check Samba credentials, ensure add-on is running |
| Files uploaded but entities don't appear | Check configuration.yaml includes, restart HA |
| YAML syntax errors | Validate locally with `yamllint` or HA's check |
| Can't connect to Samba | Verify IP, check firewall, confirm add-on is started |

### General Tips

- **unique_id**: Always add unique_id for UI customization and entity registry persistence
- **Trigger-based templates**: Have different structure with `trigger:` and `sensor:` at same level
- **Restart vs Reload**: Template entity changes can be reloaded; structural changes need restart
- **YAML anchors**: Don't work across included files; use packages for shared definitions
- **File permissions**: Samba typically handles permissions correctly for HA
- **Backup first**: Always backup configuration before major changes
- **Syntax validation**: Use YAML linter locally before uploading
- **Secrets**: Never commit .env files with credentials to git

---

## References

- [Home Assistant Template Integration](https://www.home-assistant.io/integrations/template/)
- [Home Assistant Splitting Configuration](https://www.home-assistant.io/docs/configuration/splitting_configuration/)
- [Home Assistant Packages](https://www.home-assistant.io/docs/configuration/packages/)
- [Home Assistant Configuration.yaml](https://www.home-assistant.io/docs/configuration/)
- [Samba Add-on Documentation](https://github.com/home-assistant/addons/blob/master/samba/config.yaml)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
