import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
        const body = await request.json();

        if (!body.name || !body.type) {
            return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
        }

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
