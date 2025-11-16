# Poppy

An extensible personal assistant framework for interacting with AI agents through various communication channels.

## Overview

Poppy is a modular personal assistant that connects communication channels (like iMessage) with AI agents to automate tasks and provide intelligent assistance. Built with TypeScript and deployed on Cloudflare Workers, it uses a task-based system to run agents in the background, on triggers, or as scheduled jobs.

## Features

### Channels

#### Available
- **iMessage** - Send and receive messages via Loop Message API with webhook integration

#### Planned
- **Voice** - Voice-based interactions
- **SMS** - Direct SMS integration
- **WhatsApp** - WhatsApp Business API

### Agents

Agents are configured via a task-based system that allows them to run in the background, on triggers/hooks, or as cron jobs.

#### In Progress
- **Reservation Finding** - Search for restaurant availability across multiple platforms

#### Planned
- **Reservation Booking** - Complete restaurant bookings
- **Calendar** - Manage calendar events and scheduling
- **Email** - Email management and automation
- **Travel** - Flight and hotel bookings
- **Task Management** - Todo lists and reminders

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Package Manager**: pnpm with workspaces
- **Build System**: Turborepo
- **Backend**: Hono (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM (hosted on Supabase, connected via Hyperdrive)
- **Stateful Storage**: Durable Objects
- **Validation**: Zod schemas
- **Code Quality**: Biome for linting and formatting
- **Messaging**: Loop Message API
- **AI**: OpenAI and OpenRouter

## Getting Started

### Prerequisites

- Cloudflare account with Workers enabled
- pnpm v10.12.1 or higher
- PostgreSQL database (Supabase recommended)
- Loop Message API account for iMessage integration
- Cloudflare API token with Workers permissions

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/poppy.git
cd poppy

# Install dependencies
pnpm install

# Authenticate with Cloudflare
wrangler login
```

### Development

```bash
# Run the worker locally with hot reload
cd apps/interaction-worker
pnpm dev

# Run type checking
pnpm typecheck

# Run linting with Biome (from root)
cd ../..
pnpm lint

# Format code
pnpm format

# Build all packages
pnpm build
```

### Database Setup

```bash
# Navigate to database package
cd packages/db

# Generate migration files
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Push schema changes (development only)
pnpm db:push

# Open Drizzle Studio to view database
pnpm db:studio

# Seed database with initial data (optional)
pnpm db:seed

# Reset database (Supabase only)
pnpm db:reset
```

## Deployment

Poppy is designed to run exclusively on Cloudflare Workers, providing a serverless, globally distributed architecture with Durable Objects for message debouncing and Hyperdrive for PostgreSQL connectivity.

### Initial Setup

1. **Install Wrangler globally** (optional):
```bash
npm install -g wrangler
```

2. **Authenticate with Cloudflare**:
```bash
wrangler login
```

3. **Configure Hyperdrive** for database connectivity:
```bash
# Create a Hyperdrive connection to your PostgreSQL database
wrangler hyperdrive create production-db --connection-string="postgresql://user:password@host:5432/database"
```

Update the Hyperdrive ID in `apps/interaction-worker/wrangler.jsonc` under the `production` or `staging` environment with the ID returned from the command above.

4. **Configure Durable Objects**:

The worker uses Durable Objects for message debouncing. These are automatically deployed with the worker, but you need to ensure migrations are applied:

```bash
cd apps/interaction-worker
wrangler deployments list  # Verify migrations are applied
```

### Setting Secrets

Configure required secrets using Wrangler:

```bash
cd apps/interaction-worker

# Loop Message API credentials
pnpm wrangler secret put LOOP_AUTHORIZATION_KEY --env production
pnpm wrangler secret put LOOP_SECRET_KEY --env production

# AI API keys
pnpm wrangler secret put OPENAI_API_KEY --env production
pnpm wrangler secret put OPENROUTER_API_KEY --env production
pnpm wrangler secret put EXASEARCH_API_KEY --env production
```

For staging environment, replace `--env production` with `--env staging`.

### Deployment Commands

```bash
# Deploy to production
cd apps/interaction-worker
pnpm deploy

# Deploy to staging
pnpm deploy:staging

# Or from the root directory using Turborepo
pnpm turbo deploy
```

### Environment Configuration

The worker is configured via `apps/interaction-worker/wrangler.jsonc` with two environments:

- **Production**: `poppy-interaction-production.caelinsutch.workers.dev`
- **Staging**: `poppy-interaction-staging.caelinsutch.workers.dev`

Each environment has its own:
- Durable Object bindings for message debouncing
- Hyperdrive connection for database access
- Environment variables and secrets

### CI/CD with GitHub Actions

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys to production when changes are pushed to the `main` branch.

To enable automatic deployments:

1. Add GitHub secrets:
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
   - `CLOUDFLARE_API_TOKEN` - API token with Workers deploy permissions

2. Push to main branch:
```bash
git push origin main
```

The workflow will automatically build and deploy the worker to production.

### Monitoring and Logs

View worker logs and traces:

```bash
# Tail production logs
wrangler tail --env production

# Tail staging logs
wrangler tail --env staging
```

Logs and traces are automatically persisted in Cloudflare's observability dashboard with 100% sampling rate configured in `wrangler.jsonc`.

### Custom Domain (Optional)

To use a custom domain:

1. Add a custom domain in Cloudflare Workers dashboard
2. Update the worker route configuration
3. Configure your DNS records

```bash
wrangler publish --env production
```

## Project Structure

```
poppy/
├── apps/
│   ├── interaction-worker/  # Main Cloudflare Worker for message handling
│   │   ├── src/
│   │   │   ├── clients/     # API clients (Loop Message, AI providers)
│   │   │   ├── durable-objects/ # Durable Object implementations
│   │   │   ├── tools/       # AI agent tools (web search, etc.)
│   │   │   └── index.ts     # Worker entry point
│   │   ├── wrangler.jsonc   # Cloudflare Workers configuration
│   │   └── package.json
│   └── execution-worker/    # Background task execution worker
│       ├── src/
│       │   ├── clients/     # API clients
│       │   └── index.ts     # Worker entry point
│       ├── wrangler.jsonc   # Cloudflare Workers configuration
│       └── package.json
├── packages/
│   ├── clients/             # Shared API client implementations
│   ├── db/                  # Drizzle ORM schema and utilities
│   ├── hono-helpers/        # Hono middleware and helpers
│   ├── lib/                 # Shared utility functions
│   ├── schemas/             # Zod validation schemas
│   ├── tools/               # Build and deployment scripts
│   ├── types/               # TypeScript type definitions
│   ├── supabase/            # Supabase migrations and configuration
│   └── typescript-config/   # Shared TypeScript configurations
├── .github/
│   └── workflows/
│       ├── ci.yml           # Continuous integration workflow
│       └── deploy.yml       # Deployment workflow
├── turbo.json               # Turborepo configuration
├── pnpm-workspace.yaml      # pnpm workspace configuration
├── biome.json               # Biome linting/formatting config
└── CLAUDE.md                # AI assistant development guide
```

## Architecture

Poppy runs entirely on Cloudflare's edge infrastructure:

- **Serverless, globally distributed**: Deployed across Cloudflare's network for low latency worldwide
- **Durable Objects**: Stateful coordination for message debouncing and deduplication
- **Hyperdrive**: Low-latency database connections to PostgreSQL
- **Automatic scaling**: Handles variable workloads without manual intervention
- **Cost-effective**: Pay only for what you use

### Workers

1. **Interaction Worker**: Handles incoming webhooks from Loop Message, processes messages with AI agents, and manages conversations
2. **Execution Worker**: Runs background tasks and scheduled jobs for agents

### Message Processing Pipeline

1. **Webhook Reception**: The interaction worker receives webhooks at `/api/webhooks/loop-message` for message events (inbound, sent, failed, reactions, etc.)
2. **Debouncing**: Messages are deduplicated using Durable Objects to handle rapid message updates
3. **Validation**: Webhooks are validated using Zod schemas from `@poppy/schemas`
4. **AI Processing**: Messages are processed by AI agents with access to various tools (web search, etc.)
5. **Storage**: Messages and interactions are stored in PostgreSQL via Drizzle ORM (through Hyperdrive)

### Key Integration Points

- **Loop Message API**: Handles iMessage communication with webhook-based event handling
- **Database Layer**: Drizzle ORM provides type-safe database access with PostgreSQL (via Hyperdrive on Workers)
- **AI Providers**: OpenAI and OpenRouter for language model capabilities
- **Durable Objects**: Stateful coordination for message debouncing and deduplication
- **Validation Layer**: Zod schemas ensure data integrity across the application
- **Monorepo Structure**: Turborepo enables efficient builds and shared packages

## Environment Variables

For local development, create `apps/interaction-worker/.env` based on `.env.production.example`.

For production deployment, secrets are configured via Wrangler (see Deployment section above).

Environment variables set in `wrangler.jsonc`:
- `NODE_ENV` - Environment (staging/production)
- `NAME` - Worker name for identification

Secrets (set via `wrangler secret put`):
- `LOOP_AUTHORIZATION_KEY` - Loop Message API authorization key
- `LOOP_SECRET_KEY` - Loop Message API secret key
- `OPENAI_API_KEY` - OpenAI API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `EXASEARCH_API_KEY` - Exa Search API key

## Code Style

This project uses Biome for linting and formatting with the following conventions:

- Double quotes for strings
- 2-space indentation
- Trailing commas in multi-line structures
- Semicolons required
- Line width: 80 characters
- Strict TypeScript type checking

Run `pnpm lint` to check and `pnpm format` to auto-format code.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the code style guidelines
4. Run tests and type checking (`pnpm typecheck`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

GNU General Public License v3.0
