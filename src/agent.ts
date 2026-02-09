
import { EventEmitter } from 'events';
import { AgentConfig, AgentResponse, AgentTool, LLMProvider, AgentMessage } from './types';

export class Agent extends EventEmitter {
    private config: AgentConfig;
    private provider: LLMProvider;

    constructor(config: AgentConfig) {
        super();
        this.config = config;
        this.provider = config.provider;
    }

    async run(inputContext: string | AgentMessage[]): Promise<AgentResponse> {
        this.emit('start', { timestamp: Date.now(), inputContext });
        const startTime = Date.now();

        // 1. Initialize message history
        let messages: AgentMessage[] = [];
        if (Array.isArray(inputContext)) {
            messages = [...inputContext];
        } else {
            const content = typeof inputContext === 'string' ? inputContext : String(inputContext);
            const userContent = this.config.prompt ? `${this.config.prompt}\n\n${content}` : content;
            messages.push({ role: 'user', content: userContent });
        }

        // Persistence: Save initial User Message if it's new
        if (typeof inputContext === 'string' && this.config.saveFunction) {
            try {
                const lastMsg = messages[messages.length - 1];
                await this.config.saveFunction(lastMsg);
            } catch (err) {
                console.error("Failed to save user message:", err);
            }
        }

        let iterations = 0;
        const maxIterations = this.config.max_tool_iterations || 1;
        let lastResponse: AgentResponse | null = null;

        try {
            while (iterations < maxIterations) {
                iterations++;

                const response = await this.provider.generate(
                    this.config.system,
                    messages,
                    this.config.files,
                    this.config.tools,
                    this.config.config,
                    this.config.output_schema,
                    (token) => this.emit('token', token)
                );

                lastResponse = response;

                // Capture the original text as the "message" (LLM's primary text response)
                if (typeof response.content === 'string') {
                    lastResponse.message = response.content;
                }

                // Handle Tool Execution
                if (response.tool_calls && this.config.tools) {
                    // Add Assistant's tool call message to history
                    const assistantMsg: AgentMessage = {
                        role: 'assistant',
                        content: response.content || null,
                        tool_calls: response.tool_calls
                    };
                    messages.push(assistantMsg);

                    if (this.config.saveFunction) {
                        await this.config.saveFunction(assistantMsg);
                    }

                    let lastToolResult = null;
                    for (const call of response.tool_calls) {
                        const tool = this.config.tools.find(t => t.name === call.name);
                        if (tool) {
                            try {
                                this.emit('tool_start', { tool: tool.name, arguments: call.arguments });
                                const result = await tool.execute(call.arguments);
                                this.emit('tool_end', { tool: tool.name, result });
                                lastToolResult = result;

                                const toolMsg: AgentMessage = {
                                    role: 'tool',
                                    tool_call_id: call.id,
                                    name: tool.name,
                                    content: typeof result === 'string' ? result : JSON.stringify(result)
                                };
                                messages.push(toolMsg);

                                if (this.config.saveFunction) {
                                    await this.config.saveFunction(toolMsg);
                                }
                            } catch (e) {
                                console.error(`Error executing tool ${tool.name}:`, e);
                                // Add error as tool result so LLM knows what happened
                                const errorMsg: AgentMessage = {
                                    role: 'tool',
                                    tool_call_id: call.id,
                                    name: tool.name,
                                    content: `Error: ${e instanceof Error ? e.message : String(e)}`
                                };
                                messages.push(errorMsg);
                            }
                        }
                    }

                    // For the "Intent Detection" pattern (maxIterations = 1), 
                    // we return the last tool result as the content to preserve legacy behavior.
                    if (maxIterations === 1 && lastToolResult !== null) {
                        lastResponse.content = lastToolResult;
                    }

                    // If we have more iterations, continue the loop
                    if (iterations < maxIterations) {
                        continue;
                    }
                }

                // If no tool calls OR we reached limit, break and return
                break;
            }
        } catch (error: any) {
            this.emit('error', {
                error_key: 'execution_error',
                message: error.message || String(error),
                details: error
            });
            throw error;
        }

        if (!lastResponse) {
            throw new Error("Agent failed to generate a response");
        }

        // Add latency to meta
        lastResponse.meta.latency_ms = Date.now() - startTime;

        // Persistence: Save Final Assistant Response
        if (this.config.saveFunction) {
            try {
                await this.config.saveFunction({
                    role: 'assistant',
                    content: lastResponse.content,
                    usage: lastResponse.usage,
                    meta: lastResponse.meta
                });
            } catch (err) {
                console.error("Failed to save assistant response:", err);
            }
        }

        this.emit('response', lastResponse);
        return lastResponse;
    }
}
