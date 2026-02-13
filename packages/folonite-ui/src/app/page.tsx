"use client";

import React, { useState, useEffect } from "react";
import { ChatInput } from "@/components/messages/ChatInput";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startTask, getStoredApiKeys, fetchModels } from "@/utils/taskUtils";
import { Model } from "@/types";
import { TaskList } from "@/components/tasks/TaskList";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, CpuIcon, ZapIcon } from "@hugeicons/core-free-icons";

interface FileWithBase64 {
  name: string;
  base64: string;
  type: string;
  size: number;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileWithBase64[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetchModels()
      .then((data) => {
        setModels(data);
        if (data.length > 0) setSelectedModel(data[0]);
      })
      .catch((err) => console.error("Failed to load models", err));
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    setIsLoading(true);

    try {
      if (!selectedModel) throw new Error("No model selected");
      const taskData: {
        description: string;
        model: Model;
        files?: FileWithBase64[];
        apiKeys?: { anthropic?: string; openai?: string; google?: string };
      } = {
        description: input,
        model: selectedModel,
      };

      if (uploadedFiles.length > 0) {
        taskData.files = uploadedFiles;
      }

      const apiKeys = getStoredApiKeys();
      if (apiKeys.anthropic || apiKeys.openai || apiKeys.google) {
        taskData.apiKeys = apiKeys;
      }

      const task = await startTask(taskData);

      if (task && task.id) {
        router.push(`/tasks/${task.id}`);
      } else {
        console.error("Failed to create task");
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (files: FileWithBase64[]) => {
    setUploadedFiles(files);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "anthropic":
        return <HugeiconsIcon icon={SparklesIcon} className="h-3.5 w-3.5 text-amber-400" />;
      case "openai":
        return <HugeiconsIcon icon={CpuIcon} className="h-3.5 w-3.5 text-emerald-400" />;
      case "google":
        return <HugeiconsIcon icon={ZapIcon} className="h-3.5 w-3.5 text-blue-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background relative">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-folonite-bronze/5 via-transparent to-folonite-bronze/10 pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-folonite-bronze/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-folonite-bronze/5 rounded-full blur-3xl pointer-events-none" />
      
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 md:p-8 relative z-10">
        <div className="flex w-full max-w-3xl flex-col items-center gap-10">
          {/* Logo & Greeting */}
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-folonite-bronze to-folonite-bronze-dark-7 flex items-center justify-center shadow-lg shadow-folonite-bronze/20">
                <span className="text-3xl font-bold text-white">F</span>
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-semibold text-white tracking-tight">
                What can I help you with?
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
                Give me a task and I&apos;ll work on it using the desktop. I can write code, analyze files, and more.
              </p>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="w-full flex flex-col gap-4">
            <div className="relative">
              <ChatInput
                input={input}
                isLoading={isLoading}
                onInputChange={setInput}
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                minLines={1}
              />
            </div>

            {/* Model Selector */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 bg-secondary/30 rounded-full px-4 py-2 border border-white/5">
                <span className="text-xs text-muted-foreground">Model:</span>
                <Select
                  value={selectedModel?.name}
                  onValueChange={(val) =>
                    setSelectedModel(
                      models.find((m) => m.name === val) || null,
                    )
                  }
                >
                  <SelectTrigger className="w-auto border-none bg-transparent hover:bg-white/5 rounded-full px-2 py-1 h-auto text-xs text-foreground focus:ring-0 focus:ring-offset-0 gap-2 transition-colors">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border min-w-[200px]">
                    {models.map((m) => (
                      <SelectItem key={m.name} value={m.name} className="text-sm">
                        <div className="flex items-center gap-2">
                          {getProviderIcon(m.provider)}
                          <span>{m.title}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              "Write a Python script",
              "Analyze this data",
              "Create a website",
              "Debug my code",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="px-4 py-2 rounded-full bg-secondary/20 border border-white/5 text-xs text-muted-foreground hover:bg-secondary/40 hover:text-foreground transition-all duration-200"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Task List */}
          <div className="w-full mt-4">
            <TaskList
              className="w-full"
              title="Recent Tasks"
              description=""
              showHeader={true}
              limit={3}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
