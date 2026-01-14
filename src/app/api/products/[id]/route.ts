import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAdminAccess } from '@/lib/auth-guard';
import { getStorageUrl, DEFAULT_SIZE_OPTIONS } from '@/lib/utils';

// GET: Fetch a single product by ID (Public)
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .select('id, name, description, category, category_id, image, is_popular, is_new, is_available, size_options')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Product fetch error:', error);
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // Transform to frontend format
        const transformedProduct = {
            id: product.id,
            name: product.name,
            description: product.description,
            category: product.category,
            categoryId: product.category_id,
            image: getStorageUrl(product.image),
            isPopular: product.is_popular,
            isNew: product.is_new,
            isAvailable: product.is_available,
            sizeOptions: product.size_options || DEFAULT_SIZE_OPTIONS,
        };

        return NextResponse.json(transformedProduct);
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a product (Admin only)
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        const updateData: any = {};

        // Only update provided fields
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.category !== undefined) updateData.category = body.category;
        if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
        if (body.image !== undefined) updateData.image = body.image;
        if (body.isPopular !== undefined) updateData.is_popular = body.isPopular;
        if (body.isNew !== undefined) updateData.is_new = body.isNew;
        if (body.isAvailable !== undefined) updateData.is_available = body.isAvailable;
        if (body.sizeOptions !== undefined) updateData.size_options = body.sizeOptions;
        if (body.availableToppings !== undefined) updateData.available_toppings = body.availableToppings;

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select('id, name, description, category, category_id, image, is_popular, is_new, is_available, size_options, available_toppings')
            .single();

        if (error) {
            console.error('Product update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format
        const transformedProduct = {
            id: product.id,
            name: product.name,
            description: product.description,
            category: product.category,
            categoryId: product.category_id,
            image: getStorageUrl(product.image),
            isPopular: product.is_popular,
            isNew: product.is_new,
            isAvailable: product.is_available,
            availableToppings: product.available_toppings || [],
            sizeOptions: product.size_options || DEFAULT_SIZE_OPTIONS,
        };

        return NextResponse.json({ success: true, product: transformedProduct });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Partial update a product (alias for PUT)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return PUT(request, { params });
}

// DELETE: Delete a product (Admin only)
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }

        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('products')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Product delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

