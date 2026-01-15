import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/cron/update-popularity
 * 
 * Scheduled job: Recalculate product popularity (24h order counts).
 * Per spec: Run every 5 minutes
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

        const startTime = Date.now();

        // Call database function to update popularity
        const { error: updateError } = await supabaseAdmin
            .rpc('update_product_popularity');

        if (updateError) {
            console.error('Update popularity error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Get stats for response
        const { data: stats, error: statsError } = await supabaseAdmin
            .from('product_popularity')
            .select('product_id', { count: 'exact' });

        const { data: topProducts } = await supabaseAdmin
            .from('product_popularity')
            .select('product_id, order_count_24h')
            .gte('order_count_24h', 5) // Per spec: minOrders = 5
            .order('order_count_24h', { ascending: false })
            .limit(10);

        const elapsedMs = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            stats: {
                totalProducts: stats?.length || 0,
                productsAboveThreshold: topProducts?.length || 0,
                topProduct: topProducts?.[0] || null,
                executionTimeMs: elapsedMs
            }
        });

    } catch (error: any) {
        console.error('Update popularity cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Allow GET for health checks
export async function GET() {
    return NextResponse.json({ 
        job: 'update-popularity',
        frequency: '5 minutes',
        status: 'active'
    });
}
