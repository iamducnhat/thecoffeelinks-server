import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ userId: string }>;
}

/**
 * GET /api/social/connections/status/[userId]
 * Get connection status with a specific user
 */
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { userId: targetUserId } = await params;
        
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

        if (currentUserId === targetUserId) {
            return NextResponse.json({ success: true, status: 'self' });
        }

        // Check if there's any connection between these users
        const { data: connection, error } = await supabaseAdmin
            .from('connections')
            .select('id, status, user_id_1')
            .or(`and(user_id_1.eq.${currentUserId},user_id_2.eq.${targetUserId}),and(user_id_1.eq.${targetUserId},user_id_2.eq.${currentUserId})`)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get connection status error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!connection) {
            return NextResponse.json({ success: true, status: 'none' });
        }

        // Determine the status from perspective of current user
        let status = connection.status;
        
        // If pending and current user sent the request, show as "pending_sent"
        // If pending and current user received the request, show as "pending_received"
        if (status === 'pending') {
            status = connection.user_id_1 === currentUserId ? 'pending_sent' : 'pending_received';
        }

        return NextResponse.json({ 
            success: true, 
            status,
            connectionId: connection.id
        });

    } catch (error: any) {
        console.error('Get connection status error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
