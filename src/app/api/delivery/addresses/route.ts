import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET/POST/PUT/DELETE /api/delivery/addresses
 * 
 * Manage saved delivery addresses per spec.
 */

const MAX_ADDRESSES_PER_USER = 10;
const MAX_LABEL_LENGTH = 50;
const MAX_ADDRESS_LENGTH = 500;
const MAX_NOTES_LENGTH = 500;

// Helper to extract and validate user from auth token
async function getAuthenticatedUserId(request: Request): Promise<{ userId: string | null; error?: string }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { userId: null, error: 'Authorization required' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: null, error: 'Invalid token' };
    }
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return { userId: null, error: 'Invalid authentication token' };
        }
        return { userId: data.user.id };
    } catch {
        return { userId: null, error: 'Authentication failed' };
    }
}

/**
 * GET /api/delivery/addresses
 * Returns user's saved addresses ordered by usage_count DESC
 */
export async function GET(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const { data: addresses, error } = await supabaseAdmin
            .from('addresses')
            .select('*')
            .eq('user_id', userId)
            .order('usage_count', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Addresses fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            addresses: addresses || [],
            count: addresses?.length || 0
        });

    } catch (error: any) {
        console.error('Get addresses error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/delivery/addresses
 * Create a new address
 */
export async function POST(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            label,
            full_address,
            address, // Alternative field name
            latitude,
            longitude,
            is_default,
            delivery_notes
        } = body;

        const addressText = full_address || address;
        if (!addressText || typeof addressText !== 'string') {
            return NextResponse.json({ error: 'Address is required' }, { status: 400 });
        }

        // Validate lengths
        if (label && label.length > MAX_LABEL_LENGTH) {
            return NextResponse.json({ error: `Label must be ${MAX_LABEL_LENGTH} characters or less` }, { status: 400 });
        }

        if (addressText.length > MAX_ADDRESS_LENGTH) {
            return NextResponse.json({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or less` }, { status: 400 });
        }

        if (delivery_notes && delivery_notes.length > MAX_NOTES_LENGTH) {
            return NextResponse.json({ error: `Delivery notes must be ${MAX_NOTES_LENGTH} characters or less` }, { status: 400 });
        }

        // Check address count limit
        const { count } = await supabaseAdmin
            .from('addresses')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (count && count >= MAX_ADDRESSES_PER_USER) {
            return NextResponse.json({ 
                error: `Maximum ${MAX_ADDRESSES_PER_USER} addresses allowed. Please delete an existing address first.` 
            }, { status: 400 });
        }

        // If setting as default, unset other defaults
        if (is_default) {
            await supabaseAdmin
                .from('addresses')
                .update({ is_default: false })
                .eq('user_id', userId)
                .eq('is_default', true);
        }

        // Insert new address
        const { data: newAddress, error } = await supabaseAdmin
            .from('addresses')
            .insert({
                user_id: userId,
                label: label?.slice(0, MAX_LABEL_LENGTH) || null,
                full_address: addressText.slice(0, MAX_ADDRESS_LENGTH),
                latitude: latitude || null,
                longitude: longitude || null,
                is_default: is_default || false,
                delivery_notes: delivery_notes?.slice(0, MAX_NOTES_LENGTH) || null,
                usage_count: 0
            })
            .select()
            .single();

        if (error) {
            console.error('Address insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            address: newAddress
        }, { status: 201 });

    } catch (error: any) {
        console.error('Create address error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/delivery/addresses
 * Update an existing address
 */
export async function PUT(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Address ID is required' }, { status: 400 });
        }

        // Verify ownership
        const { data: existing } = await supabaseAdmin
            .from('addresses')
            .select('id, user_id')
            .eq('id', id)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Address not found' }, { status: 404 });
        }

        if (existing.user_id !== userId) {
            return NextResponse.json({ error: 'You can only update your own addresses' }, { status: 403 });
        }

        // Validate and sanitize updates
        const allowedFields = ['label', 'full_address', 'latitude', 'longitude', 'is_default', 'delivery_notes'];
        const sanitizedUpdates: Record<string, any> = {};

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                if (field === 'label' && updates[field]) {
                    sanitizedUpdates[field] = String(updates[field]).slice(0, MAX_LABEL_LENGTH);
                } else if (field === 'full_address' && updates[field]) {
                    sanitizedUpdates[field] = String(updates[field]).slice(0, MAX_ADDRESS_LENGTH);
                } else if (field === 'delivery_notes' && updates[field]) {
                    sanitizedUpdates[field] = String(updates[field]).slice(0, MAX_NOTES_LENGTH);
                } else {
                    sanitizedUpdates[field] = updates[field];
                }
            }
        }

        // If setting as default, unset other defaults
        if (sanitizedUpdates.is_default === true) {
            await supabaseAdmin
                .from('addresses')
                .update({ is_default: false })
                .eq('user_id', userId)
                .eq('is_default', true)
                .neq('id', id);
        }

        sanitizedUpdates.updated_at = new Date().toISOString();

        const { data: updatedAddress, error } = await supabaseAdmin
            .from('addresses')
            .update(sanitizedUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Address update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            address: updatedAddress
        });

    } catch (error: any) {
        console.error('Update address error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/delivery/addresses
 * Delete an address
 */
export async function DELETE(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Address ID is required' }, { status: 400 });
        }

        // Verify ownership
        const { data: existing } = await supabaseAdmin
            .from('addresses')
            .select('id, user_id')
            .eq('id', id)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Address not found' }, { status: 404 });
        }

        if (existing.user_id !== userId) {
            return NextResponse.json({ error: 'You can only delete your own addresses' }, { status: 403 });
        }

        const { error } = await supabaseAdmin
            .from('addresses')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Address delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Delete address error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
