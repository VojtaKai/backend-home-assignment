import amqp from 'amqplib';
import { PrismaClient } from './generated/prisma'
import { Battery, CarData, Gear } from './types';
import { carDataSchema, carStateSchema, completeCarDataSchema } from './schemas';
import { RABBITMQ_QUEUE } from './queues';
import { calculateStateOfCharge, convertGear, convertSpeed } from './converting-functions';
import { RABBITMQ_BROKER_URL } from './constants';

const DEFAULT_CAR_STATE: CarState = {
    carId: 0,
    stateOfCharge: 0,
    latitude: 0,
    longitude: 0,
    gear: 0,
    speed: 0
}

const prisma = new PrismaClient();

const carDataMap = new Map<number, CarData>(); // <carId, CarData> Map to store the latest state (partial partial to complete) for each car
const carStates = new Map<number, CarState>(); // <carId, CarState> Map to store the latest COMPLETE state for each car

interface CarState {
    carId: number;
    time?: Date;
    stateOfCharge: number;
    latitude: number;
    longitude: number;
    gear: number;
    speed: number;
}

/**
 * 
 * @param carData - car data to update the state with
 * @param carState - current car state
 * @returns updated car state
 */
function updateCarState(carData: CarData, carState: CarState): CarState {
    const keys: (keyof CarData)[] = Object.keys(carData).filter(key => key !== 'id') as (keyof CarData)[];

    if (keys.length < 1) {
        console.error('No data to update data');
        return carState;
    }

    // Create a new car state with default values

    for (const key of keys) {
        const value = carData[key as keyof CarData];

        switch (key) {
            case 'latitude':
                carState.latitude = value as number;
                break;
            case 'longitude':
                carState.longitude = value as number;
                break;
            case 'speed':
                carState.speed = convertSpeed(value as number);
                break;
            case 'gear':
                carState.gear = convertGear(value as Gear);
                break;
            case 'battery':
                const result = calculateStateOfCharge(value as Battery);
                if (!Number.isNaN(result)) {
                    carState.stateOfCharge = result
                }
                break;
            default:
                throw new Error(`Unknown key: ${key}`);
        }
    }

    return carState;
}

async function processMessage(message: Buffer) {
    try {
        // Parse and validate the message data
        const parsedData = JSON.parse(message.toString()) as CarData;
        let carData = carDataSchema.parse(parsedData) as CarData;
        
        // skip if car ID is not 1
        if (carData.id !== 1) {
            console.log(`Skipping car ID ${carData.id}`);
            return;
        }


        if (!carStates.has(carData.id) || !carDataMap.has(carData.id)) {
            // create a buffer to store the latest data
            let carDataBuffer: CarData = {
                id: carData.id
            };

            if (carDataMap.has(carData.id)) {
                carDataBuffer = carDataMap.get(carData.id)!;
            } else {
                carDataMap.set(carData.id, carDataBuffer);
            }


            for (const [prop, value] of Object.entries(parsedData)) {

                if (prop === 'id') {
                    continue;
                }

                switch (prop) {
                    case 'latitude':
                        carDataBuffer.latitude = parseFloat(value);
                        break;
                    case 'longitude':
                        carDataBuffer.longitude = parseFloat(value);
                        break;
                    case 'speed':
                        carDataBuffer.speed = parseFloat(value);
                        break;
                    case 'gear':
                        carDataBuffer.gear = value as Gear;
                        break;
                    case 'battery': {
                        for (const [idx, batteryInfo] of Object.entries(value as Battery)) {

                            for (const [key, val] of Object.entries(batteryInfo)) {
                                if (key === 'soc') {
                                    if (carDataBuffer.battery && carDataBuffer.battery[idx]) {
                                        carDataBuffer.battery[idx] = {...carDataBuffer.battery[idx], soc: val}
                                    } else {
                                        carDataBuffer.battery = {...carDataBuffer.battery ?? {}, [idx]: { soc: val }};
                                    }
                                } else if (key === 'capacity') {
                                    if (carDataBuffer.battery && carDataBuffer.battery[idx]) {
                                        carDataBuffer.battery[idx] = {...carDataBuffer.battery[idx], capacity: val}
                                    } else {
                                        carDataBuffer.battery = {...carDataBuffer.battery ?? {}, [idx]: { capacity: val }};
                                    }
                                }
                            }
                        }
                        break;
                    }
                    default:
                        throw new Error(`Unknown data type: ${prop}`);
                }
            }

            carDataMap.set(carData.id, carDataBuffer);

            try {
                completeCarDataSchema.parse(carDataMap.get(carData.id));
                
                const carState = updateCarState(carDataMap.get(carData.id)!, {...DEFAULT_CAR_STATE, carId: carData.id});

                carStates.set(carData.id, carState);
            } catch {
                // when we don't have all the data, return
                return;
            }
        }

        if (carStates.has(carData.id) && carDataMap.has(carData.id)) {
            // if carState doesn't exist in memory or DB, create a new one with default values
            const carState = carStates.get(carData.id)!

            if (!carDataMap.has(carData.id)) {
                try {
                    completeCarDataSchema.parse(carDataMap.get(carData.id)!);
                    carDataMap.set(carData.id, carData);
                } catch (error) {
                    console.error('Error parsing car data:', error);
                    return;
                }
            }

            const newCarState = updateCarState(carDataMap.get(carData.id)!, carState);
    
            const validNewCarState = carStateSchema.parse(newCarState);
            
            carStates.set(carData.id, validNewCarState);
            
            console.log(`Successfully processed car state for car ID: ${carData.id}`);
        }

    } catch (error) {
        console.error('Error processing message:', error);
    }
}

/**
 * Writes car states to the database every 5 seconds
 */
async function startPeriodicDbWriter() {
    setInterval(async () => {
        try {
            console.log('Periodic Write Tick');
            if (carStates.size === 0) {
                return;
            }
           
            const time = new Date();
            
            // Get all car states and write them to DB
            await Promise.all(Array.from(carStates.entries()).map(async ([_, state]) => {
                try {
                    // validate schema one last time before writing to DB | not really necessary because I made all the properties required in the table schema
                    carStateSchema.parse(state);
                    await prisma.carState.create({
                        data: {...state, time},
                    });
                } catch (error) {
                    carStates.delete(state.carId);
                    console.error('Error while writing to DB:', error);
                }
            }));

            // keeping this here just for demo purposes
            console.log('Successfully wrote car states to database');
        } catch (error) {
            console.error('Error writing to DB:', error);
        }
    }, 5000);
}

async function startConsumer() {
    try {
        // Connect to RabbitMQ
        const connection = await amqp.connect(RABBITMQ_BROKER_URL);
        const channel = await connection.createChannel();
        
        // Ensure queue exists
        await channel.assertQueue(RABBITMQ_QUEUE, {
            durable: true
        });
        
        console.log('Connected to RabbitMQ and waiting for messages...');
        
        // Start the DB writer
        startPeriodicDbWriter();
        
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
