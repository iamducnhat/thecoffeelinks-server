import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/social/connections
 * Get all connections for the current user
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

        // Get all accepted connections where user is either user_id_1 or user_id_2
        const { data: connections, error } = await supabaseAdmin
            .from('connections')
            .select(`
                id,
                user_id_1,
                user_id_2,
                status,
                message,
                created_at,
                updated_at,
                user1:users!connections_user_id_1_fkey (
                    id, name, full_name, avatar_url, job_title, industry
                ),
                user2:users!connections_user_id_2_fkey (
                    id, name, full_name, avatar_url, job_title, industry
                )
            `)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
            .eq('status', 'accepted')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Get connections error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to show the other user in each connection
        const transformedConnections = connections?.map((c: any) => {
            const isUser1 = c.user_id_1 === userId;
            const otherUser = isUser1 ? c.user2 : c.user1;
            return {
                id: c.id,
                userId: isUser1 ? c.user_id_2 : c.user_id_1,
                status: c.status,
                message: c.message,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                user: otherUser ? {
                    id: otherUser.id,
                    name: otherUser.name || otherUser.full_name,
                    fullName: otherUser.full_name,
                    avatarUrl: otherUser.avatar_url,
                    jobTitle: otherUser.job_title,
                    industry: otherUser.industry
                } : null
            };
        }) || [];

        return NextResponse.json({ success: true, connections: transformedConnections });

    } catch (error: any) {
        console.error('Get connections error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/social/connections
 * Send a connection request to another user
 */
export async function POST(request: Request) {
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
        const body = await request.json();
        const { toUserId, message } = body;

        if (!toUserId) {
            return NextResponse.json({ error: 'toUserId is required' }, { status: 400 });
        }

        if (toUserId === userId) {
            return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 });
        }

        // Check for rate limiting (max 10 requests per hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentRequests, error: rateError } = await supabaseAdmin
            .from('connections')
            .select('id')
            .eq('user_id_1', userId)
            .gte('created_at', oneHourAgo);

        if (!rateError && recentRequests && recentRequests.length >= 10) {
            return NextResponse.json({ 
                error: 'Rate limit exceeded',
                rateLimited: true,
                retryAfter: 3600
            }, { status: 429 });
        }

        // Check if connection already exists
        const { data: existing } = await supabaseAdmin
            .from('connections')
            .select('id, status')
            .or(`and(user_id_1.eq.${userId},user_id_2.eq.${toUserId}),and(user_id_1.eq.${toUserId},user_id_2.eq.${userId})`)
            .single();

        if (existing) {
            return NextResponse.json({ 
                success: true, 
                connection: { id: existing.id, status: existing.status },
                alreadyExists: true
            });
        }

        // Create new connection request
        const { data: connection, error } = await supabaseAdmin
            .from('connections')
            .insert({
                user_id_1: userId,
                user_id_2: toUserId,
                status: 'pending',
                message: message?.slice(0, 500) || null
            })
            .select()
            .single();

        if (error) {
            console.error('Create connection error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            connection: {
                id: connection.id,
                userId: toUserId,
                status: 'pending',
                message: connection.message,
                createdAt: connection.created_at
            }
        });

    } catch (error: any) {
        console.error('Create connection error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
