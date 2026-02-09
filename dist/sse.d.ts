import { Agent } from './agent';
/**
 * Sets up standard Server-Sent Events (SSE) headers on the response object.
 * Compatible with Node.js http.ServerResponse and Express Response.
 * @param res The response object
 */
export declare function setupSSEHeaders(res: any): void;
/**
 * Bridges Agent events to a Server-Sent Events (SSE) stream.
 * Automatically attaches listeners to the agent and writes formatted SSE events to the response.
 *
 * @param res The response object (Node.js or Express)
 * @param agent The Agent instance to listen to
 */
export declare function bridgeToSSE(res: any, agent: Agent): void;
