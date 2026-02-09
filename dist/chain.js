"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chain = chain;
exports.simpleChain = simpleChain;
/**
 * Chains multiple agents to run sequentially.
 * Each agent waits for the previous one to complete before starting.
 *
 * @param steps - Array of chain steps, each containing an agent and its input
 * @returns Promise that resolves with all agent responses
 *
 * @example
 * ```typescript
 * const result = await chain([
 *   { agent: chatBot, input: 'Hello' },
 *   { agent: planner, input: (results) => results[0].content },
 *   { agent: executor, input: (results) => JSON.stringify(results[1].content) }
 * ]);
 *
 * console.log(result.results[0].content); // First agent output
 * console.log(result.results[1].content); // Second agent output
 * console.log(result.totalTokens); // Total tokens used
 * ```
 */
async function chain(steps) {
    const results = [];
    let totalLatency = 0;
    let totalTokens = 0;
    for (const step of steps) {
        // Determine the input for this agent
        let input;
        if (typeof step.input === 'function') {
            input = step.input(results);
        }
        else {
            input = step.input;
        }
        // Run the agent and wait for completion
        const response = await new Promise((resolve, reject) => {
            // Set up one-time listeners
            const onResponse = (res) => {
                cleanup();
                resolve(res);
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            const cleanup = () => {
                step.agent.removeListener('response', onResponse);
                step.agent.removeListener('error', onError);
            };
            step.agent.once('response', onResponse);
            step.agent.once('error', onError);
            // Start the agent
            step.agent.run(input).catch(reject);
        });
        // Collect results
        results.push(response);
        totalLatency += response.meta.latency_ms || 0;
        totalTokens += response.usage?.total_tokens || 0;
    }
    return {
        results,
        totalLatency,
        totalTokens
    };
}
/**
 * Simplified chain function that accepts just agents and uses previous output as next input.
 * The first agent must be provided with an initial input separately.
 *
 * @param agents - Array of agents to chain
 * @param initialInput - Input for the first agent
 * @returns Promise that resolves with all agent responses
 *
 * @example
 * ```typescript
 * const result = await simpleChain([chatBot, planner, executor], 'Hello');
 * // Each agent receives the previous agent's content as input
 * ```
 */
async function simpleChain(agents, initialInput) {
    const steps = agents.map((agent, index) => ({
        agent,
        input: index === 0
            ? initialInput
            : (results) => results[index - 1].content
    }));
    return chain(steps);
}
