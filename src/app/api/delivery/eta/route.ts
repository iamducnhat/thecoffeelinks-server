import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/delivery/eta
 * 
 * Calculate estimated delivery time for an address + store combination.
 */

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const storeId = searchParams.get('storeId');
        const addressId = searchParams.get('addressId');
        const latitude = searchParams.get('latitude');
        const longitude = searchParams.get('longitude');

        if (!storeId) {
            return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
        }

        let lat: number | null = latitude ? parseFloat(latitude) : null;
        let lng: number | null = longitude ? parseFloat(longitude) : null;

        // If addressId provided, fetch coordinates from address
        if (addressId && (!lat || !lng)) {
            const { data: addressData, error: addressError } = await supabaseAdmin
                .from('addresses')
                .select('latitude, longitude, full_address')
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
        if (isNaN(lat) || lat < -90 || lat > 90) {
            return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 });
        }
        if (isNaN(lng) || lng < -180 || lng > 180) {
            return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 });
        }

        // Get store info
        const { data: storeData, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('id, name, latitude, longitude')
            .eq('id', storeId)
            .single();

        if (storeError || !storeData) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // Check delivery zone and get ETA using database function
        const { data: zoneData, error: zoneError } = await supabaseAdmin
            .rpc('check_delivery_zone', {
                p_store_id: storeId,
                p_latitude: lat,
                p_longitude: lng
            });

        if (zoneError) {
            console.error('Zone check error:', zoneError);
            // Fallback to default ETA
            return NextResponse.json({
                storeId,
                storeName: storeData.name,
                etaMinutes: 30, // Default
                etaRange: { min: 25, max: 40 },
                deliveryFee: null,
                inZone: false,
                message: 'Unable to calculate precise ETA. Using estimate.'
            });
        }

        // If outside delivery zone
        if (!zoneData || zoneData.length === 0) {
            return NextResponse.json({
                storeId,
                storeName: storeData.name,
                etaMinutes: null,
                inZone: false,
                error: 'Address is outside delivery area'
            });
        }

        const zone = zoneData[0];
        const etaMinutes = zone.eta_minutes || 30;

        return NextResponse.json({
            storeId,
            storeName: storeData.name,
            etaMinutes,
            etaRange: {
                min: Math.max(10, etaMinutes - 5),
                max: etaMinutes + 10
            },
            distanceKm: zone.distance_km,
            deliveryFee: zone.total_fee,
            inZone: true
        });

    } catch (error: any) {
        console.error('ETA calculation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
