import { Message } from '@prisma/client';
import { MessageContentBlock } from '@folonite/shared';

export interface FoloniteAgentResponse {
  contentBlocks: MessageContentBlock[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  groq?: string;
}

export interface FoloniteAgentService {
  generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string,
    useTools: boolean,
    signal?: AbortSignal,
    apiKey?: string,
  ): Promise<FoloniteAgentResponse>;
}

export interface FoloniteAgentModel {
  provider: 'anthropic' | 'openai' | 'google' | 'proxy' | 'groq';
  name: string;
  title: string;
  contextWindow?: number;
}

export class FoloniteAgentInterrupt extends Error {
  constructor() {
    super('FoloniteAgentInterrupt');
    this.name = 'FoloniteAgentInterrupt';
  }
}
