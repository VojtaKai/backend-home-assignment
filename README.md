# Backend home assignment for Delta Green

## Overview

In this home assignment you are required to create a data pipeline which collects data from electrical cars and inputs them into the database.

The data are coming from an MQTT broker and your task is to feed them through a RabbitMQ queue into a Postgres database.

## Running the services

Every service required to complete the assignment is defined in the `docker-compose.yml` file. To run it simply execute:

```sh
docker-compose up -d
```

This will start a Postgres database on local port `55432`, Mosquitto MQTT broker on port `51883`, RabbitMQ on port `55672` and helper script which will initialize the database tables and start the electrical car simulation. All important credentials for connecting to the services can be seen in the `docker-compose.yml` file itself.

## Data description

The data coming from MQTT include these important topics:

- `car/[carId]/location/latitude` - latitude component of current car's position
- `car/[carId]/location/longitude` - longitude component of current car's position
- `car/[carId]/speed` - current speed of the car in m/s
- `car/[carId]/gear` - the gear the car is currently in (values N,1,2,3,4,5,6)
- `car/[carId]/battery/[batteryIndex]/soc` - state of charge of given battery in the car as a percentage from 0-100
- `car/[carId]/battery/[batteryIndex]/capacity` - capacity of given battery in the car in Wh

The database contains a table called `car_state` with these columns:

```
id              serial primary key,
car_id          integer,
time            timestamp,
state_of_charge integer,
latitude        double precision,
longitude       double precision,
gear            integer,
speed           double precision
```

## Expected work

Finish files `collector.ts` and `writer.ts` in the `src` directory of this repo.

The collector should be able to take data from the MQTT broker and put them into an appropriate RabbitMQ queue. **Be aware that the data may be coming out of sync**. The gear is sent only when the driver changes it, speed is sometimes delayed and the battery info can be missing or come only for one battery at a time. Be sure to deal with this fact appropriately in a way the database records don't have missing data.

Next, the writer should take the data from the RabbitMQ queue and insert them into the given database table.

At the end of the process the database should contain rows with **5 second granularity** of the car's data for the given timestamp. Moreover, in the database we want the gear to be an integer with values (0-6, where N=0), speed to be in km/h and have only one state of charge. The overall state of charge should be computed as a weighted average of the underlying state of charge weighted by the batteries` capacity.

For this task you should work only with one car with id `1`. It has two batteries and you can assume their capacity doesn't change (upon reading it from the MQTT topic you can save it in the code as a constant).

## Finishing the assignment

Please make a fork of this repo and work in your own fork. After the completion share the forked repo link with your interviewer (make sure it is public) and wait for further instructions.

# How to start the Project
## Install Packages
`pnpm install`

## Start Docker compose
`docker-compose up`

## Prisma Setup
To .env add
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/postgres

Generate Prisma Client \
`npx prisma generate`

## Apply Prisma migrations (Optional)
Baseline script for Running Postgres Instance \
`npx prisma migrate resolve --applied 0_init`

Apply Migrations Changes \
`npx prisma migrate deploy`

Generate Prisma Client (Again) \
`npx prisma generate`

## Compile Project
`CTRL+SHIP+P > Tasks: Run Task > tsc: watch - src`

## Run Collector and Writer separately
`npm run collector:dist`
`npm run writer:dist`