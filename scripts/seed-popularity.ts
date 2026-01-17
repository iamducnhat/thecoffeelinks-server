
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
    console.log('Starting seed process...');

    // 1. Get a store
    const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .limit(1)
        .single();

    if (storeError || !store) {
        console.error('Error fetching store:', storeError);
        return;
    }
    const storeId = store.id;
    console.log('Using Store ID:', storeId);

    // 2. Get a product
    const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name')
        .eq('is_available', true)
        .limit(1)
        .single();

    if (productError || !product) {
        console.error('Error fetching product:', productError);
        return;
    }
    const productId = product.id;
    const productName = product.name;
    console.log('Seeding orders for Product:', productName, '(', productId, ')');

    // 3. Get a user (optional)
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    let userId = null;
    if (users && users.length > 0) {
        userId = users[0].id;
        console.log('Using User ID:', userId);
    } else {
        console.log('No users found, proceeding with anonymous orders (if allowed) or null user_id');
    }

    // 4. Insert 6 Orders
    for (let i = 0; i < 6; i++) {
        // Create Order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                user_id: null,
                status: 'completed',
                total_amount: 50000,
                type: 'take_away',
                delivery_option: 'pickup',
                payment_method: 'momo',
                payment_status: 'paid',
                store_id: storeId,
                source: 'manual',
                created_at: new Date().toISOString(),
                pending_until: new Date(Date.now() - 60000).toISOString()
            })
            .select()
            .single();

        if (orderError) {
            console.error(`Error creating order ${i + 1}:`, orderError.message);
            continue;
        }

        // Create Order Item
        const { error: itemError } = await supabase
            .from('order_items')
            .insert({
                order_id: order.id,
                product_id: productId,
                product_name: productName,
                quantity: 1,
                final_price: 50000
            });

        if (itemError) {
            console.error(`Error creating item for order ${i + 1}:`, itemError.message);
        } else {
            console.log(`Seeded Order ${i + 1}/${6}: ${order.id}`);
        }
    }

    // 5. Trigger Popularity Update
    console.log('Triggering popularity update...');
    const { error: rpcError } = await supabase.rpc('update_product_popularity');

    if (rpcError) {
        console.error('Error updating popularity:', rpcError.message);
        // If RPC fails, try API call?
    } else {
        console.log('Popularity updated successfully.');
    }
}

seed().catch(console.error);
