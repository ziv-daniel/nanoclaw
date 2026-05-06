---
name: ioredis-fastify-error-handling
description: |
  Fix ioredis unhandled error events causing Fastify plugin timeouts. Use when:
  (1) Seeing "[ioredis] Unhandled error event: undefined" in logs,
  (2) Fastify plugin timeout error "Plugin did not start in time: 'redis'",
  (3) Redis connection works via ping but plugin fails to register,
  (4) Container restarts in loop with Redis errors. Requires explicit error
  event handlers and lazyConnect option in ioredis configuration.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# ioredis Fastify Plugin Error Handling

## Problem
When using ioredis in a Fastify plugin, unhandled error events cause the plugin
to timeout or crash, even when Redis is accessible. The cryptic error
`[ioredis] Unhandled error event: undefined` appears repeatedly in logs.

## Context / Trigger Conditions
- Error: `[ioredis] Unhandled error event: undefined`
- Error: `AVV_ERR_PLUGIN_EXEC_TIMEOUT: Plugin did not start in time: 'redis'`
- Container enters restart loop with Redis errors
- Redis ping works manually but Fastify plugin fails
- Redis connection established but then immediately drops

## Root Cause
ioredis is an EventEmitter and emits 'error' events when connection issues occur.
If no listener is attached, Node.js treats these as unhandled exceptions. The
Fastify plugin wrapper doesn't automatically catch these events, causing plugin
registration to fail.

## Solution

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import config from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        fastify.log.error(`Redis connection failed after ${times} attempts`);
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 2000);
      return delay;
    },
    lazyConnect: true, // CRITICAL: Don't connect immediately
  });

  // CRITICAL: Handle error events to prevent unhandled exceptions
  redis.on('error', (err) => {
    fastify.log.error('Redis connection error:', err.message);
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected successfully');
  });

  redis.on('close', () => {
    fastify.log.warn('Redis connection closed');
  });

  redis.on('reconnecting', () => {
    fastify.log.info('Redis reconnecting...');
  });

  // Connect explicitly after setting up handlers
  try {
    await redis.connect();
    await redis.ping();
    fastify.log.info(`Redis connected to ${config.redis.host}:${config.redis.port}`);
  } catch (error) {
    fastify.log.error('Failed to connect to Redis:', error);
    throw error;
  }

  // Decorate fastify instance
  fastify.decorate('redis', redis);

  // Clean up on close
  fastify.addHook('onClose', async (instance) => {
    await instance.redis.quit();
    instance.log.info('Redis connection closed');
  });
};

export default fp(redisPlugin, {
  name: 'redis',
});
```

## Key Points

1. **Use `lazyConnect: true`**: Prevents ioredis from connecting before error handlers are attached
2. **Attach error handler BEFORE connecting**: `redis.on('error', ...)` must come before `redis.connect()`
3. **Handle all relevant events**: error, connect, close, reconnecting
4. **Set `maxRetriesPerRequest`**: Prevents infinite retry loops
5. **Return null from retryStrategy to stop**: After max retries, stop trying

## Docker Environment Variables

Ensure both `REDIS_HOST` and `REDIS_PORT` are set, not just `REDIS_URL`:

```yaml
environment:
  - REDIS_HOST=redis
  - REDIS_PORT=6379
  - REDIS_URL=redis://redis:6379
```

Some configs read `REDIS_HOST`/`REDIS_PORT` separately, others parse `REDIS_URL`.

## Verification

After applying the fix:
```bash
# Check logs for proper connection
docker logs your-service --tail=20

# Should see:
# Redis connected to redis:6379
# NOT: [ioredis] Unhandled error event: undefined
```

## Notes

- This pattern applies to any ioredis usage in Fastify, not just plugins
- Bull/BullMQ queues also use ioredis internally - same pattern applies
- Consider adding a health check that verifies Redis connectivity
- In production, use Redis Sentinel or Cluster for high availability

## References
- [ioredis Error Handling](https://github.com/redis/ioredis#error-handling)
- [Fastify Plugin Documentation](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Node.js EventEmitter Error Events](https://nodejs.org/api/events.html#error-events)
