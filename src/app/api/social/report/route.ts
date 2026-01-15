import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/social/report
 * 
 * Report + block a user. Per spec:
 * - Creates user_reports row
 * - Auto-blocks the reported user (via database trigger)
 * - SLA: <24 hours for review
 */

// Helper to extract and validate user from auth token
async function getAuthenticatedUserId(request: Request): Promise<{ userId: string | null; error?: string }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { userId: null, error: 'Authorization required' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: null, error: 'Invalid token' };
    }
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return { userId: null, error: 'Invalid authentication token' };
        }
        return { userId: data.user.id };
    } catch {
        return { userId: null, error: 'Authentication failed' };
    }
}

const VALID_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
type ReportReason = typeof VALID_REASONS[number];

// Rate limiting: max 10 reports per user per hour
const reportRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
const MAX_REPORTS_PER_HOUR = 10;

function checkReportRateLimit(userId: string): boolean {
    const now = Date.now();
    const limit = reportRateLimits.get(userId);
    
    if (!limit || now > limit.resetAt) {
        reportRateLimits.set(userId, { count: 1, resetAt: now + 3600000 });
        return true;
    }
    
    if (limit.count >= MAX_REPORTS_PER_HOUR) {
        return false;
    }
    
    limit.count++;
    return true;
}

export async function POST(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        // Rate limit check
        if (!checkReportRateLimit(userId)) {
            return NextResponse.json({ 
                error: 'Too many reports. Please try again later.' 
            }, { status: 429 });
        }

        const body = await request.json();
        const { reportedUserId, reason, description } = body;

        if (!reportedUserId) {
            return NextResponse.json({ error: 'reportedUserId is required' }, { status: 400 });
        }

        if (!reason || !VALID_REASONS.includes(reason)) {
            return NextResponse.json({ 
                error: `Invalid reason. Valid options: ${VALID_REASONS.join(', ')}` 
            }, { status: 400 });
        }

        // Can't report yourself
        if (reportedUserId === userId) {
            return NextResponse.json({ error: 'Cannot report yourself' }, { status: 400 });
        }

        // Verify reported user exists
        const { data: targetUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', reportedUserId)
            .single();

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if already reported by this user (prevent duplicate reports)
        const { data: existingReport } = await supabaseAdmin
            .from('user_reports')
            .select('id')
            .eq('reporter_id', userId)
            .eq('reported_user_id', reportedUserId)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingReport) {
            return NextResponse.json({ 
                error: 'You have already reported this user. Report is pending review.' 
            }, { status: 400 });
        }

        // Create report (database trigger will auto-create block)
        const { data: report, error: reportError } = await supabaseAdmin
            .from('user_reports')
            .insert({
                reporter_id: userId,
                reported_user_id: reportedUserId,
                reason: reason as ReportReason,
                description: description ? String(description).slice(0, 1000) : null,
                status: 'pending'
            })
            .select()
            .single();

        if (reportError) {
            console.error('Report error:', reportError);
            return NextResponse.json({ error: reportError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true,
            reportId: report.id,
            reportedUserId,
            reason,
            // Per spec: user is also auto-blocked
            userBlocked: true
        });

    } catch (error: any) {
        console.error('Report user error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/social/report
 * Get user's own reports (for transparency)
 */
export async function GET(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const { data: reports, error } = await supabaseAdmin
            .from('user_reports')
            .select(`
                id,
                reported_user_id,
                reason,
                status,
                created_at,
                reviewed_at
            `)
            .eq('reporter_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Get reports error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            reports: (reports || []).map((r: any) => ({
                id: r.id,
                reportedUserId: r.reported_user_id,
                reason: r.reason,
                status: r.status,
                createdAt: r.created_at,
                reviewedAt: r.reviewed_at
            })),
            count: reports?.length || 0
        });

    } catch (error: any) {
        console.error('Get reports error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
