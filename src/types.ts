
import { z } from 'zod';

export interface AgentMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | any;
    name?: string;
    tool_calls?: any[];
    tool_call_id?: string;
    usage?: any;
    meta?: any;
}

export interface AgentConfig {
    name: string;
    provider: LLMProvider;
    prompt?: string;
    system?: string;
    files?: string[]; // Paths to files
    config?: Record<string, any>;
    tools?: AgentTool[];
    output_schema?: z.ZodType<any>;
    saveFunction?: (message: AgentMessage) => Promise<void> | void; // Persistence hook
    max_tool_iterations?: number;
}

export interface AgentTool {
    name: string;
    description: string;
    parameters: z.ZodType<any>;
    execute: (args: any) => Promise<any>;
}

export interface AgentResponse {
    content: string | object;
    tool_calls?: any[]; // Internal use for loop handling
    message?: string; // LLM's original text response (useful when combined with tool calls)
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        reasoning_tokens?: number;
    };
    meta: {
        model: string;
        latency_ms: number;
        [key: string]: any;
    };
}

export interface AgentEvent {
    type: 'start' | 'token' | 'tool_start' | 'tool_end' | 'response' | 'error' | 'log';
    payload: any;
}

export interface AgentError {
    error_key: 'network_error' | 'auth_error' | 'json_error' | 'execution_error' | 'retry_error';
    message: string;
    details?: any;
}

export interface LLMProvider {
    generate(
        system: string | undefined,
        prompt: string | AgentMessage[],
        files: string[] | undefined,
        tools: AgentTool[] | undefined,
        config: Record<string, any> | undefined,
        output_schema: z.ZodType<any> | undefined,
        onToken: (token: string) => void
    ): Promise<AgentResponse>;
}
