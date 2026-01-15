import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/cron/cleanup-presence
 * 
 * Scheduled job: Remove stale presence records (>30 min old).
 * Per spec: Run every 5 minutes
 * 
 * Security: Requires CRON_SECRET header
 */

export async function POST(request: Request) {
    try {
        // Verify cron secret
        const cronSecret = request.headers.get('X-Cron-Secret');
        const expectedSecret = process.env.CRON_SECRET;

        if (!expectedSecret || cronSecret !== expectedSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const startTime = Date.now();

        // Call database function to cleanup stale presence
        const { data: deletedCount, error: cleanupError } = await supabaseAdmin
            .rpc('cleanup_stale_presence');

        if (cleanupError) {
            console.error('Cleanup presence error:', cleanupError);
            return NextResponse.json({ error: cleanupError.message }, { status: 500 });
        }

        // Also cleanup old rate limit records
        const { data: rateLimitDeleted } = await supabaseAdmin
            .rpc('cleanup_order_rate_limits');

        // Get current presence stats
        const { data: stats } = await supabaseAdmin
            .from('user_presence')
            .select('store_id, mode', { count: 'exact' });

        const openModeCount = stats?.filter((p: any) => p.mode === 'open').length || 0;
        const focusModeCount = stats?.filter((p: any) => p.mode === 'focus').length || 0;

        const elapsedMs = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            cleanup: {
                presenceRecordsRemoved: deletedCount || 0,
                rateLimitRecordsRemoved: rateLimitDeleted || 0
            },
            currentStats: {
                totalPresence: stats?.length || 0,
                openMode: openModeCount,
                focusMode: focusModeCount
            },
            executionTimeMs: elapsedMs
        });

    } catch (error: any) {
        console.error('Cleanup presence cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Allow GET for health checks
export async function GET() {
    return NextResponse.json({ 
        job: 'cleanup-presence',
        frequency: '5 minutes',
        status: 'active'
    });
}
