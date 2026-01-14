import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAdminAccess } from '@/lib/auth-guard';
import { StoreSchema } from '@/lib/schemas';
import { validateRequest } from '@/lib/validation';

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

        // Transform to match Swift Store model expectations
        const transformedStores = stores?.map((s: any) => ({
            id: String(s.id),
            name: s.name,
            address: s.address,
            latitude: s.latitude ?? 0,
            longitude: s.longitude ?? 0,
            imageUrl: s.image || s.image_url || null,
            phoneNumber: s.phone || s.phone_number || null,
            openingHours: s.opening_time && s.closing_time
                ? `${s.opening_time} - ${s.closing_time}`
                : (s.opening_hours || null),
        })) || [];

        return NextResponse.json({ success: true, stores: transformedStores });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new store
export async function POST(request: Request) {
    try {
        const authResult = await verifyAdminAccess(request);
        if (!authResult.authorized) {
            return NextResponse.json({ error: authResult.error }, { status: 401 });
        }

        const validation = await validateRequest(request, StoreSchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const body = validation.data!;

        const { data: store, error } = await supabaseAdmin
            .from('stores')
            .insert({
                name: body.name,
                address: body.address,
                phone: body.phone,
                opening_time: body.opening_time,
                closing_time: body.closing_time,
                latitude: body.latitude,
                longitude: body.longitude,
                is_active: body.is_active !== undefined ? body.is_active : true
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


