import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * PUT /api/user/favorites/[id]
 * Update a favorite (notes or customization)
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const userId = authData.user.id;
        const favoriteId = id;
        const body = await request.json();
        const { customization, notes } = body;

        // Validate notes array if provided
        if (notes !== undefined) {
            if (!Array.isArray(notes)) {
                return NextResponse.json({ error: 'notes must be an array' }, { status: 400 });
            }
            if (notes.length > 3) {
                return NextResponse.json({ error: 'Maximum 3 notes allowed' }, { status: 400 });
            }
            for (const note of notes) {
                if (typeof note !== 'string' || note.length > 140) {
                    return NextResponse.json({ 
                        error: 'Each note must be a string with max 140 characters' 
                    }, { status: 400 });
                }
            }
        }

        // Build update object
        const updates: any = {};
        if (customization !== undefined) updates.customization = customization;
        if (notes !== undefined) updates.notes = notes;

        // Update favorite (user_id check ensures user can only update their own favorites)
        const { data, error } = await supabaseAdmin
            .from('favorites')
            .update(updates)
            .eq('id', favoriteId)
            .eq('user_id', userId)
            .select(`
                *,
                product:products (*)
            `)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Favorite not found' }, { status: 404 });
            }
            console.error('Update favorite error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, favorite: data });

    } catch (error: any) {
        console.error('Favorites API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/user/favorites/[id]
 * Delete a favorite
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const userId = authData.user.id;
        const favoriteId = id;

        // Delete favorite (user_id check ensures user can only delete their own favorites)
        const { error } = await supabaseAdmin
            .from('favorites')
            .delete()
            .eq('id', favoriteId)
            .eq('user_id', userId);

        if (error) {
            console.error('Delete favorite error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Favorites API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    return PUT(request, context);
}
