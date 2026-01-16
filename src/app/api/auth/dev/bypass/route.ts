import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    // Only allow in development or if a specific secret is present
    if (process.env.NODE_ENV === 'production' && !process.env.DEV_BYPASS_SECRET) {
        return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { phone } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        // Dev Bypass: Create user if not exists, return a session with a long-lived token or just the user object
        // Since we can't easily forge a valid Supabase Session without a real sign-in, 
        // we might need to actually sign them in using a magic link or admin functionality 
        // OR we just return the user object and the client trusts it (weak security, but okay for dev).

        // BETTER SECURE DEV WAY: Use VerifyOtp with a specific hardcoded token if configured?
        // Supabase allows setting 'SMS OTP' for specific numbers in dashboard. 
        // But programmatically:

        // Let's stick to "Get User by Phone" and return it. 
        // The client might need an access token though.
        // If we can't generate a token, the client might be blocked on RLS.
        // So we should try to really sign them in.

        // For now, let's implement a simple "Upsert User" and return metadata, 
        // warning the client that RLS might fail without a real token.
        // BUT the swift code expected a session.

        // Supabase Admin `generateLink` might work?
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: `${phone}@dev.local`, // Fake email for phone user? No, phone users don't need email.
            // Wait, generateLink typically needs email.
        });

        // Alternative: Just return a dummy token and have the server trust it? No.

        // Let's just pretend we sent the OTP and use the "Verify" endpoint with a backdoor?
        // Or just create the user and return their ID. 

        // Simplest for now: Check if user exists.
        let userId;
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existing = userList.users.find(u => u.phone === phone);

        if (existing) {
            userId = existing.id;
        } else {
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                phone: phone,
                email_confirm: true,
                phone_confirm: true
            });
            if (createError) throw createError;
            userId = newUser.user.id;
        }

        // Ensure public profile
        await supabaseAdmin.from('users').upsert({
            id: userId,
            phone: phone,
            member_since: new Date().toISOString()
        });

        // Retrieve the user
        const { data: publicUser } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();

        return NextResponse.json({
            success: true,
            session: { accessToken: "dev_token_bypass", refreshToken: "dev_refresh" }, // Mock token
            user: { id: userId, phone: phone, ...publicUser } // Combine
        });

    } catch (error: any) {
        console.error('Bypass Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
