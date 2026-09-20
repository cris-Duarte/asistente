import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { EventStore } from '../event-store';
import { EmbeddingService, createEmbeddingService } from '../embeddings';
import { EventStore as EventStoreClass } from '../event-store';

interface AgentConfig {
  dbUrl: string;
  electricUrl: string;
  embeddingProvider: 'openai' | 'local';
  openaiApiKey?: string;
}

interface TaskContext {
  taskId?: string;
  projectId?: string;
  userId: string;
}

interface ToolContext extends TaskContext {
  agentId?: string;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface AgentTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: any, context: ToolContext) => Promise<any>;
}

interface AgentState {
  id: string;
  name: string;
  description: string;
  tools: AgentTool[];
  systemPrompt: string;
  config: Record<string, unknown>;
}

export class AgentRuntime {
  private eventStore: any;
  private embeddingService: any;
  private tools: Map<string, AgentTool> = new Map();
  private agents: Map<string, AgentState> = new Map();
  private mcpServer: any;

  constructor(
    private config: {
      dbUrl: string;
      electricUrl: string;
      embeddingProvider: 'openai' | 'local';
      openaiApiKey?: string;
    }
  ) {}

  async initialize() {
    // Initialize event store
    this.eventStore = new (await import('../event-store')).EventStore();
    await this.eventStore.initialize({
      electricUrl: this.config.embeddingProvider === 'openai' ? 'http://localhost:3000' : 'http://electric:3000',
      userId: 'system',
      authToken: 'system-token',
    });

    // Initialize embedding service
    const embeddingService = await import('./embeddings');
    const EmbeddingServiceClass = embeddingService.EmbeddingService;
    this.embeddingService = new EmbeddingService();

    // Register default tools
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    // Task management tools
    this.registerTool({
      name: 'create_task',
      description: 'Create a new task',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        projectId: z.string().uuid().optional(),
        estimatedMinutes: z.number().int().positive().optional(),
        isParallel: z.boolean().default(false),
        metadata: z.record(z.unknown()).optional(),
      }),
      handler: async (input, context) => {
        // Implementation would call event store
        return { success: true, data: { message: 'Task created' } };
      },
    });

    this.registerTool({
      name: 'update_task',
      description: 'Update an existing task',
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        status: z.enum(['pending', 'active', 'paused', 'done', 'archived']).optional(),
        projectId: z.string().uuid().optional(),
        estimatedMinutes: z.number().int().positive().optional(),
        isParallel: z.boolean().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      handler: async (input, context) => {
        return { success: true, data: { message: 'Task updated' } };
      },
    });

    this.registerTool({
      name: 'list_tasks',
      description: 'List tasks with optional filters',
      inputSchema: z.object({
        status: z.enum(['pending', 'active', 'paused', 'done', 'archived']).optional(),
        projectId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().nonnegative().default(0),
      }),
      handler: async (input, context) => {
        return { success: true, data: { items: [], total: 0 } };
      },
    });

    this.registerTool({
      name: 'start_timer',
      description: 'Start a timer for a task',
      inputSchema: z.object({
        taskId: z.string().uuid(),
      }),
      handler: async (input, context) => {
        return { success: true, data: { message: 'Timer started' } };
      },
    });

    this.registerTool({
      name: 'stop_timer',
      description: 'Stop the current timer',
      inputSchema: z.object({
        taskId: z.string().uuid(),
      }),
      handler: async (input, context) => {
        return { success: true, data: { message: 'Timer stopped' } };
      },
    });

    this.registerTool({
      name: 'search_tasks',
      description: 'Search tasks using vector similarity',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).default(10),
        threshold: z.number().min(0).max(1).default(0.7),
      }),
      handler: async (input, context) => {
        return { success: true, data: { results: [] } };
      },
    });

    this.registerTool({
      name: 'get_task_details',
      description: 'Get detailed information about a task',
      inputSchema: z.object({
        taskId: z.string().uuid(),
      }),
      handler: async (input, context) => {
        return { success: true, data: { task: null } };
      },
    });
  }

  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: z.ZodSchema;
    handler: (input: any, context: any) => Promise<any>;
  }) {
    this.tools.set(tool.name, tool);
  }

  async initializeMcpServer() {
    this.mcpServer = new Server(
      {
        name: 'productivity-assistant',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Register tools with MCP
    for (const [name, tool] of this.tools) {
      this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name !== name) {
          throw new Error(`Tool ${name} not found`);
        }

        try {
          const result = await this.tools.get(name)!.handler(request.params.arguments, {});
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
            isError: true,
          };
        }
      });

      this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: Array.from(this.tools.entries()).map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
      });
    }

    async start() {
      await this.initializeMcpServer();
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);
      console.error('MCP Server running on stdio');
    }
  }

  getTools() {
    return Array.from(this.tools.values());
  }
}

// Tool registration schema
export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});

// Agent configuration
export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // Tool names
  config?: Record<string, unknown>;
}

// Create agent runtime
export function createAgentRuntime(config: {
  dbUrl: string;
  electricUrl: string;
  embeddingProvider: 'openai' | 'local';
  openaiApiKey?: string;
}) {
  return new AgentRuntime({
    dbUrl: config.dbUrl,
    electricUrl: config.electricUrl,
    embeddingProvider: config.embeddingProvider,
    openaiApiKey: config.openaiApiKey,
  });
}

// Export types
export type { AgentConfig, AgentState, ToolContext, ToolResult, AgentTool };
export { AgentRuntime };