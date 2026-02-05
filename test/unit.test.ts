import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('worker_threads', async () => {
  // Import EventEmitter here, as the mock is hoisted ahead of the import
  const { EventEmitter } = await import('node:events');

  // Define MockWorker inside the factory
  class MockWorkerClass extends EventEmitter {
    postMessage: any;
    terminate: any;

    constructor(...args: any[]) {
      super();
      this.postMessage = vi.fn();
      this.terminate = vi.fn();
    }

    // Helper to simulate worker sending a response
    _simulateResponse(message: any) {
      this.emit('message', message);
    }

    // Helper to simulate worker error
    _simulateError(error: Error) {
      this.emit('error', error);
    }
  }

  return {
    Worker: MockWorkerClass
  };
});

import { DB } from '../src/db.js';

describe('DB Unit Tests - Message Protocol - setup', () => {
  let db: any;
  let mockWorker: any;

  beforeEach(() => {
    db = new DB({
      dbPath: '/fake/path/db.db',
      schemaPath: '/fake/path/schema.sql'
    });

    mockWorker = db.worker;
  });

  // Setup call
  it('should send setup message on construction', () => {

    // The constructor should have sent a setup message
    expect(mockWorker.postMessage).toHaveBeenCalled();

    const calls = mockWorker.postMessage.mock.calls;
    const setupCall = calls.find((call: any) => call[0].type === 'setup');

    expect(setupCall).toBeDefined();
    expect(setupCall[0]).toMatchObject({
      type: 'setup',
      params: {
        config: {
          dbPath: '/fake/path/db.db',
          schemaPath: '/fake/path/schema.sql'
        }
      }
    });
  });
});

describe('DB Unit Tests - Message Protocol - post-setup', () => {
  let db: any;
  let mockWorker: any;

  beforeEach(async () => {
    db = new DB({
      dbPath: '/fake/path/db.db',
      schemaPath: '/fake/path/schema.sql'
    });

    mockWorker = db.worker;
    const setupCall = mockWorker.postMessage.mock.calls.find((c: any) => c[0].type === 'setup');
    mockWorker._simulateResponse({
      id: setupCall[0].id,
      result: { success: true }
    });

    // Wait a tick for the async init to process
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clear the mock to make assertions cleaner
    mockWorker.postMessage.mockClear();
  });

  // getData
  it('should resolve getData promise when worker responds', async () => {
    const resultPromise = db.getData('SELECT * FROM users', []);

    // Get the message that was sent
    const call = mockWorker.postMessage.mock.calls[0][0];
    expect(call.type).toBe('get');
    expect(call.sql).toBe('SELECT * FROM users');

    // Simulate worker response
    mockWorker._simulateResponse({
      id: call.id,
      result: { id: 1, name: 'Alice' }
    });

    const result = await resultPromise;
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('should reject getData promise when worker responds with error', async () => {
    const resultPromise = db.getData('SELECT * FROM nonexistent', []);

    const call = mockWorker.postMessage.mock.calls[0][0];

    // Simulate worker error response
    mockWorker._simulateResponse({
      id: call.id,
      error: 'no such table: nonexistent'
    });

    // Assert
    await expect(resultPromise).rejects.toThrow('no such table: nonexistent');
  });

  it('should handle multiple concurrent operations with different IDs', async () => {

    // Act - fire off 3 operations without awaiting
    const promise1 = db.getData('SELECT 1', []);
    const promise2 = db.getData('SELECT 2', []);
    const promise3 = db.getData('SELECT 3', []);

    // Get the calls
    const calls = mockWorker.postMessage.mock.calls;
    expect(calls).toHaveLength(3);

    // Each should have a unique ID
    const ids = calls.map((c: any) => c[0].id);
    expect(new Set(ids).size).toBe(3); // All unique

    // Simulate responses in DIFFERENT order than requests
    mockWorker._simulateResponse({ id: ids[1], result: { value: 2 } });
    mockWorker._simulateResponse({ id: ids[0], result: { value: 1 } });
    mockWorker._simulateResponse({ id: ids[2], result: { value: 3 } });

    // Assert - each promise should resolve with its OWN result
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
    expect(result1).toEqual({ value: 1 });
    expect(result2).toEqual({ value: 2 });
    expect(result3).toEqual({ value: 3 });
  });

  it('should send shutdown message and resolve promise', async () => {
    const shutdownPromise = db.shutdown();

    const call = mockWorker.postMessage.mock.calls[0][0];
    expect(call.type).toBe('shutdown');

    mockWorker._simulateResponse({ id: call.id, result: 'ok' });

    const result = await shutdownPromise;
    expect(result).toBe('ok');
  });
});

describe('DB Unit Tests - Queue Mechanism', () => {
  let db: any;
  let mockWorker: any;

  beforeEach(() => {
    // Create fresh instance - setup NOT completed
    db = new DB({
      dbPath: '/fake/db.db',
      schemaPath: '/fake/schema.sql'
    });
    mockWorker = db.worker;
  });

  it('should queue operations until setup completes, then flush in FIFO order', async () => {
    // Arrange - get the setup call ID but don't respond yet
    const setupCall = mockWorker.postMessage.mock.calls.find((c: any) => c[0].type === 'setup');
    const setupId = setupCall[0].id;

    // Clear mock to make tracking easier
    mockWorker.postMessage.mockClear();

    // Act - queue up 3 operations BEFORE setup completes
    const p1 = db.getData('SELECT 1', []);
    const p2 = db.getAllData('SELECT 2', []);
    const p3 = db.insertData('INSERT INTO users VALUES (?)', [['data']]);

    // Assert - nothing sent to worker yet (operations are queued)
    expect(mockWorker.postMessage).not.toHaveBeenCalled();

    // Now complete setup - this should trigger queue flush
    mockWorker._simulateResponse({ id: setupId, result: { success: true } });

    // Give the async flush a moment
    await new Promise(resolve => setTimeout(resolve, 10));

    // Now all 3 queued operations should have been sent
    expect(mockWorker.postMessage).toHaveBeenCalledTimes(3);

    // Verify FIFO order by checking the types in order
    const calls = mockWorker.postMessage.mock.calls;
    expect(calls[0][0].type).toBe('get');
    expect(calls[1][0].type).toBe('get_all');
    expect(calls[2][0].type).toBe('insert');

    // Simulate responses for all queued operations
    mockWorker._simulateResponse({ id: calls[0][0].id, result: { value: 1 } });
    mockWorker._simulateResponse({ id: calls[1][0].id, result: [{ value: 2 }] });
    mockWorker._simulateResponse({ id: calls[2][0].id, result: { inserted: 1 } });

    // All promises should now resolve
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toEqual({ value: 1 });
    expect(r2).toEqual([{ value: 2 }]);
    expect(r3).toEqual({ inserted: 1 });
  });
});
