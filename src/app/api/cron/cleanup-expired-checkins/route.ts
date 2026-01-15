import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/cron/cleanup-expired-checkins
 * 
 * Scheduled job: Auto check-out users whose check-in has expired (time-boxed check-ins).
 * Per spec: Run every 1-5 minutes
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

        // Call database function to cleanup expired check-ins
        const { data: expiredCount, error: cleanupError } = await supabaseAdmin
            .rpc('cleanup_expired_checkins');

        if (cleanupError) {
            console.error('Cleanup expired check-ins error:', cleanupError);
            return NextResponse.json({ error: cleanupError.message }, { status: 500 });
        }

        // Get current active check-ins stats
        const { data: activeCheckIns, count: activeCount } = await supabaseAdmin
            .from('store_checkins')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Get count of time-boxed check-ins that are still active
        const { data: timeBoxedCheckIns, count: timeBoxedCount } = await supabaseAdmin
            .from('store_checkins')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .not('expires_at', 'is', null);

        const elapsedMs = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            cleanup: {
                expiredCheckInsProcessed: expiredCount || 0
            },
            currentStats: {
                activeCheckIns: activeCount || 0,
                timeBoxedCheckIns: timeBoxedCount || 0
            },
            executionTimeMs: elapsedMs
        });

    } catch (error: any) {
        console.error('Cleanup expired check-ins cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Allow GET for health checks
export async function GET() {
    return NextResponse.json({ 
        job: 'cleanup-expired-checkins',
        frequency: '1-5 minutes',
        status: 'active',
        description: 'Auto check-out users whose time-boxed check-in has expired'
    });
}
