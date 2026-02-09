import { EventEmitter } from 'events';
import { AgentConfig, AgentResponse, AgentMessage } from './types';
export declare class Agent extends EventEmitter {
    private config;
    private provider;
    constructor(config: AgentConfig);
    run(inputContext: string | AgentMessage[]): Promise<AgentResponse>;
}
