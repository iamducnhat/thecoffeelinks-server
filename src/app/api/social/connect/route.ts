import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch people here now
export async function GET() {
    try {
        const { data: checkIns, error } = await supabaseAdmin
            .from('store_checkins')
            .select('*, user:users(*)')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ checkIns: checkIns || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Connect with another user
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

        const myId = authData.user.id;
        const body = await request.json();
        const { targetUserId } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: 'Target User ID required' }, { status: 400 });
        }

        if (myId === targetUserId) {
            return NextResponse.json({ error: 'Cannot connect with self' }, { status: 400 });
        }

        // Check if connection already exists
        const { data: existing } = await supabaseAdmin
            .from('connections')
            .select('*')
            .or(`and(user_id_1.eq.${myId},user_id_2.eq.${targetUserId}),and(user_id_1.eq.${targetUserId},user_id_2.eq.${myId})`)
            .single();

        if (existing) {
            return NextResponse.json({ success: true, status: existing.status });
        }

        // Create new connection
        const { error } = await supabaseAdmin
            .from('connections')
            .insert({
                user_id_1: myId,
                user_id_2: targetUserId,
                status: 'pending'
            });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, status: 'pending' });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
