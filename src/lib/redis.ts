import Redis from "ioredis";

let redisClient: Redis | undefined;

export function getRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required to connect to Redis");

  redisClient ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  return redisClient;
}

export async function checkRedisConnection() {
  await getRedis().ping();
}

export async function closeRedisConnection() {
  const client = redisClient;
  redisClient = undefined;
  client?.disconnect();
}

