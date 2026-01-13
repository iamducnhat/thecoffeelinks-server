# Supabase Orders Table Setup Guide

This guide helps you set up the required database tables for the TheCoffeeLinks order system.

---

## Quick Setup (Copy & Paste)

Go to **Supabase Dashboard → SQL Editor** and run these scripts:

### 1. Orders Table

```sql
-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Order details
    status TEXT DEFAULT 'received' CHECK (status IN ('placed', 'received', 'preparing', 'ready', 'completed', 'cancelled')),
    type TEXT DEFAULT 'dine_in' CHECK (type IN ('dine_in', 'take_away', 'delivery')),
    total_amount DECIMAL(10, 2) DEFAULT 0,
    
    -- Payment (online only - no cash)
    payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'momo', 'zalopay', 'apple_pay', 'points')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    
    -- Delivery (optional - required only for delivery type)
    delivery_address TEXT,
    notes TEXT,
    
    -- References
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    table_id TEXT,
    voucher_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own orders"
    ON orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create orders"
    ON orders FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role full access"
    ON orders FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Index for performance
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

### 2. Order Items Table

```sql
-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Item details
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    final_price DECIMAL(10, 2) DEFAULT 0,
    
    -- Customization stored as JSON
    options_snapshot_json JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Policies (inherit from orders)
CREATE POLICY "Users can view their order items"
    ON order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create order items"
    ON order_items FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role full access"
    ON order_items FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Index
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

### 3. Updated_at Trigger (Optional but Recommended)

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## Column Reference

### orders table

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | Auto | Primary key |
| `user_id` | UUID | No | Reference to auth.users |
| `status` | TEXT | Yes | Order status |
| `type` | TEXT | Yes | dine_in, take_away, delivery |
| `total_amount` | DECIMAL | Yes | Order total |
| `payment_method` | TEXT | Yes | card, momo, zalopay, apple_pay, points (no cash) |
| `payment_status` | TEXT | Yes | pending, paid, failed |
| `store_id` | UUID | No | Reference to stores |
| `table_id` | TEXT | No | Table number for dine-in |
| `voucher_id` | UUID | No | Applied voucher |
| `delivery_address` | TEXT | No* | Required for delivery orders |
| `notes` | TEXT | No | Order notes |
| `created_at` | TIMESTAMP | Auto | Creation time |
| `updated_at` | TIMESTAMP | Auto | Last update time |

### order_items table

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | Auto | Primary key |
| `order_id` | UUID | Yes | Reference to orders |
| `product_name` | TEXT | Yes | Product name snapshot |
| `quantity` | INTEGER | Yes | Item quantity |
| `final_price` | DECIMAL | Yes | Price after customization |
| `options_snapshot_json` | JSONB | No | Customization options |
| `created_at` | TIMESTAMP | Auto | Creation time |

---

## Order Status Flow

```
placed → received → preparing → ready → completed
                                    ↘ cancelled
```

---

## Verify Setup

Run this query to check your tables:

```sql
-- Check orders table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- Check order_items table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
ORDER BY ordinal_position;
```

---

## Adding Optional Columns to Existing Table

If you already have the orders table but need to add delivery support:

```sql
-- Add delivery columns (run if columns don't exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- Future: Add geo coordinates if needed
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10, 8);
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(11, 8);
```

---

## Payment Method Rules

**Only online payments accepted:**
- `card` - Credit/Debit card (Stripe)
- `momo` - MoMo e-wallet
- `zalopay` - ZaloPay e-wallet  
- `apple_pay` - Apple Pay
- `points` - Loyalty points

**NOT accepted:**
- `cash` ❌ - Returns error: "Cash payment is not accepted"

---

## Delivery Address Rules

- **Dine-in** (`dine_in`): No address needed
- **Take-away** (`take_away`): No address needed
- **Delivery** (`delivery`): `delivery_address` is **required**

---

## Troubleshooting

### Error: "Could not find the 'X' column"

Your table is missing a column. Either:
1. Add the column with `ALTER TABLE`
2. Or remove the field from the API code

### Error: "violates row-level security policy"

Check that:
1. You're using the service role key on the server
2. RLS policies are set up correctly
3. User is authenticated for user-specific operations

### Error: "violates foreign key constraint"

The referenced record doesn't exist (e.g., store_id points to non-existent store).
Set the field to `null` or ensure the referenced record exists.

---

## Current Minimum Schema

The API currently only requires these columns (everything else is optional):

**orders:**
- `id` (UUID, primary key)
- `user_id` (UUID, nullable)
- `status` (TEXT)
- `type` (TEXT)
- `total_amount` (DECIMAL)
- `payment_method` (TEXT) - card, momo, zalopay, apple_pay, points only
- `payment_status` (TEXT)
- `store_id` (UUID, nullable)
- `table_id` (TEXT, nullable)
- `voucher_id` (UUID, nullable)
- `created_at` (TIMESTAMP)

**Optional columns (add if needed):**
- `delivery_address` (TEXT) - Required for delivery orders
- `notes` (TEXT)

**order_items:**
- `id` (UUID, primary key)
- `order_id` (UUID, foreign key)
- `product_name` (TEXT)
- `quantity` (INTEGER)
- `final_price` (DECIMAL)
- `options_snapshot_json` (JSONB, nullable)
- `created_at` (TIMESTAMP)
