import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone, token, code } = body;
        const otpCode = token || code; // Accept either 'token' or 'code'

        if (!phone) {
            return NextResponse.json({ error: 'Phone is required' }, { status: 400 });
        }

        // Production mode: verify OTP
        if (!otpCode) {
            return NextResponse.json({ error: 'OTP code is required' }, { status: 400 });
        }

        // Verify OTP using Supabase Admin
        // Verify type 'sms'
        const { data, error } = await supabaseAdmin.auth.verifyOtp({
            phone,
            token: otpCode,
            type: 'sms',
        });

        if (error) {
            console.error('Supabase Verify OTP Error:', error);
            return NextResponse.json({ error: error.message }, { status: 401 });
        }

        if (!data.user || !data.session) {
            return NextResponse.json({ error: 'Verification succeeded but no session returned' }, { status: 500 });
        }

        // OTP Verification successful. Use session to return to client.
        // Also ensure User Profile exists in public.users
        // The trigger check in migration should handle this on user creation, 
        // BUT if the user already existed in Auth but not in public.users (rare edge case), we can double check.

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (!userProfile && !profileError) {
            // Does not exist, create it manually if trigger failed?
            // Actually, if trigger is robust, we shouldn't need this.
            // But for safety in this robust implementation:

            await supabaseAdmin.from('users').insert({
                id: data.user.id,
                phone: phone,
                // Default points for new phone users?
                points: 0,
                member_since: new Date().toISOString()
            });
        }

        return NextResponse.json({
            success: true,
            session: data.session,
            user: data.user,
            // We return the Auth User. The client repositories map this to Domain User.
        });

    } catch (error: any) {
        console.error('Verify OTP Handler Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
