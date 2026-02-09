import { Agent } from './agent';
import { AgentResponse } from './types';
/**
 * Configuration for a single agent in the chain
 */
export interface ChainStep {
    agent: Agent;
    input: string | any[] | ((previousResults: AgentResponse[]) => string | any[] | any);
}
/**
 * Result of executing a chain of agents
 */
export interface ChainResult {
    results: AgentResponse[];
    totalLatency: number;
    totalTokens: number;
}
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
export declare function chain(steps: ChainStep[]): Promise<ChainResult>;
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
export declare function simpleChain(agents: Agent[], initialInput: string | any[]): Promise<ChainResult>;
