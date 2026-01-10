import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !data.user) {
            return NextResponse.json({ valid: false, error: 'Invalid session' }, { status: 401 });
        }

        return NextResponse.json({
            valid: true,
            user: data.user
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
