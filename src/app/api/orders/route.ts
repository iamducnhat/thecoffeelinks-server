import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders
 * 
 * Create a new order with 30-sec pending state for undo.
 * Returns status: "pending" with expiresAt timestamp.
 */

// Input validation helpers
const MAX_ITEMS_PER_ORDER = 50;
const MAX_QUANTITY_PER_ITEM = 20;
const MAX_TOTAL_AMOUNT = 50000000; // 50 million VND
const MIN_TOTAL_AMOUNT = 1000; // 1000 VND minimum
const DEFAULT_UNDO_WINDOW_SECONDS = 30;
const MAX_NOTES_PER_ITEM = 3;
const MAX_NOTE_LENGTH = 140;
const MAX_ORDERS_PER_PRODUCT_PER_DAY = 3;

// Valid order sources per spec
const VALID_SOURCES = ['manual', 'ai_suggested', 'reorder', 'favorite'] as const;
type OrderSource = typeof VALID_SOURCES[number];

// Valid delivery options per spec
const VALID_DELIVERY_OPTIONS = ['pickup', 'dine_in', 'delivery'] as const;
type DeliveryOption = typeof VALID_DELIVERY_OPTIONS[number];

interface OrderItemInput {
    product?: { name?: string; id?: string };
    product_id?: string;
    product_name?: string;
    quantity?: number;
    finalPrice?: number;
    final_price?: number; // Support snake_case from Swift clients
    price?: number;
    customization?: Record<string, unknown>;
    notes?: string[];
    is_favorite?: boolean;
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

        // Validate notes per spec: max 3 notes, max 140 chars each
        if (item.notes) {
            if (!Array.isArray(item.notes)) {
                return { valid: false, error: `Item ${i + 1}: Notes must be an array` };
            }
            if (item.notes.length > MAX_NOTES_PER_ITEM) {
                return { valid: false, error: `Item ${i + 1}: Maximum ${MAX_NOTES_PER_ITEM} notes per item` };
            }
            for (let j = 0; j < item.notes.length; j++) {
                if (typeof item.notes[j] !== 'string') {
                    return { valid: false, error: `Item ${i + 1}: Note ${j + 1} must be a string` };
                }
                if (item.notes[j].length > MAX_NOTE_LENGTH) {
                    return { valid: false, error: `Item ${i + 1}: Note ${j + 1} exceeds ${MAX_NOTE_LENGTH} characters` };
                }
            }
        }

        // Support both camelCase and snake_case (Swift clients use snake_case encoding)
        const price = item.finalPrice ?? item.final_price ?? item.price;
        if (typeof price !== 'number' || price < 0) {
            return { valid: false, error: `Item ${i + 1}: Invalid price` };
        }
    }

    return { valid: true };
}

// Validate all items are deliverable (for delivery orders)
async function validateDeliverableItems(items: OrderItemInput[]): Promise<{ valid: boolean; error?: string }> {
    const productIds = items
        .map(item => item.product?.id || item.product_id)
        .filter((id): id is string => !!id);

    if (productIds.length === 0) {
        // No product IDs to validate - skip check
        return { valid: true };
    }

    const { data: products, error } = await supabaseAdmin
        .from('products')
        .select('id, name, is_deliverable')
        .in('id', productIds);

    if (error) {
        console.error('Deliverable check error:', error);
        return { valid: true }; // Don't block on error
    }

    const nonDeliverable = products?.filter(p => p.is_deliverable === false);
    if (nonDeliverable && nonDeliverable.length > 0) {
        const names = nonDeliverable.map(p => p.name).join(', ');
        return {
            valid: false,
            error: `These items are not available for delivery: ${names}`
        };
    }

    return { valid: true };
}

// Validate store accepts delivery at current time
async function validateStoreDelivery(storeId: string, orderTotal: number): Promise<{ valid: boolean; error?: string; minAmount?: number }> {
    const { data: store, error } = await supabaseAdmin
        .from('stores')
        .select('delivery_enabled, delivery_hours_start, delivery_hours_end, min_delivery_amount')
        .eq('id', storeId)
        .single();

    if (error || !store) {
        // Store not found or no delivery settings - allow order
        return { valid: true };
    }

    if (!store.delivery_enabled) {
        return { valid: false, error: 'This store does not accept delivery orders' };
    }

    // Check delivery hours
    if (store.delivery_hours_start && store.delivery_hours_end) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);
        if (currentTime < store.delivery_hours_start || currentTime > store.delivery_hours_end) {
            return {
                valid: false,
                error: `Delivery available ${store.delivery_hours_start} - ${store.delivery_hours_end}`
            };
        }
    }

    // Check minimum order amount
    if (store.min_delivery_amount && orderTotal < store.min_delivery_amount) {
        const shortfall = store.min_delivery_amount - orderTotal;
        return {
            valid: false,
            error: `Add ${shortfall.toLocaleString()}đ more for delivery (minimum: ${store.min_delivery_amount.toLocaleString()}đ)`,
            minAmount: store.min_delivery_amount
        };
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
        // Support prompt payload keys + legacy keys + new spec fields
        const {
            items,
            order_type, deliveryOption,
            table_id,
            address_id, deliveryAddress, deliveryAddressId,
            payment_method, paymentMethod,
            paymentToken, // Payment verification token
            voucher_id,
            user_id, // Client-provided user_id
            total_amount, total,
            source = 'manual', // Order source: manual, ai_suggested, reorder, favorite
            storeId,
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

        // Validate source per spec
        if (!VALID_SOURCES.includes(source)) {
            return NextResponse.json({
                error: `Invalid source. Valid options: ${VALID_SOURCES.join(', ')}`
            }, { status: 400 });
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

        // Determine delivery option per spec
        let deliveryOptionValue: DeliveryOption = 'pickup';
        const rawDeliveryOption = deliveryOption || order_type;
        if (rawDeliveryOption === 'delivery') {
            deliveryOptionValue = 'delivery';
        } else if (rawDeliveryOption === 'dine_in' || rawDeliveryOption === 'dine-in') {
            deliveryOptionValue = 'dine_in';
        } else if (rawDeliveryOption === 'pickup' || rawDeliveryOption === 'take_away' || rawDeliveryOption === 'take-away') {
            deliveryOptionValue = 'pickup';
        }

        // NEW: Validate delivery-specific constraints
        if (deliveryOptionValue === 'delivery') {
            // Validate all items are deliverable
            const deliverableValidation = await validateDeliverableItems(items);
            if (!deliverableValidation.valid) {
                return NextResponse.json({ error: deliverableValidation.error }, { status: 400 });
            }

            // Validate store accepts delivery
            if (storeId) {
                const storeDeliveryValidation = await validateStoreDelivery(storeId, orderTotal);
                if (!storeDeliveryValidation.valid) {
                    return NextResponse.json({
                        error: storeDeliveryValidation.error,
                        minAmount: storeDeliveryValidation.minAmount
                    }, { status: 400 });
                }
            }
        }

        // Legacy type mapping for backward compatibility
        let type = deliveryOptionValue === 'delivery' ? 'take_away' :
            deliveryOptionValue === 'dine_in' ? 'dine_in' : 'take_away';

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
        const finalAddressId = deliveryAddressId || address_id;
        if (deliveryOptionValue === 'delivery' && !deliveryAddress && !finalAddressId) {
            return NextResponse.json({ error: 'Delivery address is required for delivery orders' }, { status: 400 });
        }

        // Sanitize delivery address
        const sanitizedAddress = typeof deliveryAddress === 'string'
            ? deliveryAddress.slice(0, 500)
            : null;

        // Calculate delivery fee and ETA if delivery order
        let deliveryFee = 0;
        let deliveryEtaMinutes: number | null = null;

        if (deliveryOptionValue === 'delivery' && finalAddressId && storeId) {
            try {
                // Get address coordinates
                const { data: addressData } = await supabaseAdmin
                    .from('addresses')
                    .select('latitude, longitude')
                    .eq('id', finalAddressId)
                    .single();

                if (addressData?.latitude && addressData?.longitude) {
                    // Check delivery zone and calculate fee
                    const { data: zoneData } = await supabaseAdmin
                        .rpc('check_delivery_zone', {
                            p_store_id: storeId,
                            p_latitude: addressData.latitude,
                            p_longitude: addressData.longitude
                        });

                    if (zoneData && zoneData.length > 0) {
                        deliveryFee = zoneData[0].total_fee || 0;
                        deliveryEtaMinutes = zoneData[0].eta_minutes || 30;
                    }

                    // Increment address usage
                    await supabaseAdmin.rpc('increment_address_usage', { address_id: finalAddressId });
                }
            } catch (deliveryError) {
                console.error('Delivery calculation error:', deliveryError);
                // Use defaults
                deliveryEtaMinutes = 30;
            }
        }

        // Check if any item has notes (for has_notes flag)
        const hasNotes = items.some((item: OrderItemInput) => item.notes && item.notes.length > 0);

        // Get undo window duration from config (default 30 seconds)
        let undoWindowSeconds = DEFAULT_UNDO_WINDOW_SECONDS;
        try {
            const { data: configData } = await supabaseAdmin
                .from('system_config')
                .select('value')
                .eq('key', 'undo_window_seconds')
                .single();
            if (configData?.value) {
                undoWindowSeconds = parseInt(configData.value, 10) || DEFAULT_UNDO_WINDOW_SECONDS;
            }
        } catch {
            // Use default
        }

        // Calculate pending_until timestamp
        const pendingUntil = new Date();
        pendingUntil.setSeconds(pendingUntil.getSeconds() + undoWindowSeconds);

        // Build order data with new fields per spec
        const orderData: Record<string, any> = {
            user_id: finalUserId || null,
            status: 'pending', // NEW: Start in pending state
            pending_until: pendingUntil.toISOString(), // NEW: Undo window expiry
            total_amount: orderTotal,
            type: type,
            delivery_option: deliveryOptionValue, // NEW: Per spec
            payment_method: selectedPayment,
            payment_status: 'pending',
            store_id: storeId || null,
            table_id: table_id || null,
            voucher_id: voucher_id || null,
            source: source as OrderSource, // NEW: Track order origin
            has_notes: hasNotes, // NEW: Quick filter for staff
            delivery_address_id: finalAddressId || null, // NEW: FK to addresses
            delivery_fee: deliveryFee, // NEW: Calculated fee
            delivery_eta_minutes: deliveryEtaMinutes, // NEW: Calculated ETA
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

        // Insert Items with new fields per spec
        const orderItems = items.map((item: OrderItemInput) => ({
            order_id: order.id,
            product_id: item.product?.id || item.product_id || null, // NEW: For popularity tracking
            product_name: item.product?.name || item.product_name,
            final_price: item.finalPrice ?? item.final_price ?? item.price,
            quantity: item.quantity,
            options_snapshot_json: item.customization,
            notes: item.notes || null, // NEW: User notes array
            is_favorite: item.is_favorite || false, // NEW: From favorites flag
        }));

        const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Order items insert error:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Calculate estimated ready time
        const estimatedReadyAt = new Date();
        const baseMinutes = deliveryOptionValue === 'delivery' ? (deliveryEtaMinutes || 30) : 15;
        estimatedReadyAt.setMinutes(estimatedReadyAt.getMinutes() + baseMinutes);

        // Return response per spec: status "pending" with expiresAt
        return NextResponse.json({
            success: true,
            orderId: order.id,
            status: 'pending', // Per spec: NOT "placed"
            expiresAt: pendingUntil.toISOString(), // Per spec: now + 30 seconds
            estimatedReadyTime: estimatedReadyAt.toISOString(),
            // Include full order for backward compatibility
            order: {
                ...order,
                items: orderItems,
                estimated_ready_at: estimatedReadyAt.toISOString()
            },
            order_id: order.id, // Legacy field
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
