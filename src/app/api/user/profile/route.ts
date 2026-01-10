import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
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

        // Fetch User Profile
        let { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        // If profile doesn't exist but auth user does, create the profile
        if (userError && userError.code === 'PGRST116') {
            // User exists in auth but not in users table - create profile
            const { data: newProfile, error: createError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: userId,
                    email: authData.user.email,
                    name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'User',
                    points: 50, // Welcome bonus
                    total_points_earned: 50,
                    member_since: new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) {
                console.error('Auto-create profile error:', createError);
                return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
            }

            // Add Welcome Points to history
            await supabaseAdmin.from('points_history').insert({
                user_id: userId,
                type: 'earned',
                points: 50,
                description: 'Welcome Bonus',
            });

            userData = newProfile;
            userError = null;
        } else if (userError) {
            console.error('Fetch profile error:', userError);
            return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
        }

        // Fetch Points History
        const { data: historyData, error: historyError } = await supabaseAdmin
            .from('points_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        return NextResponse.json({
            success: true,
            user: {
                ...userData,
                pointsHistory: historyData || []
            }
        });

    } catch (error: any) {
        console.error('Profile API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
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
        const userId = authData.user.id;

        // Whitelist allowed fields to update
        const allowedFields = ['name', 'job_title', 'industry', 'bio', 'skills', 'linkedin_url', 'is_open_to_networking'];
        const updates: any = {};

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        // Handle CamelCase to snake_case conversion if client sends camelCase
        if (body.jobTitle !== undefined) updates.job_title = body.jobTitle;
        if (body.linkedinUrl !== undefined) updates.linkedin_url = body.linkedinUrl;
        if (body.isOpenToNetworking !== undefined) updates.is_open_to_networking = body.isOpenToNetworking;


        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
