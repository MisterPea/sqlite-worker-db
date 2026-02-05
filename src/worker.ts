import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import { testFolderLocation } from './helpers.js';
import fs from 'node:fs';

let db: Database.Database | undefined = undefined;

parentPort?.on('message', async (message) => {

  if (!parentPort) throw new Error('Message port not established');

  const { id, type, sql, params } = message;

  // Initial setup called from class constructor
  if (type === 'setup') {
    const { config } = params;
    const { schemaPath, dbPath } = config;

    // Establish db location;
    testFolderLocation(dbPath);

    // Start db
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 3000');
    console.info('Database started');

    // Reads in schema on startup
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    parentPort.postMessage({ id, result: { success: true } });
    return;
  }

  if (!db) throw new Error('Database not available');

  // Shutdown db
  if (type === 'shutdown') {
    db.close();              // closes better-sqlite3
    parentPort.postMessage({ id, result: 'ok' });
    parentPort.close();      // stop the message port
    return;                  // let the worker exit naturally
  }

  try {
    const stmt = db.prepare(sql);

    let result;

    if (type === 'get') {
      result = stmt.get(...params);
    }

    else if (type === 'get_all') {
      result = stmt.all(...params);
    }

    else if (type === 'set') {
      stmt.bind(...params).run();
      result = { set: params.length };
    }

    else if (type === 'insert') {
      let recordsInserted = 0;
      const insertMany = db.transaction((rows) => {
        for (const paramSet of rows) {
          const rows = stmt.run(...paramSet);

          // keep track of num row inserted per iteration
          recordsInserted += rows.changes;
        }
      });
      insertMany(params);
      result = { inserted: recordsInserted };
    }

    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: JSON.stringify((error as Error).message) });
  }
});
