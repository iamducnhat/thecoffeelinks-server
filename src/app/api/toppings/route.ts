import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper to verify admin access
async function verifyAdminAccess(request: Request): Promise<{ authorized: boolean; error?: string }> {
    const adminKey = request.headers.get('X-Admin-Key');
    const adminSecret = process.env.ADMIN_SECRET;

    if (adminKey && adminSecret && adminKey === adminSecret) {
        return { authorized: true };
    }

    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data.user) {
                return { authorized: true };
            }
        } catch { }
    }

    return { authorized: false, error: 'Admin access required' };
}

// GET: Fetch all toppings
export async function GET(request: Request) {
    try {
        const { data, error } = await supabaseAdmin
            .from('toppings')
            .select('*')
            .order('name');

        if (error) {
            console.error('Toppings fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ toppings: data || [] });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new topping
export async function POST(request: Request) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const body = await request.json();

        if (!body.name || typeof body.name !== 'string' || body.name.length < 2) {
            return NextResponse.json({ error: 'Topping name is required (min 2 characters)' }, { status: 400 });
        }

        if (typeof body.price !== 'number' || body.price < 0) {
            return NextResponse.json({ error: 'Price must be a non-negative number' }, { status: 400 });
        }

        const newTopping = {
            id: body.id || body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name: body.name.trim(),
            price: body.price,
            is_available: body.is_available !== false,
        };

        const { data: topping, error } = await supabaseAdmin
            .from('toppings')
            .insert(newTopping)
            .select()
            .single();

        if (error) {
            console.error('Topping insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, topping });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
