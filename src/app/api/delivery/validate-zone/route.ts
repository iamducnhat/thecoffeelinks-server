import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/delivery/validate-zone
 * 
 * Check if an address is within a store's delivery zone.
 * Returns zone info, delivery fee, and ETA if valid.
 */

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { storeId, latitude, longitude, addressId } = body;

        if (!storeId) {
            return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
        }

        let lat = latitude;
        let lng = longitude;

        // If addressId provided, fetch coordinates from address
        if (addressId && (!lat || !lng)) {
            const { data: addressData, error: addressError } = await supabaseAdmin
                .from('addresses')
                .select('latitude, longitude')
                .eq('id', addressId)
                .single();

            if (addressError || !addressData) {
                return NextResponse.json({ error: 'Address not found' }, { status: 404 });
            }

            lat = addressData.latitude;
            lng = addressData.longitude;
        }

        if (!lat || !lng) {
            return NextResponse.json({ 
                error: 'Coordinates required. Provide latitude/longitude or addressId with stored coordinates.' 
            }, { status: 400 });
        }

        // Validate coordinates
        if (typeof lat !== 'number' || lat < -90 || lat > 90) {
            return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 });
        }
        if (typeof lng !== 'number' || lng < -180 || lng > 180) {
            return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 });
        }

        // Check delivery zone using database function
        const { data: zoneData, error: zoneError } = await supabaseAdmin
            .rpc('check_delivery_zone', {
                p_store_id: storeId,
                p_latitude: lat,
                p_longitude: lng
            });

        if (zoneError) {
            console.error('Zone check error:', zoneError);
            return NextResponse.json({ error: zoneError.message }, { status: 500 });
        }

        // If no zone returned, address is outside delivery area
        if (!zoneData || zoneData.length === 0) {
            return NextResponse.json({
                inZone: false,
                error: 'Address is outside delivery area for this store'
            });
        }

        const zone = zoneData[0];

        return NextResponse.json({
            inZone: true,
            zone: {
                id: zone.zone_id,
                name: zone.zone_name
            },
            distanceKm: zone.distance_km,
            baseFee: zone.base_fee,
            perKmFee: zone.per_km_fee,
            totalFee: zone.total_fee,
            etaMinutes: zone.eta_minutes
        });

    } catch (error: any) {
        console.error('Validate zone error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
