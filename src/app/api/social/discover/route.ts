import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/social/discover
 * Get discoverable users at a specific store
 * Query params: storeId (required), limit (optional, default 20)
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const currentUserId = authData.user.id;

        const { searchParams } = new URL(request.url);
        const storeId = searchParams.get('storeId');
        const limit = parseInt(searchParams.get('limit') || '20');

        if (!storeId) {
            return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
        }

        // Get active check-ins at this store, excluding current user
        // Join with users table to get user profile info
        const { data: checkIns, error } = await supabaseAdmin
            .from('store_checkins')
            .select(`
                id,
                store_id,
                checked_in_at,
                presence_status,
                user:users (
                    id,
                    name,
                    full_name,
                    avatar_url,
                    job_title,
                    industry,
                    bio,
                    is_open_to_networking
                )
            `)
            .eq('store_id', storeId)
            .is('checked_out_at', null)
            .neq('user_id', currentUserId)
            .neq('presence_status', 'invisible')
            .order('checked_in_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Discover users error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to match Swift EnhancedCheckIn model
        const users = checkIns?.map((c: any) => ({
            id: c.id,
            storeId: c.store_id,
            checkedInAt: c.checked_in_at,
            presenceStatus: c.presence_status || 'available',
            user: c.user ? {
                id: c.user.id,
                name: c.user.name || c.user.full_name,
                fullName: c.user.full_name,
                avatarUrl: c.user.avatar_url,
                jobTitle: c.user.job_title,
                industry: c.user.industry,
                bio: c.user.bio,
                isOpenToNetworking: c.user.is_open_to_networking
            } : null
        })).filter((u: any) => u.user !== null) || [];

        return NextResponse.json({ success: true, users });

    } catch (error: any) {
        console.error('Discover users error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
