import { NextResponse } from 'next/server';
import { decrypt } from '@/lib/encryption';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Decrypt the request body using server's ENCRYPTION_KEY
        const decryptedData = decrypt(body.data);

        if (!decryptedData) {
            return NextResponse.json({ 
                error: 'Invalid secret key or corrupted data' 
            }, { status: 400 });
        }

        const { email, password } = decryptedData;

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Check against admin environment variables
        const envUsername = process.env.ADMIN_USERNAME;
        const envPassword = process.env.ADMIN_PASSWORD;
        const envSecret = process.env.ADMIN_SECRET;

        if (!envUsername || !envPassword || !envSecret) {
            console.error('Missing Admin Environment Variables');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (email === envUsername && password === envPassword) {
            // Return plain response - HTTPS provides encryption in transit
            return NextResponse.json({
                success: true,
                token: envSecret,
                user: { username: email, role: 'admin' }
            });
        }

        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    } catch (error: any) {
        console.error('Admin login error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
