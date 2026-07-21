// This approach is taken from https://github.com/vercel/next.js/tree/canary/examples/with-mongodb
import { Db, MongoClient, ServerApiVersion } from 'mongodb';
import 'server-only';

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
  // Fail fast rather than hanging on the driver's 30s default when MongoDB
  // is unreachable, so a connectivity blip surfaces as a quick per-request
  // error instead of piling up slow/stuck requests.
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
};

let client: MongoClient;
let db: Db;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClient?: MongoClient;
  };

  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(uri, options);
  }
  client = globalWithMongo._mongoClient;
  db = client.db();
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  db = client.db();
}

// The driver's topology monitors emit an `error` event on connection
// failures; left without a listener, Node's default EventEmitter behavior is
// to throw and crash the whole process, taking every in-flight request down
// with it instead of just failing the one hitting MongoDB.
client.on('error', (error) => {
  console.error('MongoDB client error:', error);
});

// Export a module-scoped MongoClient. By doing this in a
// separate module, the client can be shared across functions.
export default db;
