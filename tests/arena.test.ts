import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/fixtures/arena-attacks.json";
import { fetchLiveAttackPrompt } from "@/lib/attacker";
import { fixturePromptForRound, parseArenaHistory, playArenaRound } from "@/lib/arena";
import { ApiError } from "@/lib/http";
import { QUESTION_INSTRUCTIONS } from "@/lib/questions";
import { AZURE_CLIENT_SECRET } from "@/tests/helpers";
import { verdict } from "@/tests/helpers";

const highYes = { answers: { verdict: { type: "noul", noul: 0.95 } } };

describe("arena history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects forged, oversized, and over-long history", () => {
    expect(() => parseArenaHistory({ history: [{ prompt: "x".repeat(4001), verdict: verdict() }] })).toThrow(ApiError);
    expect(() =>
      parseArenaHistory({
        history: [{ prompt: "ok", verdict: verdict({ status: "decided", reason: "lowconf" }) }],
      }),
    ).toThrow(ApiError);
    const full = Array.from({ length: 10 }, () => ({ prompt: "round", verdict: verdict() }));
    expect(() => parseArenaHistory({ history: full })).toThrow(ApiError);
    try {
      parseArenaHistory({ extra: true });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(400);
    }
  });

  it("replays fixtures from the round count and does not put history in the question", async () => {
    expect(fixturePromptForRound(1)).toBe(fixtures[0]?.prompt);
    expect(fixturePromptForRound(2)).toBe(fixtures[1]?.prompt);
    const calls: unknown[] = [];
    const first = await playArenaRound(
      { history: [{ prompt: "HISTORY_MARKER_UNIQUE", verdict: verdict() }] },
      {
        callDecision: async (body) => {
          calls.push(body);
          return highYes;
        },
      },
    );
    const second = await playArenaRound(
      { history: [{ prompt: "a different untrusted prompt", verdict: verdict() }] },
      { callDecision: async () => highYes },
    );
    expect(first.attack.prompt).toBe(second.attack.prompt);
    expect(first.round).toBe(2);
    const request = calls[0] as { state: string; questions: { verdict: { instructions: string } } };
    expect(request.state).not.toContain("HISTORY_MARKER_UNIQUE");
    expect(request.questions.verdict.instructions).toBe(QUESTION_INSTRUCTIONS.arena);
    expect(request.state).toContain(first.attack.prompt);
  });

  it("calls the live attacker with separate credentials and no tools", async () => {
    process.env.ARENA_LIVE_ATTACKER = "1";
    process.env.ATTACKER_ENDPOINT = "https://attacker.example/v1/chat";
    process.env.ATTACKER_MODEL = "attacker-demo";
    const seen: { auth?: string; body?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        seen.auth = headers.get("authorization") ?? "";
        seen.body = String(init.body);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "LIVE_ATTACK_PROMPT_77", tool_calls: [{ id: "nope" }] } }] }),
        );
      }),
    );
    const calls: unknown[] = [];
    const round = await playArenaRound(
      { history: [{ prompt: "OLD_HISTORY_PROMPT_88", verdict: verdict() }] },
      {
        callDecision: async (body) => {
          calls.push(body);
          return highYes;
        },
      },
    );
    const attackerBody = JSON.parse(seen.body ?? "{}") as { tools?: unknown; tool_choice?: unknown; messages: unknown };
    expect(round.attack.prompt).toBe("LIVE_ATTACK_PROMPT_77");
    expect(seen.auth).toBe(`Bearer ${process.env.ATTACKER_API_KEY}`);
    expect(seen.auth).not.toContain(AZURE_CLIENT_SECRET);
    expect(seen.body).not.toContain(AZURE_CLIENT_SECRET);
    expect(attackerBody.tools).toBeUndefined();
    expect(attackerBody.tool_choice).toBeUndefined();
    expect(seen.body).toContain("OLD_HISTORY_PROMPT_88");
    const judged = calls[0] as { state: string; questions: { verdict: { instructions: string } } };
    expect(judged.state).toContain("LIVE_ATTACK_PROMPT_77");
    expect(judged.state).not.toContain("OLD_HISTORY_PROMPT_88");
    expect(judged.questions.verdict.instructions).not.toContain("LIVE_ATTACK_PROMPT_77");
  });

  it("refuses to reuse the Decision-1 secret for the attacker", async () => {
    process.env.ARENA_LIVE_ATTACKER = "1";
    process.env.ATTACKER_ENDPOINT = "https://attacker.example/v1/chat";
    process.env.ATTACKER_MODEL = "attacker-demo";
    process.env.ATTACKER_API_KEY = AZURE_CLIENT_SECRET;
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    await expect(playArenaRound({}, { callDecision: async () => highYes })).rejects.toMatchObject({
      status: 502,
      code: "upstream",
      message: "Upstream decision failed.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("attacker adapter", () => {
  it("does not send tools and ignores tool calls in the response", async () => {
    process.env.ATTACKER_ENDPOINT = "https://attacker.example/v1/chat";
    process.env.ATTACKER_MODEL = "attacker-demo";
    const fetchImpl = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => {
      return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic only" } }] }));
    });
    const prompt = await fetchLiveAttackPrompt(["prior"], fetchImpl);
    expect(prompt).toBe("synthetic only");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
    expect(body.model).toBe("attacker-demo");
  });
});
