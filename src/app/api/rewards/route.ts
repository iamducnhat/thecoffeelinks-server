import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Fetch all rewards and tiers
export async function GET() {
    try {
        // Fetch rewards
        const { data: rewards, error: rewardsError } = await supabaseAdmin
            .from('rewards')
            .select('*')
            .eq('is_available', true)
            .order('points_cost', { ascending: true });

        if (rewardsError) {
            console.error('Rewards fetch error:', rewardsError);
            return NextResponse.json({ error: rewardsError.message }, { status: 500 });
        }

        // Fetch tiers
        const { data: tiers, error: tiersError } = await supabaseAdmin
            .from('reward_tiers')
            .select('*')
            .order('min_points', { ascending: true });

        if (tiersError) {
            console.error('Tiers fetch error:', tiersError);
        }

        // Transform rewards to frontend format
        const transformedRewards = rewards?.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            pointsCost: r.points_cost,
            image: r.image,
            category: r.category,
        })) || [];

        // Transform tiers to frontend format
        const transformedTiers = tiers?.map((t: any) => ({
            name: t.name,
            minPoints: t.min_points,
            maxPoints: t.max_points,
            benefits: t.benefits,
            color: t.color,
        })) || [];

        return NextResponse.json({
            rewards: transformedRewards,
            tiers: transformedTiers,
        });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new reward
export async function POST(request: Request) {
    try {
        const body = await request.json();

        const newReward = {
            id: body.id || body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name: body.name,
            description: body.description,
            points_cost: body.pointsCost,
            image: body.image || null,
            category: body.category,
            is_available: body.isAvailable !== false,
        };

        const { data: reward, error } = await supabaseAdmin
            .from('rewards')
            .insert(newReward)
            .select()
            .single();

        if (error) {
            console.error('Reward insert error:', error);
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
        };

        return NextResponse.json({ success: true, reward: transformedReward });
    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
