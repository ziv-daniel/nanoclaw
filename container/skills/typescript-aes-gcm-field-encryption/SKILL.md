---
name: typescript-aes-gcm-field-encryption
description: |
  AES-256-GCM field-level encryption for sensitive strings stored in a database via
  Prisma (or any ORM). Use when: (1) storing third-party OAuth tokens, API keys, or
  secrets in a relational DB, (2) adding at-rest encryption to an existing repository
  without changing the DB schema, (3) needing transparent encrypt-on-write /
  decrypt-on-read in a TypeScript/Bun/Node.js service. Pattern: small crypto utility +
  repository-layer wrapping. Key from env var — no-op fallback when key is absent
  (safe for dev, enforced in prod).
author: Claude Code
version: 1.0.0
date: 2026-04-13
---

# AES-256-GCM Field-Level Encryption in TypeScript (Prisma Repository Pattern)

## Problem

OAuth access/refresh tokens, API keys, or other secrets stored in PostgreSQL are exposed
in plaintext if the database is compromised (backup leak, SQL injection, misconfigured
access). The application needs field-level encryption without changing the DB schema or
adding a key management service.

## Context / Trigger Conditions

- Third-party tokens (OAuth, API keys) stored via Prisma ORM
- Security review finds "sensitive data stored in plaintext"
- No existing encryption utility in the codebase
- Using TypeScript + Bun or Node.js (built-in `crypto` module available)
- No providers have stored data yet (no migration needed) OR need a migration path

## Solution

### Step 1: Create the encryption utility

```typescript
// src/utils/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;       // 96-bit IV — recommended for GCM
const AUTH_TAG_BYTES = 16; // 128-bit auth tag

function resolveKey(hexKey: string): Buffer {
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'Encryption key must be a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  return Buffer.from(hexKey, 'hex');
}

/** Returns `iv:authTag:ciphertext` — all base64, joined by `:` */
export function encrypt(plaintext: string, hexKey: string): string {
  const key = resolveKey(hexKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/** Decrypts a value produced by `encrypt`. Throws on tampered data (GCM auth tag). */
export function decrypt(encryptedValue: string, hexKey: string): string {
  const key = resolveKey(hexKey);
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted value: wrong IV or auth tag length');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

### Step 2: Add key to config

```typescript
// In your config/environment file
encryption: {
  oauthKey: process.env.OAUTH_ENCRYPTION_KEY ?? '',
},
```

### Step 3: Wrap repository methods

Add private helpers to the repository class — keep encryption concerns out of the service layer:

```typescript
import { config } from '../config';
import { encrypt, decrypt } from '../utils/encryption';

class OAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private encryptToken(token: string): string {
    return config.encryption.oauthKey
      ? encrypt(token, config.encryption.oauthKey)
      : token; // plaintext fallback for dev (no key set)
  }

  private decryptToken(token: string): string {
    return config.encryption.oauthKey
      ? decrypt(token, config.encryption.oauthKey)
      : token;
  }

  private decryptRecord(record: OAuthTokenRecord): OAuthTokenRecord {
    return {
      ...record,                                          // immutable spread
      accessToken: this.decryptToken(record.accessToken),
      refreshToken: record.refreshToken
        ? this.decryptToken(record.refreshToken)
        : null,
    };
  }

  async upsert(data: UpsertOAuthTokenData): Promise<OAuthTokenRecord> {
    const record = await this.prisma.oAuthToken.upsert({
      // ... prisma where/create/update
      create: {
        accessToken: this.encryptToken(data.accessToken),
        refreshToken: data.refreshToken
          ? this.encryptToken(data.refreshToken)
          : null,
        // ... other fields
      },
      update: {
        accessToken: this.encryptToken(data.accessToken),
        refreshToken: data.refreshToken
          ? this.encryptToken(data.refreshToken)
          : null,
      },
    });
    return this.decryptRecord(record);
  }

  async findByUserAndProvider(userId: string, provider: string) {
    const record = await this.prisma.oAuthToken.findUnique({ where: { ... } });
    return record ? this.decryptRecord(record) : null;
  }

  // findMany returns: records.map(r => this.decryptRecord(r))

  async updateTokens(id: string, accessToken: string, refreshToken: string | null, expiresAt: Date | null) {
    const record = await this.prisma.oAuthToken.update({
      where: { id },
      data: {
        accessToken: this.encryptToken(accessToken),
        refreshToken: refreshToken ? this.encryptToken(refreshToken) : null,
        expiresAt,
      },
    });
    return this.decryptRecord(record);
  }
}
```

### Step 4: Set env var

```bash
# Generate key
openssl rand -hex 32
# → e.g. 07729c535ffe37fcd042616a977c038c2abfdee8b5f0566748ac1afccca4e827

# .env.example
OAUTH_ENCRYPTION_KEY=  # 64-char hex, generate with: openssl rand -hex 32
```

Add to docker-compose:
```yaml
wearable-service:
  environment:
    - OAUTH_ENCRYPTION_KEY=${OAUTH_ENCRYPTION_KEY:-}
```

## Verification

```typescript
// Unit test — round-trip
const key = 'a'.repeat(64); // fake 64-char hex for testing
const original = 'access_token_abc123';
const enc = encrypt(original, key);
const dec = decrypt(enc, key);
assert(dec === original);

// Tamper detection — GCM auth tag catches modifications
const tampered = enc.replace('a', 'b');
expect(() => decrypt(tampered, key)).toThrow();
```

## Notes

- **No schema migration needed**: The DB column type stays `TEXT`/`VARCHAR` — encrypted values are simply longer strings.
- **No-op when key is absent**: The `encryptToken`/`decryptToken` fallback to plaintext when `OAUTH_ENCRYPTION_KEY` is empty, making local dev work without configuration.
- **Data migration**: If existing plaintext data is in the DB when the key is first set, you need a one-time migration script to re-encrypt rows. Plan for this if rotating from no-encryption to encryption on a live database.
- **Key rotation**: To rotate keys, read with old key → decrypt → encrypt with new key → write. AES-GCM's random IV means two encryptions of the same plaintext produce different ciphertexts (no deduplication possible).
- **Prisma `deleteMany` gotcha**: `userId_provider` compound unique key works on `findUnique`/`upsert` where clauses but NOT on `deleteMany`. Use `{ userId, provider }` individually for `deleteMany`.

## References

- [Node.js crypto: createCipheriv](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options)
- [NIST GCM recommendation: 96-bit IV](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [OWASP: Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
