import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { env } from '../config/env.js';
import { createResponsePacket, EMPTY_RESPONSE } from '../protocol/goldsrc.js';

interface LocalServerConfig {
    enabled: boolean;
    servers: Array<{
        address: string;
        name?: string;
        priority?: number;
    }>;
}

interface ApiResponse {
    boostedServers?: Array<{
        address: string;
    }>;
}

/**
 * Server List Service
 * Manages fetching, caching, and merging server lists from API and local config
 */
class ServerListService {
    private serverList: string[] = [];
    private responsePacket: Buffer = EMPTY_RESPONSE;
    private lastUpdate = 0;
    private updateTimer: NodeJS.Timeout | null = null;

    /**
     * Get cached response packet (zero-allocation on hot path)
     */
    getResponsePacket(): Buffer {
        return this.responsePacket;
    }

    /**
     * Get current server count
     */
    getServerCount(): number {
        return this.serverList.length;
    }

    /**
     * Get server list
     */
    getServers(): string[] {
        return this.serverList;
    }

    /**
     * Initialize service and start periodic updates
     */
    async initialize(): Promise<void> {
        console.log('[INIT] Initializing server list service...');
        await this.update();
        this.startPeriodicUpdates();
    }

    /**
     * Update server list from all sources
     */
    async update(): Promise<number> {
        try {
            const [apiServers, localServers] = await Promise.all([
                this.fetchFromApi(),
                this.loadLocalServers(),
            ]);

            // Merge based on priority setting
            this.serverList = this.mergeServers(apiServers, localServers);
            this.responsePacket = createResponsePacket(this.serverList);
            this.lastUpdate = Date.now();

            console.log(`[OK] Server list updated: ${this.serverList.length} servers`);
            if (this.serverList.length > 0 && this.serverList.length <= 10) {
                this.serverList.forEach((server, i) => console.log(`   ${i + 1}. ${server}`));
            }

            return this.serverList.length;
        } catch (error) {
            console.error('[ERROR] Failed to update server list:', error instanceof Error ? error.message : error);
            return this.serverList.length;
        }
    }

    /**
     * Fetch servers from external API
     */
    private async fetchFromApi(): Promise<string[]> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${env.API_URL}?full=1`, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'GoldSrc-Master-Server/2.0',
                },
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as ApiResponse;
            const servers = data.boostedServers?.map((s) => s.address) || [];

            console.log(`[API] Returned ${servers.length} servers`);
            return servers;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.warn('[WARN] API request timed out');
            } else {
                console.warn('[WARN] API fetch failed:', error instanceof Error ? error.message : error);
            }
            return [];
        }
    }

    /**
     * Load servers from local JSON file
     */
    private async loadLocalServers(): Promise<string[]> {
        if (!existsSync(env.LOCAL_SERVERS_FILE)) {
            return [];
        }

        try {
            const content = await readFile(env.LOCAL_SERVERS_FILE, 'utf-8');
            const config: LocalServerConfig = JSON.parse(content);

            if (!config.enabled) {
                console.log('[LOCAL] Local servers disabled');
                return [];
            }

            const servers = config.servers
                .sort((a, b) => (a.priority || 999) - (b.priority || 999))
                .map((s) => s.address);

            console.log(`[LOCAL] Loaded ${servers.length} local servers`);
            return servers;
        } catch (error) {
            console.warn('[WARN] Failed to load local servers:', error instanceof Error ? error.message : error);
            return [];
        }
    }

    /**
     * Merge API and local servers based on priority setting
     */
    private mergeServers(apiServers: string[], localServers: string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];

        const addUnique = (servers: string[]) => {
            for (const server of servers) {
                if (!seen.has(server)) {
                    seen.add(server);
                    result.push(server);
                }
            }
        };

        switch (env.LOCAL_SERVERS_PRIORITY) {
            case 'only':
                // Only use local servers
                addUnique(localServers);
                break;
            case 'high':
                // Local servers first, then API
                addUnique(localServers);
                addUnique(apiServers);
                break;
            case 'low':
                // API servers first, then local
                addUnique(apiServers);
                addUnique(localServers);
                break;
        }

        return result;
    }

    /**
     * Start periodic update timer
     */
    private startPeriodicUpdates(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.updateTimer = setInterval(() => {
            this.update().catch(console.error);
        }, env.API_UPDATE_INTERVAL);

        console.log(`[TIMER] Periodic updates every ${env.API_UPDATE_INTERVAL / 60000} minutes`);
    }

    /**
     * Stop service
     */
    stop(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
}

// Singleton instance
export const serverListService = new ServerListService();
