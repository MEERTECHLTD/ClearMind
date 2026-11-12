/** Agent error with a stable code (mapped to HTTP status by the REST API and to isError by MCP). */
export class AgentError extends Error {
  constructor(public code: 'unauthorized' | 'forbidden' | 'rate_limited' | 'invalid' | 'not_found' | 'conflict' | 'confirm_required', message: string, public data?: unknown) { super(message); }
}
