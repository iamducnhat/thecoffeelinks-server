# ☕ The Coffee Links - Server API

Central API server handling all data operations for The Coffee Links ecosystem.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev -- -p 3001
```

---

## ⚙️ Environment Variables

Create a `.env.local` file with:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Admin Authentication
ADMIN_SECRET=your-admin-secret-key
```

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | User login |
| `POST` | `/api/auth/admin-login` | Admin login |
| `GET` | `/api/auth/validate` | Validate session |

#### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

---

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List all products |
| `POST` | `/api/products` | Create product |
| `GET` | `/api/products/[id]` | Get product by ID |
| `PUT` | `/api/products/[id]` | Update product |
| `DELETE` | `/api/products/[id]` | Delete product |

#### Product Schema
```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: 'coffee' | 'tea' | 'smoothies' | 'pastries' | 'seasonal';
  image?: string;
  isPopular?: boolean;
  isNew?: boolean;
}
```

---

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orders` | List all orders |
| `POST` | `/api/orders` | Create new order |
| `GET` | `/api/orders/[id]` | Get order by ID |
| `PUT` | `/api/orders/[id]` | Update order status |

#### Order Schema
```typescript
interface Order {
  id: string;
  userId?: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: 'placed' | 'making' | 'ready' | 'collected' | 'cancelled';
  storeId?: string;
  paymentStatus?: string;
  createdAt: string;
}

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  customizations?: {
    size?: string;
    milk?: string;
    extras?: string[];
  };
}
```

---

### Stores

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stores` | List all stores |
| `POST` | `/api/stores` | Create store |
| `GET` | `/api/stores/[id]` | Get store by ID |
| `PUT` | `/api/stores/[id]` | Update store |
| `DELETE` | `/api/stores/[id]` | Delete store |

#### Store Schema
```typescript
interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  phone?: string;
  hours?: string;
  isActive: boolean;
}
```

---

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events` | List all events |
| `POST` | `/api/events` | Create event |
| `GET` | `/api/events/[id]` | Get event by ID |
| `PUT` | `/api/events/[id]` | Update event |
| `DELETE` | `/api/events/[id]` | Delete event |

---

### Vouchers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/vouchers` | List all vouchers |
| `POST` | `/api/vouchers` | Create voucher |
| `GET` | `/api/vouchers/[id]` | Get voucher by ID |
| `PUT` | `/api/vouchers/[id]` | Update voucher |
| `DELETE` | `/api/vouchers/[id]` | Delete voucher |

#### Voucher Schema
```typescript
interface Voucher {
  id: string;
  code: string;
  discount?: number;        // Fixed amount
  discountPercent?: number; // Percentage
  minOrder?: number;
  expiresAt?: string;
  isActive: boolean;
}
```

---

### Rewards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rewards` | List all rewards |
| `POST` | `/api/rewards` | Create reward |
| `GET` | `/api/rewards/[id]` | Get reward by ID |
| `PUT` | `/api/rewards/[id]` | Update reward |
| `DELETE` | `/api/rewards/[id]` | Delete reward |

---

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user/[id]` | Get user profile |
| `PUT` | `/api/user/[id]` | Update user profile |

---

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payments/verify` | Verify payment |

⚠️ **Note:** Payment verification is currently a prototype. See TODO section below.

---

## 🗄️ Database Schema

### Tables Overview

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  member_since TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_price INTEGER NOT NULL,
  category TEXT NOT NULL,
  image TEXT,
  is_popular BOOLEAN DEFAULT FALSE,
  is_new BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  customer_name TEXT NOT NULL,
  items JSONB NOT NULL,
  total INTEGER NOT NULL,
  status TEXT DEFAULT 'placed',
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stores table
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT,
  hours TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Authentication Flow

1. **User Registration**
   - Client sends email, password, name to `/api/auth/register`
   - Server creates Supabase auth user and profile
   - Returns user data with session token

2. **User Login**
   - Client sends credentials to `/api/auth/login`
   - Server validates with Supabase auth
   - Returns user data with session token

3. **Admin Login**
   - Client sends username/password to `/api/auth/admin-login`
   - Server validates against `ADMIN_SECRET`
   - Returns admin token cookie

---

## 🚀 Deployment

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Variables in Vercel

Set the following in your Vercel project settings:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`

---

## 🚧 Prototype TODO

This server is currently a **prototype**. The following features need production implementation:

### Payment API (`/api/payments/verify`)
- [ ] **Integrate real payment gateway** - Current implementation returns mock success
  - Stripe: Use Stripe SDK for payment intents
  - VNPay: Integrate VNPay payment gateway API
  - MoMo/ZaloPay: Mobile wallet integration
- [ ] **Store payment records in database** - Create `payments` table
- [ ] **Payment webhook handlers** - Handle async payment confirmations
- [ ] **Refund API** - Handle order cancellations

### Orders API
- [ ] **Validate payment token against database**
- [ ] **Check token expiry** - Tokens should expire after 15 minutes
- [ ] **Add payment columns to orders table**

### Security
- [ ] **Rate limiting** - Prevent API abuse
- [ ] **Request signing** - Verify requests from valid clients
- [ ] **Input validation** - Comprehensive request validation

---

## 📄 License

Private and proprietary to The Coffee Links.
