// db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Enable verbose mode for debugging (optional)
sqlite3.verbose();

export async function connectToDatabase() {
  const db = await open({
    filename: './telemedicine.db', // or wherever you'd like the DB to live
    driver: sqlite3.Database
  });

  console.log('Connected to SQLite database');
  return db;
}