import mqtt from 'mqtt';
import amqp from 'amqplib';
import { CarData, Gear } from './types';
import { RABBITMQ_QUEUE } from './queues';
import { MQTT_BROKER_URL, RABBITMQ_BROKER_URL } from './constants';

// Connect to MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

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
    const rabbitmqConnection = await amqp.connect(RABBITMQ_BROKER_URL);
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
                carDataBuffer.battery = {[batteryIndex]: { soc: parseFloat(value) }};
                break;
            }
            case 'capacity': {
                const batteryIndex = topicParts[topicParts.length - 2];
                carDataBuffer.battery = {[batteryIndex]: { capacity: parseFloat(value) }};
                break;
            }
            default:
                throw new Error(`Unknown data type: ${dataType}`);
        }

        console.log(`Car data buffer: ${JSON.stringify(carDataBuffer, undefined, 2)}`);

        await sendDataToRabbitMQ(carDataBuffer);
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
