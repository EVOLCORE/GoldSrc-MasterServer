# GoldSrc Master Server

High-performance UDP master server for Counter-Strike 1.6 and other GoldSrc games.

## Features

- **Zero-allocation hot path** - Pre-computed response buffers for maximum throughput
- **API + Local servers** - Merge external API and local server lists with priority control
- **Rate limiting** - Per-IP request throttling to prevent abuse
- **Connection tracking** - LRU-based unique connection logging
- **Pterodactyl support** - Ready-to-use egg for panel deployment
- **TypeScript** - Full type safety with Zod validation

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run server
npm start
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `UDP_PORT` | Server port | 27010 |
| `API_URL` | External server list API | - |
| `API_UPDATE_INTERVAL` | API refresh rate (ms) | 1200000 |
| `LOCAL_SERVERS_FILE` | Local server list JSON | local-servers.json |
| `LOCAL_SERVERS_PRIORITY` | high, low, or only | high |
| `ENABLE_CONNECTION_LOGGING` | Log connections | true |
| `MAX_CONNECTIONS_PER_IP` | Rate limit per minute | 100 |

## Local Server List

Edit `local-servers.json`:

```json
{
  "enabled": true,
  "servers": [
    { "address": "192.168.1.100:27015", "priority": 1 },
    { "address": "10.0.0.50:27015", "priority": 2 }
  ]
}
```

## Pterodactyl Deployment

1. Import `egg-master-server.json` into Pterodactyl
2. Create new server with "GoldSrc Master Server" egg
3. Configure variables in panel
4. Start server

## Development

```bash
npm run dev       # Watch mode with hot reload
npm run lint      # ESLint check
npm run typecheck # TypeScript check
```

## License

ISC
