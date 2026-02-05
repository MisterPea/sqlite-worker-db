import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../src/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DB Integration Tests', () => {
  let db: DB;
  const testDbPath = path.join(__dirname, '../test-tmp/test.db');
  const testSchemaPath = path.join(__dirname, './fixtures/test-schema.sql');

  beforeEach(async () => {
    // Make sure test-tmp directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create new DB instance with test paths
    db = new DB({
      dbPath: testDbPath,
      schemaPath: testSchemaPath
    });

    // Give the worker a moment to initialize
    // ** This is for testing only - real-world has a safety queue
    // ** to prevent jobs before db is set
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Shutdown db
    await db.shutdown();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      fs.rmdirSync(path.dirname(testDbPath));
    }
  });

  // Insert
  it('should insert data and return the count of inserted records', async () => {
    const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';
    const paramSets = [
      ['Alice', 'alice@example.com'],
      ['Bob', 'bob@example.com'],
      ['Charlie', 'charlie@example.com']
    ];

    const result = await db.insertData(sql, paramSets);
    expect(result).toEqual({ inserted: 3 });
  });

  // Get ALl
  it('should retrieve multiple rows with getAllData', async () => {
    await db.insertData(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [
        ['Alice', 'alice@example.com'],
        ['Bob', 'bob@example.com'],
        ['Charlie', 'charlie@example.com']
      ]
    );

    const results = await db.getAllData('SELECT * FROM users ORDER BY name');

    expect(results).toHaveLength(3);
    expect(results?.[0]).toMatchObject({ name: 'Alice' });
    expect(results?.[1]).toMatchObject({ name: 'Bob' });
    expect(results?.[2]).toMatchObject({ name: 'Charlie' });
  });

  // Set
  it('should update data with setData', async () => {
    await db.insertData(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [['Alice', 'alice@example.com']]
    );

    const setResult = await db.setData(
      'UPDATE users SET email = ? WHERE name = ?',
      ['alice.new@example.com', 'Alice']
    );

    // 2 params were ser
    expect(setResult).toEqual({ set: 2 });

    const updated = await db.getData('SELECT email FROM users WHERE name = ?', ['Alice']);
    expect(updated?.email).toBe('alice.new@example.com');
  });

  // Bulk insert
  it('should handle transactions correctly in bulk insert', async () => {
    const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';
    const largeBatch = Array.from({ length: 100 }, (_, i) => [
      `User${i}`,
      `user${i}@example.com`
    ]);

    const result = await db.insertData(sql, largeBatch);

    expect(result.inserted).toBe(100);

    const count = await db.getData('SELECT COUNT(*) as count FROM users');
    expect(count?.count).toBe(100);
  });

  // no return
  it('should return undefined when getData finds no matching row', async () => {
    const result = await db.getData(
      'SELECT * FROM users WHERE name = ?',
      ['NonexistentUser']
    );

    expect(result).toBeUndefined();
  });

  it('should return empty array when getAllData finds no rows', async () => {
    const results = await db.getAllData('SELECT * FROM users WHERE name = ?', ['Nobody']);

    expect(results).toEqual([]);
  });
});
