import mongoose from 'mongoose';

const URI = process.env.teamtaskos_MONGODB_URI;
if (!URI) throw new Error('Missing MONGODB_URI');

let cached = global._mongoose || (global._mongoose = { conn: null, promise: null });

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) cached.promise = mongoose.connect(URI, { bufferCommands: false, dbName: process.env.DB_NAME });
  cached.conn = await cached.promise;
  return cached.conn;
}
