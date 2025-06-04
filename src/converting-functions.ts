import { Battery, Gear } from "./types";

/**
 * Convert gear to number
 * @param gear - gear string (N, 1, 2, 3, 4, 5, 6)
 * @returns gear number
 */
export function convertGear(gear: Gear) {
    if (gear === "N") {
        return 0;
    }
    return parseInt(gear);
}

/**
 * 
 * @param speed speed in m/s
 * @returns speed in km/h
 */
export function convertSpeed(speed: number) {
    return speed * 3.6;
}

/**
 * 
 * @param battery battery data including state of charge and capacity
 * @returns average state of charge of all batteries in %
 */
export function calculateStateOfCharge(battery: Battery) {
        // check if all the values are defined
        Object.values(battery).forEach((value) => {
            if (value.soc === undefined || value.capacity === undefined) {
                return Number.NaN;
            }
        });

        const numerator = Object.values(battery).reduce((acc, curr) => {
            acc += ((curr.soc! * curr.capacity!) / 100);
            return acc;
        }, 0)
    
        const denominator = Object.values(battery).reduce((acc, curr) => {
            acc += curr.capacity!;
            return acc;
        }, 0)
    
        const result = Math.floor(((numerator * 100 )/ denominator));

        return result;
}