import type { ToolKind } from "./toolRegistry";

export type ModelContextMessage = {
  senderType: "customer" | "ai" | "human" | "system";
  content: string;
};

export type ModelToolDefinition = {
  name: string;
  kind: ToolKind;
  description: string;
  input: string;
  output: string;
};

export type ModelToolResult = {
  toolName: string;
  result: unknown;
};

export type ModelGenerationInput = {
  systemInstruction: string;
  conversation: {
    channel: "web" | "sms" | "phone" | "email" | "other";
    subject?: string;
    customerLinked: boolean;
  };
  messages: Array<ModelContextMessage>;
  toolDefinitions: Array<ModelToolDefinition>;
  toolResults: Array<ModelToolResult>;
};

/** Model adapters return data only; they cannot access Convex or execute tools. */
export type Finalization = {
  kind:
    | "unknown"
    | "clarify_service"
    | "clarify_time"
    | "clarify_customer"
    | "knowledge"
    | "services"
    | "availability"
    | "development";
  resultIndex?: number;
};

export type ModelOutput =
  | { kind: "final"; content: string; finalization?: Finalization }
  | { kind: "tool_request"; toolName: string; args: unknown };

export interface ModelAdapter {
  readonly metadata?: {
    provider: string;
    model: string;
    mode: "fake" | "live";
  };
  generate(input: ModelGenerationInput): Promise<ModelOutput>;
}

/**
 * Clearly marked local development behavior. It is intentionally not a real
 * model and never claims to have consulted business data or performed action.
 */
export class DevelopmentFakeModelAdapter implements ModelAdapter {
  readonly metadata = {
    provider: "development_fake",
    model: "deterministic",
    mode: "fake" as const,
  };
  async generate(): Promise<ModelOutput> {
    return {
      kind: "final",
      finalization: { kind: "development" },
      content:
        "Development fake AI is active. A live model provider has not been configured.",
    };
  }
}

/** Deterministic adapter for orchestration tests; never used by the public API. */
export class ScriptedFakeModelAdapter implements ModelAdapter {
  private position = 0;

  constructor(private readonly script: Array<ModelOutput | Error>) {}

  async generate(): Promise<ModelOutput> {
    const next = this.script[this.position];
    this.position += 1;
    if (next === undefined) {
      throw new Error("The fake model script ended unexpectedly");
    }
    if (next instanceof Error) throw next;
    return next;
  }
}
