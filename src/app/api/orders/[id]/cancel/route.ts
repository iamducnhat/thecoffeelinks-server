import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/orders/:id/cancel
 * 
 * Cancel an order within the undo window.
 * Per spec: Only works if order is in 'pending' state and within undo window.
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

        // Fetch the order
        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, user_id, status, pending_until, payment_status')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Verify ownership
        if (order.user_id !== userId) {
            return NextResponse.json({ error: 'You can only cancel your own orders' }, { status: 403 });
        }

        // Check if order is in pending state
        if (order.status !== 'pending') {
            return NextResponse.json({ 
                error: 'Order cannot be cancelled. Only pending orders can be cancelled.',
                currentStatus: order.status
            }, { status: 400 });
        }

        // Check if within undo window
        const now = new Date();
        const pendingUntil = new Date(order.pending_until);
        if (now > pendingUntil) {
            return NextResponse.json({ 
                error: 'Undo window has expired. Order has been finalized.',
                expiredAt: order.pending_until
            }, { status: 400 });
        }

        // Cancel the order
        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({ 
                status: 'cancelled',
                finalized_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('Order cancel error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Handle refund if payment was captured
        let refundInitiated = false;
        if (order.payment_status === 'paid' || order.payment_status === 'captured') {
            // TODO: Integrate with payment gateway for refund
            // For now, mark as refund pending
            await supabaseAdmin
                .from('orders')
                .update({ payment_status: 'refund_pending' })
                .eq('id', orderId);
            refundInitiated = true;
        }

        // Return success per spec
        return NextResponse.json({
            success: true,
            refundInitiated
        });

    } catch (error: any) {
        console.error('Cancel order error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
