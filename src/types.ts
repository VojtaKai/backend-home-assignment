export interface BatteryDetail {
    soc?: number;
    capacity?: number;
}

export type Battery = Record<string, {
    soc?: number | undefined;
    capacity?: number | undefined;
}>

export type Gear = "N" | "1" | "2" | "3" | "4" | "5" | "6"

export interface CarData {
    id: number;
    latitude?: number;
    longitude?: number;
    speed?: number;
    gear?: Gear;
    battery?: Battery;
}
