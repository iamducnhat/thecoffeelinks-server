import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/user/favorites
 * Get all favorites for the authenticated user
 */
export async function GET(request: Request) {
    try {
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

        // Fetch favorites with product details
        const { data: favorites, error } = await supabaseAdmin
            .from('favorites')
            .select(`
                *,
                product:products (*)
            `)
            .eq('user_id', userId)
            .order('last_ordered_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Fetch favorites error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, favorites });

    } catch (error: any) {
        console.error('Favorites API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/user/favorites
 * Create a new favorite
 * 
 * Request body:
 * {
 *   "product_id": "uuid",
 *   "customization": { "size": "medium", "sugar": "50", ... },
 *   "notes": ["Extra hot", "For meetings"]
 * }
 */
export async function POST(request: Request) {
    try {
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
        const body = await request.json();
        const { product_id, customization, notes } = body;

        if (!product_id) {
            return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
        }

        // Validate notes array
        if (notes && Array.isArray(notes)) {
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

        // Insert favorite
        const { data, error } = await supabaseAdmin
            .from('favorites')
            .insert({
                user_id: userId,
                product_id,
                customization: customization || {},
                notes: notes || []
            })
            .select(`
                *,
                product:products (*)
            `)
            .single();

        if (error) {
            // Handle unique constraint violation
            if (error.code === '23505') {
                return NextResponse.json({ 
                    error: 'This product with the same customization is already in your favorites' 
                }, { status: 409 });
            }
            console.error('Create favorite error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, favorite: data });

    } catch (error: any) {
        console.error('Favorites API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
