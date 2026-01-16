# TheCoffeeLinks Backend API Guide

A comprehensive guide for client app developers integrating with the TheCoffeeLinks backend API.

**Base URL**: Configure via environment variable or use production endpoint.  
**Framework**: Next.js 14+ with App Router  
**Database**: Supabase (PostgreSQL)  
**Authentication**: Supabase Auth with JWT tokens

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting & Security](#rate-limiting--security)
3. [API Endpoints](#api-endpoints)
   - [Auth](#auth)
   - [Categories](#categories)
   - [Products](#products)
   - [Toppings](#toppings)
   - [Menu](#menu)
   - [Stores](#stores)
   - [Events](#events)
   - [Orders](#orders)
   - [Delivery](#delivery)
   - [Payments](#payments)
   - [Vouchers](#vouchers)
   - [Rewards](#rewards)
   - [User](#user)
   - [Social](#social)
   - [Staff](#staff)
   - [Upload](#upload)
   - [Cron Jobs](#cron-jobs)

---

## Authentication

### Overview

The API uses JWT tokens from Supabase Auth. Most endpoints require authentication via the `Authorization` header.

### Headers

| Header | Description | Required |
|--------|-------------|----------|
| `Authorization` | `Bearer <access_token>` | For user-authenticated endpoints |
| `X-Admin-Key` | Admin secret key | For admin-only endpoints |
| `X-Staff-Api-Key` | Staff API key | For staff endpoints |

### Token Refresh

Access tokens expire. Use the refresh endpoint to get new tokens:

```
POST /api/auth/refresh
```

### Authentication Types

1. **Public**: No authentication required
2. **User Auth**: Requires valid Supabase JWT in `Authorization: Bearer <token>`
3. **Admin Auth**: Requires `X-Admin-Key` header OR user with admin role in metadata
4. **Staff Auth**: Requires `X-Staff-Api-Key` header OR user with staff role

---

## Rate Limiting & Security

### Rate Limits

| User Type | Limit |
|-----------|-------|
| Public (unauthenticated) | 100 requests/minute |
| Authenticated | 1000 requests/minute |

### Response Headers

All responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-Request-Id`: Correlation ID for debugging

### Ban Escalation

After 5 rate limit violations, IP is banned for 10 minutes.

### Security Headers

All responses include security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy-Report-Only`

---

## API Endpoints

---

## Auth

### POST `/api/auth/login`

Authenticate a user with email and password.

**Auth Required**: No

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Or encrypted format:
```json
{
  "data": "<encrypted_payload>"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "expires_in": 3600,
    "expires_at": 1234567890,
    "token_type": "bearer",
    "user": { ... }
  },
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": { "full_name": "John Doe" }
  }
}
```

**Errors**:
- `400`: Email and password required
- `401`: Invalid credentials

---

### POST `/api/auth/register`

Create a new user account.

**Auth Required**: No

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Notes**:
- Creates user in Supabase Auth
- Creates profile in `users` table with 50 welcome bonus points
- Adds entry to `points_history`

---

### POST `/api/auth/logout`

Logout the current user (client should clear local tokens).

**Auth Required**: No

**Response** (200):
```json
{
  "success": true
}
```

---

### GET `/api/auth/session`

Validate current session/token.

**Auth Required**: Yes (Bearer token)

**Response** (200):
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    ...
  }
}
```

---

### POST `/api/auth/refresh`

Refresh an expired access token.

**Auth Required**: No

**Request Body**:
```json
{
  "refresh_token": "your_refresh_token"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "access_token": "new_token",
    "refresh_token": "new_refresh_token",
    "expires_in": 3600,
    "expires_at": 1234567890,
    "token_type": "bearer",
    "user": { ... }
  }
}
```

---

### POST `/api/auth/admin-login`

Admin authentication using encrypted credentials.

**Auth Required**: No

**Request Body** (encrypted):
```json
{
  "data": "<encrypted { username, password }>"
}
```

**Response** (200):
```json
{
  "success": true,
  "token": "admin_secret_token",
  "user": { "username": "admin", "role": "admin" }
}
```

---

### POST `/api/auth/linkedin`

LinkedIn OAuth2 authentication using OpenID Connect.

**Auth Required**: No

**Request Body**:
```json
{
  "code": "linkedin_authorization_code",
  "redirect_uri": "your_app_redirect_uri"
}
```

**Required Fields**:
- `code`: Authorization code from LinkedIn OAuth flow
- `redirect_uri`: Must match the redirect URI configured in LinkedIn app

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "avatar_url": "https://media.licdn.com/...",
    "is_new_user": true
  },
  "auth_url": "https://server-nu-three-90.vercel.app/auth/confirm?token=...",
  "message": "Use auth_url to complete authentication"
}
```

**Features**:
- OpenID Connect integration with ID tokens
- Automatic account linking by email
- New user creation with 50 bonus points
- Profile data extraction (name, email, avatar)
- Supabase auth session generation

**Error Responses**:
- `400`: Missing code or redirect_uri
- `400`: Failed to authenticate with LinkedIn
- `503`: LinkedIn authentication not configured

---

### GET `/api/auth/session`

Validate current user session.

**Auth Required**: Yes (Bearer token)

**Response** (200):
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe"
  }
}
```

**Response** (401):
```json
{
  "valid": false,
  "error": "Invalid session"
}
```

---

## Categories

### GET `/api/categories`

List all categories.

**Auth Required**: No

**Response** (200):
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Coffee",
      "type": "beverages"
    }
  ]
}
```

---

### POST `/api/categories`

Create a new category.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "Tea",
  "type": "beverages"
}
```

**Response** (200):
```json
{
  "category": {
    "id": "uuid",
    "name": "Tea",
    "type": "beverages"
  }
}
```

---

### PUT `/api/categories/[id]`

Update a category.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "Updated Name",
  "type": "updated_type"
}
```

---

### DELETE `/api/categories/[id]`

Delete a category.

**Auth Required**: Admin

---

## Products

### GET `/api/products`

List all products with optional filters.

**Auth Required**: No

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by category ID or name |
| `deliverable` | boolean | Only show deliverable products |

**Response** (200):
```json
{
  "products": [
    {
      "id": "product-slug",
      "name": "Cappuccino",
      "description": "Rich espresso with milk foam",
      "category": "Coffee",
      "categoryId": "uuid",
      "categoryType": "beverages",
      "image": "https://...",
      "is_popular": true,
      "is_new": false,
      "is_available": true,
      "is_deliverable": true,
      "deliveryPrepMinutes": 10,
      "availableToppings": ["topping-1", "topping-2"],
      "sizeOptions": {
        "small": { "enabled": false, "price": 0 },
        "medium": { "enabled": true, "price": 65000 },
        "large": { "enabled": true, "price": 69000 }
      }
    }
  ],
  "toppings": [
    { "id": "topping-1", "name": "Boba", "price": 10000 }
  ],
  "size_modifiers": {
    "S": { "price": 0, "label": "Small" },
    "M": { "price": 5000, "label": "Medium" },
    "L": { "price": 10000, "label": "Large" }
  }
}
```

---

### GET `/api/products/[id]`

Get a single product by ID.

**Auth Required**: No

**Response** (200):
```json
{
  "id": "product-slug",
  "name": "Cappuccino",
  "description": "...",
  "category": "Coffee",
  "categoryId": "uuid",
  "image": "https://...",
  "isPopular": true,
  "isNew": false,
  "isAvailable": true,
  "sizeOptions": { ... }
}
```

---

### POST `/api/products`

Create a new product.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "New Drink",
  "description": "Delicious beverage",
  "categoryId": "uuid",
  "image": "path/to/image.jpg",
  "isPopular": false,
  "isNew": true,
  "isAvailable": true,
  "availableToppings": ["topping-1"],
  "sizeOptions": {
    "small": { "enabled": true, "price": 45000 },
    "medium": { "enabled": true, "price": 55000 },
    "large": { "enabled": true, "price": 65000 }
  }
}
```

---

### PUT/PATCH `/api/products/[id]`

Update a product (partial update supported).

**Auth Required**: Admin

---

### DELETE `/api/products/[id]`

Delete a product.

**Auth Required**: Admin

---

### GET `/api/products/popularity`

Get popular products based on order count (last 24h).

**Auth Required**: No

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `storeId` | string | Filter by store |
| `limit` | number | Max results (default: 10, max: 50) |

**Response** (200):
```json
{
  "products": [
    {
      "productId": "product-slug",
      "productName": "Latte",
      "categoryId": "uuid",
      "image": "https://...",
      "orderCount": 42
    }
  ],
  "windowHours": 24,
  "minOrders": 5
}
```

**Headers**:
- `Cache-Control: public, max-age=300` (5 min cache)
- `X-Cache: HIT|MISS`

---

## Toppings

### GET `/api/toppings`

List all toppings.

**Auth Required**: No

**Response** (200):
```json
{
  "toppings": [
    {
      "id": "boba",
      "name": "Boba Pearls",
      "price": 10000,
      "is_available": true
    }
  ]
}
```

---

### GET `/api/toppings/[id]`

Get a single topping.

**Auth Required**: No

---

### POST `/api/toppings`

Create a new topping.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "Jelly",
  "price": 8000,
  "is_available": true
}
```

---

### PUT `/api/toppings/[id]`

Update a topping.

**Auth Required**: Admin

---

### DELETE `/api/toppings/[id]`

Delete a topping.

**Auth Required**: Admin

---

## Menu

### GET `/api/menu`

Get complete menu with all products, toppings, sizes, and options.

**Auth Required**: No

**Response** (200):
```json
{
  "categories": [
    { "id": "Coffee", "name": "Coffee" }
  ],
  "products": [
    {
      "id": "cappuccino",
      "name": "Cappuccino",
      "description": "...",
      "category": "Coffee",
      "categoryId": "uuid",
      "image": "https://...",
      "isPopular": true,
      "isNew": false,
      "isAvailable": true,
      "availableToppings": ["boba"],
      "sizeOptions": { ... }
    }
  ],
  "toppings": [
    { "id": "boba", "name": "Boba", "price": 10000 }
  ],
  "sizes": {
    "S": { "price": 0, "label": "Small" },
    "M": { "price": 5000, "label": "Medium" },
    "L": { "price": 10000, "label": "Large" }
  },
  "sugarOptions": [
    { "value": "0", "label": "0%" },
    { "value": "50", "label": "50%" },
    { "value": "100", "label": "100%" }
  ],
  "iceOptions": [
    { "value": "none", "label": "No Ice" },
    { "value": "normal", "label": "Normal Ice" }
  ]
}
```

---

## Stores

### GET `/api/stores`

List all stores.

**Auth Required**: No

**Response** (200):
```json
{
  "success": true,
  "stores": [
    {
      "id": "1",
      "name": "Downtown Coffee",
      "address": "123 Main St",
      "latitude": 10.762622,
      "longitude": 106.660172,
      "imageUrl": "https://...",
      "phoneNumber": "+84123456789",
      "openingHours": "07:00 - 22:00"
    }
  ]
}
```

---

### GET `/api/stores/[id]`

Get a single store.

**Auth Required**: No

---

### POST `/api/stores`

Create a new store.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "New Store",
  "address": "456 Oak Ave",
  "phone": "+84987654321",
  "opening_time": "07:00",
  "closing_time": "22:00",
  "latitude": 10.762622,
  "longitude": 106.660172,
  "is_active": true
}
```

---

### PUT `/api/stores/[id]`

Update a store.

**Auth Required**: Admin

---

### DELETE `/api/stores/[id]`

Delete a store.

**Auth Required**: Admin

---

## Events

### GET `/api/events`

List all active events.

**Auth Required**: No

**Response** (200):
```json
{
  "events": [
    {
      "id": 1,
      "type": "workshop",
      "title": "Coffee Brewing 101",
      "subtitle": "Learn the basics",
      "description": "...",
      "date": "2026-01-20T14:00:00Z",
      "storeId": "uuid",
      "hostName": "John Barista",
      "bg": "bg-neutral-900 text-neutral-50",
      "icon": "Calendar",
      "imageURL": "https://..."
    }
  ]
}
```

---

### GET `/api/events/[id]`

Get a single event.

**Auth Required**: No

---

### POST `/api/events`

Create a new event.

**Auth Required**: No (consider adding admin auth)

**Request Body**:
```json
{
  "type": "workshop",
  "title": "Event Title",
  "subtitle": "Subtitle",
  "description": "Description",
  "date": "2026-02-01T10:00:00Z",
  "storeId": "uuid",
  "hostName": "Host Name",
  "bg": "bg-blue-500",
  "icon": "Calendar",
  "imageURL": "https://...",
  "isActive": true
}
```

---

### PUT/PATCH `/api/events/[id]`

Update an event.

---

### DELETE `/api/events/[id]`

Delete an event.

---

## Orders

### POST `/api/orders`

Create a new order (30-second pending state for undo).

**Auth Required**: Optional (user ID required for tracking)

**Request Body**:
```json
{
  "items": [
    {
      "product": { "id": "cappuccino", "name": "Cappuccino" },
      "quantity": 2,
      "finalPrice": 130000,
      "customization": {
        "size": "L",
        "sugar": "50",
        "ice": "normal",
        "toppings": ["boba"]
      },
      "notes": ["Extra hot please"],
      "is_favorite": false
    }
  ],
  "deliveryOption": "pickup",
  "storeId": "uuid",
  "table_id": null,
  "paymentMethod": "card",
  "total_amount": 130000,
  "source": "manual",
  "voucher_id": null,
  "deliveryAddressId": null,
  "deliveryNotes": null
}
```

**Valid Sources**: `manual`, `ai_suggested`, `reorder`, `favorite`
**Valid Delivery Options**: `pickup`, `dine_in`, `delivery`
**Valid Payment Methods**: `card`, `momo`, `zalopay`, `apple_pay`, `points`

**Response** (200):
```json
{
  "success": true,
  "orderId": "uuid",
  "status": "pending",
  "expiresAt": "2026-01-15T10:00:30Z",
  "estimatedReadyTime": "2026-01-15T10:15:00Z",
  "order": { ... }
}
```

**Validation Rules**:
- Max 50 items per order
- Max 20 quantity per item
- Max 3 notes per item, 140 chars each
- Min order: 1,000đ
- Max order: 50,000,000đ
- For delivery: validates deliverable items, store delivery settings, minimum order

---

### GET `/api/orders`

List all orders.

**Auth Required**: No (consider adding auth)

**Response** (200):
```json
{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "status": "placed",
      "total_amount": 130000,
      "delivery_option": "pickup",
      "order_items": [ ... ]
    }
  ]
}
```

---

### PATCH `/api/orders`

Update order status.

**Auth Required**: No (consider adding staff auth)

**Request Body**:
```json
{
  "orderId": "uuid",
  "status": "preparing"
}
```

**Valid Statuses**: `placed`, `received`, `preparing`, `ready`, `completed`, `cancelled`

---

### POST `/api/orders/[id]/cancel`

Cancel a pending order within undo window.

**Auth Required**: Yes (order owner)

**Response** (200):
```json
{
  "success": true,
  "refundInitiated": false
}
```

**Errors**:
- `400`: Order not in pending state or undo window expired
- `403`: Not order owner

---

### POST `/api/orders/[id]/finalize`

Manually finalize a pending order before undo window expires.

**Auth Required**: Yes (order owner)

**Response** (200):
```json
{
  "orderId": "uuid",
  "status": "placed",
  "estimatedReadyTime": "2026-01-15T10:15:00Z"
}
```

---

### POST `/api/orders/preview`

Calculate order price preview.

**Auth Required**: No

**Request Body**:
```json
{
  "productId": "cappuccino",
  "size": "L",
  "ice": "normal",
  "sugar": "50",
  "toppings": ["boba"],
  "quantity": 2,
  "voucherId": null
}
```

**Response** (200):
```json
{
  "subtotal": 158000,
  "discount": 0,
  "tax": 12640,
  "total": 170640
}
```

---

## Delivery

### GET `/api/delivery/addresses`

Get user's saved delivery addresses.

**Auth Required**: Yes

**Response** (200):
```json
{
  "addresses": [
    {
      "id": "uuid",
      "label": "Home",
      "full_address": "123 Main St, District 1",
      "latitude": 10.762622,
      "longitude": 106.660172,
      "is_default": true,
      "delivery_notes": "Ring doorbell twice",
      "usage_count": 5
    }
  ],
  "count": 1
}
```

---

### POST `/api/delivery/addresses`

Create a new delivery address.

**Auth Required**: Yes

**Request Body**:
```json
{
  "label": "Work",
  "full_address": "456 Office Building, District 3",
  "latitude": 10.782,
  "longitude": 106.695,
  "is_default": false,
  "delivery_notes": "Call on arrival"
}
```

**Limits**:
- Max 10 addresses per user
- Label: 50 chars max
- Address: 500 chars max
- Notes: 500 chars max

---

### PUT `/api/delivery/addresses`

Update an address.

**Auth Required**: Yes

**Request Body**:
```json
{
  "id": "uuid",
  "label": "Updated Label",
  "is_default": true
}
```

---

### DELETE `/api/delivery/addresses?id={uuid}`

Delete an address.

**Auth Required**: Yes

---

### GET `/api/delivery/availability`

Check delivery availability for a store/address.

**Auth Required**: No

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `storeId` | string | Yes | Store UUID |
| `addressId` | string | No | Saved address UUID |
| `latitude` | number | No | Address latitude |
| `longitude` | number | No | Address longitude |

**Response** (200) - Available:
```json
{
  "available": true,
  "eta": {
    "minutes": 25,
    "min": 20,
    "max": 35,
    "display": "20-35 min",
    "arrivalBy": "10:45 AM"
  },
  "fee": {
    "amount": 20000,
    "display": "20,000đ",
    "surge": false,
    "surgeMultiplier": 1.0
  },
  "distance": {
    "km": 3.5,
    "display": "3.5 km"
  },
  "zone": {
    "id": "uuid",
    "name": "Zone A"
  },
  "minOrderAmount": 50000,
  "store": {
    "id": "uuid",
    "name": "Downtown Coffee"
  }
}
```

**Response** (200) - Unavailable:
```json
{
  "available": false,
  "message": "Your address is outside our delivery area",
  "alternativeAction": "pickup"
}
```

---

### GET `/api/delivery/eta`

Calculate estimated delivery time.

**Auth Required**: No

**Query Parameters**: Same as `/availability`

**Response** (200):
```json
{
  "storeId": "uuid",
  "storeName": "Downtown Coffee",
  "etaMinutes": 25,
  "etaRange": { "min": 20, "max": 35 },
  "distanceKm": 3.5,
  "deliveryFee": 20000,
  "inZone": true
}
```

---

### POST `/api/delivery/validate-zone`

Check if address is in delivery zone.

**Auth Required**: No

**Request Body**:
```json
{
  "storeId": "uuid",
  "latitude": 10.762622,
  "longitude": 106.660172
}
```

Or with saved address:
```json
{
  "storeId": "uuid",
  "addressId": "uuid"
}
```

**Response** (200):
```json
{
  "inZone": true,
  "zone": {
    "id": "uuid",
    "name": "Zone A"
  },
  "distanceKm": 3.5,
  "baseFee": 15000,
  "perKmFee": 3000,
  "totalFee": 25500,
  "etaMinutes": 25
}
```

---

## Payments

### POST `/api/payments/verify`

Verify and process payment.

**Auth Required**: No

**Request Body**:
```json
{
  "amount": 150000,
  "paymentMethod": "card",
  "storeId": "uuid",
  "items": [
    { "product_name": "Latte", "quantity": 2 }
  ]
}
```

**Supported Methods**: `card`, `momo`, `zalopay`, `apple_pay`, `points`

**Response** (200):
```json
{
  "success": true,
  "payment": {
    "token": "PAY_SANDBOX_ABC123",
    "status": "verified",
    "amount": 150000,
    "expiresAt": "2026-01-15T10:15:00Z"
  },
  "_mode": "sandbox"
}
```

**Payment Modes** (via `PAYMENT_MODE` env):
- `production`: Requires real gateway (fails without it)
- `sandbox`: Validates inputs, returns mock success
- `bypass`: No validation (dev only)

---

## Vouchers

### GET `/api/vouchers`

List all active vouchers.

**Auth Required**: No

**Response** (200):
```json
{
  "vouchers": [
    {
      "id": "uuid",
      "code": "SAVE20",
      "type": "percent",
      "value": 20,
      "description": "20% off your order",
      "minSpend": 100000,
      "expiresAt": "2026-02-28T23:59:59Z",
      "isUsed": false,
      "imageUrl": "https://..."
    }
  ]
}
```

---

### GET `/api/vouchers/[code]`

Get voucher by code.

**Auth Required**: No

---

### POST `/api/vouchers`

Validate or create a voucher.

**Auth Required**: No (for validation) / Admin (for creation)

**Validate Request**:
```json
{
  "code": "SAVE20",
  "orderTotal": 150000
}
```

**Validate Response**:
```json
{
  "valid": true,
  "voucher": {
    "code": "SAVE20",
    "discountPercent": 20,
    "discount": null,
    "description": "20% off"
  }
}
```

**Create Request**:
```json
{
  "code": "NEWCODE",
  "discountPercent": 15,
  "description": "15% off",
  "minOrder": 50000,
  "maxDiscount": 30000,
  "isActive": true,
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

---

### PUT/PATCH `/api/vouchers/[code]`

Update a voucher.

---

### DELETE `/api/vouchers/[code]`

Delete a voucher.

---

## Rewards

### GET `/api/rewards`

List all rewards and tiers.

**Auth Required**: No

**Response** (200):
```json
{
  "rewards": [
    {
      "id": "free-coffee",
      "name": "Free Coffee",
      "description": "Any size coffee",
      "pointsCost": 500,
      "image": "https://...",
      "category": "drinks"
    }
  ],
  "tiers": [
    {
      "name": "Bronze",
      "minPoints": 0,
      "maxPoints": 999,
      "benefits": ["5% discount"],
      "color": "#CD7F32"
    }
  ]
}
```

---

### GET `/api/rewards/[id]`

Get a single reward.

**Auth Required**: No

---

### POST `/api/rewards`

Create a new reward.

**Auth Required**: Admin

**Request Body**:
```json
{
  "name": "Free Pastry",
  "description": "Any pastry item",
  "pointsCost": 300,
  "image": "https://...",
  "category": "food"
}
```

---

### PUT/PATCH `/api/rewards/[id]`

Update a reward.

**Auth Required**: Admin

---

### DELETE `/api/rewards/[id]`

Delete a reward.

**Auth Required**: Admin

---

## User

### GET `/api/user/profile`

Get current user's profile and points history.

**Auth Required**: Yes

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "points": 750,
    "total_points_earned": 1200,
    "member_since": "2025-06-15T10:00:00Z",
    "job_title": "Developer",
    "industry": "Technology",
    "bio": "Coffee enthusiast",
    "linkedin_url": "https://linkedin.com/in/johndoe",
    "is_open_to_networking": true,
    "pointsHistory": [
      {
        "id": "uuid",
        "type": "earned",
        "points": 50,
        "description": "Welcome Bonus",
        "created_at": "2025-06-15T10:00:00Z"
      }
    ]
  }
}
```

---

### PUT/PATCH `/api/user/profile`

Update user profile.

**Auth Required**: Yes

**Request Body**:
```json
{
  "name": "John Smith",
  "jobTitle": "Senior Developer",
  "industry": "Technology",
  "bio": "Coffee and code",
  "linkedinUrl": "https://linkedin.com/in/johnsmith",
  "isOpenToNetworking": true
}
```

---

### GET `/api/user/orders`

Get current user's order history.

**Auth Required**: Yes

**Response** (200):
```json
{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "status": "completed",
      "total_amount": 150000,
      "created_at": "2026-01-14T10:00:00Z",
      "order_items": [ ... ]
    }
  ]
}
```

---

### GET `/api/user/addresses`

Get user's saved addresses.

**Auth Required**: Yes

---

### POST `/api/user/addresses`

Save a new address.

**Auth Required**: Yes

**Request Body**:
```json
{
  "address": "123 Main St, District 1"
}
```

---

### DELETE `/api/user/addresses?id={uuid}`

Delete an address.

**Auth Required**: Yes

---

## Social

### POST `/api/social/check-in`

Check in at a store.

**Auth Required**: Yes

**Request Body**:
```json
{
  "storeId": "uuid",
  "status": "available"
}
```

**Status Options**: `available`, `busy`, `invisible`

**Response** (200):
```json
{
  "success": true,
  "checkIn": {
    "id": "uuid",
    "storeId": "uuid",
    "checkedInAt": "2026-01-15T10:00:00Z",
    "presenceStatus": "available",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "jobTitle": "Developer"
    }
  }
}
```

---

### POST `/api/social/check-out`

Check out from current store.

**Auth Required**: Yes

---

### GET `/api/social/discover?storeId={uuid}`

Discover users at a store.

**Auth Required**: Yes

**Query Parameters**:
- `storeId` (required): Store UUID
- `limit` (optional): Max users (default 20)

**Response** (200):
```json
{
  "success": true,
  "users": [
    {
      "id": "uuid",
      "storeId": "uuid",
      "checkedInAt": "2026-01-15T09:00:00Z",
      "presenceStatus": "available",
      "user": {
        "id": "uuid",
        "name": "Jane Doe",
        "avatarUrl": "https://...",
        "jobTitle": "Designer",
        "industry": "Creative",
        "isOpenToNetworking": true
      }
    }
  ]
}
```

---

### GET `/api/social/presence?storeId={uuid}`

Get presence info at a store.

**Auth Required**: Optional

**Response** (200):
```json
{
  "regularsCount": 12,
  "connectedUsers": [
    {
      "userId": "uuid",
      "name": "Jane Doe",
      "avatarUrl": "https://...",
      "enteredAt": "2026-01-15T09:00:00Z"
    }
  ]
}
```

---

### PATCH `/api/social/presence`

Update presence status.

**Auth Required**: Yes

**Request Body**:
```json
{
  "storeId": "uuid",
  "mode": "open",
  "action": null
}
```

**Modes**: `open` (visible), `focus` (hidden)
**Actions**: `exit` / `leave` to leave store

---

### POST `/api/social/presence/mode`

Set presence mode.

**Auth Required**: Yes

**Request Body**:
```json
{
  "mode": "open"
}
```

---

### GET `/api/social/connections`

Get all connections.

**Auth Required**: Yes

---

### POST `/api/social/connections`

Send connection request.

**Auth Required**: Yes

**Request Body**:
```json
{
  "toUserId": "uuid",
  "message": "Let's connect!"
}
```

**Rate Limit**: 10 requests/hour

---

### GET `/api/social/connections/requests`

Get pending connection requests received.

**Auth Required**: Yes

---

### GET `/api/social/connections/[id]`

Get a specific connection.

**Auth Required**: Yes

---

### PATCH `/api/social/connections/[id]`

Accept or decline connection request.

**Auth Required**: Yes

**Request Body**:
```json
{
  "accept": true
}
```

---

### POST `/api/social/connect`

Quick connect with user (creates pending request).

**Auth Required**: Yes

**Request Body**:
```json
{
  "targetUserId": "uuid"
}
```

---

### POST `/api/social/block`

Block a user.

**Auth Required**: Yes

**Request Body**:
```json
{
  "blockedUserId": "uuid",
  "reason": "spam"
}
```

**Valid Reasons**: `spam`, `harassment`, `inappropriate`, `other`

---

### DELETE `/api/social/block?blockedUserId={uuid}`

Unblock a user.

**Auth Required**: Yes

---

### GET `/api/social/block`

Get blocked users list.

**Auth Required**: Yes

---

### POST `/api/social/report`

Report a user.

**Auth Required**: Yes

**Request Body**:
```json
{
  "reportedUserId": "uuid",
  "reason": "harassment",
  "description": "Optional description"
}
```

**Rate Limit**: 10 reports/hour

---

### GET `/api/social/report`

Get user's own reports.

**Auth Required**: Yes

---

### GET `/api/social/posts`

Get recent posts.

**Auth Required**: No

---

### POST `/api/social/posts`

Create a post.

**Auth Required**: Yes

**Request Body**:
```json
{
  "content": "Great coffee today!",
  "type": "general"
}
```

---

## Staff

### GET `/api/staff/orders`

Get orders for staff dashboard.

**Auth Required**: Staff

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Comma-separated statuses (e.g., "received,preparing") |
| `limit` | number | Max results (default 50, max 200) |
| `offset` | number | Pagination offset |
| `from` | string | ISO date from |
| `to` | string | ISO date to |
| `today` | boolean | Only today's orders |
| `delivery` | boolean | Only delivery orders |
| `hasNotes` | boolean | Only orders with notes |
| `source` | string | Filter by source (ai_suggested, reorder, etc.) |

**Response** (200):
```json
{
  "orders": [
    {
      "id": "uuid",
      "status": "received",
      "total_amount": 150000,
      "delivery_option": "delivery",
      "source": "ai_suggested",
      "has_notes": true,
      "order_items": [ ... ],
      "delivery_address": {
        "id": "uuid",
        "label": "Home",
        "full_address": "123 Main St",
        "delivery_notes": "Ring bell"
      },
      "_staffView": {
        "sourceBadge": { "label": "AI Suggested", "color": "purple", "icon": "🤖" },
        "hasNotes": true,
        "isDelivery": true,
        "hasFavoriteItems": false,
        "deliveryInfo": {
          "address": "123 Main St",
          "label": "Home",
          "notes": "Ring bell",
          "fee": 20000,
          "etaMinutes": 25
        },
        "itemNotes": [
          { "productName": "Latte", "notes": ["Extra hot"] }
        ]
      }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Upload

### POST `/api/upload`

Upload an image with optional processing.

**Auth Required**: Optional (for protected uploads)

**Content-Type**: `multipart/form-data`

**Form Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Image file |
| `bucket` | string | No | Storage bucket (products, events, stores, users, vouchers) |
| `path` | string | No | Custom path |
| `crop` | JSON | No | Crop coordinates |
| `resize` | JSON | No | Resize dimensions |
| `quality` | number | No | 1-100 |
| `format` | string | No | jpeg, png, webp |
| `optimize` | boolean | No | Auto-optimize for web |
| `createThumbnail` | boolean | No | Create thumbnail |

**Limits**:
- Max file size: 5MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

**Response** (200):
```json
{
  "success": true,
  "url": "https://supabase.../storage/v1/object/public/products/...",
  "path": "products/1234.webp",
  "thumbnailUrl": "https://...",
  "thumbnailPath": "products/1234_thumb.webp"
}
```

---

## Cron Jobs

### POST `/api/cron/finalize-orders`

Auto-finalize pending orders after undo window expires.

**Auth Required**: Cron secret (`X-Cron-Secret` header)

**Schedule**: Every 10 seconds

**Response** (200):
```json
{
  "success": true,
  "processed": 5,
  "finalized": 5,
  "failed": 0
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing auth |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |
| `ADMIN_SECRET` | Admin API key |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |
| `STAFF_API_SECRET` | Staff API key |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data |
| `CRON_SECRET` | Secret for cron job authentication |
| `PAYMENT_MODE` | production, sandbox, or bypass |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

---

## Data Types Reference

### Order Status Flow

```
pending → placed → received → preparing → ready → completed
                                              ↘ cancelled
```

### Delivery Options

- `pickup`: Customer picks up at store
- `dine_in`: Customer eats at store
- `delivery`: Delivered to customer address

### Presence Modes

- `open`: Visible to connected users
- `focus`: Private, not visible

### Connection Status

- `pending`: Request sent, awaiting response
- `accepted`: Connection established
- `rejected`: Request declined

---

## Quick Integration Checklist

1. **Authentication**
   - Implement login/register flows
   - Store access and refresh tokens securely
   - Implement token refresh logic

2. **Menu Loading**
   - Use `/api/menu` for complete menu data
   - Cache categories, sizes, sugar/ice options

3. **Order Flow**
   - Calculate prices with `/api/orders/preview`
   - Verify payment with `/api/payments/verify`
   - Create order with `/api/orders`
   - Handle 30-second undo window
   - Allow cancel within undo window

4. **Delivery**
   - Check availability with `/api/delivery/availability`
   - Validate address zone before order
   - Include delivery fee in order total

5. **Social Features**
   - Check in at store
   - Set presence mode (open/focus)
   - Discover and connect with users
   - Handle blocks and reports

---

*Last Updated: January 2026*
