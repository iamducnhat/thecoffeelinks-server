import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAdminAccess } from '@/lib/auth-guard';
import { formatProductSlug } from '@/lib/utils';
import { ToppingSchema } from '@/lib/schemas';
import { validateRequest } from '@/lib/validation';

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
        const authResult = await verifyAdminAccess(request);
        if (!authResult.authorized) {
            return NextResponse.json({ error: authResult.error }, { status: 401 });
        }

        const validation = await validateRequest(request, ToppingSchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const body = validation.data!;

        const newTopping = {
            id: formatProductSlug(body.name, body.id),
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


