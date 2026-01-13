import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch a single event by ID
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .select('*')
            .eq('id', parseInt(id))
            .single();

        if (error) {
            console.error('Event fetch error:', error);
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Transform to frontend format
        const transformedEvent = {
            id: event.id,
            type: event.type,
            title: event.title,
            subtitle: event.subtitle,
            bg: event.bg,
            icon: event.icon,
            isActive: event.is_active,
        };

        return NextResponse.json(transformedEvent);
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update an event
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        // Only update provided fields
        if (body.type !== undefined) updateData.type = body.type;
        if (body.title !== undefined) updateData.title = body.title;
        if (body.subtitle !== undefined) updateData.subtitle = body.subtitle;
        if (body.bg !== undefined) updateData.bg = body.bg;
        if (body.icon !== undefined) updateData.icon = body.icon;
        if (body.imageURL !== undefined || body.image_url !== undefined) {
            updateData.image_url = body.imageURL || body.image_url;
        }
        if (body.isActive !== undefined) updateData.is_active = body.isActive;

        const { data: event, error } = await supabaseAdmin
            .from('events')
            .update(updateData)
            .eq('id', parseInt(id))
            .select()
            .single();

        if (error) {
            console.error('Event update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format (match Swift Event model)
        const transformedEvent = {
            id: event.id,
            type: event.type,
            title: event.title,
            subtitle: event.subtitle,
            bg: event.bg,
            icon: event.icon,
            imageURL: event.image_url,
            isActive: event.is_active,
        };

        return NextResponse.json({ success: true, event: transformedEvent });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Partial update an event (alias for PUT)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return PUT(request, { params });
}

// DELETE: Delete an event
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('id', parseInt(id));

        if (error) {
            console.error('Event delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
