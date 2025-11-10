# Poppy Cloudflare Worker

A Cloudflare Workers version of the Poppy server, built with Hono and using Cloudflare KV for state management.

## Overview

This is a port of the main Poppy server (`apps/server`) designed to run on Cloudflare Workers. It replaces:
- **Fastify** → **Hono** (lightweight web framework optimized for edge computing)
- **Redis** → **Cloudflare KV** (key-value storage for debouncing messages)
- **PostgreSQL via Direct Connection** → **PostgreSQL via Hyperdrive** (connection pooling and query acceleration)

## Architecture

### Key Components

- **Hono App** (`src/index.ts`) - Main application with routes and middleware
- **Loop Message Routes** (`src/routes/loop-message.ts`) - Webhook handlers and message sending
- **Database Client** (`src/db/client.ts`) - Drizzle ORM with Hyperdrive connection
- **KV Debouncer** (`src/helpers/kv-debouncer.ts`) - Message debouncing using Cloudflare KV
- **Message Storage** (`src/services/loop/store-loop-messages.ts`) - Store messages in PostgreSQL
- **Message Inbound Handler** (`src/services/loop/loop-message-inbound-handler.ts`) - Process incoming messages

### Differences from Original Server

1. **Database Access via Hyperdrive**
   - Uses Cloudflare Hyperdrive for optimized PostgreSQL connections
   - Same Drizzle ORM schemas from `@poppy/db`
   - Connection pooling and query caching built-in
   - See [HYPERDRIVE_SETUP.md](./HYPERDRIVE_SETUP.md) for setup instructions

2. **Simplified Message Processing**
   - Message storage is implemented
   - AI agent processing pipeline is ready to integrate
   - Add your AI logic in the message handler (TODO marked)

3. **Edge-Optimized**
   - Designed to run on Cloudflare's edge network
   - Uses `executionCtx.waitUntil()` for background processing
   - Optimized for low latency and global distribution

## Setup

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account
- Wrangler CLI installed globally: `npm install -g wrangler`

### Installation

1. Install dependencies:
```bash
cd apps/worker
pnpm install
```

2. Create KV namespace:
```bash
# Create production KV namespace
wrangler kv:namespace create "MESSAGE_DEBOUNCER"

# Create preview KV namespace for development
wrangler kv:namespace create "MESSAGE_DEBOUNCER" --preview
```

3. Update `wrangler.json` with your KV namespace IDs:
```json
{
  "kv_namespaces": [
    {
      "binding": "MESSAGE_DEBOUNCER",
      "id": "YOUR_PRODUCTION_KV_ID",
      "preview_id": "YOUR_PREVIEW_KV_ID"
    }
  ]
}
```

4. **Set up Hyperdrive for database access:**

Follow the detailed instructions in [HYPERDRIVE_SETUP.md](./HYPERDRIVE_SETUP.md). Quick summary:

```bash
# Create Hyperdrive configuration
wrangler hyperdrive create poppy-db --connection-string="postgresql://YOUR_DATABASE_URL"

# Update wrangler.json with the returned Hyperdrive ID
```

5. Set up environment variables:

**For local development:**
```bash
# Copy the example file
cp .dev.vars.example .dev.vars

# Edit .dev.vars with your actual credentials
```

**For production:**
```bash
# Set secrets using Wrangler
wrangler secret put LOOP_AUTHORIZATION_KEY
wrangler secret put LOOP_SECRET_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put EXA_API_KEY
```

## Development

Start the local development server:
```bash
pnpm dev
```

The server will be available at `http://localhost:8787`

### Available Routes

- `GET /` - Hello world endpoint
- `GET /health` - Health check
- `POST /api/messages/send` - Send a message via Loop Message API
- `POST /api/webhooks/loop-message` - Receive Loop Message webhooks

## Deployment

Deploy to Cloudflare Workers:
```bash
pnpm deploy
```

Your worker will be deployed to `https://poppy-worker.<your-subdomain>.workers.dev`

### Production Checklist

- [ ] Create and configure KV namespaces
- [ ] Create and configure Hyperdrive (see [HYPERDRIVE_SETUP.md](./HYPERDRIVE_SETUP.md))
- [ ] Set all required secrets using `wrangler secret put`
- [ ] Update `wrangler.json` with correct KV namespace IDs and Hyperdrive ID
- [ ] Configure custom domain (optional)
- [ ] Set up webhook URL in Loop Message dashboard

## Configuration

### wrangler.json

The main configuration file for Cloudflare Workers:

```json
{
  "name": "poppy-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "kv_namespaces": [
    {
      "binding": "MESSAGE_DEBOUNCER",
      "id": "...",
      "preview_id": "..."
    }
  ],
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "..."
    }
  ],
  "vars": {
    "NODE_ENV": "production"
  }
}
```

### Environment Variables

All environment variables are accessed via `c.env` in Hono:

```typescript
const apiKey = c.env.LOOP_AUTHORIZATION_KEY;
const kv = c.env.MESSAGE_DEBOUNCER;
const db = createDatabaseClient(c.env); // Uses HYPERDRIVE binding
```

## Type Safety

TypeScript types are defined in `worker-configuration.d.ts`:

```typescript
export interface Env {
  MESSAGE_DEBOUNCER: KVNamespace;
  LOOP_AUTHORIZATION_KEY: string;
  // ... other environment variables
}
```

Generate types from wrangler.toml:
```bash
pnpm cf-typegen
```

## How It Works

### Message Debouncing Flow

1. **Webhook Received** - Loop Message sends webhook to `/api/webhooks/loop-message`
2. **Add to Debouncer** - Message is added to KV with 4-second TTL
3. **Wait** - Handler waits 3.5 seconds for additional messages
4. **Check Latest** - Verifies this is still the latest message
5. **Process** - Processes all debounced messages together
6. **Clear** - Removes messages from KV

### Background Processing

Cloudflare Workers have a maximum execution time. Use `waitUntil()` for long-running tasks:

```typescript
c.executionCtx.waitUntil(
  handleMessageInbound({
    payload,
    kv: c.env.MESSAGE_DEBOUNCER,
    ctx: c.executionCtx,
  })
);
```

This allows the response to be sent immediately while processing continues in the background.

## Monitoring

View logs in real-time:
```bash
wrangler tail
```

Or view logs in the Cloudflare dashboard:
- Go to Workers & Pages
- Select your worker
- Click "Logs" tab

## Troubleshooting

### KV Operations Failing

- Ensure KV namespace IDs in `wrangler.json` are correct
- Verify KV namespace exists: `wrangler kv:namespace list`

### Database Connection Issues

- See [HYPERDRIVE_SETUP.md](./HYPERDRIVE_SETUP.md) troubleshooting section
- Verify Hyperdrive ID is correctly set in `wrangler.json`
- Ensure you're on a Workers Paid plan (Hyperdrive requires it)

### Environment Variables Not Found

- For local: Check `.dev.vars` file exists and has correct values
- For production: Verify secrets are set with `wrangler secret list`

### Timeout Errors

- Workers have a 30-second CPU time limit (10 seconds on free plan)
- Use `waitUntil()` for background tasks
- Consider breaking up long operations

## Next Steps

To complete the migration:

1. **Implement AI Processing** ✨
   - Add the full AI agent pipeline from `apps/server`
   - The TODO is marked in `loop-message-inbound-handler.ts`
   - Integrate with OpenAI/OpenRouter APIs (dependencies already added)

2. **Testing**
   - Add unit tests with Vitest
   - Test webhook handling end-to-end
   - Test KV debouncer logic
   - Test database operations with Hyperdrive

3. **Optimization**
   - Monitor Hyperdrive performance in dashboard
   - Optimize query patterns
   - Consider adding Redis/KV caching for frequently accessed data

## Resources

- [Hono Documentation](https://hono.dev)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
