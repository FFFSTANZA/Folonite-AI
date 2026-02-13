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
import { startTask } from "@/utils/taskUtils";
import { Model } from "@/types";
import { TaskList } from "@/components/tasks/TaskList";

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
    fetch("/api/tasks/models")
      .then((res) => res.json())
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
      // Send request to start a new task
      const taskData: {
        description: string;
        model: Model;
        files?: FileWithBase64[];
      } = {
        description: input,
        model: selectedModel,
      };

      // Include files if any are uploaded
      if (uploadedFiles.length > 0) {
        taskData.files = uploadedFiles;
      }

      const task = await startTask(taskData);

      if (task && task.id) {
        // Redirect to the task page
        router.push(`/tasks/${task.id}`);
      } else {
        // Handle error
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 md:p-8">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8">

          {/* Greeting */}
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="mb-2 h-16 w-16 relative">
              {/* Optional Logo placeholder or Icon */}
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
              What can I help you with?
            </h1>
          </div>

          {/* Chat Interface */}
          <div className="w-full flex flex-col gap-3">
            <ChatInput
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSend={handleSend}
              onFileUpload={handleFileUpload}
              minLines={1}
            />

            <div className="flex items-center justify-start px-1">
              <Select
                value={selectedModel?.name}
                onValueChange={(val) =>
                  setSelectedModel(
                    models.find((m) => m.name === val) || null,
                  )
                }
              >
                <SelectTrigger className="w-auto border-none bg-transparent hover:bg-secondary/50 rounded-full px-3 py-1.5 h-auto text-xs text-muted-foreground focus:ring-0 focus:ring-offset-0 gap-2">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task List - Subtle / Bottom */}
          <div className="w-full mt-8">
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
