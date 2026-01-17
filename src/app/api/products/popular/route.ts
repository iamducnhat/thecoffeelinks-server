import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/products/popular
 * 
 * Get popular products based on order counts.
 * Supports filtering by time period.
 * 
 * Params:
 * - period: 'daily' (24h) | 'weekly' (7d) (default: 'daily')
 * - limit: number (default: 10, max: 50)
 */

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'daily';
        const limitParam = searchParams.get('limit');

        // Validate period
        if (period !== 'daily' && period !== 'weekly') {
            return NextResponse.json(
                { error: 'Invalid period. Use "daily" or "weekly".' },
                { status: 400 }
            );
        }

        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 10;
        const sortColumn = period === 'weekly' ? 'order_count_7d' : 'order_count_24h';

        // Query product_popularity view joined with products
        const { data: products, error } = await supabaseAdmin
            .from('product_popularity')
            .select(`
                product_id,
                ${sortColumn},
                products:product_id (
                    id,
                    name,
                    image,
                    category_id,
                    is_available,
                    description
                )
            `)
            .gte(sortColumn, 1) // Filter out items with 0 orders
            .order(sortColumn, { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Popularity fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const responseData = {
            products: (products || []).map((p: any) => ({
                id: p.products?.id,
                name: p.products?.name,
                description: p.products?.description,
                categoryId: p.products?.category_id,
                image: p.products?.image,
                orderCount: p[sortColumn],
                period: period
            })).filter((p: any) => p.name), // Ensure product exists
            period,
            count: products?.length || 0
        };

        return NextResponse.json(responseData, {
            headers: {
                'Cache-Control': 'public, max-age=300', // 5 min cache
                'X-Cache': 'MISS'
            }
        });

    } catch (error: any) {
        console.error('Popular API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
