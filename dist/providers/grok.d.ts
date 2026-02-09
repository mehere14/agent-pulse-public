import { LLMProvider, AgentTool, AgentResponse, AgentMessage } from '../types';
import { z } from 'zod';
export declare class GrokProvider implements LLMProvider {
    private client;
    private model;
    constructor(model: string, apiKey?: string);
    generate(system: string | undefined, prompt: string | AgentMessage[], files: string[] | undefined, tools: AgentTool[] | undefined, config: Record<string, any> | undefined, output_schema: z.ZodType<any> | undefined, onToken: (token: string) => void): Promise<AgentResponse>;
}
