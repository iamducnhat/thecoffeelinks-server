import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/user/addresses
 * Fetch user's saved delivery addresses
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
        }

        // Fetch addresses for this user
        const { data: addresses, error } = await supabaseAdmin
            .from('addresses')
            .select('id, address, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Addresses fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            addresses: addresses || [] 
        });

    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/user/addresses
 * Save a new delivery address
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
        }

        const body = await request.json();
        const { address } = body;

        if (!address || typeof address !== 'string') {
            return NextResponse.json({ error: 'Address is required' }, { status: 400 });
        }

        const sanitizedAddress = address.trim().slice(0, 500);
        if (!sanitizedAddress) {
            return NextResponse.json({ error: 'Address cannot be empty' }, { status: 400 });
        }

        // Check if address already exists for this user
        const { data: existing } = await supabaseAdmin
            .from('addresses')
            .select('id')
            .eq('user_id', user.id)
            .eq('address', sanitizedAddress)
            .maybeSingle();

        if (existing) {
            // Address already saved, return it
            return NextResponse.json({ 
                success: true, 
                address: { id: existing.id, address: sanitizedAddress },
                alreadyExists: true
            });
        }

        // Insert new address
        const { data: newAddress, error } = await supabaseAdmin
            .from('addresses')
            .insert({
                user_id: user.id,
                address: sanitizedAddress
            })
            .select('id, address, created_at')
            .single();

        if (error) {
            console.error('Address insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            address: newAddress 
        });

    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/user/addresses
 * Delete a saved address
 */
export async function DELETE(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const addressId = searchParams.get('id');

        if (!addressId) {
            return NextResponse.json({ error: 'Address ID is required' }, { status: 400 });
        }

        // Delete only if it belongs to this user
        const { error } = await supabaseAdmin
            .from('addresses')
            .delete()
            .eq('id', addressId)
            .eq('user_id', user.id);

        if (error) {
            console.error('Address delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
