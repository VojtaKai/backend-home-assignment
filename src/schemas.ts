import { z } from 'zod';  
        
export const carDataSchema = z.object({
    id: z.number(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    speed: z.number().optional(),
    gear: z.string().optional(),
    battery: z.record(z.string(), z.object({
        soc: z.number().optional(),
        capacity: z.number().optional()
    })).optional()
});

// Schema for validating complete car data with all required fields
export const completeCarDataSchema = z.object({
    id: z.number(),
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number(),
    gear: z.string().refine((gear) => gear === "N" || gear === "1" || gear === "2" || gear === "3" || gear === "4" || gear === "5" || gear === "6", {
        message: "Invalid gear"
    }),
    battery: z.record(z.string(), z.object({
        soc: z.number(),
        capacity: z.number()
    })).refine((battery) => Object.keys(battery).length === 2, {
        message: "Battery record must contain exactly 2 batteries"
    })
});

export const carStateSchema = z.object({
    carId: z.number(),
    time: z.date().optional(),
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number(),
    gear: z.number().refine((gear) => [0,1,2,3,4,5,6].includes(gear), {
        message: "Invalid gear"
    }),
    stateOfCharge: z.number()
});