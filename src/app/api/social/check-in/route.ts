import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const userId = authData.user.id;
        const body = await request.json();
        // Support both storeId (Swift app) and locationId (legacy) 
        const storeId = body.storeId || body.locationId;
        const status = body.status || 'available';

        // Validate storeId - it's required and must be a valid UUID
        if (!storeId) {
            return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
        }

        // Basic UUID format validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(storeId)) {
            return NextResponse.json({ error: 'Invalid storeId format' }, { status: 400 });
        }

        // Check out any existing active check-ins first
        await supabaseAdmin
            .from('store_checkins')
            .update({ 
                checked_out_at: new Date().toISOString(),
                is_active: false
            })
            .eq('user_id', userId)
            .is('checked_out_at', null);

        // Create new check-in
        const { data, error } = await supabaseAdmin
            .from('store_checkins')
            .insert({
                user_id: userId,
                store_id: storeId,
                checked_in_at: new Date().toISOString(),
                presence_status: status,
                is_active: true
            })
            .select(`
                id,
                store_id,
                checked_in_at,
                presence_status,
                user:users (
                    id, name, full_name, avatar_url, job_title, industry
                )
            `)
            .single();

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to match Swift EnhancedCheckIn model
        const checkIn = {
            id: data.id,
            storeId: data.store_id,
            checkedInAt: data.checked_in_at,
            presenceStatus: data.presence_status,
            user: data.user ? {
                id: (data.user as any).id,
                name: (data.user as any).name || (data.user as any).full_name,
                fullName: (data.user as any).full_name,
                avatarUrl: (data.user as any).avatar_url,
                jobTitle: (data.user as any).job_title,
                industry: (data.user as any).industry
            } : null
        };

        return NextResponse.json({ success: true, checkIn });

    } catch (error: any) {
        console.error('Check-in error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
