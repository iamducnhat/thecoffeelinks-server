import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch a single voucher by code
export async function GET(
    request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;

        const { data: voucher, error } = await supabaseAdmin
            .from('vouchers')
            .select('*')
            .ilike('code', code)
            .single();

        if (error) {
            console.error('Voucher fetch error:', error);
            return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
        }

        // Transform to frontend format - matching Swift Voucher model
        const transformedVoucher = {
            id: voucher.id,
            code: voucher.code,
            type: voucher.type || (voucher.discount_percent ? 'percent' : 'fixed'),
            value: voucher.discount_percent || voucher.discount_amount || 0,
            discountPercent: voucher.discount_percent,
            discount: voucher.discount_amount,
            description: voucher.description,
            minOrder: voucher.min_order,
            minSpend: voucher.min_order,
            maxDiscount: voucher.max_discount,
            isActive: voucher.is_active,
            expiresAt: voucher.expires_at,
            imageUrl: voucher.image_url,
        };

        return NextResponse.json(transformedVoucher);
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a voucher
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;
        const body = await request.json();

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        // Only update provided fields
        if (body.discountPercent !== undefined) updateData.discount_percent = body.discountPercent;
        if (body.discount !== undefined) updateData.discount_amount = body.discount;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.minOrder !== undefined) updateData.min_order = body.minOrder;
        if (body.maxDiscount !== undefined) updateData.max_discount = body.maxDiscount;
        if (body.isActive !== undefined) updateData.is_active = body.isActive;
        if (body.expiresAt !== undefined) updateData.expires_at = body.expiresAt;
        if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;

        const { data: voucher, error } = await supabaseAdmin
            .from('vouchers')
            .update(updateData)
            .ilike('code', code)
            .select()
            .single();

        if (error) {
            console.error('Voucher update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format
        const transformedVoucher = {
            code: voucher.code,
            discountPercent: voucher.discount_percent,
            discount: voucher.discount_amount,
            description: voucher.description,
            minOrder: voucher.min_order,
            maxDiscount: voucher.max_discount,
            isActive: voucher.is_active,
        };

        return NextResponse.json({ success: true, voucher: transformedVoucher });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Partial update a voucher (alias for PUT)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    return PUT(request, { params });
}

// DELETE: Delete a voucher
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;

        const { error } = await supabaseAdmin
            .from('vouchers')
            .delete()
            .ilike('code', code);

        if (error) {
            console.error('Voucher delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
