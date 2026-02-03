import { Worker } from 'worker_threads';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Pending {
  resolve: (val: any) => void;
  reject: (err: any) => void;
}

export class DB {
  worker: Worker;
  private pending = new Map<string, Pending>();

  constructor(public schemaNameAndPath: string, public dbPath: string) {
    this.worker = new Worker(path.join(__dirname, './worker.mjs'));
    this.schemaNameAndPath = schemaNameAndPath;
    this.dbPath = dbPath;
    this.setup();

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

  async getData<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.sendToWorker('get', sql, params);
  }

  async getAllData<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.sendToWorker('get_all', sql, params);
  }

  async insertData(sql: string, paramSets: any[][]): Promise<{ inserted: number; }> {
    return this.sendToWorker('insert', sql, paramSets);
  }

  async setData(sql: string, params: any[]) {
    return this.sendToWorker('set', sql, params);
  }

  async shutdown() {
    return this.sendToWorker('shutdown');
  }

  private async runSetup(){
    
  }

  private async setup() {
    console.log("****************************************")
    return this.sendToWorker('setup', '', { schemaNameAndPath: this.schemaNameAndPath, dbPath: this.dbPath });
  }

  private sendToWorker(type: 'get' | 'get_all' | 'insert' | 'set' | 'shutdown' | 'setup', sql?: string, params?: any): Promise<any> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, sql, params });
    });
  }
}