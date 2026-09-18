import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import {
  createPresentationModel,
  findInspectableEntity,
  getAffordanceGroup,
} from '../src/client/projections.js';

describe('Milestone 30: Client Boundary & Presentation Shell Verification', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `test-m30-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    const controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
    });

    server = createWorldServer({ controller, silent: true });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (existsSync(tempFilePath)) {
      unlinkSync(tempFilePath);
    }
  });

  test('Test 1 — Initial connection: client retrieves status and location from M29 runtime', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);

    const connected = await session.init();
    assert.equal(connected, true);

    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.ok(state.model);
    assert.equal(state.model.activePlayerId, 'agent:dev-player');
    assert.equal(state.model.locationId, 'building:development-building');
    assert.equal(state.model.context, 'BUILDING');
  });

  test('Test 2 — Read-only projection: client rendering and inspection does not mutate server state', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);

    const mtimeBefore = statSync(tempFilePath).mtimeMs;
    const contentBefore = readFileSync(tempFilePath, 'utf-8');

    await session.init();

    // Verify disk content and mtime are byte-for-byte identical
    assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
    assert.equal(readFileSync(tempFilePath, 'utf-8'), contentBefore);

    // Static asset queries also produce zero mutations
    const staticRes = await fetch(`${baseUrl}/client/style.css`);
    assert.equal(staticRes.status, 200);
    assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
  });

  test('Test 3 — Valid command: UI action reaches command endpoint and projection changes authoritatively', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    assert.equal(session.getState().model?.locationId, 'building:development-building');

    // Execute leaveBuilding
    const success = await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(success, true);

    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.equal(state.model?.locationId, 'street:development-street');
    assert.equal(state.model?.context, 'STREET');

    // Verify on disk
    const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
    const player = persisted.agents.find((a: { id: string }) => a.id === 'agent:dev-player');
    assert.equal(player.locationId, 'street:development-street');
  });

  test('Test 4 — Invalid command: rejected server command does not cause client-side world mutation', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const mtimeBefore = statSync(tempFilePath).mtimeMs;

    // Attempt invalid command: enter non-existent building
    const success = await session.executeCommand('enterBuilding', {
      buildingId: 'building:imaginary',
    });
    assert.equal(success, false);

    const state = session.getState();
    assert.equal(state.status, 'DOMAIN_ERROR');
    assert.ok(state.errorMessage);
    // Location preserved without optimistic corruption
    assert.equal(state.model?.locationId, 'building:development-building');
    assert.equal(state.model?.context, 'BUILDING');

    // Zero disk write
    assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
  });

  test('Test 5 — Refresh: after command, client refreshes from server rather than applying local prediction', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    // Verify command in progress state exists during execution
    let capturedStateDuringExecution: string | null = null;
    const unsubscribe = session.subscribe((s) => {
      if (s.status === 'COMMAND_IN_PROGRESS') {
        capturedStateDuringExecution = s.status;
      }
    });

    await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    unsubscribe();

    assert.equal(capturedStateDuringExecution, 'COMMAND_IN_PROGRESS');
    const finalState = session.getState();
    assert.equal(finalState.status, 'READY');
    assert.equal(finalState.model?.locationId, 'street:development-street');
  });

  test('Test 6 — Server unavailable: client displays connection error state rather than crashing', async () => {
    // Port 1 is reserved and not running
    const apiClient = new ApiClient('http://127.0.0.1:1');
    const session = new ClientSession(apiClient);

    const connected = await session.init();
    assert.equal(connected, false);

    const state = session.getState();
    assert.equal(state.status, 'DISCONNECTED');
    assert.ok(state.errorMessage?.includes('Could not connect'));
    assert.equal(state.model, null);

    // Command dispatch also fails safely without unhandled exceptions
    const cmdResult = await session.executeCommand('leaveBuilding', {});
    assert.equal(cmdResult, false);
    assert.equal(session.getState().status, 'DISCONNECTED');
  });

  test('Test 7 — Perception boundary: client only renders places and affordances in server projection', () => {
    // Fabricated server projection with restricted perception
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const locationData = {
      success: true,
      location: {
        id: 'street:development-street',
        type: 'street',
        name: 'Development Street',
        // Server only exposes 1 accessible building and 0 neighboring streets
        accessibleBuildings: [
          { id: 'building:development-building', name: 'Development Building', type: 'building' },
        ],
        neighboringStreets: [],
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);

    assert.equal(model.context, 'STREET');
    assert.equal(model.accessibleBuildings.length, 1);
    assert.equal(model.neighboringStreets.length, 0);

    // Only 1 enterBuilding affordance exists; no traverseStreet affordances invented
    assert.equal(model.affordances.length, 1);
    assert.equal(model.affordances[0]?.commandName, 'enterBuilding');
    assert.equal(model.affordances[0]?.payload.buildingId, 'building:development-building');

    // Verify no unexposed entities leaked
    assert.equal(model.containedRestaurants.length, 0);
    assert.equal(model.offerings.length, 0);
    assert.equal(model.opportunities.length, 0);
  });

  test('Test 8 — Dynamic Opportunity: opportunity names are derived strictly from projection data', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const customOppName = 'Tacos Al Pastor Special';
    const locationData = {
      success: true,
      location: {
        id: 'building:development-building',
        type: 'building',
        name: 'Development Building',
        parentStreet: { id: 'street:development-street', name: 'Development Street', type: 'street' },
        containedRestaurants: [
          { id: 'restaurant:taqueria', name: 'Taquería Juárez', type: 'restaurant' },
        ],
        agents: [],
        opportunities: [
          {
            id: 'opportunity:tacos',
            name: customOppName,
            description: 'Fresh tacos available right now.',
            offeringId: 'offering:tacos',
            restaurantId: 'restaurant:taqueria',
          },
        ],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.opportunities.length, 1);
    assert.equal(model.opportunities[0]?.name, customOppName);
  });

  test('Test 9 — Zero Contained Restaurants: building with 0 restaurants produces 0 restaurant visual entities and 0 enterRestaurant affordances', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const locationData = {
      success: true,
      location: {
        id: 'building:quiet-office',
        type: 'building',
        name: 'Quiet Office',
        parentStreet: { id: 'street:development-street', name: 'Development Street', type: 'street' },
        containedRestaurants: [], // Explicitly zero
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.context, 'BUILDING');
    assert.equal(model.containedRestaurants.length, 0);
    assert.ok(!model.affordances.some((a) => a.commandName === 'enterRestaurant'));
  });

  test('Test 10 — Zero Agents: location with 0 agents produces 0 social affordances', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const locationData = {
      success: true,
      location: {
        id: 'restaurant:empty-cafe',
        type: 'restaurant',
        name: 'Empty Cafe',
        operationalState: 'open',
        offerings: [{ id: 'offering:tea', name: 'Hot Tea', priceMinor: 300, currency: 'USD' }],
        agents: [], // Explicitly zero
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.agents.length, 0);
    assert.ok(!model.affordances.some((a) => a.commandName === 'greetAgent'));
    assert.ok(!model.affordances.some((a) => a.commandName === 'introduceAgent'));
  });

  test('Test 11 — startCoffee Negative Assertion: startCoffee is never exposed in affordances', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    // Even in an open restaurant with coffee offering, startCoffee must NOT be exposed
    const locationData = {
      success: true,
      location: {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        operationalState: 'open',
        offerings: [
          { id: 'offering:development-coffee', name: 'Coffee', priceMinor: 500, currency: 'USD' },
        ],
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.ok(model.affordances.some((a) => a.commandName === 'purchaseOffering'));
    assert.ok(!model.affordances.some((a) => a.commandName === 'startCoffee'));
  });

  test('Test 12 — Static file isolation: raw TypeScript source files are strictly not served', async () => {
    const resTs = await fetch(`${baseUrl}/client/index.ts`);
    assert.equal(resTs.status, 404);

    const resJs = await fetch(`${baseUrl}/client/index.js`);
    assert.equal(resJs.status, 200);
    assert.equal(resJs.headers.get('content-type'), 'application/javascript; charset=utf-8');
  });

  test('Test 13 — Tests A, B, C, D: Arbitrary building names and IDs do NOT inject residential classification', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    // Location with arbitrary names that previously triggered substring heuristics
    const locationData = {
      success: true,
      location: {
        id: 'street:custom-street',
        type: 'street',
        name: 'Custom Street',
        accessibleBuildings: [
          { id: 'building:casa-del-sol', name: 'Casa del Sol', type: 'building' },
          { id: 'building:home-center', name: 'Home Center', type: 'building' },
          { id: 'building:residence-plaza', name: 'Residence Plaza', type: 'building' },
          { id: 'building:commercial-house', name: 'Commercial House', type: 'building' },
          { id: 'building:building-42', name: 'Building 42', type: 'building' },
          { id: 'building:el-palacio', name: 'El Palacio', type: 'building' },
          { id: 'building:residence-test', name: 'Testing Complex', type: 'building' },
          { id: 'building:home-test', name: 'Habitat Labs', type: 'building' },
          { id: 'building:casa-test', name: 'Center Plaza', type: 'building' },
          { id: 'building:commercial-test', name: 'Point Alpha', type: 'building' },
        ],
        neighboringStreets: [],
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.context, 'STREET');
    assert.equal(model.accessibleBuildings.length, 10);

    for (const b of model.accessibleBuildings) {
      // Authoritative PlaceType 'building' is preserved without synthetic subtype classification
      assert.equal(b.type, 'building');
      // Verify no synthetic residential classification field exists
      assert.equal((b as any).isResidence, undefined);
      assert.equal((b as any).isResidential, undefined);
      assert.equal((b as any).category, undefined);
      assert.equal((b as any).buildingKind, undefined);
      assert.equal((b as any).placeSubtype, undefined);
    }
  });

  test('Test 14 — Source Inspection: Renderer strictly contains zero name-based or ID-based residential heuristics', () => {
    const rendererSource = readFileSync(join(process.cwd(), 'src', 'client', 'renderer.ts'), 'utf-8');
    const prohibitedPatterns = [
      /\.includes\(\s*['"]residence['"]\s*\)/i,
      /\.includes\(\s*['"]casa['"]\s*\)/i,
      /\.includes\(\s*['"]apartment['"]\s*\)/i,
      /\.includes\(\s*['"]home['"]\s*\)/i,
      /\.startsWith\(\s*['"]residence['"]\s*\)/i,
      /b\.id\.includes/i,
      /b\.containedRestaurants\.length\s*===?\s*0/i,
      /b\.containedRestaurants\.length\s*>\s*0/i,
    ];

    for (const pattern of prohibitedPatterns) {
      assert.ok(
        !pattern.test(rendererSource),
        `Prohibited domain inference pattern found in renderer.ts: ${pattern.toString()}`
      );
    }
  });

  test('Test 15 — Test E: Existing development data produces neutral building items using only authoritative data', () => {
    const statusData = {
      worldId: 'juarez-el-paso',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const locationData = {
      success: true,
      location: {
        id: 'street:development-street',
        type: 'street',
        name: 'Development Street',
        accessibleBuildings: [
          { id: 'building:development-building', name: 'Development Building', type: 'building' },
          { id: 'building:development-residence', name: 'Development Residence', type: 'building' },
        ],
        neighboringStreets: [{ id: 'street:avenida-juarez', name: 'Avenida Juárez', type: 'street' }],
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.accessibleBuildings.length, 2);
    assert.equal(model.accessibleBuildings[0].type, 'building');
    assert.equal(model.accessibleBuildings[1].type, 'building');
    assert.equal((model.accessibleBuildings[1] as any).isResidence, undefined);
  });

  test('Test 16 — Test F: Empty opportunities produces 0 opportunity presentation items', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:dev-player',
    };

    const locationData = {
      success: true,
      location: {
        id: 'building:development-building',
        type: 'building',
        name: 'Development Building',
        parentStreet: { id: 'street:development-street', name: 'Development Street', type: 'street' },
        containedRestaurants: [],
        opportunities: [], // Explicitly empty
        agents: [],
      },
    };

    const model = createPresentationModel(statusData, locationData);
    assert.equal(model.opportunities.length, 0);
  });

  test('Test 17 — Milestone 32: Affordance Grouping Taxonomy maps all commands strictly to MOVE, INTERACT, or ACT', () => {
    // Check mapping function
    assert.equal(getAffordanceGroup('enterBuilding'), 'MOVE');
    assert.equal(getAffordanceGroup('leaveBuilding'), 'MOVE');
    assert.equal(getAffordanceGroup('enterRestaurant'), 'MOVE');
    assert.equal(getAffordanceGroup('exitRestaurant'), 'MOVE');
    assert.equal(getAffordanceGroup('traverseStreet'), 'MOVE');
    assert.equal(getAffordanceGroup('greetAgent'), 'INTERACT');
    assert.equal(getAffordanceGroup('introduceAgent'), 'INTERACT');
    assert.equal(getAffordanceGroup('purchaseOffering'), 'ACT');

    // Check presentation model in all 3 contexts
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:player-1',
    };

    // Street context
    const streetModel = createPresentationModel(statusData, {
      success: true,
      location: {
        id: 'street:1',
        type: 'street',
        name: 'Street 1',
        accessibleBuildings: [{ id: 'bldg:1', name: 'Bldg 1', type: 'building' }],
        neighboringStreets: [{ id: 'street:2', name: 'Street 2', type: 'street' }],
        agents: [{ id: 'agent:npc-1', name: 'Alice', agentType: 'human', isAcquainted: false }],
      },
    });

    const streetMove = streetModel.affordances.filter((a) => a.group === 'MOVE');
    const streetInteract = streetModel.affordances.filter((a) => a.group === 'INTERACT');
    assert.equal(streetMove.length, 2); // enterBuilding + traverseStreet
    assert.equal(streetInteract.length, 2); // greetAgent + introduceAgent

    // Restaurant context
    const restModel = createPresentationModel(statusData, {
      success: true,
      location: {
        id: 'restaurant:1',
        type: 'restaurant',
        name: 'Cafe 1',
        parentBuilding: { id: 'bldg:1', name: 'Bldg 1', type: 'building' },
        operationalState: 'open',
        offerings: [{ id: 'off:1', name: 'Tea', priceMinor: 250, currency: 'USD' }],
        agents: [],
      },
    });

    const restMove = restModel.affordances.filter((a) => a.group === 'MOVE');
    const restAct = restModel.affordances.filter((a) => a.group === 'ACT');
    assert.equal(restMove.length, 1); // exitRestaurant
    assert.equal(restAct.length, 1); // purchaseOffering
  });

  test('Test 18 — Milestone 32: Projection-Driven Entity Inspection returns strictly projected facts and zero fabricated attributes', () => {
    const statusData = {
      worldId: 'test-world',
      worldTime: '2026-09-17T12:00:00.000Z',
      schemaVersion: 11,
      activePlayerId: 'agent:player-1',
    };

    const model = createPresentationModel(statusData, {
      success: true,
      location: {
        id: 'restaurant:la-taqueria',
        type: 'restaurant',
        name: 'La Taquería',
        parentBuilding: { id: 'building:plaza', name: 'Plaza Central', type: 'building' },
        operationalState: 'open',
        offerings: [{ id: 'offering:tacos', name: 'Tacos', priceMinor: 450, currency: 'USD' }],
        opportunities: [
          {
            id: 'opp:lunch',
            name: 'Lunch Special',
            description: 'Midday taco discount',
            offeringId: 'offering:tacos',
            restaurantId: 'restaurant:la-taqueria',
          },
        ],
        agents: [
          { id: 'agent:player-1', name: 'Player One', agentType: 'player' },
          { id: 'agent:npc-carlos', name: 'Carlos', agentType: 'human', isAcquainted: true },
        ],
      },
    });

    // 1. Inspect Location (Place)
    const placeEntity = findInspectableEntity(model, 'restaurant:la-taqueria');
    assert.ok(placeEntity);
    assert.equal(placeEntity.kind, 'place');
    assert.equal(placeEntity.name, 'La Taquería');
    assert.equal(placeEntity.details['Location Type'], 'restaurant');
    assert.equal(placeEntity.details['Parent Location'], 'Plaza Central');
    assert.equal(placeEntity.details['Operational State'], 'open');
    // Ensure no fabricated domain data
    assert.equal(placeEntity.details['cuisine'], undefined);
    assert.equal(placeEntity.details['rating'], undefined);

    // 2. Inspect Agent
    const agentEntity = findInspectableEntity(model, 'agent:npc-carlos');
    assert.ok(agentEntity);
    assert.equal(agentEntity.kind, 'agent');
    assert.equal(agentEntity.name, 'Carlos');
    assert.equal(agentEntity.details['Agent Type'], 'human');
    assert.equal(agentEntity.details['Acquaintance Status'], 'Acquainted');
    // Strict verification: zero fabricated attributes!
    assert.equal(agentEntity.details['Occupation'], undefined);
    assert.equal(agentEntity.details['Age'], undefined);
    assert.equal(agentEntity.details['Backstory'], undefined);
    assert.equal(agentEntity.details['Balance'], undefined);

    // 3. Inspect Offering
    const offEntity = findInspectableEntity(model, 'offering:tacos');
    assert.ok(offEntity);
    assert.equal(offEntity.kind, 'offering');
    assert.equal(offEntity.name, 'Tacos');
    assert.equal(offEntity.details['Price'], '$4.50');
    assert.equal(offEntity.details['Currency'], 'USD');
    assert.equal(offEntity.details['Calories'], undefined);

    // 4. Inspect Opportunity
    const oppEntity = findInspectableEntity(model, 'opp:lunch');
    assert.ok(oppEntity);
    assert.equal(oppEntity.kind, 'opportunity');
    assert.equal(oppEntity.name, 'Lunch Special');
    assert.equal(oppEntity.details['Description'], 'Midday taco discount');
    assert.equal(oppEntity.details['Offering ID'], 'offering:tacos');

    // 5. Inspect Non-Existent Entity
    const missingEntity = findInspectableEntity(model, 'non-existent-id');
    assert.equal(missingEntity, null);
  });

  test('Test 19 — Milestone 32: Entity Selection and Inspection State Machine in ClientSession', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const model = session.getState().model!;
    const bldg = model.locationId;
    const entity = findInspectableEntity(model, bldg);
    assert.ok(entity);

    // 1. Select entity
    session.selectEntity(entity);
    assert.equal(session.getState().selectedEntity?.id, bldg);

    // 2. Deselect entity
    session.selectEntity(null);
    assert.equal(session.getState().selectedEntity, null);

    // 3. Move location and verify selectedEntity reconciliation
    session.selectEntity(entity);
    assert.equal(session.getState().selectedEntity?.id, bldg);

    // Leave building to street
    await session.executeCommand('leaveBuilding', { buildingId: bldg });
    const newState = session.getState();
    assert.equal(newState.model?.locationId, 'street:development-street');

    // Building is still observable from the street, so selectedEntity remains updated
    assert.ok(newState.selectedEntity);
    assert.equal(newState.selectedEntity?.id, bldg);
  });

  test('Test 20 — Milestone 32: Transient Command Success Feedback confirms authoritative reconciliation', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    // Initial state has no feedback
    assert.equal(session.getState().feedbackMessage, null);

    // Execute valid command
    const success = await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(success, true);

    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.ok(state.feedbackMessage);
    assert.equal(state.feedbackMessage.type, 'success');
    assert.ok(state.feedbackMessage.text.includes('Returned to Development Street'));

    // Re-entering building
    await session.executeCommand('enterBuilding', {
      buildingId: 'building:development-building',
    });
    const state2 = session.getState();
    assert.ok(state2.feedbackMessage);
    assert.ok(state2.feedbackMessage.text.includes('Entered Development Building'));
  });

  test('Test 21 — Milestone 32: Domain Rejection (422) clears success feedback and displays domain error message', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    // First do a successful command to obtain a success message
    await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.ok(session.getState().feedbackMessage);

    // Now execute an invalid command (e.g. entering non-existent building)
    const success = await session.executeCommand('enterBuilding', {
      buildingId: 'building:does-not-exist',
    });
    assert.equal(success, false);

    const state = session.getState();
    assert.equal(state.status, 'DOMAIN_ERROR');
    assert.ok(state.errorMessage);
    // Success feedback is cleared!
    assert.equal(state.feedbackMessage, null);
  });

  test('Test 22 — Milestone 32: Inspection produces zero server mutations and preserves schema version 11', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const mtimeBefore = statSync(tempFilePath).mtimeMs;
    const contentBefore = readFileSync(tempFilePath, 'utf-8');

    // Multiple inspections
    const model = session.getState().model!;
    findInspectableEntity(model, model.locationId);
    session.selectEntity(findInspectableEntity(model, model.locationId));
    session.selectEntity(null);

    // Verify zero mutations on disk
    assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
    assert.equal(readFileSync(tempFilePath, 'utf-8'), contentBefore);
  });
});
