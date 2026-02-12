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

export interface FoloniteAgentService {
  generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string,
    useTools: boolean,
    signal?: AbortSignal,
  ): Promise<FoloniteAgentResponse>;
}

export interface FoloniteAgentModel {
  provider: 'anthropic' | 'openai' | 'google' | 'proxy';
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
