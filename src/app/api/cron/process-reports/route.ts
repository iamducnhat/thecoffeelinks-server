import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/cron/process-reports
 * 
 * Scheduled job: Check report queue and alert if pending > threshold.
 * Per spec: Run every 1 hour, alert if pending > 10
 * 
 * Security: Requires CRON_SECRET header
 */

const PENDING_THRESHOLD = 10;
const SLA_HOURS = 24;

export async function POST(request: Request) {
    try {
        // Verify cron secret
        const cronSecret = request.headers.get('X-Cron-Secret');
        const expectedSecret = process.env.CRON_SECRET;

        if (!expectedSecret || cronSecret !== expectedSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get pending reports count
        const { data: pendingReports, error: countError } = await supabaseAdmin
            .from('user_reports')
            .select('id, created_at, reported_user_id')
            .eq('status', 'pending');

        if (countError) {
            console.error('Count reports error:', countError);
            return NextResponse.json({ error: countError.message }, { status: 500 });
        }

        const pendingCount = pendingReports?.length || 0;
        const now = new Date();

        // Check for SLA violations (pending > 24 hours)
        const slaViolations = (pendingReports || []).filter((r: any) => {
            const createdAt = new Date(r.created_at);
            const hoursAgo = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            return hoursAgo > SLA_HOURS;
        });

        // Get reported users with multiple reports (abuse detection)
        const reportedUserCounts: Record<string, number> = {};
        (pendingReports || []).forEach((r: any) => {
            reportedUserCounts[r.reported_user_id] = (reportedUserCounts[r.reported_user_id] || 0) + 1;
        });

        const usersWithMultipleReports = Object.entries(reportedUserCounts)
            .filter(([_, count]) => count >= 3)
            .map(([userId, count]) => ({ userId, reportCount: count }));

        // Get report stats by reason
        const { data: reasonStats } = await supabaseAdmin
            .from('user_reports')
            .select('reason')
            .eq('status', 'pending');

        const reasonCounts: Record<string, number> = {};
        (reasonStats || []).forEach((r: any) => {
            reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
        });

        // Determine alert level
        let alertLevel = 'normal';
        const alerts: string[] = [];

        if (pendingCount > PENDING_THRESHOLD) {
            alertLevel = 'warning';
            alerts.push(`Pending reports (${pendingCount}) exceed threshold (${PENDING_THRESHOLD})`);
        }

        if (slaViolations.length > 0) {
            alertLevel = 'critical';
            alerts.push(`${slaViolations.length} reports exceed ${SLA_HOURS}h SLA`);
        }

        if (usersWithMultipleReports.length > 0) {
            alerts.push(`${usersWithMultipleReports.length} users have 3+ pending reports`);
        }

        // TODO: Send alerts to admin notification system if needed
        // This could integrate with Slack, email, or push notifications

        return NextResponse.json({
            success: true,
            pendingCount,
            threshold: PENDING_THRESHOLD,
            alertLevel,
            alerts: alerts.length > 0 ? alerts : undefined,
            stats: {
                slaViolations: slaViolations.length,
                usersWithMultipleReports,
                byReason: reasonCounts
            },
            // Average resolution time for resolved reports
            slaHours: SLA_HOURS
        });

    } catch (error: any) {
        console.error('Process reports cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Allow GET for health checks
export async function GET() {
    // Quick stats endpoint
    try {
        const { data: pendingCount } = await supabaseAdmin
            .rpc('count_pending_reports');

        return NextResponse.json({ 
            job: 'process-reports',
            frequency: '1 hour',
            status: 'active',
            pendingReports: pendingCount || 0,
            threshold: PENDING_THRESHOLD
        });
    } catch {
        return NextResponse.json({ 
            job: 'process-reports',
            frequency: '1 hour',
            status: 'active'
        });
    }
}
