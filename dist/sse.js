"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSSEHeaders = setupSSEHeaders;
exports.bridgeToSSE = bridgeToSSE;
/**
 * Sets up standard Server-Sent Events (SSE) headers on the response object.
 * Compatible with Node.js http.ServerResponse and Express Response.
 * @param res The response object
 */
function setupSSEHeaders(res) {
    if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // Ensure flushing validation
        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }
    }
}
/**
 * Bridges Agent events to a Server-Sent Events (SSE) stream.
 * Automatically attaches listeners to the agent and writes formatted SSE events to the response.
 *
 * @param res The response object (Node.js or Express)
 * @param agent The Agent instance to listen to
 */
function bridgeToSSE(res, agent) {
    const sendEvent = (event, data) => {
        // We use JSON.stringify to safely serialize the data (strings or objects)
        // This handles newlines and special characters correctly in the SSE format.
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        // Optional: Flush if method exists (some environments need explicit flush)
        if (typeof res.flush === 'function') {
            res.flush();
        }
    };
    // Listen to 'token' events for streaming
    const tokenListener = (token) => {
        sendEvent('token', token);
    };
    // Listen to 'response' event for final completion
    const responseListener = (response) => {
        sendEvent('response', response);
        cleanup();
        res.end();
    };
    // Listen to 'error' event
    const errorListener = (error) => {
        sendEvent('error', error);
        cleanup();
        res.end();
    };
    // Cleanup listeners to avoid memory leaks if the agent is reused (though usually one-off)
    const cleanup = () => {
        agent.off('token', tokenListener);
        agent.off('response', responseListener);
        agent.off('error', errorListener);
    };
    agent.on('token', tokenListener);
    agent.on('response', responseListener);
    agent.on('error', errorListener);
    // Handle client disconnect if possible
    if (res.on) {
        res.on('close', cleanup);
    }
}
