import { tabPolicy, type Tab } from "@/lib/contract";

export type IntroDecisionType = "yes/no" | "choice" | "score";

export type IntroUseCase = {
  id: Tab;
  title: string;
  decisionType: IntroDecisionType;
  explanation: string;
};

const DECISION_TYPE_LABEL = {
  yesno: "yes/no",
  choice: "choice",
  score: "score",
} as const satisfies Record<(typeof tabPolicy)[Tab]["decisionType"], IntroDecisionType>;

/**
 * Overview copy. Wording matches the decide API: phishing and SOC stay
 * undecided when unsure, MCP fails closed at 70% confidence, DLP blocks at
 * 2.0, and the arena target is 27 of 30 blocks.
 */
export const INTRO_USE_CASES: readonly IntroUseCase[] = [
  {
    id: "phishing",
    title: "Phishing",
    decisionType: DECISION_TYPE_LABEL[tabPolicy.phishing.decisionType],
    explanation:
      "Yes/no on whether an email is phishing. If unsure, the result is Undecided, not a block.",
  },
  {
    id: "soc",
    title: "SOC",
    decisionType: DECISION_TYPE_LABEL[tabPolicy.soc.decisionType],
    explanation:
      "Picks a triage category for a security alert, with probabilities. Undecided when unsure.",
  },
  {
    id: "mcp",
    title: "MCP",
    decisionType: DECISION_TYPE_LABEL[tabPolicy.mcp.decisionType],
    explanation:
      "Checks whether an agent's tool call is safe to run. Allows only on a clear yes with ≥70% confidence, blocks everything else (fail closed), and blocks tool names that aren't plain identifiers.",
  },
  {
    id: "dlp",
    title: "DLP",
    decisionType: DECISION_TYPE_LABEL[tabPolicy.dlp.decisionType],
    explanation: "Scores outgoing data sensitivity on 0–4. Blocks at score ≥ 2.0.",
  },
  {
    id: "arena",
    title: "Arena",
    decisionType: DECISION_TYPE_LABEL[tabPolicy.arena.decisionType],
    explanation:
      "Replays 30 synthetic attacks. The target is at least 27 of 30 (90%) blocked.",
  },
];
