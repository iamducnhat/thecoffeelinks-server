import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone, name } = body;

        if (!phone || !name) {
            return NextResponse.json({ error: 'Phone and name are required' }, { status: 400 });
        }

        // Upsert user based on phone number
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .upsert({
                phone,
                role: 'customer',
                // We typically don't update points on login, but we need to ensure the record exists
            }, { onConflict: 'phone' })
            .select()
            .single();

        if (error) {
            console.error('User upsert error:', error);
            // If error is duplicate key (should be handled by upsert, but just in case)
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // If this is a new user (or existing), we might want to ensure they have a social profile or just return the ID
        // For now, returning the user object is sufficient.

        return NextResponse.json({ success: true, user });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
