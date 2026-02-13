"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ViewIcon, ViewOffIcon, Tick02Icon, Cancel01Icon, Download04Icon, SparklesIcon, CpuIcon, ZapIcon, AlertCircleIcon, Shield01Icon, Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  groq?: string;
}

interface ProviderConfig {
  key: keyof ApiKeys;
  name: string;
  description: string;
  placeholder: string;
  icon: typeof SparklesIcon;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  allowsCustomModel?: boolean;
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [groqModel, setGroqModel] = useState<string>("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedKeys = localStorage.getItem("folonite_api_keys");
    const storedGroqModel = localStorage.getItem("folonite_groq_model");
    if (storedGroqModel) setGroqModel(storedGroqModel);
    if (storedKeys) {
      try {
        setApiKeys(JSON.parse(storedKeys));
      } catch (e) {
        console.error("Failed to parse stored API keys", e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("folonite_api_keys", JSON.stringify(apiKeys));
    if (groqModel) localStorage.setItem("folonite_groq_model", groqModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleKeyChange = (provider: keyof ApiKeys, value: string) => {
    const newKeys = { ...apiKeys, [provider]: value };
    setApiKeys(newKeys);
    localStorage.setItem("folonite_api_keys", JSON.stringify(newKeys));
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const clearAllKeys = () => {
    setApiKeys({});
    localStorage.removeItem("folonite_api_keys");
  };

  const clearKey = (key: keyof ApiKeys) => {
    const newKeys = { ...apiKeys };
    delete newKeys[key];
    setApiKeys(newKeys);
    localStorage.setItem("folonite_api_keys", JSON.stringify(newKeys));
  };

  if (!mounted) {
    return null;
  }

  const providers: ProviderConfig[] = [
    {
      key: "anthropic",
      name: "Anthropic",
      description: "Claude AI models - Claude 3.5 Sonnet, Claude Opus, Claude Haiku",
      placeholder: "sk-ant-api03-...",
      icon: SparklesIcon,
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      key: "openai",
      name: "OpenAI",
      description: "GPT models - GPT-4, GPT-4o, o1, o3, and more",
      placeholder: "sk-...",
      icon: CpuIcon,
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      key: "google",
      name: "Google Gemini",
      description: "Gemini models - Gemini 2.5 Pro, Gemini 2.0 Flash",
      placeholder: "AIzaSy...",
      icon: ZapIcon,
      iconColor: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      key: "groq",
      name: "Groq",
      description: "LPU Inference Engine - Llama 3 70B, Mixtral 8x7B, Gemma 7B",
      placeholder: "gsk_...",
      icon: ZapIcon,
      iconColor: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
      allowsCustomModel: true,
    },
  ];

  const configuredCount = Object.values(apiKeys).filter(Boolean).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header Background */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-folonite-bronze/10 to-transparent pointer-events-none" />

      <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-10 relative z-10">
        <div className="mx-auto max-w-3xl">
          {/* Page Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-folonite-bronze/20 flex items-center justify-center">
                  <HugeiconsIcon icon={Key01Icon} className="h-5 w-5 text-folonite-bronze" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-white">API Keys</h1>
                  <p className="text-gray-400 text-sm">
                    Manage your AI provider API keys
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-white/5">
              <div className={cn(
                "h-2 w-2 rounded-full",
                configuredCount > 0 ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs text-muted-foreground">
                {configuredCount} of {providers.length} configured
              </span>
            </div>
          </div>

          {/* API Key Cards */}
          <div className="space-y-4">
            {providers.map((provider) => {
              const isConfigured = !!apiKeys[provider.key];
              return (
                <Card
                  key={provider.key}
                  className={cn(
                    "bg-secondary/20 border-white/5 overflow-hidden transition-all duration-200",
                    isConfigured && "ring-1 ring-green-500/20"
                  )}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Provider Icon */}
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                        provider.bgColor,
                        provider.borderColor,
                        "border"
                      )}>
                        <HugeiconsIcon
                          icon={provider.icon}
                          className={cn("h-6 w-6", provider.iconColor)}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-white font-medium">{provider.name}</h3>
                          {isConfigured && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                              <HugeiconsIcon icon={Shield01Icon} className="h-3 w-3 text-green-400" />
                              <span className="text-xs text-green-400 font-medium">Configured</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{provider.description}</p>

                        {/* Input Area */}
                        <div className="relative">
                          <Input
                            id={`${provider.key}-api-key`}
                            type={showKeys[provider.key] ? "text" : "password"}
                            placeholder={`Enter ${provider.name} API key`}
                            value={apiKeys[provider.key] || ""}
                            onChange={(e) =>
                              handleKeyChange(provider.key, e.target.value)
                            }
                            className="bg-background/50 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-folonite-bronze/50 pr-24"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {isConfigured && (
                              <button
                                onClick={() => clearKey(provider.key)}
                                className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors"
                                title="Clear key"
                              >
                                <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => toggleShowKey(provider.key)}
                              className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                              title={showKeys[provider.key] ? "Hide key" : "Show key"}
                            >
                              <HugeiconsIcon
                                icon={showKeys[provider.key] ? ViewOffIcon : ViewIcon}
                                className="h-4 w-4"
                              />
                            </button>
                          </div>
                          {provider.allowsCustomModel && (
                            <div className="mt-3">
                              <label className="text-xs text-gray-400 mb-1.5 block">Custom Model Name (Optional, defaults to llama3-70b-8192)</label>
                              <Input
                                type="text"
                                placeholder="e.g. llama3-8b-8192"
                                value={groqModel}
                                onChange={(e) => setGroqModel(e.target.value)}
                                className="bg-background/50 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-folonite-bronze/50"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
            <Button
              variant="outline"
              onClick={clearAllKeys}
              className="border-white/10 text-gray-400 hover:text-white hover:bg-white/5 hover:border-white/20"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4 mr-2" />
              Clear All Keys
            </Button>

            <Button
              onClick={handleSave}
              className={cn(
                "transition-all duration-200",
                saved
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-folonite-bronze hover:bg-folonite-bronze-dark-7 text-white"
              )}
            >
              <HugeiconsIcon
                icon={saved ? Tick02Icon : Download04Icon}
                className="h-4 w-4 mr-2"
              />
              {saved ? "Saved Successfully!" : "Save API Keys"}
            </Button>
          </div>

          {/* Security Notice */}
          <Card className="mt-8 bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={AlertCircleIcon} className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-blue-200 mb-1">Security Notice</h4>
                  <p className="text-xs text-blue-300/80 leading-relaxed">
                    Your API keys are stored locally in your browser&apos;s localStorage and are never
                    sent to our servers except when making AI requests. Keys are cleared from server
                    memory when tasks complete. Keep your browser secure and avoid sharing your computer
                    with untrusted parties.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
