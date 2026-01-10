import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
    try {
        // Fetch recent posts with user details
        const { data: posts, error } = await supabaseAdmin
            .from('posts')
            .select(`
                *,
                user:users(name, job_title, industry)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Fetch posts error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, posts });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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

        const body = await request.json();
        const { content, type } = body; // type is usually 'post', 'news', etc.

        if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert({
                user_id: authData.user.id,
                content,
                type: type || 'general',
                likes: 0,
                comments: 0
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, post: data });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
