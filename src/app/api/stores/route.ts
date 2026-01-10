import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: List all stores
export async function GET() {
    try {
        const { data: stores, error } = await supabaseAdmin
            .from('stores')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Stores fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, stores });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new store
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, address, phone, opening_time, closing_time, latitude, longitude, is_active } = body;

        if (!name || !address) {
            return NextResponse.json({ error: 'Name and address are required' }, { status: 400 });
        }

        const { data: store, error } = await supabaseAdmin
            .from('stores')
            .insert({
                name,
                address,
                phone,
                opening_time,
                closing_time,
                latitude,
                longitude,
                is_active: is_active !== undefined ? is_active : true
            })
            .select()
            .single();

        if (error) {
            console.error('Store create error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, store });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
