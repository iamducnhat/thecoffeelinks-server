import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/delivery/availability
 * 
 * Check if delivery is available for a store/address combination.
 * This is the "eager" check done when switching to delivery mode.
 * 
 * Query params:
 * - storeId: UUID of the store
 * - addressId: UUID of saved address (optional if lat/lng provided)
 * - latitude: decimal (optional if addressId provided)
 * - longitude: decimal (optional if addressId provided)
 * 
 * Returns:
 * - available: boolean
 * - eta: { min, max, display } 
 * - fee: { amount, display, surge }
 * - minOrderAmount: number
 * - message?: string (for unavailable cases)
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

        // 1. Check if store has delivery enabled
        const { data: store, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('id, name, delivery_enabled, delivery_hours_start, delivery_hours_end, min_delivery_amount, latitude, longitude')
            .eq('id', storeId)
            .single();

        if (storeError || !store) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        if (!store.delivery_enabled) {
            return NextResponse.json({
                available: false,
                message: 'This store does not offer delivery',
                alternativeAction: 'pickup'
            });
        }

        // 2. Check delivery hours
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

        if (store.delivery_hours_start && store.delivery_hours_end) {
            if (currentTime < store.delivery_hours_start || currentTime > store.delivery_hours_end) {
                return NextResponse.json({
                    available: false,
                    message: `Delivery available ${store.delivery_hours_start} - ${store.delivery_hours_end}`,
                    deliveryHours: {
                        start: store.delivery_hours_start,
                        end: store.delivery_hours_end
                    },
                    alternativeAction: 'pickup'
                });
            }
        }

        // 3. Get address coordinates
        let lat: number | null = latitude ? parseFloat(latitude) : null;
        let lng: number | null = longitude ? parseFloat(longitude) : null;

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

        // If no coordinates, can't validate zone but return basic availability
        if (!lat || !lng) {
            return NextResponse.json({
                available: true,
                needsAddressValidation: true,
                minOrderAmount: store.min_delivery_amount,
                message: 'Select a delivery address to see ETA and fees'
            });
        }

        // 4. Check delivery zone
        const { data: zoneData, error: zoneError } = await supabaseAdmin
            .rpc('check_delivery_zone', {
                p_store_id: storeId,
                p_latitude: lat,
                p_longitude: lng
            });

        if (zoneError) {
            console.error('Zone check error:', zoneError);
            return NextResponse.json({
                available: true,
                eta: { min: 25, max: 40, display: '25-40 min' },
                fee: { amount: 20000, display: '20,000đ', surge: false },
                minOrderAmount: store.min_delivery_amount,
                message: 'Estimated delivery details'
            });
        }

        // 5. Address is outside delivery zone
        if (!zoneData || zoneData.length === 0) {
            return NextResponse.json({
                available: false,
                message: 'Your address is outside our delivery area',
                alternativeAction: 'pickup',
                suggestion: 'Try pickup or select a different store'
            });
        }

        // 6. Return full availability info
        const zone = zoneData[0];
        const etaMinutes = zone.eta_minutes || 30;
        const isSurge = zone.surge_active || false;

        // Format arrival time
        const arrivalTime = new Date();
        arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);
        const arrivalDisplay = arrivalTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Format fee
        const feeAmount = zone.total_fee || 0;
        const feeDisplay = new Intl.NumberFormat('vi-VN').format(feeAmount) + 'đ';

        return NextResponse.json({
            available: true,
            eta: {
                minutes: etaMinutes,
                min: Math.max(10, etaMinutes - 5),
                max: etaMinutes + 10,
                display: `${Math.max(10, etaMinutes - 5)}-${etaMinutes + 10} min`,
                arrivalBy: arrivalDisplay
            },
            fee: {
                amount: feeAmount,
                display: feeDisplay,
                surge: isSurge,
                surgeMultiplier: isSurge ? zone.surge_multiplier : 1.0
            },
            distance: {
                km: zone.distance_km,
                display: `${zone.distance_km} km`
            },
            zone: {
                id: zone.zone_id,
                name: zone.zone_name
            },
            minOrderAmount: store.min_delivery_amount,
            store: {
                id: store.id,
                name: store.name
            }
        });

    } catch (error: any) {
        console.error('Delivery availability error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
