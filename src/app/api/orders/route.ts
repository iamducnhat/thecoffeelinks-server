import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders
 * 
 * Create a new order. Requires payment verification token.
 */

// Input validation helpers
const MAX_ITEMS_PER_ORDER = 50;
const MAX_QUANTITY_PER_ITEM = 20;
const MAX_TOTAL_AMOUNT = 50000000; // 50 million VND
const MIN_TOTAL_AMOUNT = 1000; // 1000 VND minimum

interface OrderItemInput {
    product?: { name?: string; id?: string };
    product_name?: string;
    quantity?: number;
    finalPrice?: number;
    price?: number;
    customization?: Record<string, unknown>;
}

function validateOrderItems(items: OrderItemInput[]): { valid: boolean; error?: string } {
    if (!Array.isArray(items)) {
        return { valid: false, error: 'Items must be an array' };
    }
    
    if (items.length === 0) {
        return { valid: false, error: 'No items in order' };
    }
    
    if (items.length > MAX_ITEMS_PER_ORDER) {
        return { valid: false, error: `Maximum ${MAX_ITEMS_PER_ORDER} items per order` };
    }
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const productName = item.product?.name || item.product_name;
        
        if (!productName || typeof productName !== 'string') {
            return { valid: false, error: `Item ${i + 1}: Product name is required` };
        }
        
        if (productName.length > 200) {
            return { valid: false, error: `Item ${i + 1}: Product name too long` };
        }
        
        const quantity = item.quantity;
        if (typeof quantity !== 'number' || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
            return { valid: false, error: `Item ${i + 1}: Quantity must be between 1 and ${MAX_QUANTITY_PER_ITEM}` };
        }
        
        const price = item.finalPrice || item.price;
        if (typeof price !== 'number' || price < 0) {
            return { valid: false, error: `Item ${i + 1}: Invalid price` };
        }
    }
    
    return { valid: true };
}

// Helper to extract and validate user from auth token
async function getAuthenticatedUserId(request: Request): Promise<{ userId: string | null; error?: string }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { userId: null }; // Anonymous order allowed
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: null };
    }
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return { userId: null, error: 'Invalid authentication token' };
        }
        return { userId: data.user.id };
    } catch {
        return { userId: null };
    }
}

export async function POST(request: Request) {
    try {
        // Get authenticated user if token provided
        const { userId: authUserId, error: authError } = await getAuthenticatedUserId(request);
        if (authError) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }
        
        const body = await request.json();
        // Support prompt payload keys + legacy keys
        const {
            items,
            order_type, deliveryOption,
            table_id,
            address_id, deliveryAddress,
            payment_method, paymentMethod,
            voucher_id,
            user_id, // Client-provided user_id
            total_amount, total
        } = body;
        
        // Security: If user_id is provided in body, it MUST match authenticated user
        // This prevents users from creating orders for other users
        let finalUserId = authUserId;
        if (user_id) {
            if (authUserId && user_id !== authUserId) {
                return NextResponse.json({ 
                    error: 'User ID mismatch. Cannot create orders for other users.' 
                }, { status: 403 });
            }
            finalUserId = user_id;
        }

        // Validate items
        const itemsValidation = validateOrderItems(items);
        if (!itemsValidation.valid) {
            return NextResponse.json({ error: itemsValidation.error }, { status: 400 });
        }
        
        // Validate total amount
        const orderTotal = total_amount || total || 0;
        if (typeof orderTotal !== 'number' || orderTotal < MIN_TOTAL_AMOUNT) {
            return NextResponse.json({ error: `Minimum order amount is ${MIN_TOTAL_AMOUNT}đ` }, { status: 400 });
        }
        
        if (orderTotal > MAX_TOTAL_AMOUNT) {
            return NextResponse.json({ error: 'Order amount exceeds maximum limit' }, { status: 400 });
        }

        // Determine Type
        let type = order_type || (deliveryOption === 'delivery' || deliveryOption === 'take-away' ? 'take_away' : 'dine_in');
        if (type === 'take-away') type = 'take_away';
        
        const validTypes = ['dine_in', 'take_away', 'delivery'];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: 'Invalid order type' }, { status: 400 });
        }

        // Payment Verification
        const validPaymentMethods = ['card', 'momo', 'zalopay', 'apple_pay', 'points'];
        const selectedPayment = payment_method || paymentMethod;
        
        if (!selectedPayment) {
            return NextResponse.json({ error: 'Payment method is required' }, { status: 400 });
        }
        
        if (selectedPayment === 'cash') {
            return NextResponse.json({ error: 'Cash payment is not accepted. Please use online payment.' }, { status: 400 });
        }
        
        if (!validPaymentMethods.includes(selectedPayment)) {
            return NextResponse.json({ error: `Invalid payment method. Accepted: ${validPaymentMethods.join(', ')}` }, { status: 400 });
        }

        // Validate delivery address is required for delivery orders
        if (type === 'delivery' && !deliveryAddress) {
            return NextResponse.json({ error: 'Delivery address is required for delivery orders' }, { status: 400 });
        }
        
        // Sanitize delivery address
        const sanitizedAddress = typeof deliveryAddress === 'string' 
            ? deliveryAddress.slice(0, 500) 
            : null;

        // Auto-save delivery address for authenticated users
        if (sanitizedAddress && finalUserId) {
            try {
                // Check if address already exists
                const { data: existingAddress } = await supabaseAdmin
                    .from('addresses')
                    .select('id')
                    .eq('user_id', finalUserId)
                    .eq('address', sanitizedAddress)
                    .maybeSingle();

                // Save address if it doesn't exist
                if (!existingAddress) {
                    await supabaseAdmin
                        .from('addresses')
                        .insert({
                            user_id: finalUserId,
                            address: sanitizedAddress
                        });
                }
            } catch (addressError) {
                // Don't fail order if address save fails, just log it
                console.error('Failed to save address:', addressError);
            }
        }

        // Build order data
        const orderData: Record<string, any> = {
            user_id: finalUserId || null, // Use validated user ID
            status: 'received',
            total_amount: orderTotal,
            type: type,
            payment_method: selectedPayment,
            payment_status: 'pending',
            store_id: body.storeId || null,
            table_id: table_id || null,
            voucher_id: voucher_id || null
        };

        // Add optional fields only if they exist
        if (body.deliveryNotes) orderData.notes = String(body.deliveryNotes).slice(0, 500);
        if (sanitizedAddress) orderData.delivery_address = sanitizedAddress;

        // Insert Order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert(orderData)
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

        // Return full order object for Swift app compatibility
        return NextResponse.json({
            success: true,
            order: {
                ...order,
                items: orderItems,
                estimated_ready_at: estimatedReadyAt.toISOString()
            },
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
