import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/staff/orders
// Fetch orders with optional status filter, pagination, and date range
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status'); // e.g. "received,preparing"
        const limitParam = searchParams.get('limit');
        const offsetParam = searchParams.get('offset');
        const dateFrom = searchParams.get('from'); // ISO date string
        const dateTo = searchParams.get('to'); // ISO date string
        const todayOnly = searchParams.get('today') === 'true';
        
        // Parse and validate limit
        let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
        if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
        if (limit > MAX_LIMIT) limit = MAX_LIMIT;
        
        // Parse offset
        let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
        if (isNaN(offset) || offset < 0) offset = 0;

        let query = supabaseAdmin
            .from('orders')
            .select('*, order_items(*)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Filter by status
        if (statusParam) {
            const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
            if (statuses.length > 0) {
                query = query.in('status', statuses);
            }
        }
        
        // Filter by date range
        if (todayOnly) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query = query.gte('created_at', today.toISOString());
        } else {
            if (dateFrom) {
                query = query.gte('created_at', dateFrom);
            }
            if (dateTo) {
                query = query.lte('created_at', dateTo);
            }
        }

        const { data: orders, error, count } = await query;

        if (error) {
            throw error;
        }

        return NextResponse.json({ 
            orders,
            pagination: {
                total: count,
                limit,
                offset,
                hasMore: count ? offset + limit < count : false
            }
        });
    } catch (error: any) {
        console.error('Staff Orders Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
