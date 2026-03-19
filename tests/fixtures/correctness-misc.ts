/**
 * Test fixture: Miscellaneous Correctness Issues
 *
 * Covers COR-001 through COR-012 (except COR-007 which has its own fixture):
 *   COR-001: dead-code-after-return
 *   COR-002: unreachable-branch
 *   COR-003: missing-null-check
 *   COR-004: type-coercion-risk
 *   COR-005: incomplete-error-handling
 *   COR-006: unused-import
 *   COR-008: empty-catch-block
 *   COR-009: off-by-one-loop
 *   COR-010: async-without-await
 *   COR-011: incorrect-array-method-return
 *   COR-012: assignment-in-condition
 */

import { join } from 'node:path';     // COR-006: unused import (join is never used)
import { resolve } from 'node:path';

// COR-001: Dead code after return
function earlyReturn(x: number): number {
  if (x > 0) {
    return x;
    console.log('This is unreachable');  // Dead code
    const y = x + 1;                      // Dead code
    void y;
  }
  return -x;
}

// COR-002: Unreachable branch
function alwaysTrueBranch(x: number): string {
  if (x === x) {
    return 'always true';
  } else {
    return 'unreachable';  // This branch is never reached
  }
}

function constantCondition(): string {
  const flag = true;
  if (flag) {
    return 'always runs';
  }
  return 'never runs';  // Unreachable
}

// COR-003: Missing null check
function processUser(user: { name?: string; address?: { city: string } }): string {
  // Accessing nested property without null check
  const city = user.address!.city;  // Could be undefined
  return user.name!.toUpperCase() + ' from ' + city;
}

// COR-004: Type coercion risk
function riskyComparison(a: unknown, b: unknown): boolean {
  // Using == instead of === (loose equality)
  if (a == b) return true;    // Type coercion
  if (a == null) return true;  // This one is actually OK (null/undefined check)
  if (a == 0) return true;     // Type coercion
  return false;
}

// COR-005: Incomplete error handling
async function fetchData(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    return response.json();
  } catch {
    // Only logging, not re-throwing or returning a meaningful error
    console.error('Failed to fetch');
    // Missing: return value, re-throw, or error propagation
  }
}

// COR-008: Empty catch block
function silentFailure(): void {
  try {
    JSON.parse('invalid json');
  } catch {
    // Empty catch block — silently swallows errors
  }
}

function anotherSilentFailure(): number {
  try {
    return parseInt('not a number');
  } catch (_e) {
    // Still effectively empty — variable caught but unused
  }
  return 0;
}

// COR-009: Off-by-one loop
function processArray(items: string[]): void {
  // Off by one: should be i < items.length, not <=
  for (let i = 0; i <= items.length; i++) {
    console.log(items[i]);  // undefined on last iteration
  }
}

function reverseLoop(items: string[]): void {
  // Off by one in reverse: starts at length instead of length - 1
  for (let i = items.length; i >= 0; i--) {
    console.log(items[i]);  // undefined on first iteration
  }
}

// COR-010: Async without await
async function noAwait(): Promise<void> {
  // Async function without any await — misleading
  console.log('This function is async but never awaits');
  return;
}

async function callsAsyncButDoesntAwait(): Promise<void> {
  // Calls async function but doesn't await it (fire and forget)
  fetchData('http://example.com');  // Missing await
}

// COR-011: Incorrect array method return
function filterExample(): void {
  const numbers = [1, 2, 3, 4, 5];

  // forEach doesn't return anything — result is always undefined
  const result = numbers.forEach((n) => n * 2);
  void result;

  // map callback should return a value
  numbers.map((n) => {
    console.log(n);
    // Missing return statement
  });
}

// COR-012: Assignment in condition
function assignmentInIf(x: number): string {
  let y: number;
  // Assignment used in condition instead of comparison
  if (y = x) {
    return 'truthy';
  }
  return 'falsy';
}

// Safe usage (should NOT trigger)
function safeCode(): string {
  const items = [1, 2, 3];
  for (let i = 0; i < items.length; i++) {
    void items[i];
  }
  return resolve('/safe/path');
}

export {
  earlyReturn,
  alwaysTrueBranch,
  constantCondition,
  processUser,
  riskyComparison,
  fetchData,
  silentFailure,
  anotherSilentFailure,
  processArray,
  reverseLoop,
  noAwait,
  callsAsyncButDoesntAwait,
  filterExample,
  assignmentInIf,
  safeCode,
};
