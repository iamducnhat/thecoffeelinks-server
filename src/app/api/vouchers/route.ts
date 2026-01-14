import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch all active vouchers
export async function GET() {
    try {
        const { data: vouchers, error } = await supabaseAdmin
            .from('vouchers')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Vouchers fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format - matching Swift Voucher model
        // Swift expects: id, code, type, value, description, minSpend, expiresAt, isUsed, imageUrl
        const transformedVouchers = vouchers?.map((v: any) => ({
            id: v.id,
            code: v.code,
            type: v.type || (v.discount_percent ? 'percent' : 'fixed'),
            value: v.discount_percent || v.discount_amount || 0,
            description: v.description,
            minSpend: v.min_order || 0,
            expiresAt: v.expires_at,
            isUsed: v.is_used || false,
            imageUrl: v.image_url || null,
        })) || [];

        return NextResponse.json({ vouchers: transformedVouchers });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Validate a voucher code OR create a new voucher
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Check if this is a validation request or creation request
        if (body.code && body.orderTotal !== undefined) {
            // Validation mode
            const { code, orderTotal } = body;

            const { data: voucher, error } = await supabaseAdmin
                .from('vouchers')
                .select('*')
                .ilike('code', code)
                .eq('is_active', true)
                .single();

            if (error || !voucher) {
                return NextResponse.json({ valid: false, error: 'Invalid voucher code' });
            }

            if (orderTotal && orderTotal < voucher.min_order) {
                return NextResponse.json({
                    valid: false,
                    error: `Minimum order of ${voucher.min_order}đ required`,
                });
            }

            return NextResponse.json({
                valid: true,
                voucher: {
                    code: voucher.code,
                    discountPercent: voucher.discount_percent,
                    discount: voucher.discount_amount,
                    description: voucher.description,
                },
            });
        } else {
            // Creation mode
            const newVoucher = {
                code: body.code.toUpperCase(),
                discount_percent: body.discountPercent || null,
                discount_amount: body.discount || null,
                description: body.description,
                min_order: body.minOrder || 0,
                max_discount: body.maxDiscount || null,
                is_active: body.isActive !== false,
                expires_at: body.expiresAt || null,
            };

            const { data: voucher, error } = await supabaseAdmin
                .from('vouchers')
                .insert(newVoucher)
                .select()
                .single();

            if (error) {
                console.error('Voucher insert error:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                voucher: {
                    code: voucher.code,
                    discountPercent: voucher.discount_percent,
                    discount: voucher.discount_amount,
                    description: voucher.description,
                    minOrder: voucher.min_order,
                    isActive: voucher.is_active,
                },
            });
        }
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
