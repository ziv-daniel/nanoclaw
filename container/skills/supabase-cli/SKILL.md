---
name: supabase-cli
description: Comprehensive guide for working with Supabase CLI - database migrations, schema management, type generation, Edge Functions, and more
---

# Supabase CLI Comprehensive Guide

This skill provides comprehensive guidance for working with the Supabase CLI across all operations.

## Installation & Setup

### CLI Installation

**Windows (recommended method):**
```bash
# Using npx (no installation needed)
npx supabase --version

# Note: Global npm install is not supported
# Always use: npx supabase [command]
```

**Alternative methods:**
- Scoop: `scoop install supabase`
- Direct download: https://github.com/supabase/cli/releases

### Initial Authentication

```bash
# One-time login (opens browser)
npx supabase login

# Verify authentication
npx supabase projects list
```

## Project Setup & Linking

### Initialize a New Project

```bash
# In your project directory
cd ~/projects/my-app/
npx supabase init

# Creates:
# - supabase/config.toml
# - supabase/migrations/
# - supabase/seed.sql
# - supabase/.gitignore
```

### Link to Remote Database

```bash
# Link project to remote Supabase database
npx supabase link --project-ref <project-ref-id>

# Get project ref from:
# 1. Supabase Dashboard > Settings > General > Reference ID
# 2. Extract from URL: https://<project-ref>.supabase.co
```

**Example:**
```bash
# For project URL: https://chhryzblsnqjqrrqmwdx.supabase.co
npx supabase link --project-ref chhryzblsnqjqrrqmwdx
```

### Environment Configuration

Create `.env` file in project root (reference template in `~/.claude/skills/supabase-cli/assets/.env.template`):

```bash
# Project credentials
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...        # Client-side access
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Admin privileges (keep secret!)
SUPABASE_PROJECT_REF=<project-ref>
```

**Get credentials from:**
- Supabase Dashboard > Settings > API
- Copy `anon` key and `service_role` key

**Important:** Add `.env` to `.gitignore` - never commit credentials!

## Database Migrations (Code-First)

### Creating Migrations

```bash
# Create new migration file
npx supabase migration new <description>

# Examples:
npx supabase migration new create_users_table
npx supabase migration new add_email_column
npx supabase migration new create_indexes
```

**Creates file:** `supabase/migrations/YYYYMMDDHHMMSS_description.sql`

### Writing Migrations

```sql
-- supabase/migrations/20260111123456_create_users_table.sql

-- Always use transactions
BEGIN;

-- Create table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_users_email ON users(email);

-- Add RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

COMMIT;
```

### Applying Migrations

```bash
# Apply all pending migrations to remote database
npx supabase db push

# Apply with confirmation
npx supabase db push --dry-run  # Preview changes first
npx supabase db push            # Then apply

# Check migration status
npx supabase migration list
```

### Pulling Schema from Remote

```bash
# Pull remote schema as a new migration
npx supabase db pull

# Useful for:
# - Initial setup (pulling existing schema)
# - Syncing manual changes made in dashboard
# - Team member catching up with remote changes
```

### Migration Best Practices

1. **Keep migrations small and focused**
   - One logical change per migration
   - Easier to review and rollback

2. **Always use transactions**
   ```sql
   BEGIN;
   -- Your changes
   COMMIT;
   ```

3. **Never edit applied migrations**
   - Once pushed, create new migration to modify
   - Editing breaks migration history

4. **Test before pushing**
   - Review SQL carefully
   - Consider impact on existing data
   - Have rollback plan for destructive changes

5. **Add meaningful descriptions**
   ```bash
   # Good
   npx supabase migration new add_user_profile_fields

   # Bad
   npx supabase migration new changes
   ```

## Database Operations

### Querying

```bash
# Execute SQL query
npx supabase db query "SELECT * FROM users LIMIT 10"

# Execute from file
npx supabase db query -f queries/analyze_data.sql

# With output format
npx supabase db query "SELECT * FROM users" --output json
npx supabase db query "SELECT * FROM users" --output csv
```

### Schema Inspection

```bash
# Show database info
npx supabase db inspect

# List all tables
npx supabase db inspect --table users

# Show table structure
npx supabase db query "\\d users"

# List database functions
npx supabase db functions list
```

### Diffing

```bash
# Compare local vs remote schema
npx supabase db diff --use-migra

# Compare specific schemas
npx supabase db diff --schema public --use-migra

# Generate migration from diff
npx supabase db diff --use-migra > migration.sql
```

### Database Dump

```bash
# Export full schema
npx supabase db dump -f schema.sql

# Export data
npx supabase db dump --data-only -f data.sql

# Export specific tables
npx supabase db dump -t users -t posts -f backup.sql
```

### Seed Data

```bash
# Edit seed file
# supabase/seed.sql

INSERT INTO users (email, name) VALUES
  ('test@example.com', 'Test User'),
  ('admin@example.com', 'Admin User');

# Apply seeds
npx supabase db seed

# Note: Seeds run after migrations
# Use for development/test data only
```

## Type Generation

### TypeScript Types

```bash
# Generate types from linked project
npx supabase gen types typescript --linked > src/types/database.types.ts

# Or specify project explicitly
npx supabase gen types typescript \
  --project-id <project-ref> \
  > src/types/database.types.ts

# With custom schema
npx supabase gen types typescript \
  --linked \
  --schema public,auth \
  > src/types/database.types.ts
```

### Generated Type Structure

```typescript
// database.types.ts (auto-generated)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: { ... }
    Functions: { ... }
    Enums: { ... }
  }
}
```

### Using Generated Types

```typescript
import { Database } from './types/database.types'

type User = Database['public']['Tables']['users']['Row']
type UserInsert = Database['public']['Tables']['users']['Insert']
type UserUpdate = Database['public']['Tables']['users']['Update']

// Type-safe queries
const { data, error } = await supabase
  .from('users')
  .select('*')
  .returns<User[]>()
```

### Best Practices for Types

1. **Regenerate after migrations**
   ```bash
   npx supabase db push
   npx supabase gen types typescript --linked > src/types/database.types.ts
   ```

2. **Commit types to git**
   - Team consistency
   - Type safety across environments

3. **Automate in CI/CD**
   ```yaml
   # GitHub Actions example
   - name: Generate types
     run: npx supabase gen types typescript --linked > src/types/database.types.ts
   ```

## Edge Functions

### Creating Functions

```bash
# Create new Edge Function
npx supabase functions new my-function

# Creates:
# - supabase/functions/my-function/index.ts
# - Basic Deno TypeScript template
```

### Function Structure

```typescript
// supabase/functions/my-function/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Handle request
  const { name } = await req.json()

  // Database query
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('name', name)

  return new Response(
    JSON.stringify({ data, error }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### Deploying Functions

```bash
# Deploy single function
npx supabase functions deploy my-function

# Deploy with environment variables
npx supabase functions deploy my-function \
  --secret-file .env.local

# Deploy all functions
npx supabase functions deploy
```

### Testing Functions Locally

```bash
# Serve function locally
npx supabase functions serve my-function

# Test with curl
curl -X POST \
  http://localhost:54321/functions/v1/my-function \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"name":"test"}'
```

### Function Logs

```bash
# View function logs
npx supabase functions logs my-function

# Follow logs in real-time
npx supabase functions logs my-function --follow

# Filter by time
npx supabase functions logs my-function --since 1h
```

### Function Secrets

```bash
# Set function secret
npx supabase secrets set MY_SECRET=value

# List secrets
npx supabase secrets list

# Unset secret
npx supabase secrets unset MY_SECRET
```

## Project Management

### Status & Info

```bash
# Check project status
npx supabase status

# List all your projects
npx supabase projects list

# Get current project info
npx supabase projects get
```

### Unlinking

```bash
# Unlink current directory from project
npx supabase unlink
```

## Local Development (Optional)

### Starting Local Supabase

```bash
# Start local Supabase stack (requires Docker)
npx supabase start

# Stop local stack
npx supabase stop

# Reset local database
npx supabase db reset
```

**Note:** Local development requires Docker. If you only work with remote databases, you can skip this.

## Common Workflows

### Initial Setup Workflow

```bash
# 1. Authenticate
npx supabase login

# 2. Initialize project
npx supabase init

# 3. Link to remote
npx supabase link --project-ref <project-ref>

# 4. Pull existing schema
npx supabase db pull

# 5. Setup environment
# Copy credentials to .env

# 6. Generate types
npx supabase gen types typescript --linked > src/types/database.types.ts
```

### Development Workflow

```bash
# 1. Create migration
npx supabase migration new add_new_feature

# 2. Write SQL in migration file
# Edit: supabase/migrations/YYYYMMDDHHMMSS_add_new_feature.sql

# 3. Apply to remote
npx supabase db push

# 4. Generate types
npx supabase gen types typescript --linked > src/types/database.types.ts

# 5. Commit changes
git add supabase/migrations/ src/types/
git commit -m "Add new feature migration"
```

### Team Sync Workflow

```bash
# 1. Pull latest code
git pull

# 2. Apply new migrations
npx supabase db push

# 3. Regenerate types
npx supabase gen types typescript --linked > src/types/database.types.ts
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Project not linked" | `npx supabase link --project-ref <ref>` |
| "Authentication failed" | `npx supabase login` (reauthorize) |
| "Migration already applied" | Check `npx supabase migration list`, create new migration |
| "Connection timeout" | Check network, verify project URL |
| "Permission denied" | Verify service role key has admin privileges |
| "npx command not found" | Install Node.js and npm |

### Getting Project Information

```bash
# From Supabase Dashboard
1. Go to: Project Settings > General
2. Copy "Reference ID"

# From project URL
https://<project-ref>.supabase.co
          ^^^^^^^^^ this is your project ref
```

### Reset & Clean

```bash
# Unlink project
npx supabase unlink

# Remove all migrations (destructive!)
rm -rf supabase/migrations/*

# Note: Cannot undo applied migrations on remote
# Must create new migrations to rollback changes
```

### Debugging Commands

```bash
# Check CLI version
npx supabase --version

# Check authentication
npx supabase projects list

# View project config
cat supabase/config.toml

# Test database connection
npx supabase db query "SELECT NOW()"

# Check migration status
npx supabase migration list
```

## Advanced Topics

### Custom Postgres Configuration

Edit `supabase/config.toml`:

```toml
[db]
port = 54322
major_version = 15

[db.pooler]
enabled = true
port = 54329
pool_mode = "transaction"
default_pool_size = 20
max_client_conn = 100
```

### Database Branching (Beta)

```bash
# Create branch
npx supabase branches create feature-branch

# Switch branch
npx supabase branches switch feature-branch

# List branches
npx supabase branches list

# Merge branch
npx supabase branches merge feature-branch
```

### Realtime Configuration

```sql
-- Enable realtime for table
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Disable realtime
ALTER PUBLICATION supabase_realtime DROP TABLE users;
```

### Custom SQL Functions

```sql
-- Create function in migration
CREATE OR REPLACE FUNCTION get_user_count()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM users;
$$ LANGUAGE SQL STABLE;

-- Call from application
SELECT get_user_count();
```

## Multi-Project Setup

### Directory Structure

```
~/projects/
├── music-mind-app/
│   ├── supabase/
│   │   ├── config.toml (linked to music_mind)
│   │   └── migrations/
│   └── .env (music_mind credentials)
│
└── ai-news-app/
    ├── supabase/
    │   ├── config.toml (linked to ai_news)
    │   └── migrations/
    └── .env (ai_news credentials)
```

### Switching Projects

```bash
# No manual switching needed!
# Just cd to project directory

cd ~/projects/music-mind-app/
npx supabase status  # Targets music_mind

cd ~/projects/ai-news-app/
npx supabase status  # Targets ai_news
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link project
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Push migrations
        run: supabase db push

      - name: Generate types
        run: supabase gen types typescript --linked > src/types/database.types.ts

      - name: Commit types
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add src/types/
          git commit -m "Update database types" || exit 0
          git push
```

## Security Best Practices

1. **Never commit credentials**
   - Add `.env` to `.gitignore`
   - Use environment variables in CI/CD

2. **Use Row Level Security (RLS)**
   ```sql
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can only read own data"
     ON users FOR SELECT
     USING (auth.uid() = id);
   ```

3. **Limit service role key usage**
   - Use anon key for client-side
   - Use service role only for admin operations

4. **Validate input in Edge Functions**
   ```typescript
   // Validate before database query
   if (!email || !email.includes('@')) {
     return new Response('Invalid email', { status: 400 })
   }
   ```

## Resources

- **Official Docs:** https://supabase.com/docs/guides/cli
- **CLI GitHub:** https://github.com/supabase/cli
- **SQL Reference:** https://www.postgresql.org/docs/
- **Supabase API:** https://supabase.com/docs/reference/javascript

## Quick Reference

### Most Used Commands

```bash
# Setup
npx supabase login
npx supabase init
npx supabase link --project-ref <ref>

# Migrations
npx supabase migration new <name>
npx supabase db push
npx supabase db pull

# Types
npx supabase gen types typescript --linked > src/types/database.types.ts

# Database
npx supabase db query "SELECT * FROM table"
npx supabase db inspect

# Functions
npx supabase functions new <name>
npx supabase functions deploy <name>
npx supabase functions logs <name>

# Status
npx supabase status
npx supabase projects list
npx supabase migration list
```

---

**Pro Tips:**

1. Always work in transactions for migrations
2. Commit migrations and types to git
3. Use descriptive migration names
4. Generate types after every migration
5. Test migrations before pushing
6. Never edit applied migrations
7. Use RLS for security
8. Keep migrations small and focused
9. Document complex SQL in comments
10. Use `npx supabase --help` for any command
