import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/staff/orders
// Fetch orders with optional status filter
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status'); // e.g. "received,preparing"

        let query = supabaseAdmin
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false });

        if (statusParam) {
            const statuses = statusParam.split(',');
            query = query.in('status', statuses);
        }

        const { data: orders, error } = await query;

        if (error) {
            throw error;
        }

        return NextResponse.json({ orders });
    } catch (error: any) {
        console.error('Staff Orders Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
