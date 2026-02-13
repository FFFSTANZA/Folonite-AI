import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
    MessageContentBlock,
    MessageContentType,
    TextContentBlock,
    ToolUseContentBlock,
    ThinkingContentBlock,
    isUserActionContentBlock,
    isComputerToolUseContentBlock,
    isImageContentBlock,
} from '@folonite/shared';
import { DEFAULT_MODEL } from './groq.constants';
import { Message, Role } from '@prisma/client';
import { openaiTools } from '../openai/openai.tools'; // Reusing OpenAI tools definition as Groq supports OpenAI tool format
import {
    FoloniteAgentService,
    FoloniteAgentInterrupt,
    FoloniteAgentResponse,
} from '../agent/agent.types';

@Injectable()
export class GroqService implements FoloniteAgentService {
    private readonly groq: OpenAI;
    private readonly logger = new Logger(GroqService.name);

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GROQ_API_KEY');

        if (!apiKey) {
            this.logger.warn(
                'GROQ_API_KEY is not set. GroqService will not work properly.',
            );
        }

        this.groq = new OpenAI({
            apiKey: apiKey || 'dummy-key-for-initialization',
            baseURL: 'https://api.groq.com/openai/v1',
        });
    }

    async generateMessage(
        systemPrompt: string,
        messages: Message[],
        model: string = DEFAULT_MODEL.name,
        useTools: boolean = true,
        signal?: AbortSignal,
        apiKey?: string,
    ): Promise<FoloniteAgentResponse> {
        try {
            // Use provided API key or fall back to the one from config
            const effectiveApiKey = apiKey || this.configService.get<string>('GROQ_API_KEY');

            // Create a new Groq client with the effective API key if different
            const groqClient = effectiveApiKey && effectiveApiKey !== this.configService.get<string>('GROQ_API_KEY')
                ? new OpenAI({
                    apiKey: effectiveApiKey,
                    baseURL: 'https://api.groq.com/openai/v1'
                })
                : this.groq;

            const groqMessages = this.formatMessagesForGroq(messages);

            const maxTokens = 8192; // Groq specific limits might vary by model, but this is a safe default

            const response = await groqClient.chat.completions.create(
                {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...groqMessages
                    ] as any,
                    tools: useTools ? openaiTools : undefined,
                    tool_choice: useTools ? 'auto' : undefined,
                    max_tokens: maxTokens,
                    temperature: 0.7,
                },
                { signal },
            );

            return {
                contentBlocks: this.formatGroqResponse(response.choices[0].message),
                tokenUsage: {
                    inputTokens: response.usage?.prompt_tokens || 0,
                    outputTokens: response.usage?.completion_tokens || 0,
                    totalTokens: response.usage?.total_tokens || 0,
                },
            };
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                this.logger.log('Groq API call aborted');
                throw new FoloniteAgentInterrupt();
            }
            this.logger.error(
                `Error sending message to Groq: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    private formatMessagesForGroq(
        messages: Message[],
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const groqMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        for (const message of messages) {
            const messageContentBlocks = message.content as MessageContentBlock[];

            if (
                messageContentBlocks.every((block) => isUserActionContentBlock(block))
            ) {
                const userActionContentBlocks = messageContentBlocks.flatMap(
                    (block) => block.content,
                );
                for (const block of userActionContentBlocks) {
                    if (isComputerToolUseContentBlock(block)) {
                        groqMessages.push({
                            role: 'user',
                            content: `User performed action: ${block.name}\n${JSON.stringify(block.input, null, 2)}`,
                        });
                    } else if (isImageContentBlock(block)) {
                        // Groq vision support varies, for now treating as unsupported or checking model
                        // Assuming Llama 3.2 vision or similar might support it, but for standard models we might need to skip or warn
                        // For simplicity, we'll try to pass it if the model supports it, but standard OpenAI format is:
                        groqMessages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${block.source.media_type};base64,${block.source.data}`,
                                    },
                                },
                            ],
                        } as any);
                    }
                }
            } else {
                // Convert content blocks to OpenAI format (Groq compatible)
                for (const block of messageContentBlocks) {
                    switch (block.type) {
                        case MessageContentType.Text: {
                            // Combine sequential text blocks if needed or push individually
                            // OpenAI chat format expects specific structure
                            if (message.role === Role.USER) {
                                groqMessages.push({
                                    role: 'user',
                                    content: block.text,
                                });
                            } else {
                                groqMessages.push({
                                    role: 'assistant',
                                    content: block.text,
                                });
                            }
                            break;
                        }
                        case MessageContentType.ToolUse:
                            if (message.role === Role.ASSISTANT) {
                                const toolBlock = block as ToolUseContentBlock;
                                groqMessages.push({
                                    role: 'assistant',
                                    content: null,
                                    tool_calls: [{
                                        id: toolBlock.id,
                                        type: 'function',
                                        function: {
                                            name: toolBlock.name,
                                            arguments: JSON.stringify(toolBlock.input),
                                        }
                                    }]
                                });
                            }
                            break;

                        case MessageContentType.ToolResult: {
                            const toolResult = block;
                            toolResult.content.forEach((content) => {
                                if (content.type === MessageContentType.Text) {
                                    groqMessages.push({
                                        role: 'tool',
                                        tool_call_id: toolResult.tool_use_id,
                                        content: content.text,
                                    });
                                }
                                // Handle images in tool results if supported
                                if (content.type === MessageContentType.Image) {
                                    groqMessages.push({
                                        role: 'tool',
                                        tool_call_id: toolResult.tool_use_id,
                                        content: "screenshot captured", // Placeholder as direct image in tool role might vary
                                    });
                                }
                            });
                            break;
                        }

                        case MessageContentType.Thinking:
                            // Groq usually doesn't output thinking blocks in the standard API unless specifically supported/requested
                            // For input (history), we can check if we want to include it. 
                            // OpenAI format doesn't have a specific 'thinking' role/type standardly used in this way yet.
                            // We'll skip adding it to history sent to Groq for now to avoid errors, or add as text.
                            break;

                        default:
                            groqMessages.push({
                                role: 'user',
                                content: JSON.stringify(block),
                            });
                    }
                }
            }
        }

        return groqMessages;
    }

    private formatGroqResponse(
        message: OpenAI.Chat.Completions.ChatCompletionMessage,
    ): MessageContentBlock[] {
        const contentBlocks: MessageContentBlock[] = [];

        if (message.content) {
            contentBlocks.push({
                type: MessageContentType.Text,
                text: message.content,
            } as TextContentBlock);
        }

        if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                contentBlocks.push({
                    type: MessageContentType.ToolUse,
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: JSON.parse(toolCall.function.arguments),
                } as ToolUseContentBlock);
            }
        }

        return contentBlocks;
    }
}
