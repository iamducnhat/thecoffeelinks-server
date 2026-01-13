import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
    try {
        // 1. Fetch Products (including image field for display)
        const { data: products, error: productsError } = await supabaseAdmin
            .from('products')
            .select('id, name, description, base_price, category, image, is_popular, is_new, is_available')
            .eq('is_available', true);

        if (productsError) throw productsError;

        // 2. Fetch Toppings
        const { data: toppings, error: toppingsError } = await supabaseAdmin
            .from('toppings')
            .select('id, name, price, is_available')
            .eq('is_available', true);

        if (toppingsError) throw toppingsError;

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
            sizeModifiers['M'] = { price: 0, label: 'Medium' }; // Assuming base price is M? Or 0 if base is S. check requirements later. User said "base prices", implies base is smallest? Usually M is standard. 
            // Re-reading requirements: returns "Available sizes". 
            // Previous code had M=10000. Let's stick to safe defaults or what was in products/route.ts
            sizeModifiers['S'] = { price: 0, label: 'Small' };
            sizeModifiers['M'] = { price: 5000, label: 'Medium' };
            sizeModifiers['L'] = { price: 10000, label: 'Large' };
        }

        // 4. Hardcoded Categories (if dynamic categories table doesn't exist yet, derive from products or static list)
        // Ideally we scan products for unique categories or have a categories table. 
        // For now, let's derive unique categories from products to ensure consistency.
        const categoriesSet = new Set(products?.map(p => p.category).filter(Boolean));
        const categories = Array.from(categoriesSet).map(c => ({
            id: c,
            name: (c as string).charAt(0).toUpperCase() + (c as string).slice(1).replace('_', ' ')
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
            products: products?.map(p => ({
                ...p,
                base_price: Number(p.base_price), // ensure number
            })),
            toppings: toppings?.map(t => ({
                ...t,
                price: Number(t.price)
            })),
            sizes: sizeModifiers,
            sugar_options: sugarOptions,
            ice_options: iceOptions
        });

    } catch (error: any) {
        console.error('Menu API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
