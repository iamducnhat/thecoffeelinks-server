import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/staff/orders/[id]/status
export async function POST(
    request: Request,
    { params }: { params: { id: string } } // Next.js 13+ params
) {
    // Note: In Next.js App Router, params are awaited in recent versions or passed as 2nd arg.
    // Ensure we handle `params` correctly. If `params` is a Promise (Next 15?), we await it.
    // Assuming Next 14 standard usage here.

    try {
        const id = params.id;
        const body = await request.json();
        const { status } = body; // "preparing" | "ready" | "completed"

        if (!status) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        const validStatuses = ['received', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        // Update status
        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        // TODO: Trigger Notification or Realtime event here

        return NextResponse.json({ success: true, order });
    } catch (error: any) {
        console.error('Staff Update Status Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
