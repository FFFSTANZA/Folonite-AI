import { FoloniteAgentModel } from '../agent/agent.types';

export const ANTHROPIC_MODELS: FoloniteAgentModel[] = [
  {
    provider: 'anthropic',
    name: 'claude-opus-4-1-20250805',
    title: 'Claude Opus 4.1',
    contextWindow: 200000,
  },
  {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    title: 'Claude Sonnet 4',
    contextWindow: 200000,
  },
  {
    provider: 'anthropic',
    name: 'claude-3-7-sonnet-20250219',
    title: 'Claude 3.7 Sonnet',
    contextWindow: 200000,
  },
  {
    provider: 'anthropic',
    name: 'claude-3-5-sonnet-20241022',
    title: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
  },
  {
    provider: 'anthropic',
    name: 'claude-3-5-haiku-20241022',
    title: 'Claude 3.5 Haiku',
    contextWindow: 200000,
  },
];

export const DEFAULT_MODEL = ANTHROPIC_MODELS[0];
