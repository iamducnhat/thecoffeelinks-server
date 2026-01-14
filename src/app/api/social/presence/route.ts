import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * PATCH /api/social/presence
 * Update user's presence status at current location
 */
export async function PATCH(request: Request) {
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
        const { status } = body;

        // Valid statuses: available, busy, dnd (do not disturb), invisible
        const validStatuses = ['available', 'busy', 'dnd', 'invisible'];
        if (!status || !validStatuses.includes(status)) {
            return NextResponse.json({ 
                error: 'Invalid status. Valid options: available, busy, dnd, invisible' 
            }, { status: 400 });
        }

        // Update the user's presence status in their active check-in
        const { error } = await supabaseAdmin
            .from('store_checkins')
            .update({ 
                presence_status: status,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .is('checked_out_at', null);

        if (error) {
            console.error('Presence update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, status });

    } catch (error: any) {
        console.error('Presence update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
