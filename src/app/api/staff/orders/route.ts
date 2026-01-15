import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyStaffAccess } from '@/lib/auth-guard';

/**
 * GET /api/staff/orders
 * 
 * Fetch orders for staff with enhanced fields per spec:
 * - source badge (ai_suggested, reorder, favorite, manual)
 * - has_notes indicator
 * - delivery filter
 * - delivery address on tickets
 * - is_favorite flag on items
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
    try {
        const { authorized, error: authError } = await verifyStaffAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status'); // e.g. "received,preparing"
        const limitParam = searchParams.get('limit');
        const offsetParam = searchParams.get('offset');
        const dateFrom = searchParams.get('from'); // ISO date string
        const dateTo = searchParams.get('to'); // ISO date string
        const todayOnly = searchParams.get('today') === 'true';
        
        // NEW: Additional filters per spec
        const deliveryOnly = searchParams.get('delivery') === 'true';
        const hasNotesOnly = searchParams.get('hasNotes') === 'true';
        const sourceFilter = searchParams.get('source'); // e.g. "ai_suggested"

        // Parse and validate limit
        let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
        if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
        if (limit > MAX_LIMIT) limit = MAX_LIMIT;

        // Parse offset
        let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
        if (isNaN(offset) || offset < 0) offset = 0;

        // Enhanced select with new fields and delivery address
        let query = supabaseAdmin
            .from('orders')
            .select(`
                *,
                order_items(*),
                delivery_address:delivery_address_id (
                    id,
                    label,
                    full_address,
                    delivery_notes
                )
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Filter by status (exclude pending orders from staff view - they're not finalized)
        if (statusParam) {
            const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
            if (statuses.length > 0) {
                query = query.in('status', statuses);
            }
        } else {
            // By default, don't show pending orders to staff
            query = query.neq('status', 'pending');
        }

        // NEW: Filter by delivery option
        if (deliveryOnly) {
            query = query.eq('delivery_option', 'delivery');
        }

        // NEW: Filter by has_notes
        if (hasNotesOnly) {
            query = query.eq('has_notes', true);
        }

        // NEW: Filter by source
        if (sourceFilter) {
            query = query.eq('source', sourceFilter);
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

        // Transform orders for staff view per spec
        const staffOrders = (orders || []).map((order: any) => ({
            ...order,
            // Staff-facing badges and indicators
            _staffView: {
                // Source badge per spec
                sourceBadge: getSourceBadge(order.source),
                // Notes indicator (sticky note icon)
                hasNotes: order.has_notes || false,
                // Delivery badge
                isDelivery: order.delivery_option === 'delivery',
                // Favorite items in order
                hasFavoriteItems: (order.order_items || []).some((item: any) => item.is_favorite),
                // Delivery info for ticket
                deliveryInfo: order.delivery_option === 'delivery' ? {
                    address: order.delivery_address?.full_address || order.delivery_address,
                    label: order.delivery_address?.label,
                    notes: order.delivery_address?.delivery_notes,
                    fee: order.delivery_fee,
                    etaMinutes: order.delivery_eta_minutes
                } : null,
                // Item notes for quick reference
                itemNotes: (order.order_items || [])
                    .filter((item: any) => item.notes && item.notes.length > 0)
                    .map((item: any) => ({
                        productName: item.product_name,
                        notes: item.notes
                    }))
            }
        }));

        return NextResponse.json({
            orders: staffOrders,
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

/**
 * Get display badge for order source
 */
function getSourceBadge(source: string): { label: string; color: string; icon: string } {
    switch (source) {
        case 'ai_suggested':
            return { label: 'AI Suggested', color: 'purple', icon: '🤖' };
        case 'reorder':
            return { label: 'Reorder', color: 'blue', icon: '🔄' };
        case 'favorite':
            return { label: 'Favorite', color: 'yellow', icon: '⭐' };
        case 'manual':
        default:
            return { label: 'Manual', color: 'gray', icon: '' };
    }
}
}

