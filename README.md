# SQLite + Worker 💼

A worker-thread wrapper implementing [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) that offloads database operations to a background thread. Simple API, minimal setup, maximum performance.

## Installation
```bash
npm install @misterpea/sqlite-worker-db
```

## Setup
You must provide:
1. **Schema path** - absolute path to your `.sql` schema file
2. **Database path** - absolute path where the database file should live (created if it doesn't exist)
```typescript
import { DB, DbConfig } from '@misterpea/sqlite-worker-db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: DbConfig = {
  schemaPath: path.join(__dirname, './schemas/my_schema.sql'),
  dbPath: path.join(__dirname, './sqlite/myDb.db')
};

const db = new DB(config);
```

## API
| Method       | Description                                    | Returns                        |
| ------------ | ---------------------------------------------- | ------------------------------ |
| `getData`    | Get the first matching row                     | `Promise<Object \| undefined>` |
| `getAllData` | Get all matching rows                          | `Promise<Object[]>`            |
| `insertData` | Bulk-insert rows (uses transactions)           | `Promise<{inserted: number}>`  |
| `setData`    | Run `UPDATE`, `DELETE`, or other queries           | `Promise<{set: number}>`       |
| `shutdown`   | Gracefully close database and terminate worker | `Promise<'ok'>`                |

## Examples

#### `getData` - Query single row
```typescript
const query = `
  SELECT * FROM innies WHERE id = ?`;

const myInnie = await db.getData(query, ['123']);
// Returns: { id: '123', name: 'Mark S', ... } or undefined
```
#### `getAllData` - Query multiple rows
```typescript
const query = `SELECT * FROM employees WHERE department = ?`;

const employees = await db.getAllData(query, ['MDR']);
// Returns: [{ id: 1, name: 'Mark S' }, { id: 2, name: 'Helly R' }]
```

#### `insertData` - Bulk insert with transaction
```typescript
const employees = [
  [1, 'Mark S', 'MDR'],
  [2, 'Helly R', 'MDR'],
  [3, 'Burt G', 'O&D'],
  [4, 'Doug Graner', 'Security'],
];

const query = `
  INSERT INTO employees (id, name, department)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`;

const result = await db.insertData(query, employees);
// Returns: { inserted: 4 }
```
#### `setData` - Update or delete data
```typescript
const query = `
  UPDATE jobs 
  SET status = ?, 
  updated_at = CURRENT_TIMESTAMP 
  WHERE id = ?
`;

const result = await db.setData(query, ['complete', 123]);
// Returns: { set: 2 } (number of params set)
```
#### `shutdown` - Shutdown
```typescript
await db.shutdown();
// Returns: 'ok'
// Worker thread is terminated, database connection closed
```
## Requirements

- Node.js >= 18.0.0
- ESM module support

## Why use a worker thread?

SQLite operations block the main thread. By moving them to a worker:
- Your app stays responsive during large queries
- Bulk inserts don't freeze the event loop
- Multiple concurrent queries are queued and handled efficiently

## License
MIT