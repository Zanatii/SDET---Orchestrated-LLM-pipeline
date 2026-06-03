export interface REQItem {
  id: string;
  text: string;
  source: string;
  type: string;
}

export interface HLSItem {
  id: string;
  title: string;
  description: string;
  linked_requirements: string[];
  type: string;
}

export interface TCStep {
  action: string;
  test_data: string;
  expected: string;
}

export interface TCItem {
  id: string;
  hls_id: string;
  linked_requirements: string[];
  title: string;
  preconditions: string[];
  steps: TCStep[];
  priority: string;
  type: string;
  test_type: string;
}

export interface ReviewDecision {
  action: "approve" | "reject";
  feedback?: string;
  edits?: { items: unknown[] };
}

export interface AgentState {
  ticket_id: string;
  provider: "claude" | "groq" | "grok" | "proxi";
  run_id: string;
  ticket_data: Record<string, unknown> | null;
  requirements_analysis: {
    requirements: REQItem[];
    ambiguities: Record<string, unknown>[];
    contradictions: Record<string, unknown>[];
    assumptions: Record<string, unknown>[];
  } | null;
  requirements: string | null;
  hls_list: HLSItem[] | null;
  tc_list: TCItem[] | null;
  coverage_report: Record<string, unknown> | null;
  review_requirements: ReviewDecision | null;
  review_hls: ReviewDecision | null;
  review_tcs: ReviewDecision | null;
  review_coverage: ReviewDecision | null;
  review_jira: ReviewDecision | null;
  review_classifications: ReviewDecision | null;
  review_scripts: ReviewDecision | null;
  review_report: ReviewDecision | null;
  test_data_requirements: unknown[] | null;
  tc_classifications: unknown[] | null;
  generated_scripts: unknown[] | null;
  scripts_written: unknown[] | null;
  execution_results: unknown[] | null;
  report: Record<string, unknown> | null;
  req_retry_count: number;
  hls_retry_count: number;
  tc_retry_count: number;
  report_retry_count: number;
  changed_hls_ids: string[] | null;
  _auto_approved_reason: string | null;
  error: string | null;
  feedback_injected: Record<string, string> | null;
  node_providers: Record<string, string> | null;
  skip_steps: string[] | null;
}

export type StepStatus = "pending" | "active" | "approved" | "rejected" | "auto-approved";

export interface PipelineStep {
  id: string;
  label: string;
  phase: 1 | 2;
  gate: string | null;
  outputKey: keyof AgentState | null;
  feedbackNodeKey: string | null;
  skipKey: string | null;
}

export interface DescriptionTextBlock {
  type: "text";
  content: string;
}

export interface DescriptionTableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export type DescriptionBlock = DescriptionTextBlock | DescriptionTableBlock;

export interface TicketComment {
  author: string;
  body: string;
  created: string;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  // Phase 1
  { id: "fetch_ticket",            label: "Fetch Ticket",          phase: 1, gate: null,                    outputKey: "ticket_data",            feedbackNodeKey: null,                    skipKey: null },
  { id: "requirements_analysis",   label: "Requirements Analysis",  phase: 1, gate: "review_requirements",   outputKey: "requirements_analysis",   feedbackNodeKey: "requirements_analysis", skipKey: null },
  { id: "generate_hls",            label: "Generate HLS",           phase: 1, gate: "review_hls",            outputKey: "hls_list",               feedbackNodeKey: "generate_hls",          skipKey: null },
  { id: "generate_tcs",            label: "Generate TCs",           phase: 1, gate: "review_tcs",            outputKey: "tc_list",                feedbackNodeKey: "generate_tcs",          skipKey: null },
  { id: "coverage_validation",     label: "Coverage Validation",    phase: 1, gate: "review_coverage",       outputKey: "coverage_report",        feedbackNodeKey: null,                    skipKey: null },
  { id: "write_jira",              label: "Write JIRA",             phase: 1, gate: "review_jira",           outputKey: null,                     feedbackNodeKey: null,                    skipKey: null },
  // Phase 2
  { id: "classify_tcs",            label: "Classify TCs",           phase: 2, gate: "review_classifications", outputKey: "tc_classifications",     feedbackNodeKey: "classify_tcs",          skipKey: null },
  { id: "test_data_planning",      label: "Test Data Planning",     phase: 2, gate: null,                    outputKey: "test_data_requirements",  feedbackNodeKey: "test_data_planning",    skipKey: "test_data_planning" },
  { id: "generate_scripts",        label: "Generate Scripts",       phase: 2, gate: "review_scripts",        outputKey: "scripts_written",        feedbackNodeKey: null,                    skipKey: "generate_scripts" },
  { id: "playwright_execution",    label: "Execute Tests",          phase: 2, gate: null,                    outputKey: "execution_results",      feedbackNodeKey: null,                    skipKey: "execute_tests" },
  { id: "report_generation",       label: "Report Generation",      phase: 2, gate: "review_report",         outputKey: "report",                 feedbackNodeKey: null,                    skipKey: null },
  { id: "commit_github",           label: "GitHub PR",              phase: 2, gate: null,                    outputKey: null,                     feedbackNodeKey: null,                    skipKey: null },
  { id: "send_email",              label: "Send Email",             phase: 2, gate: null,                    outputKey: null,                     feedbackNodeKey: null,                    skipKey: null },
];
