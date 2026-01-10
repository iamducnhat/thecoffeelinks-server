import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    // For stateless JWT, we can't really "invalidate" except by expiry, unless we use blacklists.
    // Supabase signOut just clears local session usually. 
    // If we receive a token, we *could* try admin.signOut(token) if API supports it (it usually doesn't for JWTs).

    // For now, we just return success to tell client to clear local storage.
    return NextResponse.json({ success: true });
}
