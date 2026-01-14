import { LRUCache } from 'lru-cache';
import { logger } from './logger';

interface RateLimitConfig {
    uniqueTokenPerInterval: number; // Max number of unique IPs/Users to track
    interval: number; // Window size in ms
}

interface RateLimitState {
    count: number;
    warnings: number;
    banExpires?: number;
}

export class RateLimiter {
    private cache: LRUCache<string, RateLimitState>;
    private interval: number;

    constructor(config: RateLimitConfig) {
        this.cache = new LRUCache<string, RateLimitState>({
            max: config.uniqueTokenPerInterval,
            ttl: config.interval,
        });
        this.interval = config.interval;
    }

    /**
     * Check if a token is rate limited.
     * @param token Unique identifier (IP or User ID)
     * @param limit Max requests per interval
     * @returns {success: boolean, limit: number, remaining: number}
     */
    check(token: string, limit: number): { success: boolean; limit: number; remaining: number } {
        const now = Date.now();
        const state = this.cache.get(token) || { count: 0, warnings: 0 };

        // Check for active ban
        if (state.banExpires && state.banExpires > now) {
            return { success: false, limit: 0, remaining: 0 };
        }

        // Reset ban if expired
        if (state.banExpires && state.banExpires <= now) {
            state.banExpires = undefined;
            state.warnings = 0;
            state.count = 0;
        }

        const currentCount = state.count + 1;
        state.count = currentCount;

        let success = true;

        if (currentCount > limit) {
            success = false;
            // Escalation Logic
            state.warnings += 1;

            // Ban for 10 minutes if 5 warnings
            if (state.warnings >= 5) {
                state.banExpires = now + 10 * 60 * 1000;
                logger.security('IP/User Banned', { token, warnings: state.warnings });
            }
        }

        this.cache.set(token, state);

        return {
            success,
            limit,
            remaining: Math.max(0, limit - currentCount),
        };
    }
}

// Singleton instances for different limit types
export const publicRateLimiter = new RateLimiter({
    uniqueTokenPerInterval: 500,
    interval: 60 * 1000, // 1 minute
});

export const authRateLimiter = new RateLimiter({
    uniqueTokenPerInterval: 500,
    interval: 60 * 1000, // 1 minute
});
