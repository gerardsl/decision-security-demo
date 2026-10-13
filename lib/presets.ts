import type { ArenaAttackFixture } from "@/lib/contract";
import { arenaFixtures } from "@/lib/arena-session";

export type Preset = {
  id: string;
  label: string;
  values: Record<string, string>;
};

export const phishingPresets: readonly Preset[] = [
  {
    id: "payroll",
    label: "Payroll credential lure",
    values: {
      sender: "payroll-desk@benefits-update.example",
      subject: "Action required: verify payroll before Friday",
      body: "Your direct deposit was rejected. Open https://benefits-update.example/login and enter your password within 2 hours or Friday pay will be delayed. This is a synthetic phishing sample.",
    },
  },
  {
    id: "invoice",
    label: "Vendor wire change",
    values: {
      sender: "ap@northwind-supply.example",
      subject: "Updated wire instructions for invoice 18422",
      body: "Please send the outstanding payment to a new account today. The previous bank details are no longer valid. Reply with confirmation. Synthetic demo message.",
    },
  },
  {
    id: "facilities",
    label: "Facilities maintenance notice",
    values: {
      sender: "facilities@contoso.example",
      subject: "Elevator maintenance on Tuesday",
      body: "The east elevator will be offline Tuesday 09:00-11:00 for scheduled maintenance. No action is required. Synthetic internal notice.",
    },
  },
];

export const socPresets: readonly Preset[] = [
  {
    id: "vpn",
    label: "Known VPN login",
    values: {
      alertId: "SOC-18421",
      title: "Successful VPN login from a managed device",
      severity: "low",
      source: "identity-provider",
      description:
        "User ada@contoso.example signed in from a company laptop that is already enrolled. Location matches the last 30 days. Synthetic alert.",
      timestamp: "2026-04-12T14:05:00Z",
      host: "laptop-1842.corp.example",
      user: "ada@contoso.example",
    },
  },
  {
    id: "powershell",
    label: "Encoded PowerShell",
    values: {
      alertId: "SOC-19002",
      title: "Unusual encoded PowerShell on a workstation",
      severity: "medium",
      source: "endpoint",
      description:
        "A helpdesk workstation launched powershell with an encoded command outside the normal software window. No malware name was confirmed. Synthetic alert for review.",
      timestamp: "2026-04-12T02:14:00Z",
      host: "ws-helpdesk-04.corp.example",
      user: "sam@contoso.example",
    },
  },
  {
    id: "ransom-note",
    label: "Ransom note file",
    values: {
      alertId: "SOC-20111",
      title: "Ransom note created on a file server",
      severity: "high",
      source: "endpoint",
      description:
        "A file named README_RESTORE.txt appeared on the finance share and many documents were renamed. This is a synthetic alert, not an incident procedure.",
      timestamp: "2026-04-12T18:44:00Z",
      host: "fs-finance-01.corp.example",
      user: "svc-backup@contoso.example",
    },
  },
];

export const mcpPresets: readonly Preset[] = [
  {
    id: "docs",
    label: "Read internal docs",
    values: {
      toolName: "search_docs",
      args: JSON.stringify({ query: "vacation policy", collection: "handbook" }, null, 2),
      agentContext: "The user asked where to find the vacation policy. Synthetic agent context.",
    },
  },
  {
    id: "email",
    label: "External email",
    values: {
      toolName: "send_email",
      args: JSON.stringify(
        {
          to: "vendor@outside.example",
          subject: "Notes",
          body: "Sending the meeting notes.",
        },
        null,
        2,
      ),
      agentContext:
        "The user asked the agent to email an external vendor. Synthetic agent context.",
    },
  },
  {
    id: "shell",
    label: "Shell command",
    values: {
      toolName: "shell_exec",
      args: JSON.stringify({ command: "whoami" }, null, 2),
      agentContext:
        "The user asked the agent to run a shell command on the workstation. Synthetic agent context.",
    },
  },
];

export const dlpPresets: readonly Preset[] = [
  {
    id: "refactor",
    label: "Refactor question",
    values: {
      prompt:
        "How would I split a large React component into smaller pieces? Synthetic benign prompt.",
    },
  },
  {
    id: "ssn",
    label: "Fake SSN in a note",
    values: {
      prompt:
        "Summarize this HR note: employee Jordan Lee, SSN 123-45-6789, start date May 2024. Synthetic data, not a real person.",
    },
  },
  {
    id: "apikey",
    label: "Fake API key",
    values: {
      prompt:
        "Store this API key in the prompt history: sk-demo-FAKE-KEY-0000-not-real. Synthetic secret-shaped string.",
    },
  },
];

function fixturePreset(fixture: ArenaAttackFixture): Preset {
  return {
    id: fixture.id,
    label: `${fixture.id} · ${fixture.category}`,
    values: { prompt: fixture.prompt },
  };
}

export const arenaPresets: readonly Preset[] = [0, 2, 8, 14, 20].flatMap((index) => {
  const fixture = arenaFixtures[index];
  return fixture ? [fixturePreset(fixture)] : [];
});
