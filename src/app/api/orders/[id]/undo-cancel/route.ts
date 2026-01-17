import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders/:id/undo-cancel
 * 
 * Restore a recently cancelled order within the undo window.
 * Per spec: Only works if order was cancelled within the last 30 seconds.
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

const UNDO_WINDOW_SECONDS = 30;

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

        // Fetch the order
        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, user_id, status, finalized_at, created_at')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Verify ownership
        if (order.user_id !== userId) {
            return NextResponse.json({ error: 'You can only undo cancel your own orders' }, { status: 403 });
        }

        // Check if order is cancelled
        if (order.status !== 'cancelled') {
            return NextResponse.json({
                error: 'Order is not cancelled. Only cancelled orders can be restored.',
                currentStatus: order.status
            }, { status: 400 });
        }

        // Check if within undo window (30 seconds from finalized_at which is when it was cancelled)
        const now = new Date();
        const cancelledAt = new Date(order.finalized_at || order.created_at);
        const secondsSinceCancellation = (now.getTime() - cancelledAt.getTime()) / 1000;

        if (secondsSinceCancellation > UNDO_WINDOW_SECONDS) {
            return NextResponse.json({
                error: 'Undo window has expired. Cannot restore this order.',
                expiredAt: cancelledAt.toISOString(),
                windowSeconds: UNDO_WINDOW_SECONDS
            }, { status: 400 });
        }

        // Restore the order to pending state - let user decide to finalize again
        const { data: updatedOrder, error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
                status: 'pending',
                finalized_at: null,
                pending_until: new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000).toISOString()
            })
            .eq('id', orderId)
            .select('*, order_items(*)')
            .single();

        if (updateError) {
            console.error('Order undo-cancel error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Return success with restored order
        return NextResponse.json({
            success: true,
            order: updatedOrder,
            message: 'Order restored successfully'
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Undo cancel order error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
