import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders/:id/finalize
 * 
 * Confirm an order after undo window (or manually before expiry).
 * Per spec: Transitions from 'pending' to 'placed' state.
 */

// Helper to extract and validate user from auth token
async function getAuthenticatedUserId(request: Request): Promise<{ userId: string | null; error?: string }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { userId: null, error: 'Authorization required' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: null, error: 'Invalid token' };
    }
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return { userId: null, error: 'Invalid authentication token' };
        }
        return { userId: data.user.id };
    } catch {
        return { userId: null, error: 'Authentication failed' };
    }
}

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
    try {
        const { id: orderId } = await context.params;

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        // Require authentication
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        // Fetch the order with items and delivery info
        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select(`
                *,
                order_items(*),
                addresses:delivery_address_id(*)
            `)
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Verify ownership
        if (order.user_id !== userId) {
            return NextResponse.json({ error: 'You can only finalize your own orders' }, { status: 403 });
        }

        // Check if order is in pending state
        if (order.status !== 'pending') {
            // If already placed, return success with current state
            if (order.status === 'placed' || order.status === 'received' || 
                order.status === 'preparing' || order.status === 'ready') {
                return NextResponse.json({
                    orderId: order.id,
                    status: order.status,
                    estimatedReadyTime: order.estimated_ready_at
                });
            }
            return NextResponse.json({ 
                error: 'Order cannot be finalized.',
                currentStatus: order.status
            }, { status: 400 });
        }

        // Calculate estimated ready time
        const estimatedReadyAt = new Date();
        const baseMinutes = order.delivery_option === 'delivery' 
            ? (order.delivery_eta_minutes || 30) 
            : 15;
        estimatedReadyAt.setMinutes(estimatedReadyAt.getMinutes() + baseMinutes);

        // Finalize the order: transition to 'placed'
        const { data: updatedOrder, error: updateError } = await supabaseAdmin
            .from('orders')
            .update({ 
                status: 'placed',
                finalized_at: new Date().toISOString(),
                estimated_ready_at: estimatedReadyAt.toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (updateError) {
            console.error('Order finalize error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Update rate limits for popularity tracking (anti-manipulation)
        if (order.user_id && order.order_items) {
            for (const item of order.order_items) {
                if (item.product_id) {
                    try {
                        await supabaseAdmin.rpc('check_order_rate_limit', {
                            p_user_id: order.user_id,
                            p_product_id: item.product_id,
                            p_max_per_day: 3
                        });
                    } catch {
                        // Rate limit check failed, continue anyway
                    }
                }
            }
        }

        // Return success per spec
        return NextResponse.json({
            orderId: updatedOrder.id,
            status: 'placed',
            estimatedReadyTime: estimatedReadyAt.toISOString()
        });

    } catch (error: any) {
        console.error('Finalize order error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
