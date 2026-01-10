import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Import encryption utils
import { encrypt, decrypt } from '@/lib/encryption';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        let email: string;
        let password: string;

        // Support both encrypted and non-encrypted requests
        if (body.data) {
            // Encrypted request: { data: encryptedString }
            const decryptedData = decrypt(body.data);
            if (!decryptedData) {
                return NextResponse.json({ error: 'Invalid encrypted data' }, { status: 400 });
            }
            email = decryptedData.email;
            password = decryptedData.password;
        } else {
            // Plain request: { email, password }
            email = body.email;
            password = body.password;
        }

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Use signInWithPassword. 
        // Note: supabaseAdmin has service role, but acts generally. 
        // For distinct user login, we might want a clean client or just use the returned session.
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }

        // Encrypt the response
        const encryptedResponse = encrypt({
            success: true,
            session: data.session,
            user: data.user
        });

        // Return the encrypted session to the client
        return NextResponse.json({
            data: encryptedResponse
        });

    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
