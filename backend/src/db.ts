import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolveDatabaseConfig } from './db-config';

dotenv.config();

let pool: Pool;

export const getPool = () => {
  if (pool) return pool;

  const isProduction = process.env.NODE_ENV?.includes('production');
  const dbConfig = process.env.DATABASE_URL 
    ? resolveDatabaseConfig(process.env.DATABASE_URL)
    : {
        user: process.env.DB_USER || 'admin',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'finalcut_social',
        password: process.env.DB_PASSWORD || 'password',
        port: parseInt(process.env.DB_PORT || '5432'),
        ssl: false as const,
      };

  console.log(`Initializing pool with ${process.env.DATABASE_URL ? 'connection string' : 'params'}`);
  
  pool = new Pool(dbConfig);

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
};

export default {
    query: (text: string, params?: any[]) => getPool().query(text, params)
};
