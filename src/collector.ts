import mqtt from 'mqtt';
import amqp from 'amqplib';
import { CarData, Gear } from './types';
import { completeCarDataSchema } from './schemas';

// Constants for MQTT configuration
const MQTT_BROKER = 'mqtt://localhost:51883';
const RABBITMQ_BROKER = 'amqp://admin:admin@localhost:55672';
const RABBITMQ_QUEUE = 'car_data';

const carDataMap: Map<number, CarData> = new Map(); // Map to store car data by car ID
const carIdsInitializedProperly: Set<number> = new Set(); // Set to store car IDs that have been initialized properly

// Connect to MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER);

// Handle MQTT connection
mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Subscribe to all relevant topics
    const topics = [
        'car/+/location/latitude',
        'car/+/location/longitude',
        'car/+/speed',
        'car/+/gear',
        'car/+/battery/+/soc',
        'car/+/battery/+/capacity',
    ];

    // Subscribe to all topics
    mqttClient.subscribe(topics, (err) => {
        if (err) {
            console.error('Error subscribing to topics:', err);
            return;
        }
        console.log('Subscribed to all topics');
    });
});

async function sendDataToRabbitMQ(carData: CarData) {
    const rabbitmqConnection = await amqp.connect(RABBITMQ_BROKER);
    const channel = await rabbitmqConnection.createChannel();
    await channel.assertQueue(RABBITMQ_QUEUE);

    const result = channel.sendToQueue(RABBITMQ_QUEUE, Buffer.from(JSON.stringify(carData)));

    if (result) {
        console.log('Data sent to RabbitMQ');
    } else {
        console.log('Failed to send data to RabbitMQ');
    }

    await channel.close();
    await rabbitmqConnection.close();

    return result;
}

// Handle incoming messages
mqttClient.on('message', async (topic: string, message: Buffer) => {
    try {
        const value = JSON.parse(message.toString()).value.toString();

        // Parse the topic to determine the type of data and car ID
        const topicParts = topic.split('/');
        const carId = parseInt(topicParts[1]);

        // Only process data for car ID 1
        if (carId !== 1) {
            console.log(`Other car ID than 1: ${carId} - SKIPPING`);
            return
        }

        let carDataBuffer: CarData = {
            id: carId
        };

        if (carDataMap.has(carId)) {
            carDataBuffer = carDataMap.get(carId)!;
        } else {
            carDataMap.set(carId, carDataBuffer);
        }

        // Create a buffer to store the latest data

        console.log(`Received message on topic ${topic}: ${value}`);

        const dataType = topicParts[topicParts.length - 1];

        // Update the buffer with the new data
        switch (dataType) {
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
            case 'soc': {
                const batteryIndex = topicParts[topicParts.length - 2];

                if (!batteryIndex) {
                    throw new Error('Battery index not found');
                }

                if (carDataBuffer.battery && carDataBuffer.battery[parseInt(batteryIndex)]) {
                    carDataBuffer.battery[parseInt(batteryIndex)].soc = parseFloat(value);
                } else {
                    carDataBuffer.battery = {...carDataBuffer.battery ?? {}, [parseInt(batteryIndex)]: { soc: parseFloat(value) }};
                }

                break;
            }
            case 'capacity': {
                const batteryIndex = topicParts[topicParts.length - 2];

                if (!batteryIndex) {
                    throw new Error('Battery index not found');
                }

                if (carDataBuffer.battery && carDataBuffer.battery[parseInt(batteryIndex)]) {
                    carDataBuffer.battery[parseInt(batteryIndex)].capacity = parseFloat(value);
                } else {
                    carDataBuffer.battery = {...carDataBuffer.battery ?? {}, [parseInt(batteryIndex)]: { capacity: parseFloat(value) }};
                }
                break;
            }
            default:
                throw new Error(`Unknown data type: ${dataType}`);
        }

        // Prepare a full object for the first time. Then partial objects are okay
        if (!carIdsInitializedProperly.has(carId)) {
            try {
                const carDataWithRequiredFields = completeCarDataSchema.parse(carDataBuffer);
                const result = await sendDataToRabbitMQ(carDataWithRequiredFields);
                if (result) {
                    carIdsInitializedProperly.add(carId);
                }
            } catch (error) {
                console.log(`Object is incomplete. Skipping...`);
                console.log(`Data so far: ${JSON.stringify(carDataBuffer, undefined, 2)}`);
            }
        } else {
            console.log(`Data complete: ${JSON.stringify(carDataBuffer, undefined, 2)}`)
            // await sendDataToRabbitMQ(carDataBuffer);
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Handle errors
mqttClient.on('error', (err) => {
    console.error('MQTT Error:', err);
});

// Handle disconnection
mqttClient.on('close', () => {
    console.log('Disconnected from MQTT broker');
});

// Keep the process running
process.on('SIGINT', () => {
    mqttClient.end();
    process.exit();
});

// async function test_rabbitmq() {
//     const carData: CarData = {
//         id: 1,
//         latitude: 1,
//         longitude: 1,
//         speed: 1,
//         gear: '1',
//         battery: {},
//         createdAt: Date.now(),
//         lastUpdated: Date.now()
//     }
//     await sendDataToRabbitMQ(carData);
// }

// void test_rabbitmq()
