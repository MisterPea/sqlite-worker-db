export type DbConfig = {
  schemaPath: string,
  dbPath: string;
};

export type WorkerCallType = 'get' | 'get_all' | 'insert' | 'set' | 'shutdown' | 'setup';

export type GetData = [sql: string, params?: any[]];
export type GetDataRrn = Promise<Record<string, any> | undefined>;

export type GetAllData = [sql: string, params?: any[]];
export type GetAllDataRtn = Promise<Record<string, any>[] | undefined>;

export type InsertData = [sql: string, paramsSets: any[][]];
export type InsertDataRtn = Promise<{ inserted: number; }>;

export type SetData = [sql: string, params?: any[]];
export type SetDataRtn = Promise<{ set: number; }>;

export type ShutdownRtn = Promise<any>;

export type QueuedJob = {
  id: string;
  type: WorkerCallType;
  sql: string;
  params: any[];
  resolve: (val: any) => void;
  reject: (err: any) => void;
};

export type SendToWorker = [type: WorkerCallType, sql?: string, params?: any[] | {}];