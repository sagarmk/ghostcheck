/**
 * Worker thread pool for parallel file analysis.
 *
 * Uses Node.js worker_threads to distribute AST parsing and rule
 * execution across multiple CPU cores. Each worker processes one
 * file at a time and returns findings.
 */

import type { Finding } from './types.js';

/**
 * Message sent to a worker thread.
 */
export interface WorkerTask {
  readonly type: 'analyze';
  readonly filePath: string;
  readonly language: string;
  readonly ruleIds: readonly string[];
  readonly parseTimeout: number;
}

/**
 * Result returned from a worker thread.
 */
export interface WorkerResult {
  readonly type: 'result';
  readonly filePath: string;
  readonly findings: readonly Finding[];
  readonly durationMs: number;
  readonly cached: boolean;
  readonly error?: string;
}

/**
 * Worker pool configuration.
 */
export interface WorkerPoolConfig {
  /** Number of worker threads */
  readonly size: number;
  /** Path to the worker script */
  readonly workerScript: string;
}

/**
 * Worker pool placeholder — will use worker_threads in implementation.
 *
 * The pool manages a fixed number of workers, distributes file analysis
 * tasks, and collects results. Workers are reused across files.
 */
export class WorkerPool {
  private readonly _config: WorkerPoolConfig;
  private _running = false;

  constructor(config: WorkerPoolConfig) {
    this._config = config;
  }

  get size(): number {
    return this._config.size;
  }

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * Start the worker pool.
   */
  start(): Promise<void> {
    // TODO: Spawn worker_threads
    this._running = true;
    return Promise.resolve();
  }

  /**
   * Submit a file for analysis and return findings.
   */
  analyze(task: WorkerTask): Promise<WorkerResult> {
    // TODO: Route to available worker
    return Promise.resolve({
      type: 'result' as const,
      filePath: task.filePath,
      findings: [],
      durationMs: 0,
      cached: false,
    });
  }

  /**
   * Gracefully shut down all workers.
   */
  shutdown(): Promise<void> {
    // TODO: Terminate worker threads
    this._running = false;
    return Promise.resolve();
  }
}
