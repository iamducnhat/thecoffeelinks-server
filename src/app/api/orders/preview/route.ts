import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper types matching Swift OrderPreviewRequest
type PreviewRequest = {
    productId: string;
    size: string; // e.g. 'S', 'M', 'L'
    ice?: string;
    sugar?: string;
    toppings: string[]; // List of topping IDs
    quantity: number;
    voucherId?: string | null;
};

// Size options structure from database
type SizeOption = {
    enabled: boolean;
    price: number;
};

type SizeOptions = {
    small: SizeOption;
    medium: SizeOption;
    large: SizeOption;
};

// Map size code to size_options key
function getSizeKey(size: string): keyof SizeOptions {
    switch (size.toUpperCase()) {
        case 'S': return 'small';
        case 'M': return 'medium';
        case 'L': return 'large';
        default: return 'medium';
    }
}

export async function POST(request: Request) {
    try {
        const body: PreviewRequest = await request.json();
        const { productId, size, toppings, quantity, voucherId } = body;

        if (!productId || !quantity) {
            return NextResponse.json({ error: 'Missing productId or quantity' }, { status: 400 });
        }

        // 1. Fetch Product with size_options (base_price has been removed)
        const { data: product, error: productError } = await supabaseAdmin
            .from('products')
            .select('id, name, size_options')
            .eq('id', productId)
            .single();

        if (productError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // 2. Get price from product's size_options
        const sizeOptions: SizeOptions = product.size_options || {
            small: { enabled: false, price: 0 },
            medium: { enabled: true, price: 65000 },
            large: { enabled: true, price: 69000 }
        };

        const sizeKey = getSizeKey(size || 'M');
        const selectedSizeOption = sizeOptions[sizeKey];

        if (!selectedSizeOption.enabled) {
            return NextResponse.json({ error: `Size ${size} is not available for this product` }, { status: 400 });
        }

        let unitPrice = Number(selectedSizeOption.price);

        // 3. Toppings Price
        let toppingsPrice = 0;
        if (toppings && toppings.length > 0) {
            const { data: toppingsData, error: toppingsError } = await supabaseAdmin
                .from('toppings')
                .select('price')
                .in('id', toppings);

            if (!toppingsError && toppingsData) {
                toppingsPrice = toppingsData.reduce((sum, t) => sum + Number(t.price), 0);
            }
        }

        unitPrice += toppingsPrice;

        // 4. Calculate Subtotal
        const subtotal = unitPrice * quantity;

        // 5. Vouchers (Placeholder logic)
        let discount = 0;
        if (voucherId) {
            // TODO: Lookup voucher and apply discount
            // For now, return 0 discount
        }

        // 6. Tax (8% - prices are tax-exclusive in this system)
        const taxRate = 0.08;
        const tax = Math.round(subtotal * taxRate);

        return NextResponse.json({
            subtotal,
            discount,
            tax,
            total: subtotal - discount + tax
        });

    } catch (error: any) {
        console.error('Price Preview Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
