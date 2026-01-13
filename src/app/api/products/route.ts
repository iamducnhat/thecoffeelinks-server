import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch all products with optional category filter
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');

        // Build query - including image field for display
        let query = supabaseAdmin
            .from('products')
            .select('id, name, description, base_price, category, image, is_popular, is_new, is_available');

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
            base_price: Number(p.base_price),
            category: p.category,
            image: p.image ? (p.image.startsWith('http') ? p.image : `https://ggikmpqyhkfhctwqbytk.supabase.co/storage/v1/object/public/${p.image}`) : null,
            is_popular: p.is_popular,
            is_new: p.is_new,
            is_available: p.is_available,
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

// Helper to verify admin access
async function verifyAdminAccess(request: Request): Promise<{ authorized: boolean; error?: string }> {
    // Check for admin API key or valid auth token
    const adminKey = request.headers.get('X-Admin-Key');
    const adminSecret = process.env.ADMIN_SECRET;
    
    if (adminKey && adminSecret && adminKey === adminSecret) {
        return { authorized: true };
    }
    
    // Alternatively check for valid user session (for authenticated admin users)
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data.user) {
                // In production, also check user role/permissions
                return { authorized: true };
            }
        } catch {}
    }
    
    return { authorized: false, error: 'Admin access required' };
}

// POST: Create a new product (Admin only)
export async function POST(request: Request) {
    try {
        // Verify admin access
        const { authorized, error: authError } = await verifyAdminAccess(request);
        if (!authorized) {
            return NextResponse.json({ error: authError }, { status: 401 });
        }
        
        const body = await request.json();
        
        // Input validation
        if (!body.name || typeof body.name !== 'string' || body.name.length < 2) {
            return NextResponse.json({ error: 'Product name is required (min 2 characters)' }, { status: 400 });
        }
        
        if (body.basePrice !== undefined && (typeof body.basePrice !== 'number' || body.basePrice < 0)) {
            return NextResponse.json({ error: 'Invalid base price' }, { status: 400 });
        }

        const newProduct = {
            id: body.id || body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name: body.name.trim(),
            description: body.description?.trim() || null,
            base_price: body.basePrice || 0,
            category: body.category || 'coffee',
            image: body.image || null,
            is_popular: body.isPopular || false,
            is_new: body.isNew || false,
            is_available: body.isAvailable !== false,
        };

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert(newProduct)
            .select('id, name, description, base_price, category, image, is_popular, is_new, is_available')
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
            image: product.image || null,
            isPopular: product.is_popular,
            isNew: product.is_new,
        };

        return NextResponse.json({ success: true, product: transformedProduct });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
