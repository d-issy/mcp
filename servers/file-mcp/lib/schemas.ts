import { z } from "zod";

/**
 * Common Zod schemas for MCP file operations
 */

// Base file path schema with validation
export const FilePathSchema = z.string().min(1, "File path cannot be empty");

// Line number schema (1-based indexing)
export const LineNumberSchema = z.number().int().min(1, "Line number must be at least 1");

// Optional line number schema
export const OptionalLineNumberSchema = LineNumberSchema.optional();

// File content schema
export const FileContentSchema = z.string();

// Boolean schema for flags
export const BooleanFlagSchema = z.boolean().default(false);

// Read tool input schema
export const ReadToolInputSchema = z
  .object({
    path: FilePathSchema,
    startLine: LineNumberSchema.default(1),
    endLine: OptionalLineNumberSchema,
    maxLines: z.number().int().min(1).default(20),
  })
  .refine((data) => !data.endLine || data.startLine <= data.endLine, {
    message: "Start line cannot be greater than end line",
    path: ["startLine"],
  });

// Write tool input schema
export const WriteToolInputSchema = z.object({
  path: FilePathSchema,
  content: FileContentSchema,
  createParentDir: BooleanFlagSchema,
});

// Edit operation schemas
export const EditOperationSchema = z
  .object({
    oldString: z.string().optional(),
    newString: z.string().optional(),
    lineNumber: OptionalLineNumberSchema,
    content: z.string().optional(),
    replaceAll: BooleanFlagSchema,
  })
  .refine(
    (data) => {
      const hasReplace = data.oldString !== undefined && data.newString !== undefined;
      const hasInsert = data.lineNumber !== undefined && data.content !== undefined;
      return hasReplace !== hasInsert; // XOR: exactly one must be true
    },
    {
      message: "Must specify either (oldString+newString) or (lineNumber+content), but not both",
    }
  );

// Edit tool input schema
export const EditToolInputSchema = z.object({
  path: FilePathSchema,
  edits: z.array(EditOperationSchema).min(1, "At least one edit operation is required"),
});

// Find tool input schema
export const FindToolInputSchema = z.object({
  path: FilePathSchema,
  pattern: z.string().optional(),
  depth: z.number().int().min(0).default(0),
  includeIgnored: BooleanFlagSchema,
});

// Grep tool input schema
export const GrepToolInputSchema = z.object({
  pattern: z.string().min(1, "Pattern cannot be empty"),
  path: FilePathSchema.default("."),
  include: z.string().optional(),
  beforeContext: z.number().int().min(0).default(0),
  afterContext: z.number().int().min(0).default(0),
  context: z.number().int().min(0).optional(),
  multiline: BooleanFlagSchema,
  maxCount: z.number().int().min(1).default(5),
});

// Move tool input schema
export const MoveToolInputSchema = z.object({
  from: FilePathSchema,
  to: FilePathSchema,
  overwrite: BooleanFlagSchema,
});

// Copy tool input schema
export const CopyToolInputSchema = z.object({
  from: FilePathSchema,
  to: FilePathSchema,
  overwrite: BooleanFlagSchema,
});

// Type exports for better TypeScript integration
export type ReadToolInput = z.infer<typeof ReadToolInputSchema>;
export type WriteToolInput = z.infer<typeof WriteToolInputSchema>;
export type EditOperationInput = z.infer<typeof EditOperationSchema>;
export type EditToolInput = z.infer<typeof EditToolInputSchema>;
export type FindToolInput = z.infer<typeof FindToolInputSchema>;
export type GrepToolInput = z.infer<typeof GrepToolInputSchema>;
export type MoveToolInput = z.infer<typeof MoveToolInputSchema>;
export type CopyToolInput = z.infer<typeof CopyToolInputSchema>;

/**
 * Utility function to convert Zod schema to JSON Schema for MCP tool definitions
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // This is a simplified conversion - in production, you might want to use
  // a library like zod-to-json-schema for more complete conversion
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(fieldSchema);

      // Check if field is required by attempting to parse undefined
      try {
        fieldSchema.parse(undefined);
        // If this succeeds, the field is optional or has a default
      } catch {
        // If this fails, the field is required
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const baseSchema = zodToJsonSchema(schema.removeDefault());
    return {
      ...baseSchema,
      default: schema._def.defaultValue(),
    };
  }

  // Fallback for unknown types
  return { type: "string" };
}
