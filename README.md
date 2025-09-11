# Poppy

An extensible personal assistant framework for interacting with AI agents.

## Overview

Poppy is a modular personal assistant that connects various communication channels with AI agents to automate tasks and provide intelligent assistance. Built with TypeScript and designed for extensibility.

## Features

### Channels

#### Available
- **iMessage** - Send and receive messages via Loop Message API

#### Planned
- **Voice** - Voice-based interactions
- **SMS** - Direct SMS integration
- **WhatsApp** - WhatsApp Business API

### Agents

#### Available
- **Reservation Finding** - Search for restaurant availability

#### Planned
- **Reservation Booking** - Complete restaurant bookings
- **Calendar** - Manage calendar events and scheduling
- **Email** - Email management and automation
- **Travel** - Flight and hotel bookings
- **Task Management** - Todo lists and reminders

## Tech Stack

- **Runtime**: Node.js v22+
- **Package Manager**: pnpm with workspaces
- **Build System**: Turborepo
- **Backend**: Fastify (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM (Supabase)
- **Validation**: Zod schemas
- **Code Quality**: Biome for linting/formatting
- **Messaging**: Loop Message API

## Getting Started

### Prerequisites

- Node.js v22 or higher
- pnpm v10.12.1 or higher
- PostgreSQL database (or Supabase account)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/poppy.git
cd poppy

# Install dependencies
pnpm install

# Copy environment variables
cp apps/server/.env.example apps/server/.env
# Edit .env with your configuration
```

### Development

```bash
# Run development server
pnpm dev

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Format code
pnpm format

# Build for production
pnpm build
```

### Database Setup

```bash
cd packages/db

# Generate migrations
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Seed database (optional)
pnpm db:seed
```

### Testing Webhooks

For local webhook testing with Loop Message:

```bash
# Start ngrok tunnel (configured domain required)
pnpm tunnel
```

## Project Structure

```
poppy/
├── apps/
│   └── server/          # Fastify API server
├── packages/
│   ├── clients/         # Shared API clients
│   ├── db/              # Database schema and utilities
│   ├── schemas/         # Zod validation schemas
│   ├── types/           # TypeScript type definitions
│   └── supabase/        # Supabase migrations
├── turbo.json           # Turborepo configuration
├── pnpm-workspace.yaml  # pnpm workspace configuration
└── biome.json           # Code quality configuration
```

## Environment Variables

See `apps/server/.env.example` for required environment variables:

- `PORT` - Server port
- `HOST` - Server host
- `NODE_ENV` - Environment mode
- `LOOP_AUTHORIZATION_KEY` - Loop Message API key
- `LOOP_SECRET_KEY` - Loop Message secret
- `LOOP_BASE_URL` - Loop Message API URL
- `DATABASE_URL` - PostgreSQL connection string
