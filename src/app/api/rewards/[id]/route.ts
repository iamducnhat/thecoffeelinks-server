import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch a single reward by ID
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: reward, error } = await supabaseAdmin
            .from('rewards')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Reward fetch error:', error);
            return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
        }

        // Transform to frontend format
        const transformedReward = {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost: reward.points_cost,
            image: reward.image,
            category: reward.category,
            isAvailable: reward.is_available,
        };

        return NextResponse.json(transformedReward);
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a reward
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        // Only update provided fields
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.pointsCost !== undefined) updateData.points_cost = body.pointsCost;
        if (body.image !== undefined) updateData.image = body.image;
        if (body.category !== undefined) updateData.category = body.category;
        if (body.isAvailable !== undefined) updateData.is_available = body.isAvailable;

        const { data: reward, error } = await supabaseAdmin
            .from('rewards')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Reward update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to frontend format
        const transformedReward = {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost: reward.points_cost,
            image: reward.image,
            category: reward.category,
            isAvailable: reward.is_available,
        };

        return NextResponse.json({ success: true, reward: transformedReward });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Partial update a reward (alias for PUT)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return PUT(request, { params });
}

// DELETE: Delete a reward
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('rewards')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Reward delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
