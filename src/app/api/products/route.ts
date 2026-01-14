import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAdminAccess } from '@/lib/auth-guard';
import { getStorageUrl, DEFAULT_SIZE_OPTIONS, formatProductSlug } from '@/lib/utils';
import { ProductSchema } from '@/lib/schemas';
import { validateRequest } from '@/lib/validation';

interface Category {
    name: string;
    type: string;
}

interface Product {
    id: string;
    name: string;
    description: string | null;
    category_id: string;
    categories: Category | Category[] | null; // Join can return array or single object depending on query
    image: string | null;
    is_popular: boolean;
    is_new: boolean;
    is_available: boolean;
    size_options: any; // Ideally stricter type
    available_toppings: string[];
}

// GET: Fetch all products with optional category filter
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryParam = searchParams.get('category');

        // Build query - including image field for display
        let query = supabaseAdmin
            .from('products')
            .select(`
                id, 
                name, 
                description, 
                category_id,
                categories (
                    name,
                    type
                ),
                image, 
                is_popular, 
                is_new, 
                is_available,
                size_options,
                available_toppings
            `);

        // Filter by category if provided
        if (categoryParam && categoryParam !== 'all') {
            // Check if UUID
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryParam)) {
                query = query.eq('category_id', categoryParam);
            } else {
                // Filter by joined category name reference
                // Use !inner to ensure filtering works on joined table
                query = supabaseAdmin
                    .from('products')
                    .select(`
                        id, 
                        name, 
                        description, 
                        category_id,
                        categories!inner (
                            name,
                            type
                        ),
                        image, 
                        is_popular, 
                        is_new, 
                        is_available,
                        size_options,
                        available_toppings
                    `)
                    .eq('categories.name', categoryParam);
            }
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
        const transformedProducts = (products as unknown as Product[])?.map((p) => {
            const categoryData = Array.isArray(p.categories) ? p.categories[0] : p.categories;

            return {
                id: p.id,
                name: p.name,
                description: p.description,
                category: categoryData?.name || 'Uncategorized',
                categoryId: p.category_id,
                categoryType: categoryData?.type,
                image: getStorageUrl(p.image),
                is_popular: p.is_popular,
                is_new: p.is_new,
                is_available: p.is_available,
                availableToppings: p.available_toppings || [],
                sizeOptions: p.size_options || DEFAULT_SIZE_OPTIONS,
            };
        }) || [];

        // Transform toppings
        const transformedToppings = toppings?.map((t: any) => ({
            id: t.id,
            name: t.name,
            price: t.price,
        })) || [];

        return NextResponse.json({
            products: transformedProducts,
            toppings: transformedToppings,
            size_modifiers: Object.keys(sizeModifiers).length > 0 ? sizeModifiers : {
                'S': { price: 0, label: 'Small' },
                'M': { price: 5000, label: 'Medium' },
                'L': { price: 10000, label: 'Large' },
            },
        });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new product (Admin only)
export async function POST(request: Request) {
    try {
        // Verify admin access
        const authResult = await verifyAdminAccess(request);
        if (!authResult.authorized) {
            return NextResponse.json({ error: authResult.error }, { status: 401 });
        }

        // Validate Request Body
        const validation = await validateRequest(request, ProductSchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const body = validation.data!; // Safe because success is true

        const newProduct = {
            id: formatProductSlug(body.name, body.id),
            name: body.name.trim(),
            description: body.description?.trim() || null,
            category_id: body.categoryId,
            image: body.image || null,
            is_popular: body.isPopular || false,
            is_new: body.isNew || false,
            is_available: body.isAvailable !== false,
            available_toppings: body.availableToppings || [],
            size_options: body.sizeOptions || DEFAULT_SIZE_OPTIONS,
        };

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert(newProduct)
            .select(`
                id, 
                name, 
                description, 
                category_id,
                categories(name, type), 
                image, 
                is_popular, 
                is_new, 
                is_available,
                size_options,
                available_toppings
            `)
            .single();

        if (error) {
            console.error('Product insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform response to match frontend format
        const p = product as unknown as Product;
        const categoryData = Array.isArray(p.categories) ? p.categories[0] : p.categories;

        const transformedProduct = {
            id: p.id,
            name: p.name,
            description: p.description,
            category: categoryData?.name || 'Uncategorized',
            categoryId: p.category_id,
            categoryType: categoryData?.type,
            image: p.image || null,
            isPopular: p.is_popular,
            isNew: p.is_new,
            availableToppings: p.available_toppings || [],
            sizeOptions: p.size_options || DEFAULT_SIZE_OPTIONS,
        };

        return NextResponse.json({ success: true, product: transformedProduct });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


