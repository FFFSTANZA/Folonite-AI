import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
  HttpException,
  Headers,
  Logger,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { Message, Task } from '@prisma/client';
import { AddTaskMessageDto } from './dto/add-task-message.dto';
import { MessagesService } from '../messages/messages.service';
import { ANTHROPIC_MODELS } from '../anthropic/anthropic.constants';
import { OPENAI_MODELS } from '../openai/openai.constants';
import { GOOGLE_MODELS } from '../google/google.constants';
import { GROQ_MODELS } from '../groq/groq.constants';
import { FoloniteAgentModel, ApiKeys } from 'src/agent/agent.types';

const geminiApiKey = process.env.GEMINI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

const proxyUrl = process.env.FOLONITE_LLM_PROXY_URL;

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
  ) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
  ): Promise<{ tasks: Task[]; total: number; totalPages: number }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    // Handle both single status and multiple statuses
    let statusFilter: string[] | undefined;
    if (statuses) {
      statusFilter = statuses.split(',');
    } else if (status) {
      statusFilter = [status];
    }

    return this.tasksService.findAll(pageNum, limitNum, statusFilter);
  }

  @Get('models')
  async getModels(
    @Headers('x-anthropic-api-key') anthropicApiKeyHeader?: string,
    @Headers('x-openai-api-key') openaiApiKeyHeader?: string,
    @Headers('x-google-api-key') googleApiKeyHeader?: string,
    @Headers('x-groq-api-key') groqApiKeyHeader?: string,
  ) {
    // Build models list from environment variables and provided API keys
    // Environment variables take precedence, but client keys can add models if env vars are not set
    const models: FoloniteAgentModel[] = [];

    // Add Anthropic models if API key is available (env or client)
    if (anthropicApiKey || anthropicApiKeyHeader) {
      models.push(...ANTHROPIC_MODELS);
    }

    // Add OpenAI models if API key is available (env or client)
    if (openaiApiKey || openaiApiKeyHeader) {
      models.push(...OPENAI_MODELS);
    }

    // Add Google models if API key is available (env or client)
    if (geminiApiKey || googleApiKeyHeader) {
      models.push(...GOOGLE_MODELS);
    }

    // Add Groq models if API key is available (env or client)
    if (groqApiKey || groqApiKeyHeader) {
      models.push(...GROQ_MODELS);
    }

    // If proxy is configured, fetch models from proxy
    if (proxyUrl) {
      try {
        const response = await fetch(`${proxyUrl}/model/info`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          this.logger?.warn?.(`Failed to fetch models from proxy: ${response.statusText}`);
        } else {
          const proxyModels = await response.json();

          // Map proxy response to FoloniteAgentModel format
          const mappedProxyModels: FoloniteAgentModel[] = proxyModels.data.map(
            (model: any) => ({
              provider: 'proxy',
              name: model.litellm_params.model,
              title: model.model_name,
              contextWindow: 128000,
            }),
          );

          models.push(...mappedProxyModels);
        }
      } catch (error: any) {
        // Log but don't fail - return other models
        console.warn(`Error fetching proxy models: ${error.message}`);
      }
    }

    return models;
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Task> {
    return this.tasksService.findById(id);
  }

  @Get(':id/messages')
  async taskMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    const messages = await this.messagesService.findAll(taskId, options);
    return messages;
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addTaskMessage(
    @Param('id') taskId: string,
    @Body() guideTaskDto: AddTaskMessageDto,
  ): Promise<Task> {
    return this.tasksService.addTaskMessage(taskId, guideTaskDto);
  }

  @Get(':id/messages/raw')
  async taskRawMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findRawMessages(taskId, options);
  }

  @Get(':id/messages/processed')
  async taskProcessedMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findProcessedMessages(taskId, options);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.tasksService.delete(id);
  }

  @Post(':id/takeover')
  @HttpCode(HttpStatus.OK)
  async takeOver(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.takeOver(taskId);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.resume(taskId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.cancel(taskId);
  }
}
