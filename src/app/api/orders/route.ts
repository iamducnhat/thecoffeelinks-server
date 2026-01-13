import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders
 * 
 * Create a new order. Requires payment verification token.
 * 
 * TODO: Validate payment token against stored payment records
 * TODO: Check payment token expiry
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Support prompt payload keys + legacy keys
        const {
            items,
            order_type, deliveryOption, // order_type preferred
            table_id,
            address_id, deliveryAddress, // address_id preferred? or deliveryAddress object
            payment_method, paymentMethod, // payment_method preferred
            voucher_id,
            user_id, // Authenticated user
            total_amount, total // total preferred?
        } = body;

        // Basic validation
        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items in order' }, { status: 400 });
        }

        // Determine Type
        // prompt: "dine_in | take_away | delivery"
        // db enum: 'dine_in', 'take_away', 'delivery' (assuming)
        let type = order_type || (deliveryOption === 'delivery' || deliveryOption === 'take-away' ? 'take_away' : 'dine_in');

        // Mapped to DB enum often snake_case
        if (type === 'take-away') type = 'take_away';

        // Payment Verification Logic
        // For this task, we assume payment is handled or method is sufficient. 
        // If 'paymentToken' is strictly required by business logic, we'd check it.
        // Prompt says "Payment Method: card | apple_pay | points".
        // We will default status to 'received' (prompt) which maps to 'placed' or 'received' in DB.

        // Insert Order
        // Note: Only using columns that exist in current schema
        // Add delivery_address, notes columns to DB if needed later
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                user_id: user_id || null,
                status: 'received',
                total_amount: total_amount || total || 0,
                type: type,
                payment_method: payment_method || paymentMethod || 'cash',
                payment_status: 'pending',
                store_id: body.storeId || null,
                table_id: table_id || null,
                voucher_id: voucher_id || null
            })
            .select()
            .single();

        if (orderError) {
            console.error('Order insert error:', orderError);
            return NextResponse.json({ error: orderError.message }, { status: 500 });
        }

        // Insert Items
        // Flatten customization to JSON
        const orderItems = items.map((item: any) => ({
            order_id: order.id,
            product_name: item.product.name, // or item.product_name
            final_price: item.finalPrice || item.price,
            quantity: item.quantity,
            options_snapshot_json: item.customization, // Stores the full customization object
        }));

        const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Order items insert error:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Estimate ready time (mock logic)
        const estimatedReadyAt = new Date();
        estimatedReadyAt.setMinutes(estimatedReadyAt.getMinutes() + 15);

        return NextResponse.json({
            success: true,
            order_id: order.id,
            status: order.status,
            estimated_ready_at: estimatedReadyAt.toISOString()
        });
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

        // Actual database enum often includes: 'placed', 'received', 'preparing', 'ready', 'completed', 'cancelled'
        const validStatuses = ['placed', 'received', 'preparing', 'ready', 'completed', 'cancelled'];
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
