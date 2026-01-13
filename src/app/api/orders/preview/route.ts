import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper types
type PreviewRequest = {
    product_id: string;
    size: string; // e.g. 'S', 'M', 'L'
    ice?: string;
    sugar?: string;
    toppings: string[]; // List of topping IDs
    quantity: number;
    voucher_id?: string | null;
};

export async function POST(request: Request) {
    try {
        const body: PreviewRequest = await request.json();
        const { product_id, size, toppings, quantity, voucher_id } = body;

        if (!product_id || !quantity) {
            return NextResponse.json({ error: 'Missing product_id or quantity' }, { status: 400 });
        }

        // 1. Fetch Product Base Price
        const { data: product, error: productError } = await supabaseAdmin
            .from('products')
            .select('base_price')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        let unitPrice = Number(product.base_price);

        // 2. Fetch Size Modifier
        // If size modifiers are in DB, fetch them. For now, we might need to hardcode if table access is tricky or just fetch all.
        // Let's assume 'size_modifiers' table exists as seen in 'products/route.ts'
        let sizePrice = 0;
        if (size) {
            const { data: sizeMod, error: sizeError } = await supabaseAdmin
                .from('size_modifiers')
                .select('price')
                .eq('id', size.toUpperCase()) // assuming ID is 'S', 'M', 'L'
                .single();

            if (!sizeError && sizeMod) {
                sizePrice = Number(sizeMod.price);
            } else {
                // Fallback if DB lookup fails (though it shouldn't if configured)
                if (size === 'L') sizePrice = 10000;
                if (size === 'M') sizePrice = 5000;
            }
        }

        unitPrice += sizePrice;

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

        // 5. Vouchers (Placeholder logical)
        let discount = 0;
        if (voucher_id) {
            // TODO: Lookup voucher and apply discount
            // For now, return 0 discount
        }

        // 6. Tax (e.g., 8% or 10%)
        const taxRate = 0.08;
        const tax = Math.round(subtotal * taxRate);
        const total = subtotal + tax; // Or maybe subtotal is inclusive? usually menu prices in VN are tax inclusive? 
        // Requirement says: "Returns subtotal, discount, tax, total".
        // Let's assume prices are tax-exclusive for this calculation demo, or tax is just extracted.
        // If prices are inclusive: Total = Subtotal. Tax = Total - (Total / 1.08).
        // Let's assume inclusive for "The Coffee Links" context (common in VN F&B).
        // BUT Payload example in prompt: "Subtotal: 98000, Tax: 8000, Total: 106000" -> This implies Exclusive. 98k + 8k = 106k.
        // So we add tax.

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
