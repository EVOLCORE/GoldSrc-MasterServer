#!/usr/bin/env node

/**
 * GoldSrc Master Server v2.0
 * High-performance UDP master server for CS 1.6
 * 
 * Features:
 * - Pre-computed response buffers (zero-allocation hot path)
 * - API + Local server list merging
 * - LRU-based connection tracking with rate limiting
 * - Optimized for Pterodactyl deployment
 */

import dgram from 'dgram';
import { env } from './config/env.js';
import { isValidRequest } from './protocol/goldsrc.js';
import { serverListService } from './services/server-list.service.js';
import { connectionTrackerService } from './services/connection-tracker.service.js';

// Create UDP socket with reuse option
const server = dgram.createSocket({
    type: 'udp4',
    reuseAddr: true,
});

// Performance counters
let requestCount = 0;

/**
 * Handle incoming UDP message
 * Optimized for minimal allocations on hot path
 */
server.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    // Validate request (fast check)
    if (!isValidRequest(msg)) {
        return;
    }

    const { address: clientIP, port: clientPort } = rinfo;

    // Check rate limit
    if (!connectionTrackerService.checkRateLimit(clientIP)) {
        return; // Drop rate-limited requests silently
    }

    // Track connection (returns true if new)
    const isNew = connectionTrackerService.track(clientIP, clientPort);

    // Get pre-computed response (zero allocation)
    const response = serverListService.getResponsePacket();

    // Send response
    server.send(response, clientPort, clientIP, (error) => {
        if (error) {
            console.error(`[ERROR] Send error to ${clientIP}:${clientPort}: ${error.message}`);
        } else {
            requestCount++;
            const status = isNew ? 'NEW' : 'RPT';
            console.log(`[SEND] [${status}] ${clientIP}:${clientPort} (${response.length}B, ${serverListService.getServerCount()} servers)`);
        }
    });
});

/**
 * Handle server errors
 */
server.on('error', (error) => {
    console.error('[FATAL] UDP Server error:', error.message);
    shutdown(1);
});

/**
 * Handle server listening
 */
server.on('listening', () => {
    const addr = server.address();
    console.log(`[OK] UDP Server listening on ${addr.address}:${addr.port}`);
});

/**
 * Graceful shutdown handler
 */
async function shutdown(code = 0): Promise<void> {
    console.log('\n[SHUTDOWN] Shutting down...');

    try {
        // Stop services
        serverListService.stop();
        await connectionTrackerService.stop();

        // Close UDP server
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });

        console.log('[OK] Server closed');
        console.log(`[STATS] Total requests handled: ${requestCount}`);
        console.log(`[STATS] Unique connections: ${connectionTrackerService.getUniqueCount()}`);
    } catch (error) {
        console.error('[ERROR] Shutdown error:', error);
    }

    process.exit(code);
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

/**
 * Main startup function
 */
async function main(): Promise<void> {
    console.log('');
    console.log('===============================================');
    console.log('   GoldSrc Master Server v2.0');
    console.log('   High-Performance Edition');
    console.log('===============================================');
    console.log('');

    // Print configuration
    console.log('[CONFIG] Configuration:');
    console.log(`   - UDP Server: ${env.UDP_HOST}:${env.UDP_PORT}`);
    console.log(`   - Environment: ${env.NODE_ENV}`);
    console.log(`   - API URL: ${env.API_URL}`);
    console.log(`   - Local Servers: ${env.LOCAL_SERVERS_FILE} (Priority: ${env.LOCAL_SERVERS_PRIORITY})`);
    console.log(`   - Connection Logging: ${env.ENABLE_CONNECTION_LOGGING ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Rate Limit: ${env.MAX_CONNECTIONS_PER_IP} req/${env.RATE_LIMIT_WINDOW_MS / 1000}s per IP`);
    console.log('');

    // Initialize services
    console.log('[INIT] Initializing services...');
    await connectionTrackerService.initialize();
    await serverListService.initialize();

    // Start UDP server
    server.bind(env.UDP_PORT, env.UDP_HOST);

    console.log('');
    console.log('===============================================');
    console.log('[RUNNING] Master Server is running!');
    console.log('   - Press Ctrl+C to stop');
    console.log(`   - Listening on UDP ${env.UDP_HOST}:${env.UDP_PORT}`);
    console.log(`   - Serving ${serverListService.getServerCount()} servers`);
    console.log('===============================================');
    console.log('');
}

// Start the server
main().catch((error) => {
    console.error('[FATAL] Fatal error:', error);
    process.exit(1);
});
