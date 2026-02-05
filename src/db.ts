import { Worker } from 'worker_threads';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import {
  DbConfig,
  GetAllData,
  GetAllDataRtn,
  GetData,
  GetDataRrn,
  InsertData,
  InsertDataRtn,
  QueuedJob,
  SendToWorker,
  SetData,
  SetDataRtn,
  ShutdownRtn
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Pending {
  resolve: (val: any) => void;
  reject: (err: any) => void;
}

/**
 * Private function to spawn a new worker. 
 * Needed because Node does not share loaders between threads. 
 * So we have to bootstrap tsx inside the worker
 * @returns {Worker} 
 */
function _spawnWorker(tsFilename: string, jsFilename: string): Worker {
  const parentFolder = path.basename(__dirname);
  const tsWorkPath = path.join(__dirname, tsFilename);
  const jsWorkPath = path.join(__dirname, jsFilename);

  if (parentFolder === 'dist') return new Worker(jsWorkPath);
  return new Worker(`import('tsx/esm/api').then(({ register }) => { 
    register(); 
    import('${tsWorkPath}') 
    })`,
    { eval: true });
}

export class DB {
  worker: Worker;
  private pending = new Map<string, Pending>();
  private setupComplete: boolean;
  private queue: any[];

  constructor(public config: DbConfig) {
    this.queue = [];
    this.setupComplete = false;
    this.worker = _spawnWorker('worker.ts', 'worker.js');
    this.config = config;
    this.init();

    this.worker.on('message', ({ id, result, error }) => {
      const pending = this.pending.get(id);
      if (!pending) return;
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
      this.pending.delete(id);
    });

    this.worker.on('error', (err) => {
      console.error('[DB Worker Error]', err);
    });
  }

  /**
   * Private method to initiate the database setup if needed
   */
  private async init() {
    if (!this.setupComplete) {
      try {
        await this.sendToWorker('setup', '', { config: this.config });
        this.setupComplete = true;
        this.flushQueue();
      } catch (err) {
        this.queue.length = 0;
      }
    }
  }

  /**
   * Method to get the first matching result
   * @param {string} sql SQLite query 
   * @param {any[]} params Array of any matching params
   * @returns {Promise<object>} Returns Promise - Object
   */
  async getData(...args: GetData): GetDataRrn {
    const [sql, params = []] = args;
    return this.sendToWorker('get', sql, params);
  }

  /**
   * Method to get all matching data
   * @param {string} sql SQLite query 
   * @param {any[]} params Array of any matching params
   * @returns {Promise<object[]>} Returns Promise - Object[]
   */
  async getAllData(...args: GetAllData): GetAllDataRtn {
    const [sql, params = []] = args;
    return this.sendToWorker('get_all', sql, params);
  }

  /**
   * Method to bulk-insert data
   * @param {string} sql SQLite query 
   * @param {any[][]} paramSets Array of arrays containing data to be inserted
   * @returns {Promise<{inserted: number}>} Returns Promise - with number of records inserted
   */
  async insertData(...args: InsertData): InsertDataRtn {
    const [sql, paramSets] = args;
    return this.sendToWorker('insert', sql, paramSets);
  }

  /**
   * Method to set data
   * @param {string} sql SQLite query 
   * @param {any[]} params Array of params to set
   * @returns {Promise<{set: number}>} Returns Promise - with number of records set
   */
  async setData(...args: SetData): SetDataRtn {
    const [sql, params = []] = args;
    return this.sendToWorker('set', sql, params);
  }

  /**
   * Method to gracefully shut down the Database
   * @returns {Promise<any>} Returns 'ok' when shutdown is completed
   */
  async shutdown(): ShutdownRtn {
    return this.sendToWorker('shutdown');
  }

  /**
   * Private method to flush the queue when setup is complete
   */
  private async flushQueue() {
    while (this.queue.length) {
      // shift() for FIFO
      const job: QueuedJob | undefined = this.queue.shift();
      if (!job) break;

      const { id, type, sql, params, resolve, reject } = job;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, sql, params });
    }
  }

  /**
   * Private method to handle worker communication
   * @param type 
   * @param sql 
   * @param params 
   * @returns 
   */
  private sendToWorker(...args: SendToWorker): Promise<any> | void {
    const [type, sql = '', params = []] = args;
    const id = uuidv4();

    return new Promise((resolve, reject) => {
      if (type !== 'setup' && this.setupComplete === false) {

        // If job hits before setup, queue it w/promise callbacks
        this.queue.push({
          type,
          sql,
          params,
          id,
          resolve,
          reject
        });
      } else {

        // Normal path
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, type, sql, params });
      }
    });
  }
}