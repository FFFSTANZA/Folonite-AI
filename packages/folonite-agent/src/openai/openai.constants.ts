import { FoloniteAgentModel } from 'src/agent/agent.types';

export const OPENAI_MODELS: FoloniteAgentModel[] = [
  {
    provider: 'openai',
    name: 'o3',
    title: 'o3',
    contextWindow: 200000,
  },
  {
    provider: 'openai',
    name: 'o4-mini',
    title: 'o4 Mini',
    contextWindow: 200000,
  },
  {
    provider: 'openai',
    name: 'gpt-4.1',
    title: 'GPT-4.1',
    contextWindow: 1047576,
  },
  {
    provider: 'openai',
    name: 'gpt-4.1-mini',
    title: 'GPT-4.1 Mini',
    contextWindow: 1047576,
  },
  {
    provider: 'openai',
    name: 'gpt-4o',
    title: 'GPT-4o',
    contextWindow: 128000,
  },
];

export const DEFAULT_MODEL = OPENAI_MODELS[0];
