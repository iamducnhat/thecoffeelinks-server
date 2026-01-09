import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch a single product by ID
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .select('id, name, description, base_price, category, is_popular, is_new, is_available')
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
            basePrice: Number(product.base_price),
            category: product.category,
            image: '/images/default.jpg', // Default fallback
            isPopular: product.is_popular,
            isNew: product.is_new,
            isAvailable: product.is_available,
        };

        return NextResponse.json(transformedProduct);
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a product
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const updateData: any = {};

        // Only update provided fields
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.basePrice !== undefined) updateData.base_price = body.basePrice;
        if (body.category !== undefined) updateData.category = body.category;
        // if (body.image !== undefined) updateData.image = body.image; // Column missing
        if (body.isPopular !== undefined) updateData.is_popular = body.isPopular;
        if (body.isNew !== undefined) updateData.is_new = body.isNew;
        if (body.isAvailable !== undefined) updateData.is_available = body.isAvailable;

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select('id, name, description, base_price, category, is_popular, is_new, is_available')
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
            basePrice: Number(product.base_price),
            category: product.category,
            image: '/images/default.jpg', // Default fallback as DB column is missing
            isPopular: product.is_popular,
            isNew: product.is_new,
            isAvailable: product.is_available,
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

// DELETE: Delete a product
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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
