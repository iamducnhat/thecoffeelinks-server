# API Updates - Implementation Summary

This document summarizes the backend API and database changes made to support features from API_REQUIREMENTS.md.

## 📦 Database Migrations Created

### 1. Migration 025: Professional Fields for Users
**File**: `database_migrations/025_add_professional_fields_to_users.sql`

**Changes**:
- Added `headline` TEXT - Professional tagline (e.g., "Senior Developer @ StartupX")
- Added `company` TEXT - Current company name
- Added `networking_intent` TEXT - Current intent: hiring, learning, collaboration, open_chat
- Added indexes for efficient filtering

### 2. Migration 026: Networking Intent & Time-Boxed Check-in
**File**: `database_migrations/026_add_intent_and_time_boxed_checkin.sql`

**Changes to `store_checkins`**:
- Added `intent` TEXT - Networking intent
- Added `table_number` TEXT - Table/room number
- Added `duration_minutes` INTEGER - Expected duration
- Added `expires_at` TIMESTAMP - Auto checkout time

**Changes to `user_presence`**:
- Added `intent` TEXT - Networking intent
- Added `table_number` TEXT - Table/room number
- Added `expires_at` TIMESTAMP - Auto presence expiry

**New Functions**:
- Updated `get_store_presence()` to support intent filtering and table_number
- Created `cleanup_expired_checkins()` for cron job

### 3. Migration 027: Favorites Table
**File**: `database_migrations/027_add_favorites_table.sql`

**New Table**: `favorites`
- `id` UUID PRIMARY KEY
- `user_id` UUID (references users)
- `product_id` UUID (references products)
- `customization` JSONB - Size, sugar, ice, toppings, etc.
- `notes` TEXT[] - Max 3 notes, max 140 chars each
- `created_at` TIMESTAMP
- `last_ordered_at` TIMESTAMP
- `order_count` INTEGER

**Features**:
- Unique constraint on (user_id, product_id, customization)
- Validation trigger for notes (max 3, max 140 chars)
- Full RLS policies for user privacy

---

## 🔌 API Endpoints Updated

### 1. User Profile API - Enhanced
**Endpoint**: `PUT /api/user/profile`

**New Fields Accepted**:
```json
{
  "headline": "Senior Developer @ StartupX",
  "company": "StartupX",
  "networking_intent": "learning"
}
```

**Validation**:
- `networking_intent` must be one of: hiring, learning, collaboration, open_chat

---

### 2. Check-In API - Time-Boxed & Intent Support
**Endpoint**: `POST /api/social/check-in`

**New Fields**:
```json
{
  "storeId": "uuid",
  "intent": "hiring",
  "tableNumber": "7",
  "durationMinutes": 60
}
```

**Response Includes**:
```json
{
  "checkIn": {
    "id": "...",
    "intent": "hiring",
    "tableNumber": "7",
    "durationMinutes": 60,
    "expiresAt": "2026-01-16T03:00:00Z",
    "user": {
      "headline": "Senior Developer @ StartupX",
      ...
    }
  }
}
```

---

### 3. Discover API - Intent Filtering
**Endpoint**: `GET /api/social/discover?storeId={id}&intent={intent}`

**New Query Params**:
- `intent` (optional) - Filter by networking intent: hiring, learning, collaboration, open_chat

**Response Includes**:
- `intent`, `tableNumber`, `expiresAt` for each user
- `headline` in user profile

**Example**:
```
GET /api/social/discover?storeId=123&intent=hiring
```

---

### 4. Posts API - Typed Posts Enforcement
**Endpoint**: `POST /api/social/posts`

**Validation**:
```json
{
  "type": "hiring",  // REQUIRED
  "content": "Looking for a junior developer"
}
```

**Valid Types**:
- `hiring`
- `learning`
- `collaboration`
- `event_discussion`

**Rules**:
- Type is REQUIRED (no free-form generic posts)
- Content max 280 characters

---

## 🆕 New API Endpoints

### 1. Favorites Management

#### Get All Favorites
```
GET /api/user/favorites
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "favorites": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "customization": { "size": "medium", "sugar": "50" },
      "notes": ["Extra hot", "For meetings"],
      "order_count": 12,
      "last_ordered_at": "2026-01-15T10:00:00Z",
      "product": { /* full product object */ }
    }
  ]
}
```

#### Create Favorite
```
POST /api/user/favorites
Authorization: Bearer <token>
Content-Type: application/json

{
  "product_id": "uuid",
  "customization": { "size": "medium", "sugar": "50" },
  "notes": ["Extra hot", "Order on Mondays"]
}
```

#### Update Favorite
```
PUT /api/user/favorites/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "notes": ["Extra hot", "Updated note"]
}
```

#### Delete Favorite
```
DELETE /api/user/favorites/{id}
Authorization: Bearer <token>
```

---

### 2. LinkedIn Authentication (Placeholder)
```
POST /api/auth/linkedin
Content-Type: application/json

{
  "code": "linkedin_auth_code",
  "redirect_uri": "https://..."
}
```

**Status**: Returns 501 Not Implemented with helpful message. Full implementation requires:
1. LinkedIn OAuth app setup
2. Environment variables: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
3. Token exchange and profile fetch logic

---

## ⏰ Cron Jobs

### New: Cleanup Expired Check-Ins
**Endpoint**: `POST /api/cron/cleanup-expired-checkins`
**Frequency**: Every 1-5 minutes
**Header**: `X-Cron-Secret: <secret>`

**Function**:
- Calls `cleanup_expired_checkins()` database function
- Auto checks-out users whose time-boxed check-in has expired
- Removes expired presence records

**Response**:
```json
{
  "success": true,
  "cleanup": {
    "expiredCheckInsProcessed": 3
  },
  "currentStats": {
    "activeCheckIns": 45,
    "timeBoxedCheckIns": 12
  }
}
```

---

## 📊 Feature Implementation Status

| Feature | Backend | Priority | Status |
|---------|---------|----------|--------|
| **LinkedIn Auth** | ✅ Endpoint created | P0 | Placeholder (501) |
| **Professional Profile Fields** | ✅ Complete | P0 | ✅ Ready |
| **Networking Intents** | ✅ Complete | P0 | ✅ Ready |
| **Favorite Notes** | ✅ Complete | P1 | ✅ Ready |
| **Time-Boxed Check-In** | ✅ Complete | P1 | ✅ Ready |
| **Typed Community Posts** | ✅ Complete | P1 | ✅ Ready |
| **AI Predictions** | ⏭️ Client-side | P2 | N/A |
| **Trust Badges** | ⏭️ Client-side | P2 | N/A |
| **Weather-Reactive** | ⏭️ Client-side | P2 | N/A |

---

## 🔄 Migration Steps

### Run in Supabase SQL Editor (in order):

1. **User Profile Enhancements**:
   ```sql
   -- Run: database_migrations/025_add_professional_fields_to_users.sql
   ```

2. **Check-In Enhancements**:
   ```sql
   -- Run: database_migrations/026_add_intent_and_time_boxed_checkin.sql
   ```

3. **Favorites Table**:
   ```sql
   -- Run: database_migrations/027_add_favorites_table.sql
   ```

### Verify Migrations:
```sql
-- Check new columns in users table
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('headline', 'company', 'networking_intent');

-- Check new columns in store_checkins
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'store_checkins' 
AND column_name IN ('intent', 'table_number', 'expires_at');

-- Check favorites table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'favorites';
```

---

## 🔧 Vercel Cron Configuration

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-expired-checkins",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Or set up at: https://vercel.com/dashboard → Project → Settings → Cron Jobs

---

## 📝 Client Integration Notes

### For Swift App:

1. **Profile Updates**: Include new fields in profile update requests
   ```swift
   profileData = [
       "headline": "Senior Developer @ StartupX",
       "company": "StartupX",
       "networking_intent": "learning"
   ]
   ```

2. **Check-In**: Add intent and duration
   ```swift
   checkInData = [
       "storeId": storeId,
       "intent": "hiring",
       "tableNumber": "7",
       "durationMinutes": 60
   ]
   ```

3. **Discover**: Filter by intent
   ```swift
   let url = "\(baseURL)/api/social/discover?storeId=\(id)&intent=hiring"
   ```

4. **Posts**: Always include type
   ```swift
   postData = [
       "type": "hiring",  // REQUIRED
       "content": "Looking for..."
   ]
   ```

5. **Favorites**: Use new API endpoints
   ```swift
   // GET /api/user/favorites
   // POST /api/user/favorites
   // PUT /api/user/favorites/{id}
   // DELETE /api/user/favorites/{id}
   ```

---

## ✅ Testing Checklist

- [ ] Run all 3 database migrations in Supabase
- [ ] Test profile update with new fields
- [ ] Test check-in with intent and duration
- [ ] Test discover with intent filter
- [ ] Test creating typed posts (should reject invalid types)
- [ ] Test favorites CRUD operations
- [ ] Verify cron job for expired check-ins
- [ ] Check RLS policies work correctly

---

## 📚 Documentation Updated

- [x] Database migrations created
- [x] API endpoints documented
- [x] Cron jobs documented
- [ ] BACKEND_API_GUIDE.md needs updates (recommended)

---

## 🚀 Deployment Notes

1. **Database**: Run migrations in Supabase SQL Editor
2. **Server**: Deploy updated server code to Vercel
3. **Cron**: Configure cron job in Vercel dashboard
4. **Environment**: No new env vars needed (except LinkedIn client ID/secret for future)
5. **Testing**: Use provided test checklist

---

## 📖 Related Documents

- `/Users/nguyenducnhat/appcafe/thecoffeelinks-native-swift/API_REQUIREMENTS.md` - Original requirements
- `database_migrations/025_*.sql` - User profile migration
- `database_migrations/026_*.sql` - Check-in enhancements
- `database_migrations/027_*.sql` - Favorites table

---

**Implementation Date**: January 16, 2026  
**Status**: ✅ Complete and Ready for Testing
