# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Poppy is an extensible personal assistant framework for interacting with AI agents. It provides channels (like iMessage) for communication and various AI agents for tasks like reservation finding.

## Tech Stack

- **Monorepo**: Turborepo with pnpm workspaces
- **Server**: Fastify (Node.js)
- **Database**: PostgreSQL with Drizzle ORM, hosted on Supabase
- **Language**: TypeScript
- **Code Quality**: Biome for linting and formatting
- **Messaging**: Loop Message API for iMessage integration

## Development Commands

### Root Level Commands
```bash
# Install dependencies
pnpm install

# Run development servers
pnpm dev

# Build all packages
pnpm build

# Run linting with Biome
pnpm lint

# Run type checking
pnpm typecheck

# Format code with Prettier
pnpm format

# Start ngrok tunnel (for webhook testing)
pnpm tunnel
```

### Database Commands (run from packages/db/)
```bash
# Generate migration files
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Push schema changes (dev only)
pnpm db:push

# Open Drizzle Studio
pnpm db:studio

# Seed database
pnpm db:seed

# Reset database (Supabase)
pnpm db:reset
```

### Server Commands (run from apps/server/)
```bash
# Run development server with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type check
pnpm typecheck
```

## Architecture

### Monorepo Structure
- `apps/server/` - Main Fastify server application
  - `src/clients/` - External API clients (Loop Message)
  - `src/routes/` - API route handlers
  - `src/services/` - Business logic and message handlers
  - `src/env.ts` - Environment variable validation

- `packages/` - Shared packages
  - `clients/` - Shared API client implementations
  - `db/` - Drizzle ORM schema and database utilities
  - `schemas/` - Zod validation schemas shared across packages
  - `types/` - TypeScript type definitions
  - `supabase/` - Supabase migrations and configuration
  - `typescript-config/` - Shared TypeScript configurations

### Key Integration Points

1. **Loop Message Webhook Handler**: The server receives webhooks at `/api/webhooks/loop-message` for various message events (inbound, sent, failed, reactions, etc.)

2. **Message Processing Pipeline**: 
   - Webhooks are validated using Zod schemas from `@poppy/schemas`
   - Inbound messages are processed in `message-inbound-handler.ts`
   - Messages should be stored in the database (TODO implemented)

3. **Database Schema**: Defined in `packages/db/src/schema.ts` using Drizzle ORM, migrations stored in `packages/supabase/migrations/`

## Code Style Guidelines

- Use Biome for linting and formatting (configuration in `biome.json`)
- TypeScript with strict type checking
- Double quotes for strings
- 2-space indentation
- Trailing commas in multi-line structures
- Semicolons required
- Line width: 80 characters

## Environment Variables

Required environment variables (see `apps/server/.env.example`):
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)
- `LOOP_AUTHORIZATION_KEY` - Loop Message API authorization
- `LOOP_SECRET_KEY` - Loop Message API secret
- `LOOP_BASE_URL` - Loop Message API base URL
- `DATABASE_URL` - PostgreSQL connection string (for database operations)

## Testing Webhooks

Use ngrok for local webhook testing:
```bash
pnpm tunnel
```
This starts ngrok with the configured domain pointing to localhost:3000