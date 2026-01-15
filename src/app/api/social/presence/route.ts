import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/social/presence?storeId=X
 * Get users at a store (only those in "open" mode, respecting blocks)
 * 
 * PATCH /api/social/presence
 * Update user's presence status (legacy - use /mode endpoint)
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

/**
 * GET /api/social/presence?storeId=X
 * Returns users at store who are in "open" mode
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const storeId = searchParams.get('storeId');

        if (!storeId) {
            return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
        }

        // Get authenticated user (optional for regulars count, required for connected users)
        const { userId } = await getAuthenticatedUserId(request);

        // Get regulars count (all users at store, regardless of mode)
        const { data: regularsCountData } = await supabaseAdmin
            .rpc('get_store_regulars_count', { p_store_id: storeId });
        
        const regularsCount = regularsCountData || 0;

        // If user is authenticated, get connected users (respecting blocks)
        let connectedUsers: any[] = [];
        
        if (userId) {
            const { data: presenceData, error: presenceError } = await supabaseAdmin
                .rpc('get_store_presence', {
                    p_store_id: storeId,
                    p_requesting_user_id: userId
                });

            if (!presenceError && presenceData) {
                connectedUsers = presenceData.map((u: any) => ({
                    userId: u.user_id,
                    name: u.display_name,
                    avatarUrl: u.avatar_url,
                    enteredAt: u.entered_at
                }));
            }
        }

        // Response per spec
        return NextResponse.json({
            regularsCount,
            connectedUsers
        });

    } catch (error: any) {
        console.error('Presence fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/social/presence
 * Update user's presence (enter/exit store, update heartbeat)
 */
export async function PATCH(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { storeId, mode, action } = body;

        // Handle exit action
        if (action === 'exit' || action === 'leave') {
            await supabaseAdmin.rpc('clear_user_presence', { p_user_id: userId });
            return NextResponse.json({ success: true, action: 'exited' });
        }

        // Validate mode if provided
        const validModes = ['open', 'focus'];
        const presenceMode = mode && validModes.includes(mode) ? mode : 'focus';

        if (storeId) {
            // Enter store or update presence
            await supabaseAdmin.rpc('upsert_user_presence', {
                p_user_id: userId,
                p_store_id: storeId,
                p_mode: presenceMode
            });

            return NextResponse.json({ 
                success: true, 
                storeId,
                mode: presenceMode 
            });
        }

        // Just update mode without changing store
        if (mode) {
            await supabaseAdmin.rpc('update_presence_mode', {
                p_user_id: userId,
                p_mode: presenceMode
            });

            return NextResponse.json({ success: true, mode: presenceMode });
        }

        // Heartbeat - just update last_seen
        const { error } = await supabaseAdmin
            .from('user_presence')
            .update({ last_seen: new Date().toISOString() })
            .eq('user_id', userId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, action: 'heartbeat' });

    } catch (error: any) {
        console.error('Presence update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
