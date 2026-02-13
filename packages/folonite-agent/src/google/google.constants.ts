import { FoloniteAgentModel } from '../agent/agent.types';

export const GOOGLE_MODELS: FoloniteAgentModel[] = [
  {
    provider: 'google',
    name: 'gemini-2.5-pro',
    title: 'Gemini 2.5 Pro',
    contextWindow: 1000000,
  },
  {
    provider: 'google',
    name: 'gemini-2.5-flash',
    title: 'Gemini 2.5 Flash',
    contextWindow: 1000000,
  },
  {
    provider: 'google',
    name: 'gemini-2.0-flash',
    title: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
  },
  {
    provider: 'google',
    name: 'gemini-2.0-flash-lite',
    title: 'Gemini 2.0 Flash Lite',
    contextWindow: 1000000,
  },
  {
    provider: 'google',
    name: 'gemini-1.5-pro',
    title: 'Gemini 1.5 Pro',
    contextWindow: 2000000,
  },
];

export const DEFAULT_MODEL = GOOGLE_MODELS[0];
