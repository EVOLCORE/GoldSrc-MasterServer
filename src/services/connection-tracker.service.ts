import { appendFile, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { env } from '../config/env.js';

interface ConnectionEntry {
    clientIP: string;
    clientPort: number;
    timestamp: string;
    date: string;
    time: string;
    year: number;
}

/**
 * Connection Tracker Service
 * Efficient tracking with LRU-style eviction and rate limiting
 */
class ConnectionTrackerService {
    // Use Map for LRU-style eviction (insertion order preserved)
    private connections = new Map<string, number>();
    private rateLimitMap = new Map<string, number>();
    private pendingLogs: string[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private initialized = false;

    /**
     * Initialize service and load existing connections
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.loadExistingConnections();
        this.startFlushTimer();
        this.initialized = true;

        console.log(`[TRACKER] Connection tracker initialized: ${this.connections.size} existing connections`);
    }

    /**
     * Check if connection is unique and track it
     * Returns true if new connection, false if duplicate
     */
    track(clientIP: string, clientPort: number): boolean {
        const key = `${clientIP}:${clientPort}`;

        // Check if already tracked
        if (this.connections.has(key)) {
            return false;
        }

        // Add new connection
        this.connections.set(key, Date.now());

        // Evict old entries if over limit (LRU style)
        if (this.connections.size > env.MAX_TRACKED_CONNECTIONS) {
            const firstKey = this.connections.keys().next().value;
            if (firstKey) {
                this.connections.delete(firstKey);
            }
        }

        // Log the connection
        if (env.ENABLE_CONNECTION_LOGGING) {
            this.logConnection(clientIP, clientPort);
        }

        return true;
    }

    /**
     * Check rate limit for IP
     * Returns true if allowed, false if rate limited
     */
    checkRateLimit(clientIP: string): boolean {
        const count = this.rateLimitMap.get(clientIP) || 0;

        if (count >= env.MAX_CONNECTIONS_PER_IP) {
            return false;
        }

        this.rateLimitMap.set(clientIP, count + 1);

        // Schedule cleanup
        setTimeout(() => {
            const current = this.rateLimitMap.get(clientIP) || 1;
            if (current <= 1) {
                this.rateLimitMap.delete(clientIP);
            } else {
                this.rateLimitMap.set(clientIP, current - 1);
            }
        }, env.RATE_LIMIT_WINDOW_MS);

        return true;
    }

    /**
     * Get total unique connections
     */
    getUniqueCount(): number {
        return this.connections.size;
    }

    /**
     * Log connection for analytics
     */
    private logConnection(clientIP: string, clientPort: number): void {
        const now = new Date();
        const entry: ConnectionEntry = {
            clientIP,
            clientPort,
            timestamp: now.toISOString(),
            date: now.toDateString(),
            time: now.toTimeString().split(' ')[0],
            year: now.getFullYear(),
        };

        console.log(`[NEW] ${clientIP}:${clientPort} at ${entry.date} ${entry.time}`);

        // Queue for batch file write
        const logLine = `${entry.timestamp},${clientIP},${clientPort},${entry.date},${entry.time},${entry.year}`;
        this.pendingLogs.push(logLine);

        // Send to API asynchronously (fire and forget)
        if (env.CONNECTIONS_API_URL) {
            this.sendToApi(entry).catch(() => { });
        }
    }

    /**
     * Send connection to API
     */
    private async sendToApi(entry: ConnectionEntry): Promise<void> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            await fetch(env.CONNECTIONS_API_URL!, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'GoldSrc-Master-Server/2.0',
                },
                body: JSON.stringify(entry),
            });

            clearTimeout(timeout);
        } catch {
            // Silent fail - API logging is optional
        }
    }

    /**
     * Load existing connections from log file
     */
    private async loadExistingConnections(): Promise<void> {
        if (!existsSync(env.LOG_FILE)) {
            // Create file with header
            await writeFile(env.LOG_FILE, 'timestamp,client_ip,client_port,date,time,year\n');
            return;
        }

        try {
            const content = await readFile(env.LOG_FILE, 'utf-8');
            const lines = content.split('\n').slice(1); // Skip header

            for (const line of lines) {
                if (!line.trim()) continue;
                const [, clientIP, clientPort] = line.split(',');
                if (clientIP && clientPort) {
                    this.connections.set(`${clientIP}:${clientPort}`, 0);
                }
            }
        } catch {
            console.warn('[WARN] Failed to load existing connections');
        }
    }

    /**
     * Flush pending logs to file
     */
    private async flushLogs(): Promise<void> {
        if (this.pendingLogs.length === 0) return;

        const toFlush = this.pendingLogs.splice(0);
        try {
            await appendFile(env.LOG_FILE, toFlush.join('\n') + '\n');
        } catch {
            // Re-queue on failure
            this.pendingLogs.unshift(...toFlush);
        }
    }

    /**
     * Start periodic log flush timer
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            this.flushLogs().catch(() => { });
        }, 5000); // Flush every 5 seconds
    }

    /**
     * Stop service and flush remaining logs
     */
    async stop(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flushLogs();
    }
}

// Singleton instance
export const connectionTrackerService = new ConnectionTrackerService();
