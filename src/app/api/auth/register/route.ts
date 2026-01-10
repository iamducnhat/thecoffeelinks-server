import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        if (!email || !password || !name) {
            return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
        }

        // Create user via Admin API (bypass email confirm for smoother dev experience if needed, or standard signup)
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto confirm for now to simplify
            user_metadata: { full_name: name }
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (!data.user) {
            return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
        }

        // Create user profile in 'users' table
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: data.user.id,
                email: email,
                name: name,
                points: 50, // Welcome bonus
                total_points_earned: 50,
                member_since: new Date().toISOString(),
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            // Verify if we should rollback user creation?
            // For now, return error but user exists in Auth.
            return NextResponse.json({ error: 'User created but profile failed: ' + profileError.message }, { status: 500 });
        }

        // Add Points History
        await supabaseAdmin.from('points_history').insert({
            user_id: data.user.id,
            type: 'earned',
            points: 50,
            description: 'Welcome Bonus',
        });

        return NextResponse.json({ success: true, user: data.user });

    } catch (error: any) {
        console.error('Register error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
