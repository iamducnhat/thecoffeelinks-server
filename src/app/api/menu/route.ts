import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getStorageUrl } from '@/lib/utils';

export async function GET() {
    try {
        // 1. Fetch Products (including image field for display)
        const { data: products, error: productsError } = await supabaseAdmin
            .from('products')
            .select('id, name, description, category_id, categories(name, type), image, is_popular, is_new, is_available, available_toppings, size_options')
            .eq('is_available', true);

        if (productsError) throw productsError;

        // 2. Fetch Toppings
        const { data: toppings, error: toppingsError } = await supabaseAdmin
            .from('toppings')
            .select('id, name, price, is_available');

        if (toppingsError) {
            console.warn('Toppings fetch error:', toppingsError);
        }

        // Filter available toppings (or include all if is_available column doesn't exist)
        const availableToppings = toppings?.filter(t => t.is_available !== false) ?? [];

        // 3. Fetch Size Modifiers
        const { data: sizeModifiersData, error: sizeError } = await supabaseAdmin
            .from('size_modifiers')
            .select('id, label, price');

        if (sizeError) {
            console.warn('Size modifiers fetch error, using defaults:', sizeError);
        }

        // Transform size modifiers
        const sizeModifiers: Record<string, { price: number; label: string }> = {};
        if (sizeModifiersData && sizeModifiersData.length > 0) {
            sizeModifiersData.forEach((size: any) => {
                sizeModifiers[size.id] = { price: size.price, label: size.label };
            });
        } else {
            // Fallback defaults
            sizeModifiers['S'] = { price: 0, label: 'Small' };
            sizeModifiers['M'] = { price: 5000, label: 'Medium' };
            sizeModifiers['L'] = { price: 10000, label: 'Large' };
        }

        // 4. Derive Categories
        // We use the joined category name if available, or fetch separate categories list if needed.
        // For menu, we usually want unique categories from the products list.
        const categoriesSet = new Set<string>();
        const productsWithCategoryName = products?.map((p: any) => {
            const catData = Array.isArray(p.categories) ? p.categories[0] : p.categories;
            const catName = catData?.name || 'Uncategorized';
            categoriesSet.add(catName);
            return {
                ...p,
                category: catName
            };
        }) || [];

        const categories = Array.from(categoriesSet).map(c => ({
            id: c,
            name: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')
        }));

        // 5. Hardcoded Sugar/Ice Options (Configuration)
        const sugarOptions = [
            { value: '0', label: '0%' },
            { value: '25', label: '25%' },
            { value: '50', label: '50%' },
            { value: '75', label: '75%' },
            { value: '100', label: '100%' }
        ];

        const iceOptions = [
            { value: 'none', label: 'No Ice' },
            { value: 'less', label: 'Less Ice' },
            { value: 'normal', label: 'Normal Ice' },
            { value: 'extra', label: 'Extra Ice' }
        ];

        return NextResponse.json({
            categories,
            products: productsWithCategoryName.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                category: p.category,
                categoryId: p.category_id,
                image: getStorageUrl(p.image),
                isPopular: p.is_popular,
                isNew: p.is_new,
                isAvailable: p.is_available,
                availableToppings: p.available_toppings || [],
                sizeOptions: p.size_options,
                // base_price might not exist in schema based on prev route.ts readings (only size_options), 
                // removing it unless I see it in schema. 
                // I will assume size_options dictates price.
            })),
            toppings: availableToppings?.map(t => ({
                ...t,
                price: Number(t.price)
            })),
            sizes: sizeModifiers,
            sugarOptions: sugarOptions,
            iceOptions: iceOptions
        });

    } catch (error: any) {
        console.error('Menu API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

