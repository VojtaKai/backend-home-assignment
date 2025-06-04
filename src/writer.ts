import amqp from 'amqplib';
import { PrismaClient } from './generated/prisma'
import { z } from 'zod';
import { Battery, CarData, CarDataWithRequiredFields, Gear } from './types';
import { carDataSchema, carStateModelSchema, completeCarDataSchema } from './schemas';

// Constants for RabbitMQ configuration
const RABBITMQ_BROKER = 'amqp://admin:admin@localhost:55672';
const RABBITMQ_QUEUE = 'car_data';

// Initialize Prisma client
const prisma = new PrismaClient();

// Map to store the latest state for each car
const carStates = new Map<number, CarState>();

interface CarState {
    id?: number;
    carId: number;
    time?: Date;
    stateOfCharge: number;
    latitude: number;
    longitude: number;
    gear: number;
    speed: number;
}

function convertGear(gear: Gear) {
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
function convertSpeed(speed: number) {
    return speed * 3.6;
}

/**
 * 
 * @param battery battery data including state of charge and capacity
 * @returns average state of charge of all batteries in %
 */
function calculateStateOfCharge(battery: Battery) {
    const numerator = Object.values(battery).reduce((acc, curr) => {
        acc += curr.soc! * curr.capacity!;
        return acc;
    }, 0)

    const denominator = Object.values(battery).reduce((acc, curr) => {
        acc += curr.capacity!;
        return acc;
    }, 0)

    return Math.floor(numerator / denominator * 100);
}

async function processMessage(message: Buffer) {
    try {
        // Parse and validate the message data
        const parsedData = JSON.parse(message.toString()) as CarData;
        let carData = carDataSchema.parse(parsedData);

        // Get the last record for this car to compare with new data
        const lastCarState = await prisma.carState.findFirst({
            where: {
                carId: carData.id
            },
            orderBy: {
                time: 'desc'
            }
        });

        if (!lastCarState) {
            try {
                carData = completeCarDataSchema.parse(parsedData);
                // Store in memory instead of DB
                const newState: CarState = {
                    carId: carData.id,
                    time: new Date(),
                    latitude: carData.latitude!,
                    longitude: carData.longitude!,
                    speed: convertSpeed(carData.speed!),
                    gear: convertGear(carData.gear as Gear),
                    stateOfCharge: calculateStateOfCharge(carData.battery as Battery)
                };
                carStates.set(carData.id, newState);
                return;
            } catch (error) {
                console.error('Error parsing car data:', error);
                return;
            }
        }

        // skip if car ID is not 1
        if (carData.id !== 1) {
            console.log(`Skipping car ID ${carData.id}`);
            return;
        }

        const keys: (keyof CarData)[] = Object.keys(carData).filter(key => key !== 'id') as (keyof CarData)[];

        if (keys.length < 1) {
            console.error('No data to update data');
            return;
        }

        // Create a new car state with default values
        const newCarState: CarState = {
            carId: lastCarState.carId,
            latitude: lastCarState.latitude as number,
            longitude: lastCarState.longitude as number,
            speed: lastCarState.speed as number,
            gear: lastCarState.gear as number,
            stateOfCharge: lastCarState.stateOfCharge as number
        }

        for (const key of keys) {
            const value = carData[key as keyof CarData];
            if (value === undefined) {
                console.error(`Missing required field: ${key}`);
                return;
            }
            switch (key) {
                case 'latitude':
                    newCarState.latitude = value as number;
                    break;
                case 'longitude':
                    newCarState.longitude = value as number;
                    break;
                case 'speed':
                    newCarState.speed = convertSpeed(value as number);
                    break;
                case 'gear':
                    newCarState.gear = convertGear(value as Gear);
                    break;
                case 'battery':
                    newCarState.stateOfCharge = calculateStateOfCharge(value as Battery);
                    break;
                default:
                    throw new Error(`Unknown key: ${key}`);
            }
        }

        const validNewCarState = carStateModelSchema.parse(newCarState);
        
        // Store in memory instead of DB
        carStates.set(carData.id, validNewCarState);
        
        console.log(`Successfully processed car state for car ID: ${carData.id}`);
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

/**
 * Writes car states to the database every 5 seconds
 */
async function startDbWriter() {
    setInterval(async () => {
        try {
            if (carStates.size === 0) {
                return;
            }
           
            // todo: remove
            console.log(`Writing ${carStates.size} car states to database...`);
            
            // Get all car states and write them to DB
            await Promise.all(Array.from(carStates.entries()).map(async ([_, state]) => {
                try {
                    // validate schema before writing to DB
                    carStateModelSchema.parse(state);

                    await prisma.carState.create({
                        data: {...state, time: new Date()},
                    });
                } catch (error) {
                    // quiet error
                }
            }));
            
            // Clear the states after writing
            carStates.clear();
            console.log('Successfully wrote car states to database');
        } catch (error) {
            console.error('Error writing to DB:', error);
        }
    }, 5000);
}

async function startConsumer() {
    try {
        // Connect to RabbitMQ
        const connection = await amqp.connect(RABBITMQ_BROKER);
        const channel = await connection.createChannel();
        
        // Ensure queue exists
        await channel.assertQueue(RABBITMQ_QUEUE, {
            durable: true
        });
        
        console.log('Connected to RabbitMQ and waiting for messages...');
        
        // Start the DB writer
        startDbWriter();
        
        // Consume messages
        channel.consume(RABBITMQ_QUEUE, async (msg) => {
            if (msg) {
                await processMessage(msg.content);
                channel.ack(msg);
                // console.log(msg.content.toString());
            }
        });
        
        // Handle connection close
        connection.on('close', () => {
            console.log('RabbitMQ connection closed');
        });
        
    } catch (error) {
        console.error('Error in consumer:', error);
    }
}

// Start the consumer
startConsumer().catch(console.error);

// Handle process termination
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});
