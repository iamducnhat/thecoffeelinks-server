DO $$
DECLARE
    v_store_id uuid;
    v_product_id uuid;
    v_user_id uuid;
    v_order_id uuid;
    i integer;
BEGIN
    -- Get a store
    SELECT id INTO v_store_id FROM public.stores LIMIT 1;
    
    -- Get a product
    SELECT id INTO v_product_id FROM public.products WHERE is_available = true LIMIT 1;
    
    -- Get a user (optional, can be null)
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    IF v_store_id IS NULL OR v_product_id IS NULL THEN
        RAISE EXCEPTION 'Missing store or product data to seed.';
    END IF;

    RAISE NOTICE 'Seeding orders for product % in store %', v_product_id, v_store_id;

    -- Insert 6 orders
    FOR i IN 1..6 LOOP
        INSERT INTO public.orders (
            user_id, status, total_amount, type, delivery_option, 
            payment_method, payment_status, store_id, source, 
            created_at, pending_until
        ) VALUES (
            v_user_id, 'completed', 50000, 'take_away', 'pickup',
            'momo', 'completed', v_store_id, 'manual',
            NOW(), NOW() - interval '1 minute'
        ) RETURNING id INTO v_order_id;

        INSERT INTO public.order_items (
            order_id, product_id, product_name, quantity, final_price
        ) VALUES (
            v_order_id, v_product_id, 'Seeded Popular Product', 1, 50000
        );
    END LOOP;

    -- Refresh popularity
    -- Try to call the function if it exists, otherwise rely on CRON or manual trigger
    BEGIN
        PERFORM public.update_product_popularity();
        RAISE NOTICE 'Product popularity updated.';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not auto-update popularity (function might be missing or restricted): %', SQLERRM;
    END;
    
    RAISE NOTICE 'Successfully seeded 6 orders.';
END $$;
