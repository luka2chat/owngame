import { Delivery, Assessment, LibraryOperations } from "../library/index.js";
import { ToolkitOperations } from "./toolkit.js";
import { z } from "zod";
export const VERSION = "1.0.0";
const text = z.string().min(1).max(12000);
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,160}$/);
const version = z.number().int().positive();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const Ref = z.strictObject({ id, version });
export const RecordTypes = z.enum([
  "source_evidence",
  "reference_game",
  "mechanic",
  "player_strategy",
  "design_hypothesis",
  "concept_proposal",
  "implementation_recipe",
  "acceptance_check",
  "project_experiment",
]);
export const ClaimKinds = z.enum([
  "reported",
  "observed",
  "inferred",
  "proposed",
  "test_result",
]);
export const KnowledgeRecord = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  version,
  type: RecordTypes,
  title: text,
  summary: text,
  aliases: z.array(text),
  tags: z.array(text),
  status: z.enum(["draft", "active", "disputed", "superseded", "archived"]),
  claim_kind: ClaimKinds,
  source_refs: z.array(
    z.strictObject({
      source_id: id,
      version,
      relation: z.enum(["supports", "contradicts"]),
      purpose: text,
    }),
  ),
  relations: z.array(
    z.strictObject({
      relation: z.enum([
        "describes",
        "derived_from",
        "depends_on",
        "tests",
        "supports",
        "contradicts",
      ]),
      target: Ref,
    }),
  ),
  applicability: z.record(z.string(), z.string()),
  unknowns: z.array(text),
  validation: z.strictObject({
    state: z.enum(["not_run", "source_reviewed", "experiment_recorded"]),
    basis: text,
  }),
  content: z.record(z.string(), z.unknown()),
});
export const Source = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  version,
  alias: id,
  path: text,
  source_version: text,
  sha256: sha,
  selector: z.union([
    z.strictObject({ kind: z.literal("json_pointer"), pointer: z.string() }),
    z.strictObject({
      kind: z.literal("lines"),
      start: z.number().int().positive(),
      end: z.number().int().positive(),
    }),
  ]),
  snapshot_sha256: sha,
  captured_at: z.string().datetime(),
  scope: text,
});
export const SourceRegistry = z.strictObject({
  schema_version: z.literal(VERSION),
  sources: z.array(Source),
});
export const CreationRequest = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  version,
  intent: text,
  reference: Ref,
  preserve: z.array(text).min(1),
  change: z.array(text),
  exclusions: z.array(text),
  target: z.strictObject({
    engine: z.literal("cocos"),
    engine_version: z.literal("3.8.8"),
    platform: z.literal("web-desktop"),
  }),
  budgets: z.strictObject({
    research_sources: z.number().int().min(1).max(8),
    research_ms: z.number().int().min(1).max(900000),
    run_ms: z.number().int().min(1).max(2700000),
  }),
});
export const Design = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  version,
  claim_kind: z.literal("proposed"),
  title: text,
  reference: Ref,
  knowledge_refs: z.array(Ref).min(1),
  rules: z.array(z.strictObject({ id, statement: text })).min(1),
  hypotheses: z.array(z.strictObject({ claim: text, falsifier: text })).min(1),
  candidates: z
    .array(
      z.strictObject({
        name: text,
        change: text,
        risk: text,
        selected: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
  exclusions: z.array(text),
  unknowns: z.array(text),
});
export const Check = z.strictObject({
  id,
  kind: z.enum(["rule", "input", "experience"]),
  scope: text,
  preconditions: z.record(z.string(), z.unknown()),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
  expected: z.record(z.string(), z.unknown()),
  required_evidence: z.array(text).min(1),
  failure_criteria: z.array(text).min(1),
  verdict: z.literal("not_run"),
});
export const CheckSuite = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  version,
  design_ref: Ref,
  checks: z.array(Check).min(1),
});
export const Result = z.strictObject({
  schema_version: z.literal(VERSION),
  operation_id: z.string(),
  operation: z.string(),
  status: z.enum(["succeeded", "failed", "unknown"]),
  data: z.unknown().nullable(),
  diagnostics: z.array(
    z.strictObject({ code: z.string(), message: z.string() }),
  ),
  unknowns: z.array(z.string()),
  artifacts: z.array(z.strictObject({ path: z.string(), sha256: sha })),
});
export const Task = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  run_id: id,
  kind: z.literal("research.prepare"),
  status: z.enum([
    "pending",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deadline_at: z.string().datetime().nullable(),
  budget_ms: z.number().int().positive(),
  source_limit: z.number().int().positive(),
  cancel_requested: z.boolean(),
  stop_reason: z
    .enum([
      "completed",
      "budget_exhausted",
      "verification_unavailable",
      "environment_unavailable",
      "cancelled",
    ])
    .nullable(),
  input_sha256: sha,
  result: Result.nullable(),
});
export const Run = z.strictObject({
  schema_version: z.literal(VERSION),
  id,
  created_at: z.string().datetime(),
  input_sha256: sha,
  stage: z.literal("research"),
  game_verdict: z.literal("not_run"),
  request: CreationRequest,
  design: Design,
  checks: CheckSuite,
  pins: z.array(z.strictObject({ id, version, sha256: sha })),
  source_pins: z.array(z.strictObject({ id, version, sha256: sha })),
});
export const Contracts = {
  delivery: Delivery,
  assessment: Assessment,
  knowledge: KnowledgeRecord,
  source: Source,
  request: CreationRequest,
  design: Design,
  checks: CheckSuite,
  result: Result,
  task: Task,
  run: Run,
};
export type ContractName = keyof typeof Contracts;
export type Knowledge = z.infer<typeof KnowledgeRecord>;
export type SourceEntry = z.infer<typeof Source>;
export type TaskRecord = z.infer<typeof Task>;
export type RunRecord = z.infer<typeof Run>;
export type OperationResult = z.infer<typeof Result>;
const taskAddress = { run_id: id, task_id: id };
export const PublicOperations = {
  ...ToolkitOperations,
  ...LibraryOperations,
  capabilities: z.strictObject({}),
  "knowledge.search": z.strictObject({
    query: z.string().max(200).default(""),
    types: z.array(RecordTypes).optional(),
    claim_kinds: z.array(ClaimKinds).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  "knowledge.get": z.strictObject({
    id,
    version: version.optional(),
    view: z.enum(["summary", "full"]).default("summary"),
  }),
  "knowledge.validate": z.strictObject({}),
  "source.list": z.strictObject({}),
  "source.read": z.strictObject({
    id,
    version,
    mode: z.enum(["live", "snapshot"]).default("live"),
  }),
  "contract.get": z.strictObject({
    name: z.enum(Object.keys(Contracts) as [ContractName, ...ContractName[]]),
  }),
  "contract.validate": z.strictObject({
    name: z.enum(Object.keys(Contracts) as [ContractName, ...ContractName[]]),
    document: z.unknown(),
  }),
};
export const LegacyOperations = {
  "run.create": z.strictObject({
    request: CreationRequest,
    design: Design,
    checks: CheckSuite,
    idempotency_key: id,
  }),
  "run.get": z.strictObject({ run_id: id }),
  "task.create": z.strictObject({
    run_id: id,
    idempotency_key: id,
    kind: z.literal("research.prepare"),
    budget_ms: z.number().int().min(1).max(900000).default(900000),
    source_limit: z.number().int().min(1).max(8).default(8),
  }),
  "task.execute": z.strictObject(taskAddress),
  "task.get": z.strictObject(taskAddress),
  "task.cancel": z.strictObject(taskAddress),
};
export const Operations = { ...PublicOperations, ...LegacyOperations };
export type OperationName = keyof typeof Operations;
export function jsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { target: "draft-2020-12" });
}
