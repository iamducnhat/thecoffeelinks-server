import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/cron/finalize-orders
 * 
 * Scheduled job: Auto-finalize pending orders after undo window expires.
 * Per spec: Run every 10 seconds
 * 
 * Security: Requires CRON_SECRET header
 */

export async function POST(request: Request) {
    try {
        // Verify cron secret
        const cronSecret = request.headers.get('X-Cron-Secret');
        const expectedSecret = process.env.CRON_SECRET;

        if (!expectedSecret || cronSecret !== expectedSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date().toISOString();

        // Find all pending orders where undo window has expired
        const { data: pendingOrders, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, user_id, pending_until, delivery_option, delivery_eta_minutes')
            .eq('status', 'pending')
            .lt('pending_until', now)
            .limit(100); // Process in batches

        if (fetchError) {
            console.error('Fetch pending orders error:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!pendingOrders || pendingOrders.length === 0) {
            return NextResponse.json({ 
                success: true, 
                processed: 0,
                message: 'No pending orders to finalize'
            });
        }

        // Finalize each order
        const results = {
            finalized: 0,
            failed: 0,
            errors: [] as string[]
        };

        for (const order of pendingOrders) {
            try {
                // Calculate estimated ready time
                const estimatedReadyAt = new Date();
                const baseMinutes = order.delivery_option === 'delivery' 
                    ? (order.delivery_eta_minutes || 30) 
                    : 15;
                estimatedReadyAt.setMinutes(estimatedReadyAt.getMinutes() + baseMinutes);

                const { error: updateError } = await supabaseAdmin
                    .from('orders')
                    .update({
                        status: 'placed',
                        finalized_at: now,
                        estimated_ready_at: estimatedReadyAt.toISOString()
                    })
                    .eq('id', order.id)
                    .eq('status', 'pending'); // Double-check status to prevent race conditions

                if (updateError) {
                    results.failed++;
                    results.errors.push(`Order ${order.id}: ${updateError.message}`);
                } else {
                    results.finalized++;
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Order ${order.id}: ${err.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            processed: pendingOrders.length,
            finalized: results.finalized,
            failed: results.failed,
            errors: results.errors.length > 0 ? results.errors : undefined
        });

    } catch (error: any) {
        console.error('Finalize orders cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Allow GET for health checks
export async function GET() {
    return NextResponse.json({ 
        job: 'finalize-orders',
        frequency: '10 seconds',
        status: 'active'
    });
}
