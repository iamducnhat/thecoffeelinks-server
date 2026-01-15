import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/social/block
 * 
 * Block a user. Per spec:
 * - Immediate effect (client stores locally)
 * - Persisted to server
 * - Blocked user invisible in all presence queries
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
type BlockReason = typeof VALID_REASONS[number];

export async function POST(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { blockedUserId, reason } = body;

        if (!blockedUserId) {
            return NextResponse.json({ error: 'blockedUserId is required' }, { status: 400 });
        }

        // Validate reason if provided
        if (reason && !VALID_REASONS.includes(reason)) {
            return NextResponse.json({ 
                error: `Invalid reason. Valid options: ${VALID_REASONS.join(', ')}` 
            }, { status: 400 });
        }

        // Can't block yourself
        if (blockedUserId === userId) {
            return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });
        }

        // Verify blocked user exists
        const { data: targetUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', blockedUserId)
            .single();

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Create block (upsert to handle duplicates)
        const { error: blockError } = await supabaseAdmin
            .from('user_blocks')
            .upsert({
                user_id: userId,
                blocked_user_id: blockedUserId,
                reason: reason || null,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,blocked_user_id'
            });

        if (blockError) {
            console.error('Block error:', blockError);
            return NextResponse.json({ error: blockError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true,
            blockedUserId,
            reason: reason || null
        });

    } catch (error: any) {
        console.error('Block user error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/social/block
 * Unblock a user
 */
export async function DELETE(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const blockedUserId = searchParams.get('blockedUserId');

        if (!blockedUserId) {
            return NextResponse.json({ error: 'blockedUserId is required' }, { status: 400 });
        }

        const { error: deleteError } = await supabaseAdmin
            .from('user_blocks')
            .delete()
            .eq('user_id', userId)
            .eq('blocked_user_id', blockedUserId);

        if (deleteError) {
            console.error('Unblock error:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true,
            unblockedUserId: blockedUserId
        });

    } catch (error: any) {
        console.error('Unblock user error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/social/block
 * Get list of blocked users
 */
export async function GET(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const { data: blocks, error } = await supabaseAdmin
            .from('user_blocks')
            .select(`
                id,
                blocked_user_id,
                reason,
                created_at,
                blocked_user:blocked_user_id (
                    id,
                    full_name,
                    avatar_url
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get blocks error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            blocks: (blocks || []).map((b: any) => ({
                id: b.id,
                blockedUserId: b.blocked_user_id,
                blockedUserName: b.blocked_user?.full_name,
                blockedUserAvatar: b.blocked_user?.avatar_url,
                reason: b.reason,
                createdAt: b.created_at
            })),
            count: blocks?.length || 0
        });

    } catch (error: any) {
        console.error('Get blocks error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
