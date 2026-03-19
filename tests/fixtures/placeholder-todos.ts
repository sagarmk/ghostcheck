/**
 * Test fixture: Placeholder TODO Stubs (COR-007)
 *
 * Contains TODO comments, FIXME markers, placeholder implementations,
 * and incomplete code stubs. These are extremely common in AI-generated
 * code where the LLM acknowledges it hasn't fully implemented something.
 *
 * Expected: Each placeholder should trigger COR-007 with severity 'warn'
 */

// Basic TODO comments
// TODO: Implement authentication
function authenticate(username: string, password: string): boolean {
  void username;
  void password;
  return true; // TODO: Actually validate credentials
}

// FIXME markers
function calculateTax(amount: number): number {
  // FIXME: Tax calculation is wrong for international orders
  return amount * 0.1;
}

// HACK markers
function parseDate(dateStr: string): Date {
  // HACK: This is a temporary workaround, needs proper date parsing
  return new Date(dateStr);
}

// XXX markers
function validateInput(input: string): boolean {
  // XXX: This validation is incomplete
  return input.length > 0;
}

// Placeholder implementations
function processPayment(_amount: number): { success: boolean } {
  // TODO: Integrate with Stripe
  throw new Error('Not implemented');
}

function sendEmail(_to: string, _subject: string): void {
  // TODO: Implement email sending
  console.log('Email sending not implemented yet');
}

function generateReport(): string {
  // FIXME: Implement actual report generation
  return 'placeholder report';
}

// Stub functions that return default values
function fetchUserProfile(_userId: string): Record<string, unknown> {
  // TODO: Fetch from API
  return {};
}

function computeDiscount(_items: unknown[]): number {
  // Implementation pending
  return 0;
}

// Incomplete error handling
function riskyOperation(): void {
  try {
    // TODO: Add actual implementation
  } catch {
    // TODO: Handle error properly
  }
}

// Multiple TODOs in one function
function complexOperation(data: unknown[]): unknown[] {
  // TODO: Validate input data
  // TODO: Transform data
  // TODO: Apply business rules
  // FIXME: Handle edge cases
  // HACK: Temporary implementation
  return data;
}

// Safe examples (should NOT trigger COR-007)
function wellImplemented(x: number): number {
  // This comment mentions a past TODO that was resolved
  // The following calculation handles all edge cases
  if (x <= 0) return 0;
  return Math.sqrt(x) * 2;
}

export {
  authenticate,
  calculateTax,
  parseDate,
  validateInput,
  processPayment,
  sendEmail,
  generateReport,
  fetchUserProfile,
  computeDiscount,
  riskyOperation,
  complexOperation,
  wellImplemented,
};
