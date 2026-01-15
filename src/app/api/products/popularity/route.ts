import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/products/popularity
 * 
 * Get order counts per product (last 24h).
 * Per spec: Cacheable with 5-min TTL, minOrders threshold.
 */

// In-memory cache for popularity data
interface CacheEntry {
    data: any;
    timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes per spec

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const storeId = searchParams.get('storeId');
        const limitParam = searchParams.get('limit');
        
        // Cache key includes storeId if provided
        const cacheKey = `popularity_${storeId || 'all'}`;
        
        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return NextResponse.json(cached.data, {
                headers: {
                    'Cache-Control': 'public, max-age=300',
                    'X-Cache': 'HIT'
                }
            });
        }

        // Get config values
        let minOrders = 5; // Default per spec
        let maxShown = 10;

        try {
            const { data: minOrdersConfig } = await supabaseAdmin
                .from('system_config')
                .select('value')
                .eq('key', 'popularity_min_orders')
                .single();
            if (minOrdersConfig?.value) {
                minOrders = parseInt(minOrdersConfig.value, 10) || 5;
            }

            const { data: maxShownConfig } = await supabaseAdmin
                .from('system_config')
                .select('value')
                .eq('key', 'popularity_max_shown')
                .single();
            if (maxShownConfig?.value) {
                maxShown = parseInt(maxShownConfig.value, 10) || 10;
            }
        } catch {
            // Use defaults
        }

        // Override max with limit param if provided
        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : maxShown;

        // Get popular products using database function
        const { data: products, error } = await supabaseAdmin
            .rpc('get_popular_products', {
                p_min_orders: minOrders,
                p_max_results: limit,
                p_store_id: storeId || null
            });

        if (error) {
            console.error('Popularity fetch error:', error);
            
            // Fallback to direct query
            const { data: fallbackProducts, error: fallbackError } = await supabaseAdmin
                .from('product_popularity')
                .select(`
                    product_id,
                    order_count_24h,
                    products:product_id (
                        id,
                        name,
                        image,
                        category_id,
                        is_available
                    )
                `)
                .gte('order_count_24h', minOrders)
                .order('order_count_24h', { ascending: false })
                .limit(limit);

            if (fallbackError) {
                return NextResponse.json({ error: fallbackError.message }, { status: 500 });
            }

            const responseData = {
                products: (fallbackProducts || []).map((p: any) => ({
                    productId: p.product_id,
                    productName: p.products?.name,
                    categoryId: p.products?.category_id,
                    image: p.products?.image,
                    orderCount: p.order_count_24h
                })).filter((p: any) => p.productName),
                windowHours: 24,
                minOrders
            };

            // Update cache
            cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

            return NextResponse.json(responseData, {
                headers: {
                    'Cache-Control': 'public, max-age=300',
                    'X-Cache': 'MISS'
                }
            });
        }

        // Format response per spec
        const responseData = {
            products: (products || []).map((p: any) => ({
                productId: p.product_id,
                productName: p.product_name,
                categoryId: p.category_id,
                image: p.image,
                orderCount: p.order_count
            })),
            windowHours: 24,
            minOrders
        };

        // Update cache
        cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

        return NextResponse.json(responseData, {
            headers: {
                'Cache-Control': 'public, max-age=300',
                'X-Cache': 'MISS'
            }
        });

    } catch (error: any) {
        console.error('Popularity API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
