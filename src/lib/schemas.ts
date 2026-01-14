import { z } from 'zod';

export const ProductSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string().optional().nullable(),
    categoryId: z.string().uuid("Invalid Category ID"),
    image: z.string().optional().nullable(),
    isPopular: z.boolean().optional(),
    isNew: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    availableToppings: z.array(z.string()).optional(),
    sizeOptions: z.any().optional(), // Ideally stricter, but schema is flexible for now
});

export const CategorySchema = z.object({
    name: z.string().min(2),
    type: z.string().min(2),
});

export const StoreSchema = z.object({
    name: z.string().min(2),
    address: z.string().min(5),
    phone: z.string().optional().nullable(),
    opening_time: z.string().optional().nullable(),
    closing_time: z.string().optional().nullable(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    is_active: z.boolean().optional(),
});

export const ToppingSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(2),
    price: z.number().min(0),
    is_available: z.boolean().optional(),
});
