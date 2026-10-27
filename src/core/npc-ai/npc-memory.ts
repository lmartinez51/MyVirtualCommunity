/**
 * Milestone 92: Structured NPC Memory Store
 *
 * Implements a minimal, bounded memory mechanism for NPCs.
 *
 * Invariant: Memory is an NPC-local cognitive structure.
 * It is completely distinct from World History, World Truth, and persistence.
 * Memory CANNOT rewrite world history or mutate WorldState directly.
 */

import type { NpcMemory, NpcMemoryType } from './npc-cognition-types.js';

export interface AddMemoryParams {
  type: NpcMemoryType;
  summary: string;
  timestamp: string;
  targetAgentId?: string;
  establishmentId?: string;
}

export class NpcMemoryStore {
  private readonly maxMemories: number;
  private memories: NpcMemory[] = [];
  private monotonicCounter: number = 0;

  constructor(maxMemories: number = 10) {
    this.maxMemories = Math.max(1, maxMemories);
  }

  /**
   * Records a new structured memory entry.
   * If the buffer exceeds max capacity, drops the oldest memory.
   */
  public addMemory(params: AddMemoryParams): NpcMemory {
    this.monotonicCounter += 1;
    const memory: NpcMemory = {
      id: `mem:${Date.now()}-${this.monotonicCounter}`,
      timestamp: params.timestamp,
      type: params.type,
      summary: params.summary,
      targetAgentId: params.targetAgentId,
      establishmentId: params.establishmentId,
    };

    this.memories.push(memory);
    if (this.memories.length > this.maxMemories) {
      this.memories.shift();
    }
    return memory;
  }

  /**
   * Returns a read-only snapshot of all stored memories.
   */
  public getMemories(): readonly NpcMemory[] {
    return [...this.memories];
  }

  /**
   * Returns memories relevant to a specific target agent.
   */
  public getMemoriesForAgent(agentId: string): readonly NpcMemory[] {
    return this.memories.filter((m) => m.targetAgentId === agentId);
  }

  /**
   * Returns count of stored memories.
   */
  public getCount(): number {
    return this.memories.length;
  }

  /**
   * Clears all memories (used in tests or fresh restarts).
   */
  public clear(): void {
    this.memories = [];
    this.monotonicCounter = 0;
  }
}
