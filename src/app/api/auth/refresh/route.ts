import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/refresh
 * 
 * Refresh an expired access token using a refresh token.
 */
export async function POST(request: Request) {
    try {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { refresh_token } = body;

        if (!refresh_token) {
            return NextResponse.json({ error: 'Refresh token is required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.auth.refreshSession({
            refresh_token: refresh_token,
        });

        if (error || !data.session) {
            console.error('Refresh token error:', error);
            return NextResponse.json({ error: error?.message || 'Failed to refresh session' }, { status: 401 });
        }

        return NextResponse.json({
            success: true,
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_in: data.session.expires_in,
                expires_at: data.session.expires_at,
                token_type: data.session.token_type,
                user: data.session.user
            }
        });

    } catch (error: any) {
        console.error('Refresh server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
