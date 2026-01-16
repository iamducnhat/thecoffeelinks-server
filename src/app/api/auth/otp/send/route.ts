import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        // Check PAYMENT_MODE for bypass
        const mode = process.env.PAYMENT_MODE?.toLowerCase();

        if (mode === 'bypass') {
            // Development bypass: don't send actual SMS
            console.log(`🔓 [OTP Bypass] Would send OTP to ${phone}`);
            return NextResponse.json({
                success: true,
                message: 'OTP bypass mode - no SMS sent',
                bypass: true
            });
        }

        // Clean phone number: remove non-numeric chars, ensure it has country code if needed or rely on Supabase defaults
        // For now assuming the client sends E.164 or locally usable format. 
        // Supabase usually expects E.164 (e.g. +14155551234).

        // We strictly use supabaseAdmin to send OTP. 
        // This requires Supabase Project to have Phone Provider (Twilio/MessageBird) configured.
        const { error } = await supabaseAdmin.auth.signInWithOtp({
            phone: phone,
        });

        if (error) {
            console.error('Supabase Send OTP Error:', error);
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'OTP sent successfully' });
    } catch (error: any) {
        console.error('Send OTP Handler Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
