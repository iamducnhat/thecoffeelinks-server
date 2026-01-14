import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/social/connections/requests
 * Get pending connection requests for the current user
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

        const userId = authData.user.id;

        // Get pending requests where user is the recipient (user_id_2)
        const { data: requests, error } = await supabaseAdmin
            .from('connections')
            .select(`
                id,
                user_id_1,
                status,
                message,
                created_at,
                sender:users!connections_user_id_1_fkey (
                    id, name, full_name, avatar_url, job_title, industry, bio
                )
            `)
            .eq('user_id_2', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get requests error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to match Swift ConnectionRequest model
        const transformedRequests = requests?.map((r: any) => ({
            id: r.id,
            fromUserId: r.user_id_1,
            status: r.status,
            message: r.message,
            createdAt: r.created_at,
            user: r.sender ? {
                id: r.sender.id,
                name: r.sender.name || r.sender.full_name,
                fullName: r.sender.full_name,
                avatarUrl: r.sender.avatar_url,
                jobTitle: r.sender.job_title,
                industry: r.sender.industry,
                bio: r.sender.bio
            } : null
        })) || [];

        return NextResponse.json({ success: true, requests: transformedRequests });

    } catch (error: any) {
        console.error('Get requests error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
