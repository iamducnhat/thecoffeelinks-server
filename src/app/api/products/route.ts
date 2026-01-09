import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch all products with optional category filter
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');

        // Build query
        let query = supabaseAdmin
            .from('products')
            .select('id, name, description, base_price, category, is_popular, is_new, is_available');

        // Filter by category if provided
        if (category && category !== 'all') {
            query = query.eq('category', category);
        }

        const { data: products, error: productsError } = await query;

        if (productsError) {
            console.error('Products fetch error:', productsError);
            return NextResponse.json({ error: productsError.message }, { status: 500 });
        }

        // Fetch toppings
        const { data: toppings, error: toppingsError } = await supabaseAdmin
            .from('toppings')
            .select('*')
            .eq('is_available', true);

        if (toppingsError) {
            console.error('Toppings fetch error:', toppingsError);
        }

        // Fetch size modifiers
        const { data: sizeModifiersData, error: sizeError } = await supabaseAdmin
            .from('size_modifiers')
            .select('*');

        if (sizeError) {
            console.error('Size modifiers fetch error:', sizeError);
        }

        // Transform size modifiers to expected format
        const sizeModifiers: Record<string, { price: number; label: string }> = {};
        sizeModifiersData?.forEach((size: any) => {
            sizeModifiers[size.id] = { price: size.price, label: size.label };
        });

        // Transform products to match expected frontend format
        const transformedProducts = products?.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            basePrice: Number(p.base_price),
            category: p.category,
            image: p.image || '/images/default.jpg',
            isPopular: p.is_popular,
            isNew: p.is_new,
            isAvailable: p.is_available,
        })) || [];

        // Transform toppings
        const transformedToppings = toppings?.map((t: any) => ({
            id: t.id,
            name: t.name,
            price: t.price,
        })) || [];

        return NextResponse.json({
            products: transformedProducts,
            toppings: transformedToppings,
            sizeModifiers: Object.keys(sizeModifiers).length > 0 ? sizeModifiers : {
                'S': { price: 0, label: 'Small' },
                'M': { price: 10000, label: 'Medium' },
                'L': { price: 20000, label: 'Large' },
            },
        });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new product
export async function POST(request: Request) {
    try {
        const body = await request.json();

        const newProduct = {
            id: body.id || body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name: body.name,
            description: body.description,
            base_price: body.basePrice,
            category: body.category,
            // image: body.image || '/images/default.jpg', // Column missing in DB
            is_popular: body.isPopular || false,
            is_new: body.isNew || false,
            is_available: body.isAvailable !== false,
        };

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert(newProduct)
            .select('id, name, description, base_price, category, is_popular, is_new, is_available')
            .single();

        if (error) {
            console.error('Product insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform response to match frontend format
        const transformedProduct = {
            id: product.id,
            name: product.name,
            description: product.description,
            basePrice: Number(product.base_price),
            category: product.category,
            image: '/images/default.jpg', // Default fallback as DB column is missing
            isPopular: product.is_popular,
            isNew: product.is_new,
        };

        return NextResponse.json({ success: true, product: transformedProduct });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
