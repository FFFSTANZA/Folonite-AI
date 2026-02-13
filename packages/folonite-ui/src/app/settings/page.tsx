"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ViewIcon, ViewOffIcon, Tick02Icon, Cancel01Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedKeys = localStorage.getItem("folonite_api_keys");
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleKeyChange = (provider: keyof ApiKeys, value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const clearAllKeys = () => {
    setApiKeys({});
    localStorage.removeItem("folonite_api_keys");
  };

  if (!mounted) {
    return null;
  }

  const providers = [
    {
      key: "anthropic",
      name: "Anthropic",
      description: "Claude AI models (Claude 3.5 Sonnet, Claude Opus, etc.)",
      placeholder: "sk-ant-api03-...",
    },
    {
      key: "openai",
      name: "OpenAI",
      description: "GPT models (GPT-4, GPT-4o, o1, o3, etc.)",
      placeholder: "sk-...",
    },
    {
      key: "google",
      name: "Google Gemini",
      description: "Gemini models (Gemini 2.5 Pro, Gemini 2.0 Flash, etc.)",
      placeholder: "AIzaSy...",
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto px-6 pt-6 pb-10">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-white">Settings</h1>
            <p className="text-gray-400 mt-1">
              Manage your API keys and preferences
            </p>
          </div>

          <Card className="bg-folonite-bronze-light-2 border-folonite-bronze-light-7">
            <CardHeader>
              <CardTitle className="text-white">API Keys</CardTitle>
              <CardDescription className="text-gray-400">
                Enter your API keys for AI providers. These are stored locally in your browser and never sent to our servers except when making AI requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {providers.map((provider) => (
                <div key={provider.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`${provider.key}-api-key`}
                      className="text-sm font-medium text-white"
                    >
                      {provider.name}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {apiKeys[provider.key as keyof ApiKeys] ? "Configured" : "Not set"}
                      </span>
                      <Switch
                        checked={!!showKeys[provider.key]}
                        onCheckedChange={() => toggleShowKey(provider.key)}
                        className="data-[state=checked]:bg-folonite-bronze"
                      />
                      <HugeiconsIcon
                        icon={showKeys[provider.key] ? ViewOffIcon : ViewIcon}
                        className="h-4 w-4 text-gray-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{provider.description}</p>
                  <Input
                    id={`${provider.key}-api-key`}
                    type={showKeys[provider.key] ? "text" : "password"}
                    placeholder={provider.placeholder}
                    value={apiKeys[provider.key as keyof ApiKeys] || ""}
                    onChange={(e) =>
                      handleKeyChange(provider.key as keyof ApiKeys, e.target.value)
                    }
                    className="bg-folonite-bronze-light-3 border-folonite-bronze-light-7 text-white placeholder:text-gray-600 focus-visible:ring-folonite-bronze"
                  />
                </div>
              ))}

              <div className="flex items-center gap-4 pt-4 border-t border-folonite-bronze-light-7">
                <Button
                  onClick={handleSave}
                  className="bg-folonite-bronze hover:bg-folonite-bronze-dark-7 text-white"
                >
                  <HugeiconsIcon
                    icon={saved ? Tick02Icon : Download04Icon}
                    className="h-4 w-4 mr-2"
                  />
                  {saved ? "Saved!" : "Save API Keys"}
                </Button>
                <Button
                  variant="outline"
                  onClick={clearAllKeys}
                  className="border-folonite-bronze-light-7 text-gray-400 hover:text-white hover:bg-folonite-bronze-light-3"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    className="h-4 w-4 mr-2"
                  />
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6 bg-folonite-bronze-light-2 border-folonite-bronze-light-7">
            <CardHeader>
              <CardTitle className="text-white">Security Notice</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400">
                Your API keys are stored locally in your browser&apos;s localStorage.
                They are only sent to the AI provider APIs when processing tasks.
                Make sure to keep your browser secure and avoid sharing your computer
                with untrusted parties.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
