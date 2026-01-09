import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch all active events
export async function GET() {
    try {
        const { data: events, error } = await supabaseAdmin
            .from('events')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Events fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format
        const transformedEvents = events?.map((e: any) => ({
            id: e.id,
            type: e.type,
            title: e.title,
            subtitle: e.subtitle,
            bg: e.bg,
            icon: e.icon,
        })) || [];

        return NextResponse.json({ events: transformedEvents });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new event
export async function POST(request: Request) {
    try {
        const body = await request.json();

        const newEvent = {
            type: body.type,
            title: body.title,
            subtitle: body.subtitle,
            bg: body.bg || 'bg-neutral-900 text-neutral-50',
            icon: body.icon || 'Calendar',
            is_active: body.isActive !== false,
        };

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .insert(newEvent)
            .select()
            .single();

        if (error) {
            console.error('Event insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format
        const transformedEvent = {
            id: event.id,
            type: event.type,
            title: event.title,
            subtitle: event.subtitle,
            bg: event.bg,
            icon: event.icon,
        };

        return NextResponse.json({ success: true, event: transformedEvent });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
