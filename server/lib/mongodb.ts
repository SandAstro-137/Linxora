import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongoDB(): Promise<Db | null> {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.warn('MONGODB_URI not configured, using in-memory storage');
    return null;
  }

  try {
    if (!client) {
      client = new MongoClient(mongoUri);
      await client.connect();
      db = client.db();
      console.log('Connected to MongoDB successfully');
    }
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    console.warn('Falling back to in-memory storage');
    return null;
  }
}

export function getDB(): Db | null {
  return db;
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
