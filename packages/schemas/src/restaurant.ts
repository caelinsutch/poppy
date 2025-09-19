import { z } from "zod";
import {
  BookingPlatform,
  ConfirmationType,
  PriceRange,
  TableType,
} from "./enums";

// Location schema
export const LocationSchema = z.object({
  address: z.string(),
  city: z.string(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

// Restaurant base schema
export const RestaurantSchema = z.object({
  name: z.string(),
  cuisine: z.string().optional(),
  location: LocationSchema,
  rating: z.number().min(0).max(5).optional(),
  priceRange: PriceRange.optional(),
  phone: z.string().optional(),
  website: z.url().optional(),
});

// Restaurant metadata schema
export const RestaurantMetadataSchema = z.object({
  cuisineTypes: z.array(z.string()),
  amenities: z.array(z.string()),
  hours: z.record(z.string(), z.string()).optional(),
  images: z.array(z.url()).optional(),
});

// Availability schema
export const AvailabilitySchema = z.object({
  date: z.string(), // ISO date
  time: z.string(), // HH:MM format
  partySize: z.number().positive(),
  tableType: TableType.optional(),
  confirmationType: ConfirmationType,
});

// Booking details schema
export const BookingDetailsSchema = z.object({
  platform: BookingPlatform,
  bookingUrl: z.url().optional(),
  bookingId: z.string().optional(),
  expiresAt: z.date().optional(),
  specialNotes: z.string().optional(),
  requiresCreditCard: z.boolean().optional(),
});

// Reservation option schema
export const ReservationOptionSchema = z.object({
  id: z.string(),
  restaurant: RestaurantSchema,
  availability: AvailabilitySchema,
  bookingDetails: BookingDetailsSchema,
  score: z.number().min(0).max(1), // Relevance score from LLM
  explanation: z.string().optional(), // LLM's reasoning
  alternativeTimes: z.array(z.string()).optional(), // Other available times
});

// Export types
export type Location = z.infer<typeof LocationSchema>;
export type Restaurant = z.infer<typeof RestaurantSchema>;
export type RestaurantMetadata = z.infer<typeof RestaurantMetadataSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type BookingDetails = z.infer<typeof BookingDetailsSchema>;
export type ReservationOption = z.infer<typeof ReservationOptionSchema>;
