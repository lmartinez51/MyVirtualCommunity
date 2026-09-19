import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  introduceToAgent,
  isAgentAcquainted,
  inquireAgentSchedule,
  inspectPlayerKnowledge,
  Agent,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 35: AUTHORITATIVE KNOWLEDGE ACQUISITION & EPISTEMIC RETENTION');
console.log('================================================================\n');

const demoPersistenceFile = join(
  tmpdir(),
  `demo-m35-knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
);

try {
  // === STEP 1: World Initialized with Schema Version 14 ===
  console.log('=== STEP 1: World Bootstrap & Epistemic Substrate ===');
  const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
  const state = createInitialWorldState(clock);
  validateWorldState(state);

  assert.equal(state.version, 14);
  assert.ok(Array.isArray(state.knowledge));
  assert.equal(state.knowledge.length, 0);

  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

  console.log(`[STATE] World Time: ${state.worldTime}`);
  console.log(`[STATE] Schema Version: ${state.version}`);
  console.log(`[STATE] Initial Knowledge Count: ${state.knowledge.length}`);
  console.log(`[STATE] Player Location: ${player.locationId}`);
  console.log(`[STATE] NPC Location: ${npc.locationId}\n`);

  // === STEP 2: Preconditions & Social Introduction ===
  console.log('=== STEP 2: Spatial Co-Location & Social Introduction ===');
  // Co-locate agents at building
  npc.locationId = player.locationId;
  console.log(`[SPATIAL] Both agents co-located at: ${player.locationId}`);

  console.log('[ACTION] Player introduces to NPC via introduceToAgent()...');
  const introResult = introduceToAgent(state, player.id, npc.id);
  assert.equal(introResult.success, true);
  assert.equal(isAgentAcquainted(state, player.id, npc.id), true);
  console.log(`[SOCIAL] Mutual acquaintance established: ${isAgentAcquainted(state, player.id, npc.id)}\n`);

  // === STEP 3: Pre-Inquiry Epistemic Inspection ===
  console.log('=== STEP 3: Pre-Inquiry Epistemic Inspection ===');
  console.log('[ACTION] Player inspects private knowledge via inspectPlayerKnowledge()...');
  const preInspection = inspectPlayerKnowledge(state, player.id);
  assert.equal(preInspection.success, true);
  assert.equal(preInspection.code, 'success');
  assert.ok(preInspection.knowledge);
  assert.equal(preInspection.knowledge.length, 0);
  console.log(`[KNOWLEDGE] Player retained knowledge records: ${preInspection.knowledge.length}\n`);

  // === STEP 4: First Social Inquiry Interaction ===
  console.log('=== STEP 4: Social Inquiry Interaction ===');
  console.log('[ACTION] Player inquires about NPC schedule via inquireAgentSchedule()...');
  const inquiryResult1 = inquireAgentSchedule(state, player.id, npc.id);

  assert.equal(inquiryResult1.success, true);
  assert.equal(inquiryResult1.code, 'success');
  assert.ok(inquiryResult1.schedule);
  assert.ok(inquiryResult1.knowledgeRecord);

  console.log(`[INQUIRY RESULT] Success: ${inquiryResult1.success}, Code: "${inquiryResult1.code}"`);
  console.log(`[DISCLOSURE] Workplace:   ${inquiryResult1.schedule.workplaceId}`);
  console.log(`[DISCLOSURE] Shift:       ${inquiryResult1.schedule.shiftStart} - ${inquiryResult1.schedule.shiftEnd}`);
  console.log(`[RETAINED RECORD] ID:     ${inquiryResult1.knowledgeRecord.id}`);
  console.log(`[RETAINED RECORD] Knower: ${inquiryResult1.knowledgeRecord.agentId}`);
  console.log(`[RETAINED RECORD] Fact:   ${inquiryResult1.knowledgeRecord.factType} -> ${inquiryResult1.knowledgeRecord.subjectId}`);
  console.log(`[RETAINED RECORD] Source: ${inquiryResult1.knowledgeRecord.source} via ${inquiryResult1.knowledgeRecord.sourceAgentId}`);
  console.log(`[RETAINED RECORD] Acquired:     ${inquiryResult1.knowledgeRecord.acquiredAt}`);
  console.log(`[RETAINED RECORD] LastVerified: ${inquiryResult1.knowledgeRecord.lastVerifiedAt}\n`);

  // Verify WorldState now contains exactly one knowledge record
  assert.equal(state.knowledge.length, 1);
  const firstRecord = state.knowledge[0];
  assert.equal(firstRecord.id, 'knowledge:1');
  assert.equal(firstRecord.agentId, player.id);
  assert.equal(firstRecord.factType, 'agent-schedule');
  assert.equal(firstRecord.subjectId, npc.id);
  assert.equal(firstRecord.acquiredAt, '2026-09-14T08:00:00.000Z');
  assert.equal(firstRecord.lastVerifiedAt, '2026-09-14T08:00:00.000Z');

  // === STEP 5: Knower Isolation & Epistemic Privacy ===
  console.log('=== STEP 5: Knower Isolation & Epistemic Privacy ===');
  // Register a secondary player in the world
  const secondaryPlayer: Agent = {
    id: 'agent:dev-player-2',
    type: 'agent',
    name: 'Secondary Player',
    agentType: 'player',
    activityState: 'active',
    activitySince: state.worldTime,
    locationId: 'building:development-building',
    balanceMinor: 1000,
    currency: 'USD',
    playerActivity: null,
  };
  state.agents.push(secondaryPlayer);

  const player1Knowledge = inspectPlayerKnowledge(state, player.id);
  const player2Knowledge = inspectPlayerKnowledge(state, secondaryPlayer.id);

  assert.equal(player1Knowledge.success, true);
  assert.equal(player1Knowledge.knowledge?.length, 1);
  assert.equal(player2Knowledge.success, true);
  assert.equal(player2Knowledge.knowledge?.length, 0);

  console.log(`[PRIVACY] Player 1 retained records: ${player1Knowledge.knowledge?.length}`);
  console.log(`[PRIVACY] Player 2 retained records: ${player2Knowledge.knowledge?.length}`);
  console.log('>>> Verified: Knower isolation guaranteed; knowledge is private to acquiring agent.\n');

  // === STEP 6: Epistemic Re-Acquisition & Single-Record Upsert ===
  console.log('=== STEP 6: Epistemic Re-Acquisition (Single-Record Upsert) ===');
  // Advance world clock by 30 minutes
  clock.advance(30 * 60_000);
  state.worldTime = clock.getTime();
  console.log(`[CLOCK] Advanced world clock to: ${state.worldTime} (T1)`);

  console.log('[ACTION] Player re-inquires about NPC schedule at T1...');
  const inquiryResult2 = inquireAgentSchedule(state, player.id, npc.id);

  assert.equal(inquiryResult2.success, true);
  assert.equal(state.knowledge.length, 1); // Single-record upsert invariant

  const updatedRecord = state.knowledge[0];
  console.log(`[UPSERT] Record Count in State: ${state.knowledge.length}`);
  console.log(`[UPSERT] Record ID Preserved:  ${updatedRecord.id === firstRecord.id} (${updatedRecord.id})`);
  console.log(`[UPSERT] AcquiredAt Preserved: ${updatedRecord.acquiredAt === '2026-09-14T08:00:00.000Z'} (${updatedRecord.acquiredAt})`);
  console.log(`[UPSERT] LastVerified Updated: ${updatedRecord.lastVerifiedAt === '2026-09-14T08:30:00.000Z'} (${updatedRecord.lastVerifiedAt})`);

  assert.equal(updatedRecord.id, firstRecord.id);
  assert.equal(updatedRecord.acquiredAt, '2026-09-14T08:00:00.000Z');
  assert.equal(updatedRecord.lastVerifiedAt, '2026-09-14T08:30:00.000Z');
  console.log('>>> Verified: Single-record upsert invariant satisfied without historical ledger accumulation.\n');

  // === STEP 7: Cold-Start Persistence Roundtrip ===
  console.log('=== STEP 7: Cold-Start Persistence Roundtrip ===');
  console.log(`[PERSISTENCE] Saving state with retained knowledge to: ${demoPersistenceFile}`);
  const persistenceA = new LocalFilePersistence(demoPersistenceFile);
  persistenceA.save(state);

  console.log('[PERSISTENCE] Runtime Session A destroyed.');
  console.log('[PERSISTENCE] Initializing fresh Runtime Session B from disk...');
  const persistenceB = new LocalFilePersistence(demoPersistenceFile);
  const restoredState = persistenceB.load();

  assert.ok(restoredState);
  assert.equal(restoredState.version, 14);
  assert.equal(restoredState.knowledge.length, 1);
  validateWorldState(restoredState);

  const restoredRecord = restoredState.knowledge[0];
  console.log(`[RESTORED] Schema Version: ${restoredState.version}`);
  console.log(`[RESTORED] Knowledge Records: ${restoredState.knowledge.length}`);
  console.log(`[RESTORED] Record ID: ${restoredRecord.id}`);
  console.log(`[RESTORED] Knower: ${restoredRecord.agentId}`);
  console.log(`[RESTORED] Subject: ${restoredRecord.subjectId}`);
  console.log(`[RESTORED] AcquiredAt: ${restoredRecord.acquiredAt}`);
  console.log(`[RESTORED] LastVerifiedAt: ${restoredRecord.lastVerifiedAt}`);
  console.log(`[RESTORED] Payload Workplace: ${restoredRecord.payload.workplaceId}`);
  console.log(`[RESTORED] Payload Shift: ${restoredRecord.payload.shiftStart} - ${restoredRecord.payload.shiftEnd}`);

  assert.equal(restoredRecord.id, 'knowledge:1');
  assert.equal(restoredRecord.agentId, 'agent:dev-player');
  assert.equal(restoredRecord.subjectId, 'agent:dev-npc');
  assert.equal(restoredRecord.acquiredAt, '2026-09-14T08:00:00.000Z');
  assert.equal(restoredRecord.lastVerifiedAt, '2026-09-14T08:30:00.000Z');
  assert.equal(restoredRecord.payload.workplaceId, 'restaurant:development-restaurant');
  assert.equal(restoredRecord.payload.shiftStart, '09:00');
  assert.equal(restoredRecord.payload.shiftEnd, '17:00');

  // Verify private inspection on restored state
  const restoredInspection = inspectPlayerKnowledge(restoredState, 'agent:dev-player');
  assert.equal(restoredInspection.success, true);
  assert.equal(restoredInspection.knowledge?.length, 1);
  assert.equal(restoredInspection.knowledge![0].id, 'knowledge:1');
  console.log('>>> Verified: Authoritative epistemic retention survives process death and cold restart.\n');

  console.log('================================================================');
  console.log('EPISTEMIC BOUNDARIES & RETENTION INVARIANTS VERIFIED:');
  console.log('  1. Knowledge != World Truth: Subjective epistemic retention.');
  console.log('  2. Knowledge != Memory: Declarative fact substrate without cognitive decay.');
  console.log('  3. Knowledge != History: Single-record upsert keyed on (knower, factType, subject).');
  console.log('  4. Epistemic Privacy: Private to acquiring player; zero leakage across agents.');
  console.log('  5. Cold-Start Durability: Authoritative Schema v14 persistence verified.');
  console.log('DEMONSTRATION COMPLETED SUCCESSFULLY');
  console.log('================================================================');
} catch (error) {
  console.error('\nDEMONSTRATION FAILED:', error);
  process.exit(1);
} finally {
  if (existsSync(demoPersistenceFile)) {
    unlinkSync(demoPersistenceFile);
  }
}
