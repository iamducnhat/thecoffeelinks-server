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

// GET: Fetch a specific topping
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { data, error } = await supabaseAdmin
            .from('toppings')
            .select('*')
            .eq('id', params.id)
            .single();

        if (error) {
            console.error('Topping fetch error:', error);
            return NextResponse.json({ error: 'Topping not found' }, { status: 404 });
        }

        return NextResponse.json({ topping: data });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a topping
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const body = await request.json();

        const updates: any = {};
        if (body.name !== undefined) {
            if (typeof body.name !== 'string' || body.name.length < 2) {
                return NextResponse.json({ error: 'Topping name must be at least 2 characters' }, { status: 400 });
            }
            updates.name = body.name.trim();
        }

        if (body.price !== undefined) {
            if (typeof body.price !== 'number' || body.price < 0) {
                return NextResponse.json({ error: 'Price must be a non-negative number' }, { status: 400 });
            }
            updates.price = body.price;
        }

        if (body.is_available !== undefined) {
            updates.is_available = body.is_available;
        }

        const { data: topping, error } = await supabaseAdmin
            .from('toppings')
            .update(updates)
            .eq('id', params.id)
            .select()
            .single();

        if (error) {
            console.error('Topping update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, topping });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Delete a topping
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const { error } = await supabaseAdmin
            .from('toppings')
            .delete()
            .eq('id', params.id);

        if (error) {
            console.error('Topping delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
