import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
        const { locationId } = body;

        // Optionally validate locationId here

        const { data, error } = await supabaseAdmin
            .from('store_checkins')
            .insert({
                user_id: userId,
                store_id: locationId || 'default',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, checkIn: data });

    } catch (error: any) {
        console.error('Check-in error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
