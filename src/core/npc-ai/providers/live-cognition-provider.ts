/**
 * Milestone 92: Live LLM Cognition Provider
 *
 * Implements NpcCognitionProvider using external LLM inference
 * (OpenAI / Gemini via native fetch, zero npm dependencies added).
 *
 * Invariants:
 * 1. AI Output is strictly structured and validated against NpcActionProposal.
 * 2. Secrets are read from process.env; NEVER committed or logged.
 * 3. Network or provider failure NEVER mutates or corrupts WorldState.
 * 4. Free-form text reasoning is non-authoritative metadata.
 */

import type {
  NpcCognitionProvider,
  NpcCognitionContext,
  NpcCognitionResult,
  NpcActionProposal,
  NpcActionType,
} from '../npc-cognition-types.js';

export interface LiveProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

const VALID_ACTIONS: readonly NpcActionType[] = [
  'observe',
  'offer_service',
  'approach_player',
  'acknowledge_player',
];

export class LiveNpcCognitionProvider implements NpcCognitionProvider {
  public readonly id = 'live-llm-provider';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: LiveProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    this.model =
      options.model ||
      process.env.OPENAI_REVIEW_MODEL ||
      (process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gemini-3.8-flash');
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  public async decideAction(context: NpcCognitionContext): Promise<NpcCognitionResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new Error(
        'LiveNpcCognitionProvider: No API key found in environment (OPENAI_API_KEY or GEMINI_API_KEY)'
      );
    }

    const systemPrompt = `You are the cognition layer for Elena Morales, a persistent attendant at Wing Spot in Ciudad Juárez, Mexico.
Your responsibility is to decide Elena's next action based on her current bounded perception, memories, and goal.

Valid actions:
- "offer_service": If you are on duty at Wing Spot, a player is present/co-located, and they have not been served.
- "observe": If you are waiting, watching the counter, service is already active, or player is not present.
- "acknowledge_player": If a player enters or greets you.
- "approach_player": If you need to step toward a customer to assist them.

You MUST respond with a valid JSON object matching this schema:
{
  "actionType": "observe" | "offer_service" | "approach_player" | "acknowledge_player",
  "targetAgentId": string or null,
  "establishmentId": string or null,
  "reasoningContext": string
}`;

    const userPrompt = JSON.stringify(
      {
        npc: {
          id: context.perception.agentId,
          name: context.perception.agentName,
          role: context.perception.role,
          location: context.perception.locationId,
          interiorSpaceId: context.perception.interiorSpaceId,
          onDuty: context.perception.isOnDutyShift,
          civilTime: context.perception.civilTime.isoCivilString,
        },
        establishment: context.perception.establishment,
        perceivedPlayer: context.perception.perceivedPlayer,
        activeService: context.perception.activeService,
        goal: context.goal.description,
        recentMemories: context.memories.slice(-3),
      },
      null,
      2
    );

    let rawJson: string;

    // Use OpenAI API if OPENAI_API_KEY is available
    if (process.env.OPENAI_API_KEY || !process.env.GEMINI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
          `OpenAI API request failed [HTTP ${response.status}]: ${errText.slice(0, 200)}`
        );
      }

      const data = await response.json();
      rawJson = data?.choices?.[0]?.message?.content || '{}';
    } else {
      // Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
          `Gemini API request failed [HTTP ${response.status}]: ${errText.slice(0, 200)}`
        );
      }

      const data = await response.json();
      rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    // Parse and strictly validate proposal shape
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error(`Invalid JSON returned by cognition provider: ${rawJson.slice(0, 100)}`);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Cognition provider returned non-object JSON');
    }

    const actionType = parsed.actionType;
    if (!VALID_ACTIONS.includes(actionType)) {
      throw new Error(
        `Invalid actionType "${actionType}" returned by provider. Must be one of: ${VALID_ACTIONS.join(', ')}`
      );
    }

    const proposal: NpcActionProposal = {
      actionType,
      targetAgentId: typeof parsed.targetAgentId === 'string' ? parsed.targetAgentId : undefined,
      establishmentId:
        typeof parsed.establishmentId === 'string'
          ? parsed.establishmentId
          : context.perception.establishment?.id,
      reasoningContext:
        typeof parsed.reasoningContext === 'string' ? parsed.reasoningContext : undefined,
      requestedAt: context.perception.worldTime,
    };

    return {
      proposal,
      providerId: this.id,
      modelUsed: this.model,
      rawResponse: rawJson,
      latencyMs: Date.now() - startTime,
    };
  }
}
