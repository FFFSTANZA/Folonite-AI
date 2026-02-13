import { FoloniteAgentModel } from '../agent/agent.types';

export const GROQ_MODELS: FoloniteAgentModel[] = [
    {
        provider: 'groq',
        name: 'llama3-70b-8192',
        title: 'Llama 3 70B',
        contextWindow: 8192,
    },
    {
        provider: 'groq',
        name: 'mixtral-8x7b-32768',
        title: 'Mixtral 8x7B',
        contextWindow: 32768,
    },
    {
        provider: 'groq',
        name: 'gemma-7b-it',
        title: 'Gemma 7B',
        contextWindow: 8192,
    },
];

export const DEFAULT_MODEL = GROQ_MODELS[0];
