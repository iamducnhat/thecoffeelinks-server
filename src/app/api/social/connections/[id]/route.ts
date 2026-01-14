import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/social/connections/[id]
 * Get a specific connection
 */
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        
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

        const { data: connection, error } = await supabaseAdmin
            .from('connections')
            .select(`
                id,
                user_id_1,
                user_id_2,
                status,
                message,
                created_at,
                updated_at,
                user1:users!connections_user_id_1_fkey (id, name, full_name, avatar_url, job_title),
                user2:users!connections_user_id_2_fkey (id, name, full_name, avatar_url, job_title)
            `)
            .eq('id', id)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
            .single();

        if (error || !connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const isUser1 = connection.user_id_1 === userId;
        const otherUser = isUser1 ? connection.user2 : connection.user1;

        return NextResponse.json({
            success: true,
            connection: {
                id: connection.id,
                userId: isUser1 ? connection.user_id_2 : connection.user_id_1,
                status: connection.status,
                message: connection.message,
                createdAt: connection.created_at,
                user: otherUser
            }
        });

    } catch (error: any) {
        console.error('Get connection error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/social/connections/[id]
 * Accept or decline a connection request
 */
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        
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
        const { accept } = body;

        if (typeof accept !== 'boolean') {
            return NextResponse.json({ error: 'accept (boolean) is required' }, { status: 400 });
        }

        // Verify this connection request was sent TO the current user
        const { data: connection, error: fetchError } = await supabaseAdmin
            .from('connections')
            .select('id, user_id_1, user_id_2, status')
            .eq('id', id)
            .eq('user_id_2', userId) // User must be the recipient
            .eq('status', 'pending')
            .single();

        if (fetchError || !connection) {
            return NextResponse.json({ 
                error: 'Connection request not found or already processed' 
            }, { status: 404 });
        }

        // Update the connection status
        const newStatus = accept ? 'accepted' : 'declined';
        const { error: updateError } = await supabaseAdmin
            .from('connections')
            .update({ 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Update connection error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        console.error('Update connection error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/social/connections/[id]
 * Remove a connection
 */
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        
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

        // User can only delete connections they're part of
        const { error } = await supabaseAdmin
            .from('connections')
            .delete()
            .eq('id', id)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

        if (error) {
            console.error('Delete connection error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Delete connection error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
