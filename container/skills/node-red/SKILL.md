---
name: node-red
description: Comprehensive Node-RED flow-based automation guidance covering core concepts, node configuration, MQTT integration, subflows, context storage, automation patterns, custom development, and Home Assistant integration. Use when building Node-RED flows, configuring nodes, working with MQTT topics, creating subflows, managing state with context, developing custom nodes, or integrating with Home Assistant via node-red-contrib-home-assistant-websocket.
---

# Node-RED Skill

Node-RED is a flow-based visual programming tool for wiring together hardware, APIs, and services. Built on Node.js, it provides a browser-based editor for creating event-driven automations.

## Core Concepts

### Flow-Based Programming
Applications are networks of "black box" nodes exchanging data via wires. Nodes process messages asynchronously within Node.js's event loop.

### The msg Object
Every message is a JavaScript object:

| Property | Purpose |
|----------|---------|
| `msg.payload` | Primary data (most nodes read/write this) |
| `msg.topic` | Source identifier for routing |
| `msg._msgid` | Unique ID for tracing |

**Critical:** Always modify the received `msg` rather than creating new objects—this preserves properties like `msg.req`/`msg.res` for HTTP flows.

### Node Types
- **Input nodes**: Generate messages (Inject, MQTT In, HTTP In)
- **Processing nodes**: Transform data (Function, Change, Switch)
- **Output nodes**: Send externally (Debug, MQTT Out, HTTP Response)
- **Configuration nodes**: Shared settings (MQTT broker, HA server)—don't appear in workspace

### Wires and Message Flow
Wires connect output ports to input ports. Messages to multiple wires are **cloned automatically**. A node with multiple outputs sends via array: `return [msg1, msg2, null]` sends msg1 to output 1, msg2 to output 2, nothing to output 3.

## Installation

```bash
# npm global
npm install -g --unsafe-perm node-red
node-red  # http://localhost:1880

# Docker
docker run -d -p 1880:1880 -v node_red_data:/data nodered/node-red

# Raspberry Pi
bash <(curl -sL https://github.com/node-red/linux-installers/releases/latest/download/update-nodejs-and-nodered-deb)
```

## Essential Nodes Quick Reference

| Node | Purpose | Key Config |
|------|---------|------------|
| **Inject** | Trigger flows | Interval, cron, or manual |
| **Debug** | Display messages | Sidebar output, filter by node |
| **Function** | Custom JavaScript | `msg`, `send`, `done` pattern |
| **Change** | Modify properties | Set, Change, Move, Delete |
| **Switch** | Route by condition | Property comparisons, regex |
| **Template** | Generate text | Mustache syntax `{{payload}}` |

### Function Node Pattern (Node-RED 1.0+)
```javascript
// Modern async pattern with error handling
node.on('input', function(msg, send, done) {
    try {
        msg.payload = msg.payload.toUpperCase();
        send(msg);
        done();
    } catch(err) {
        done(err);  // Routes to Catch node
    }
});
```

## Reference Files

Read these based on the task at hand:

| Reference | When to Read |
|-----------|--------------|
| [references/mqtt.md](references/mqtt.md) | Configuring MQTT brokers, topic wildcards, QoS levels, retain flags |
| [references/subflows.md](references/subflows.md) | Creating reusable components, environment variables, subflow patterns |
| [references/core-nodes.md](references/core-nodes.md) | Detailed node configuration, all core node types with examples |
| [references/automation-patterns.md](references/automation-patterns.md) | Time-based triggers, event-driven flows, debouncing, error handling |
| [references/context-storage.md](references/context-storage.md) | Node/flow/global context, persistent storage, Redis configuration |
| [references/custom-development.md](references/custom-development.md) | Creating custom nodes, contrib ecosystem, publishing to npm |
| [references/home-assistant.md](references/home-assistant.md) | HA integration, WebSocket nodes, deployment options, automation subflows |

## Debug Workflow

1. Add Debug nodes after suspect nodes, set to "complete msg object"
2. Use `node.warn("checkpoint")` in Function nodes for console output
3. Check for `msg.error` after Catch nodes
4. Use `--safe` flag to start Node-RED without executing flows: `node-red --safe`

## Common Patterns

### Conditional Routing
```
[Input] → [Switch node] → Output 1 (condition A)
                       → Output 2 (condition B)
                       → Output 3 (otherwise)
```

### Error Handling
```
[Any Node] ──error──→ [Catch node] → [Debug/Notification]
```

### State Machine
```
[Trigger] → [Function: check/update context] → [Switch: route by state] → [Actions]
```

## Best Practices

1. **Name every node** - Essential for debugging and Catch node identification
2. **Use Link nodes** - Connect flows across tabs without visual clutter
3. **Group related nodes** - Visual organization and bulk operations
4. **Disable unused Debug nodes** - Reduces overhead in production
5. **Set credential_secret** - Required for backup restoration in settings.js
