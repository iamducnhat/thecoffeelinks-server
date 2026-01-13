import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Track in-progress profile creations to prevent race conditions
const profileCreationLocks = new Map<string, Promise<any>>();

async function createProfileWithLock(userId: string, email: string | undefined, fullName: string | undefined) {
    // Check if creation is already in progress for this user
    const existingLock = profileCreationLocks.get(userId);
    if (existingLock) {
        return existingLock;
    }
    
    // Create new profile with lock
    const creationPromise = (async () => {
        try {
            // Double-check profile doesn't exist (another request might have created it)
            const { data: existingProfile } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('id', userId)
                .single();
                
            if (existingProfile) {
                return { alreadyExists: true };
            }
            
            // Create profile
            const { data: newProfile, error: createError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: userId,
                    email: email,
                    name: fullName || email?.split('@')[0] || 'User',
                    points: 50,
                    total_points_earned: 50,
                    member_since: new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) {
                // Check if it's a duplicate key error (profile created by concurrent request)
                if (createError.code === '23505') {
                    return { alreadyExists: true };
                }
                throw createError;
            }

            // Add Welcome Points to history (only if profile was just created)
            await supabaseAdmin.from('points_history').insert({
                user_id: userId,
                type: 'earned',
                points: 50,
                description: 'Welcome Bonus',
            });

            return { profile: newProfile, created: true };
        } finally {
            // Clean up lock after 5 seconds
            setTimeout(() => profileCreationLocks.delete(userId), 5000);
        }
    })();
    
    profileCreationLocks.set(userId, creationPromise);
    return creationPromise;
}

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

        // If profile doesn't exist but auth user does, create the profile with lock
        if (userError && userError.code === 'PGRST116') {
            const result = await createProfileWithLock(
                userId,
                authData.user.email,
                authData.user.user_metadata?.full_name
            );
            
            if (result.alreadyExists) {
                // Fetch the profile that was created by concurrent request
                const { data: existingProfile, error: refetchError } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();
                    
                if (refetchError) {
                    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
                }
                userData = existingProfile;
            } else if (result.profile) {
                userData = result.profile;
            } else {
                return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
            }
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
            .order('created_at', { ascending: false })
            .limit(50); // Add limit for performance

        return NextResponse.json({
            success: true,
            user: {
                ...userData,
                pointsHistory: historyData || []
            }
        });

    } catch (error: any) {
        console.error('Profile API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

export async function PATCH(request: Request) {
    return PUT(request);
}
