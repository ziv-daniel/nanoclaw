---
name: z2m-troubleshooting
description: |
  Diagnose and fix Zigbee2MQTT crashes and USB coordinator disconnection issues.
  Use when: (1) z2m container shows "Exited" status, (2) logs show "Error: No such
  file or directory, cannot open /dev/ttyACM0", (3) USB coordinator disconnected
  errors, (4) z2m won't start after reboot, (5) /dev/ttyACM path changed.
  Critical for smart home stability - z2m controls all Zigbee devices.
author: Claude Code
version: 1.0.0
date: 2026-01-25
---

# Zigbee2MQTT Troubleshooting

## Problem

Zigbee2MQTT container crashes or fails to start, often due to USB coordinator
disconnection or device path changes. This is critical as z2m controls all
Zigbee devices in the smart home.

## Context / Trigger Conditions

Use this skill when:
- Container status shows `Exited (2)` or similar non-zero exit code
- Logs show: `Error: No such file or directory, cannot open /dev/ttyACM0`
- Logs show: `USB adapter disconnected` or `Coordinator disconnected`
- Logs show: `Error: SRSP - SYS - ping after 6000ms`
- z2m worked before but stopped after reboot or power cycle
- Multiple USB devices connected and paths may have shifted

## Diagnostic Steps

### Step 1: Check Container Status
```bash
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep zigbee
```

### Step 2: Check Recent Logs for Error
```bash
docker logs --tail 100 zigbee2mqtt 2>&1 | grep -i "error\|disconnect\|ttyACM"
```

Look for these patterns:
- `Error: No such file or directory, cannot open /dev/ttyACM0` = Device path issue
- `USB adapter disconnected` = Physical USB issue or power problem
- `Coordinator disconnected` = USB connection dropped during operation

### Step 3: Find Current USB Device Path
```bash
# List all serial devices
ls -la /dev/ttyACM* /dev/ttyUSB* 2>/dev/null

# Better: Use stable by-id path (RECOMMENDED)
ls -la /dev/serial/by-id/
```

Example output:
```
/dev/serial/by-id/usb-Texas_Instruments_TI_CC2531_USB_CDC___0X00124B00XXXXX-if00 -> ../../ttyACM0
```

### Step 4: Compare with Docker-Compose Configuration
```bash
cat /path/to/docker-compose.yml | grep -A5 devices
```

Check if the device mapping matches reality:
```yaml
devices:
  - /dev/ttyACM0:/dev/ttyACM0  # Both sides must match current device
```

## Common Fixes

### Fix 1: Device Path Mismatch (Most Common)

**Symptom**: Config says `/dev/ttyACM1` but device is at `/dev/ttyACM0`

**Fix**:
```bash
# Update docker-compose.yml
sed -i 's|/dev/ttyACM1:/dev/ttyACM0|/dev/ttyACM0:/dev/ttyACM0|' docker-compose.yml

# Restart container
docker compose up -d zigbee2mqtt
```

### Fix 2: Use Stable Device Path (Permanent Fix)

**Problem**: `/dev/ttyACM*` numbers can change after reboot

**Fix**: Use `/dev/serial/by-id/` path instead:
```yaml
# docker-compose.yml
devices:
  - /dev/serial/by-id/usb-Texas_Instruments_TI_CC2531_USB_CDC___0X00124B00XXXXX-if00:/dev/ttyACM0
```

Also update `configuration.yaml`:
```yaml
serial:
  port: /dev/ttyACM0  # Keep this as is (container-internal path)
  adapter: zstack     # Specify adapter type explicitly
```

### Fix 3: USB Power/Cable Issues

**Symptoms**: Random disconnections, works for hours then fails

**Fixes**:
1. Use a **powered USB hub** (especially on Raspberry Pi)
2. Replace USB cable (cheap cables cause disconnections)
3. Use a better power supply (Pi needs 3A+ for stable USB)
4. Don't touch the USB cable during operation

### Fix 4: Check for USB Conflicts

```bash
# Find what's using the device
ls -l /proc/[0-9]*/fd/ 2>/dev/null | grep /dev/ttyACM0

# Kill conflicting process if needed
fuser -k /dev/ttyACM0
```

## Quick Recovery Script

```bash
#!/bin/bash
# z2m-recover.sh - Quick recovery for zigbee2mqtt

COMPOSE_DIR="/home/admin/zigbee2mqtt-docker"
cd "$COMPOSE_DIR"

# Check current USB device
CURRENT_DEV=$(ls /dev/ttyACM* 2>/dev/null | head -1)
if [ -z "$CURRENT_DEV" ]; then
    echo "ERROR: No USB coordinator found!"
    echo "Check: USB cable, power, physical connection"
    exit 1
fi

echo "Found USB device: $CURRENT_DEV"

# Update compose if needed
if ! grep -q "$CURRENT_DEV:$CURRENT_DEV" docker-compose.yml; then
    echo "Updating device path in docker-compose.yml..."
    sed -i "s|/dev/ttyACM[0-9]:/dev/ttyACM0|$CURRENT_DEV:/dev/ttyACM0|" docker-compose.yml
fi

# Restart
docker compose up -d zigbee2mqtt

# Wait and check
sleep 10
docker logs --tail 20 zigbee2mqtt
```

## Verification

After fixing, verify z2m is healthy:

```bash
# Check status
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep zigbee

# Should show: zigbee2mqtt   Up X minutes (healthy)

# Check logs for successful start
docker logs --tail 30 zigbee2mqtt 2>&1 | grep -i "started\|mqtt\|devices"

# Look for: "Zigbee2MQTT started!" and MQTT publish messages
```

## Prevention

1. **Use `/dev/serial/by-id/`** paths in docker-compose
2. **Add adapter type** to configuration.yaml: `adapter: zstack`
3. **Use powered USB hub** on Raspberry Pi
4. **Monitor container health** via Home Assistant sensors
5. **Set up alerts** for z2m container going down

## PIE5-Specific Notes

On PIE5 (Raspberry Pi 5):
- Docker-compose location: `/home/admin/zigbee2mqtt-docker/docker-compose.yml`
- Config location: `/home/admin/zigbee2mqtt-docker/data/configuration.yaml`
- Web UI: http://192.168.68.136:8099
- Default device: `/dev/ttyACM0`
- Container managed via: `/home/admin/scripts/container-manager.sh`

## References

- [Zigbee2MQTT Fails to Start Guide](https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start_crashes-runtime.html)
- [Adapter Settings Configuration](https://www.zigbee2mqtt.io/guide/configuration/adapter-settings.html)
- [GitHub: USB Device Path Issues](https://github.com/Koenkk/zigbee2mqtt/issues/2157)
- [GitHub: USB Adapter Discovery Error](https://github.com/Koenkk/zigbee2mqtt/discussions/24364)
