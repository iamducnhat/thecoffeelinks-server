import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { items, deliveryOption, total, user_id } = body;

        // Basic validation
        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items in order' }, { status: 400 });
        }

        // Insert Order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                user_id: user_id || null,
                status: 'placed',
                total_amount: total,
                type: deliveryOption === 'delivery' ? 'delivery' : (deliveryOption === 'take-away' ? 'take_away' : 'dine_in'),
                payment_method: 'cash',
                store_id: body.storeId || null,
                delivery_address: body.deliveryAddress || null,
                delivery_latitude: body.deliveryLat || null,
                delivery_longitude: body.deliveryLng || null,
                delivery_notes: body.deliveryNotes || null,
            })
            .select()
            .single();

        if (orderError) {
            console.error('Order insert error:', orderError);
            return NextResponse.json({ error: orderError.message }, { status: 500 });
        }

        // Insert Items
        const orderItems = items.map((item: any) => ({
            order_id: order.id,
            product_name: item.product.name,
            final_price: item.finalPrice || item.product.price, // Now using calculated finalPrice from client
            quantity: item.quantity,
            options_snapshot_json: item.customization,
        }));

        const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Order items insert error:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, order });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Update order status
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { orderId, status } = body;

        if (!orderId || !status) {
            return NextResponse.json({ error: 'orderId and status are required' }, { status: 400 });
        }

        // Actual database enum: 'placed', 'ready', 'completed', 'cancelled'
        const validStatuses = ['placed', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .update({ status })
            .eq('id', orderId)
            .select()
            .single();

        if (error) {
            console.error('Order update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, order });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Fetch all orders with items
export async function GET() {
    try {
        const { data: orders, error } = await supabaseAdmin
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Orders fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, orders });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
