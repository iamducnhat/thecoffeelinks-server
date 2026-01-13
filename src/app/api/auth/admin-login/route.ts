import { NextResponse } from 'next/server';
import { decrypt } from '@/lib/encryption';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Decrypt the request body using server's ENCRYPTION_KEY
        const decryptedData = decrypt(body.data);

        if (!decryptedData) {
            return NextResponse.json({ 
                error: 'Invalid PIN: Unable to decrypt credentials' 
            }, { status: 401 });
        }

        const { username, password } = decryptedData;

        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
        }

        // Check against admin environment variables
        const envUsername = process.env.ADMIN_USERNAME;
        const envPassword = process.env.ADMIN_PASSWORD;
        const envSecret = process.env.ADMIN_SECRET;

        if (!envUsername || !envPassword || !envSecret) {
            console.error('Missing Admin Environment Variables');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (username === envUsername && password === envPassword) {
            // Return plain response - HTTPS provides encryption in transit
            return NextResponse.json({
                success: true,
                token: envSecret,
                user: { username, role: 'admin' }
            });
        }

        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });

    } catch (error: any) {
        console.error('Admin login error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
