import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAdminAccess } from '@/lib/auth-guard';
import { CategorySchema } from '@/lib/schemas';
import { validateRequest } from '@/lib/validation';

// GET: List all categories
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('categories')
            .select('*')
            .order('name');

        if (error) {
            console.error('Categories fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ categories: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new category
export async function POST(request: Request) {
    try {
        const authResult = await verifyAdminAccess(request);
        if (!authResult.authorized) {
            return NextResponse.json({ error: authResult.error }, { status: 401 });
        }

        const validation = await validateRequest(request, CategorySchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const body = validation.data!;

        const { data, error } = await supabaseAdmin
            .from('categories')
            .insert({
                name: body.name,
                type: body.type
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ category: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


