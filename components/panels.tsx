"use client";

import { CONFIDENCE_THRESHOLD, DLP_BLOCK_SCORE, DLP_SCORE_RANGE, LIMITS } from "@/lib/contract";
import {
  buildArenaRequest,
  buildDlpRequest,
  buildMcpRequest,
  buildPhishingRequest,
  buildSocRequest,
} from "@/lib/forms";
import {
  arenaPresets,
  dlpPresets,
  mcpPresets,
  phishingPresets,
  socPresets,
} from "@/lib/presets";
import { DecisionForm, type FieldDef } from "@/components/DecisionForm";

const phishingFields: readonly FieldDef[] = [
  { name: "sender", label: "Sender", maxLength: LIMITS.phishingSender },
  { name: "subject", label: "Subject", maxLength: LIMITS.phishingSubject },
  { name: "body", label: "Body", maxLength: LIMITS.phishingBody, multiline: true, rows: 8 },
];

const socFields: readonly FieldDef[] = [
  { name: "alertId", label: "Alert ID", maxLength: LIMITS.socAlertId },
  { name: "title", label: "Title", maxLength: LIMITS.socTitle },
  { name: "severity", label: "Severity", maxLength: LIMITS.socSeverity },
  { name: "source", label: "Source", maxLength: LIMITS.socSource },
  { name: "description", label: "Description", maxLength: LIMITS.socDescription, multiline: true, rows: 6 },
  { name: "timestamp", label: "Timestamp", maxLength: LIMITS.socTimestamp, optional: true },
  { name: "host", label: "Host", maxLength: LIMITS.socHost, optional: true },
  { name: "user", label: "User", maxLength: LIMITS.socUser, optional: true },
];

const mcpFields: readonly FieldDef[] = [
  { name: "toolName", label: "Tool name", maxLength: LIMITS.mcpToolName },
  { name: "args", label: "Arguments (JSON)", maxLength: LIMITS.mcpArgsJson, multiline: true, rows: 8 },
  {
    name: "agentContext",
    label: "Agent context",
    maxLength: LIMITS.mcpAgentContext,
    multiline: true,
    rows: 4,
  },
];

const dlpFields: readonly FieldDef[] = [
  { name: "prompt", label: "Prompt", maxLength: LIMITS.dlpPrompt, multiline: true, rows: 8 },
];

const arenaFields: readonly FieldDef[] = [
  { name: "prompt", label: "Attack prompt", maxLength: LIMITS.arenaPrompt, multiline: true, rows: 6 },
];

export function PhishingPanel() {
  return (
    <DecisionForm
      tab="phishing"
      intro={`The badge shows Phishing or Legitimate from the verdict. Confidence under ${CONFIDENCE_THRESHOLD} is the service threshold and is not applied again in the browser.`}
      presets={phishingPresets}
      fields={phishingFields}
      buildRequest={buildPhishingRequest}
    />
  );
}

export function SocPanel() {
  return (
    <DecisionForm
      tab="soc"
      intro={`The badge shows the routed label: benign, suspicious, or malicious. Confidence under ${CONFIDENCE_THRESHOLD} is the service threshold and is not applied again in the browser.`}
      presets={socPresets}
      fields={socFields}
      buildRequest={buildSocRequest}
    />
  );
}

export function McpPanel() {
  return (
    <DecisionForm
      tab="mcp"
      intro={`Allowed appears only when the service outcome is allow. Confidence under ${CONFIDENCE_THRESHOLD} is the service threshold and is not applied again in the browser.`}
      presets={mcpPresets}
      fields={mcpFields}
      buildRequest={buildMcpRequest}
    />
  );
}

export function DlpPanel() {
  return (
    <DecisionForm
      tab="dlp"
      intro={`Scores are decimals from ${DLP_SCORE_RANGE.min} to ${DLP_SCORE_RANGE.max}. The service blocks at ${DLP_BLOCK_SCORE} or higher; this page only displays that cutoff. Allowed appears only when the outcome is allow.`}
      presets={dlpPresets}
      fields={dlpFields}
      buildRequest={buildDlpRequest}
    />
  );
}

export function ArenaJudgeForm() {
  return (
    <DecisionForm
      tab="arena"
      intro={`Allowed appears only when the service outcome is allow. Confidence under ${CONFIDENCE_THRESHOLD} is the service threshold and is not applied again in the browser.`}
      presets={arenaPresets}
      fields={arenaFields}
      buildRequest={buildArenaRequest}
      submitLabel="Judge prompt"
    />
  );
}
