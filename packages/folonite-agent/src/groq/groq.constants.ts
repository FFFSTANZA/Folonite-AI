import { FoloniteAgentModel } from '../agent/agent.types';

export const GROQ_MODELS: FoloniteAgentModel[] = [
    {
        provider: 'groq',
        name: 'llama-3.3-70b-versatile',
        title: 'Llama 3.3 70B Versatile',
        contextWindow: 128000,
    },
    {
        provider: 'groq',
        name: 'llama-3.1-8b-instant',
        title: 'Llama 3.1 8B Instant',
        contextWindow: 128000,
    },
    {
        provider: 'groq',
        name: 'mixtral-8x7b-32768',
        title: 'Mixtral 8x7B',
        contextWindow: 32768,
    },
    {
        provider: 'groq',
        name: 'gemma2-9b-it',
        title: 'Gemma 2 9B IT',
        contextWindow: 8192,
    },
    {
        provider: 'groq',
        name: 'deepseek-r1-distill-llama-70b',
        title: 'DeepSeek R1 Distill Llama 70B',
        contextWindow: 128000,
    },
];

export const DEFAULT_MODEL = GROQ_MODELS[0];
