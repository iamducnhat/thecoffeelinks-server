import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/social/check-out
 * Check out from current store/location
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

        // Update the most recent check-in to mark it as checked out
        const { error } = await supabaseAdmin
            .from('store_checkins')
            .update({ 
                checked_out_at: new Date().toISOString(),
                is_active: false
            })
            .eq('user_id', userId)
            .is('checked_out_at', null);

        if (error) {
            console.error('Check-out error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Check-out error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
