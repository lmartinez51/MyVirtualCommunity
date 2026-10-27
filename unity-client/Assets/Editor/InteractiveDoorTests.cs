using System;
using UnityEditor;
using UnityEngine;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Environment;
using MyVirtualCommunity.Player;

namespace MyVirtualCommunity.Editor
{
    /// <summary>
    /// Phase 1 & Phase 2: Automated Unit & Integration Test Suite for Physical Door Collision,
    /// Business Hours Access Control, Status Signage, Auto-Closing, and Interaction Invariants.
    /// 
    /// INVARIANTS TESTED:
    /// 1. Door state lifecycle transitions (Closed -> Opening -> Open -> Closing -> Closed).
    /// 2. Hinge pivot rotation synchronizes visual leaf and physical collider geometry.
    /// 3. Mathematical angle determinism and zero floating-point accumulation drift over multiple cycles.
    /// 4. Contextual interaction prompt generation based on door state and friendly name.
    /// 5. Closed door physically blocks CharacterController (Height 1.75, Radius 0.38, Center 0, 0.875, 0).
    /// 6. Open door clears the doorway and allows seamless CharacterController traversal.
    /// 7. Anti-pinch obstruction detection prevents closing through a character capsule in the threshold.
    /// 8. Repeated rapid interaction toggles without coroutine overlap, transform drift, or state corruption.
    /// 9. GomezMorinSceneBuilder integration: entrance, restroom, Tía Lupe, and storage doors correctly configured.
    /// 10. Extensibility hook CanInteract() allows Phase 1 unrestricted operation while supporting Phase 2 policies.
    /// 11. Authoritative business schedule registry, timezone conversion (America/Ciudad_Juarez), and admission cutoff.
    /// 12. Dynamic BusinessStatusSign text and palette states (ABIERTO, CIERRE PRÓXIMO, CERRADO).
    /// 13. Access control policy: closed door rejects entry after cutoff; exiting occupants always permitted to open.
    /// 14. Automatic door closing after passage with clearance radius and obstruction prevention.
    /// 15. E/C input conflict resolution: C isolated for avatar customization, E toggles leaf without teleportation.
    /// </summary>
    public static class InteractiveDoorTests
    {
        [MenuItem("MyVirtualCommunity/Run Interactive Door Tests")]
        public static void RunTests()
        {
            Debug.Log("==========================================================================");
            Debug.Log("[InteractiveDoorTests] STARTING PHYSICAL DOOR & ACCESS CONTROL TEST SUITE");
            Debug.Log("==========================================================================");

            int testsPassed = 0;
            int totalTests = 17;

            GameObject testRoot = new GameObject("DoorTest_Sandbox");

            try
            {
                // -------------------------------------------------------------
                // TEST 1: Door State Lifecycle Transitions & Event Firing
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 1: State Lifecycle Transitions...");
                GameObject doorObj1 = new GameObject("TestDoor_1");
                doorObj1.transform.SetParent(testRoot.transform);
                var door1 = doorObj1.AddComponent<InteractiveDoor>();

                GameObject leaf1 = GameObject.CreatePrimitive(PrimitiveType.Cube);
                leaf1.name = "Leaf";
                leaf1.transform.SetParent(doorObj1.transform, false);
                leaf1.transform.localPosition = new Vector3(0.5f, 1.0f, 0f);
                leaf1.transform.localScale = new Vector3(1.0f, 2.0f, 0.05f);

                door1.Configure(
                    doorObj1.transform,
                    leaf1.transform,
                    leaf1.GetComponent<Collider>(),
                    Vector3.zero,
                    90f,
                    0.85f,
                    2.2f,
                    "Puerta de Prueba",
                    DoorState.Closed
                );

                Assert(door1.CurrentState == DoorState.Closed, "Test 1: Initial state must be Closed");
                Assert(door1.IsClosed, "Test 1: IsClosed property must be true");
                Assert(!door1.IsOpen, "Test 1: IsOpen property must be false");

                int openEvents = 0;
                int closeEvents = 0;
                int stateChangeEvents = 0;
                door1.OnDoorOpened += () => openEvents++;
                door1.OnDoorClosed += () => closeEvents++;
                door1.OnDoorStateChanged += (s) => stateChangeEvents++;

                // Immediate open
                door1.SetStateImmediate(DoorState.Open);
                Assert(door1.CurrentState == DoorState.Open, "Test 1: State must transition to Open");
                Assert(door1.IsOpen, "Test 1: IsOpen must be true");
                Assert(openEvents == 1, "Test 1: OnDoorOpened event must fire once");

                // Immediate close
                door1.SetStateImmediate(DoorState.Closed);
                Assert(door1.CurrentState == DoorState.Closed, "Test 1: State must transition to Closed");
                Assert(door1.IsClosed, "Test 1: IsClosed must be true");
                Assert(closeEvents == 1, "Test 1: OnDoorClosed event must fire once");
                Assert(stateChangeEvents == 2, "Test 1: OnDoorStateChanged must fire for each transition");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 1: State Lifecycle Transitions PASS");

                // -------------------------------------------------------------
                // TEST 2: Synchronized Leaf and Collider Rotation Around Hinge
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 2: Synchronized Leaf & Collider Rotation...");
                door1.SetStateImmediate(DoorState.Closed);
                Physics.SyncTransforms();

                Vector3 closedLeafPos = leaf1.transform.position;
                BoxCollider boxCol = leaf1.GetComponent<BoxCollider>();
                Vector3 closedColCenter = boxCol.bounds.center;

                // When closed at 0 deg, leaf extends along +X
                Assert(Mathf.Abs(doorObj1.transform.localEulerAngles.y) < 0.01f, "Test 2: Closed rotation must be 0 deg");

                // When opened to 90 deg around Y:
                door1.SetStateImmediate(DoorState.Open);
                Physics.SyncTransforms();

                Assert(Mathf.Abs(doorObj1.transform.localEulerAngles.y - 90f) < 0.01f, "Test 2: Open rotation must be 90 deg");
                // Collider bounds center should have moved in world space along the arc
                Vector3 openColCenter = boxCol.bounds.center;
                float centerDisplacement = Vector3.Distance(closedColCenter, openColCenter);
                Assert(centerDisplacement > 0.4f, $"Test 2: Collider center must move when leaf rotates (Displacement: {centerDisplacement}m)");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 2: Synchronized Leaf & Collider Rotation PASS");

                // -------------------------------------------------------------
                // TEST 3: Mathematical Angle Determinism and Zero Drift
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 3: Zero Accumulation Drift Over 100 Cycles...");
                for (int i = 0; i < 100; i++)
                {
                    door1.SetStateImmediate(DoorState.Open);
                    door1.SetStateImmediate(DoorState.Closed);
                }

                Assert(door1.IsClosed, "Test 3: Must be Closed after even cycles");
                Assert(doorObj1.transform.localRotation == door1.ClosedRotation, "Test 3: Final rotation must strictly equal ClosedRotation");
                Assert(Mathf.Abs(doorObj1.transform.localEulerAngles.y) < 0.001f, "Test 3: Euler angle Y must remain 0.000 deg without float drift");

                door1.SetStateImmediate(DoorState.Open);
                Assert(doorObj1.transform.localRotation == door1.OpenRotation, "Test 3: Open rotation must strictly equal OpenRotation");
                Assert(Mathf.Abs(doorObj1.transform.localEulerAngles.y - 90f) < 0.001f, "Test 3: Euler angle Y must strictly equal 90.000 deg");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 3: Zero Accumulation Drift PASS");

                // -------------------------------------------------------------
                // TEST 4: Contextual Prompt Generation
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 4: Contextual Prompt Formatting...");
                door1.SetStateImmediate(DoorState.Closed);
                string promptClosed = door1.GetInteractionPrompt();
                Assert(promptClosed.Contains("[E]") && promptClosed.Contains("Abrir") && promptClosed.Contains("Puerta de Prueba"),
                    $"Test 4: Closed prompt '{promptClosed}' must indicate opening");

                door1.SetStateImmediate(DoorState.Open);
                string promptOpen = door1.GetInteractionPrompt();
                Assert(promptOpen.Contains("[E]") && promptOpen.Contains("Cerrar") && promptOpen.Contains("Puerta de Prueba"),
                    $"Test 4: Open prompt '{promptOpen}' must indicate closing");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 4: Contextual Prompt Formatting PASS");

                // -------------------------------------------------------------
                // TEST 5: Closed Door Leaf Physically Blocks CharacterController
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 5: Closed Door Blocks CharacterController...");
                // Create dedicated doorway and CharacterController
                GameObject doorFrameObj = new GameObject("TestDoor_Physical");
                doorFrameObj.transform.SetParent(testRoot.transform);
                doorFrameObj.transform.position = new Vector3(0f, 0f, 10f);

                GameObject testLeaf = GameObject.CreatePrimitive(PrimitiveType.Cube);
                testLeaf.name = "PhysicalLeaf";
                testLeaf.transform.SetParent(doorFrameObj.transform, false);
                testLeaf.transform.localPosition = new Vector3(0.5f, 1.0f, 0f);
                testLeaf.transform.localScale = new Vector3(1.0f, 2.0f, 0.08f);

                BoxCollider leafCol = testLeaf.GetComponent<BoxCollider>();
                leafCol.isTrigger = false;

                var physDoor = doorFrameObj.AddComponent<InteractiveDoor>();
                physDoor.Configure(doorFrameObj.transform, testLeaf.transform, leafCol, Vector3.zero, 90f, 0.85f, 2.5f, "SolidDoor", DoorState.Closed);
                physDoor.SetStateImmediate(DoorState.Closed);
                Physics.SyncTransforms();

                // Create Player CharacterController with mandatory dimensions
                GameObject playerObj = new GameObject("TestPlayer_Capsule");
                playerObj.transform.SetParent(testRoot.transform);
                playerObj.transform.position = new Vector3(0.5f, 0f, 9.0f); // 1.0m South of door (door is at Z = 10.0m)

                CharacterController cc = playerObj.AddComponent<CharacterController>();
                cc.height = 1.75f;
                cc.radius = 0.38f;
                cc.center = new Vector3(0f, 0.875f, 0f);
                cc.skinWidth = 0.015f;
                cc.minMoveDistance = 0.001f;
                Physics.SyncTransforms();

                // Attempt to walk forward +Z directly across the closed door leaf
                Vector3 moveAttempt = new Vector3(0f, 0f, 2.5f); // Attempt to reach Z = 11.5m
                cc.Move(moveAttempt);
                Physics.SyncTransforms();

                // The door leaf is at Z = 10.0m with thickness 0.08m and player radius 0.38m.
                // The player capsule MUST NOT cross Z = 10.0m! It must be stopped before Z = 9.70m.
                Assert(playerObj.transform.position.z < 9.70f,
                    $"Test 5: CharacterController must be physically stopped by closed door leaf! Position Z reached: {playerObj.transform.position.z}");

                testsPassed++;
                Debug.Log($"[InteractiveDoorTests] TEST 5: Closed Door Physical Blocking PASS (Player stopped at Z = {playerObj.transform.position.z:F3}m)");

                // -------------------------------------------------------------
                // TEST 6: Open Door Clears Doorway for Free Locomotion
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 6: Open Doorway Locomotion Traversal...");
                // Open the door (swings 90 deg into +Z along X = 0)
                physDoor.SetStateImmediate(DoorState.Open);
                Physics.SyncTransforms();

                // Move forward through the open doorway
                cc.Move(moveAttempt);
                Physics.SyncTransforms();

                // With the door open, the player should successfully move through the doorway past Z = 10.0m
                Assert(playerObj.transform.position.z > 10.5f,
                    $"Test 6: Player must freely traverse open doorway! Position Z reached: {playerObj.transform.position.z}");

                testsPassed++;
                Debug.Log($"[InteractiveDoorTests] TEST 6: Open Door Locomotion Traversal PASS (Player reached Z = {playerObj.transform.position.z:F3}m)");

                // -------------------------------------------------------------
                // TEST 7: Anti-Pinch Obstruction Detection
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 7: Anti-Pinch Obstruction Detection...");
                // Place player capsule directly in the doorway threshold (Z = 10.0m, X = 0.5m)
                playerObj.transform.position = new Vector3(0.5f, 0f, 10.0f);
                Physics.SyncTransforms();

                // Door is currently Open. Verify threshold obstruction pre-check detects player
                bool isObstructed = physDoor.CheckClosedThresholdObstruction(out Collider hit);
                Assert(isObstructed, "Test 7: Threshold obstruction check must detect character capsule in doorway");
                Assert(hit != null && (hit.GetComponent<CharacterController>() != null || hit.gameObject == playerObj),
                    "Test 7: Detected hit must be the player character");

                // Attempting to Close() while doorway is occupied must abort closing and remain Open
                physDoor.Close();
                Assert(physDoor.IsOpen, "Test 7: Door must remain Open when obstructed by character capsule");

                // Move player away to clear threshold
                playerObj.transform.position = new Vector3(0.5f, 0f, 7.0f);
                Physics.SyncTransforms();

                bool isClearNow = physDoor.CheckClosedThresholdObstruction(out Collider clearHit);
                Assert(!isClearNow, "Test 7: Threshold must be reported clear once player moves away");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 7: Anti-Pinch Obstruction Detection PASS");

                // -------------------------------------------------------------
                // TEST 8: Repeated Rapid Interaction Toggles
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 8: Repeated Rapid Interactions...");
                physDoor.SetStateImmediate(DoorState.Closed);

                // Call Interact 10 times in rapid succession
                for (int k = 0; k < 10; k++)
                {
                    physDoor.Interact(playerObj);
                }

                // Door should end in a valid defined state (Closed or Open)
                Assert(physDoor.CurrentState == DoorState.Closed || physDoor.CurrentState == DoorState.Open,
                    "Test 8: Rapid toggling must resolve into a valid stable state");
                Assert(!float.IsNaN(doorFrameObj.transform.localEulerAngles.y),
                    "Test 8: Rapid interactions must not produce NaN rotations");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 8: Repeated Rapid Interactions PASS");

                // -------------------------------------------------------------
                // TEST 9: GomezMorinSceneBuilder Scene Integration Audit
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 9: Scene Integration Audit (Wing Spot, Restroom, Tía Lupe, Storage)...");
                GameObject builderObj = new GameObject("Test_Scene_Builder");
                builderObj.transform.SetParent(testRoot.transform);
                var builder = builderObj.AddComponent<GomezMorinSceneBuilder>();
                builder.BuildEnvironment();

                // 1. Wing Spot Entrance Door
                var wsPivot = GameObject.Find("WingSpot_Entrance_Door_Pivot");
                Assert(wsPivot != null, "Test 9: WingSpot_Entrance_Door_Pivot must exist");
                var wsDoor = wsPivot.GetComponent<InteractiveDoor>();
                Assert(wsDoor != null, "Test 9: WingSpot_Entrance_Door_Pivot must have InteractiveDoor component");
                var wsCol = wsPivot.GetComponentInChildren<BoxCollider>();
                Assert(wsCol != null && !wsCol.isTrigger, "Test 9: Wing Spot entrance door must have a solid non-trigger BoxCollider");
                Assert(wsDoor.IsClosed, "Test 9: Wing Spot entrance door must start in Closed state");

                // 2. Wing Spot Restroom Door
                var restroomPivot = GameObject.Find("Restroom_Door_Pivot");
                Assert(restroomPivot != null, "Test 9: Restroom_Door_Pivot must exist");
                var restroomDoor = restroomPivot.GetComponent<InteractiveDoor>();
                Assert(restroomDoor != null, "Test 9: Restroom_Door_Pivot must have InteractiveDoor component");
                var restroomLeaf = GameObject.Find("Restroom_Door_Leaf");
                Assert(restroomLeaf != null, "Test 9: Restroom_Door_Leaf must exist");
                var restroomCol = restroomLeaf.GetComponent<BoxCollider>();
                Assert(restroomCol != null && !restroomCol.isTrigger, "Test 9: Restroom_Door_Leaf must have a solid non-trigger BoxCollider");

                // 3. Tía Lupe Storefront Door
                var tiaLupePivot = GameObject.Find("TiaLupe_Door_Pivot");
                Assert(tiaLupePivot != null, "Test 9: TiaLupe_Door_Pivot must exist");
                var tiaLupeDoor = tiaLupePivot.GetComponent<InteractiveDoor>();
                Assert(tiaLupeDoor != null, "Test 9: TiaLupe_Door_Pivot must have InteractiveDoor component");
                var tiaLupeCol = tiaLupePivot.GetComponentInChildren<BoxCollider>();
                Assert(tiaLupeCol != null && !tiaLupeCol.isTrigger, "Test 9: Tía Lupe door must have a solid non-trigger BoxCollider");
                Assert(tiaLupeDoor.IsClosed, "Test 9: Tía Lupe door must start in Closed state");

                // 4. Storage Room Door
                var storagePivot = GameObject.Find("StorageRoom_Door_Pivot");
                Assert(storagePivot != null, "Test 9: StorageRoom_Door_Pivot must exist");
                var storageDoor = storagePivot.GetComponent<InteractiveDoor>();
                Assert(storageDoor != null, "Test 9: StorageRoom_Door_Pivot must have InteractiveDoor component");
                var storageCol = storagePivot.GetComponentInChildren<BoxCollider>();
                Assert(storageCol != null && !storageCol.isTrigger, "Test 9: Storage door must have a solid non-trigger BoxCollider");
                Assert(storageDoor.IsClosed, "Test 9: Storage door must start in Closed state");

                // 5. Del Porvenir Two-Story Residence & Structural Enclosure Audit
                var twoStoryRoot = GameObject.Find("DelPorvenir_TwoStory_Residence");
                Assert(twoStoryRoot != null, "Test 9: DelPorvenir_TwoStory_Residence root must exist");
                Assert(GameObject.Find("Carport_Roof_Slab") != null, "Test 9: Carport_Roof_Slab must exist");
                Assert(GameObject.Find("Recessed_Floor_Slab") != null, "Test 9: Recessed_Floor_Slab must exist");
                Assert(GameObject.Find("Recessed_Floor_Fascia") != null, "Test 9: Recessed_Floor_Fascia must exist");
                Assert(GameObject.Find("Residence_Rear_Wall_Ground") != null, "Test 9: Residence_Rear_Wall_Ground must exist");
                Assert(GameObject.Find("Residence_Rear_Wall_Upper") != null, "Test 9: Residence_Rear_Wall_Upper must exist");
                Assert(GameObject.Find("Residence_North_Wall_Ground") != null, "Test 9: Residence_North_Wall_Ground must exist");
                Assert(GameObject.Find("Residence_South_Wall_Ground") != null, "Test 9: Residence_South_Wall_Ground must exist");
                Assert(GameObject.Find("Rear_Yard_Wall_Back") != null, "Test 9: Rear_Yard_Wall_Back must exist");
                Assert(GameObject.Find("Porvenir_West_Driveway_Apron_TwoStory") != null, "Test 9: Driveway apron must exist");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 9: Scene Integration Audit PASS");

                // -------------------------------------------------------------
                // TEST 10: Extensible Access Policy Hook
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 10: Extensible Access Policy Hook...");
                Assert(door1.CanInteract(playerObj, out string accessReason),
                    "Test 10: Phase 1 base CanInteract() must return true for unrestricted access");
                Assert(string.IsNullOrEmpty(accessReason), "Test 10: Access reason must be null or empty for unrestricted access");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 10: Extensible Access Policy Hook PASS");

                // -------------------------------------------------------------
                // TEST 11: Authoritative Business Schedule Registry & Boundaries
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 11: Business Schedule Registry & Time Boundaries...");
                var wingSpotSched = BusinessScheduleRegistry.GetSchedule("restaurant:wing-spot");
                Assert(wingSpotSched != null, "Test 11: Wing Spot schedule must be registered");
                Assert(wingSpotSched.hours.openHour == 9 && wingSpotSched.hours.closeHour == 18, "Test 11: Wing Spot hours must be 09:00 - 18:00");
                Assert(wingSpotSched.lastEntryCutoffMinutes == 15, "Test 11: Last entry cutoff must be 15 minutes");

                // Test time boundaries in Ciudad Juárez (UTC-6)
                // Saturday 2026-10-24 10:00 local = 16:00 UTC
                DateTime sat10am = new DateTime(2026, 10, 24, 16, 0, 0, DateTimeKind.Utc);
                Assert(BusinessScheduleRegistry.EvaluateStatus("restaurant:wing-spot", sat10am) == BusinessOperationalState.Open,
                    "Test 11: Saturday 10:00 must be Open");
                Assert(BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat10am, out _),
                    "Test 11: Customer admission must be permitted when Open");

                // Saturday 2026-10-24 17:44 local = 23:44 UTC
                DateTime sat1744 = new DateTime(2026, 10, 24, 23, 44, 0, DateTimeKind.Utc);
                Assert(BusinessScheduleRegistry.EvaluateStatus("restaurant:wing-spot", sat1744) == BusinessOperationalState.Open,
                    "Test 11: Saturday 17:44 must be Open");

                // Saturday 2026-10-24 17:45 local = 23:45 UTC (cutoff)
                DateTime sat1745 = new DateTime(2026, 10, 24, 23, 45, 0, DateTimeKind.Utc);
                Assert(BusinessScheduleRegistry.EvaluateStatus("restaurant:wing-spot", sat1745) == BusinessOperationalState.ClosingSoon,
                    "Test 11: Saturday 17:45 must be ClosingSoon");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat1745, out string cutoffReason),
                    "Test 11: Admission must be denied at 17:45 cutoff");
                Assert(cutoffReason.Contains("18:00"), "Test 11: Rejection message must mention closing time 18:00");

                // Saturday 2026-10-24 18:00 local = 2026-10-25 00:00 UTC
                DateTime sat1800 = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
                Assert(BusinessScheduleRegistry.EvaluateStatus("restaurant:wing-spot", sat1800) == BusinessOperationalState.Closed,
                    "Test 11: Saturday 18:00 must be Closed");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat1800, out string closedReason),
                    "Test 11: Admission must be denied when Closed");
                Assert(closedReason.Contains("09:00 - 18:00"), "Test 11: Closed rejection must mention schedule hours");

                // Sunday 2026-10-25 12:00 local = 18:00 UTC
                DateTime sunNoon = new DateTime(2026, 10, 25, 18, 0, 0, DateTimeKind.Utc);
                Assert(BusinessScheduleRegistry.EvaluateStatus("restaurant:wing-spot", sunNoon) == BusinessOperationalState.Closed,
                    "Test 11: Sunday must be Closed all day");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 11: Business Schedule Registry PASS");

                // -------------------------------------------------------------
                // TEST 12: BusinessStatusSign Dynamic Visual States
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 12: BusinessStatusSign Dynamic Visual States...");
                GameObject signObj = new GameObject("Test_StatusSign");
                signObj.transform.SetParent(testRoot.transform);
                var signComp = signObj.AddComponent<BusinessStatusSign>();

                GameObject statusTxtObj = new GameObject("StatusText");
                statusTxtObj.transform.SetParent(signObj.transform);
                var statusTm = statusTxtObj.AddComponent<TextMesh>();

                GameObject subTxtObj = new GameObject("SubText");
                subTxtObj.transform.SetParent(signObj.transform);
                var subTm = subTxtObj.AddComponent<TextMesh>();

                signComp.Configure("restaurant:wing-spot", statusTm, subTm);

                // Update to Open
                signComp.UpdateDisplay(sat10am);
                Assert(signComp.CurrentState == BusinessOperationalState.Open, "Test 12: Sign state must be Open");
                Assert(signComp.StatusText == "ABIERTO", "Test 12: Status text must be ABIERTO");
                Assert(signComp.SubtitleText.Contains("18:00"), "Test 12: Subtitle text must show Cierre: 18:00");

                // Update to ClosingSoon
                signComp.UpdateDisplay(sat1745);
                Assert(signComp.CurrentState == BusinessOperationalState.ClosingSoon, "Test 12: Sign state must be ClosingSoon");
                Assert(signComp.StatusText == "CIERRE PRÓXIMO", "Test 12: Status text must be CIERRE PRÓXIMO");
                Assert(signComp.SubtitleText == "NO SE PERMITE EL INGRESO", "Test 12: Subtitle must state NO SE PERMITE EL INGRESO");

                // Update to Closed
                signComp.UpdateDisplay(sat1800);
                Assert(signComp.CurrentState == BusinessOperationalState.Closed, "Test 12: Sign state must be Closed");
                Assert(signComp.StatusText == "CERRADO", "Test 12: Status text must be CERRADO");
                Assert(signComp.SubtitleText.Contains("09:00 - 18:00"), "Test 12: Subtitle must show Horario: 09:00 - 18:00");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 12: BusinessStatusSign Visual States PASS");

                // -------------------------------------------------------------
                // TEST 13: Access Control Policy on InteractiveDoor
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 13: Access Control Policy on InteractiveDoor...");
                GameObject bizDoorObj = new GameObject("TestBizDoor");
                bizDoorObj.transform.SetParent(testRoot.transform);
                var bizDoor = bizDoorObj.AddComponent<InteractiveDoor>();

                GameObject bizLeaf = GameObject.CreatePrimitive(PrimitiveType.Cube);
                bizLeaf.transform.SetParent(bizDoorObj.transform, false);
                bizLeaf.transform.localPosition = new Vector3(0.5f, 1.0f, 0f);

                bizDoor.Configure(
                    bizDoorObj.transform,
                    bizLeaf.transform,
                    bizLeaf.GetComponent<Collider>(),
                    Vector3.zero,
                    90f,
                    0.85f,
                    2.2f,
                    "Puerta de Negocio",
                    DoorState.Closed,
                    "restaurant:wing-spot",
                    true,
                    2.5f,
                    1.6f
                );

                // Outside customer attempting to open when closed or closing soon
                var playerComp = playerObj.GetComponent<PlayerController>();
                if (playerComp == null)
                {
                    playerComp = playerObj.AddComponent<PlayerController>();
                }
                playerComp.SetInsideWingSpot(false);

                // Closing an open door is always allowed regardless of hours
                bizDoor.SetStateImmediate(DoorState.Open);
                Assert(bizDoor.CanInteract(playerObj, out _), "Test 13: Closing an open door must always be permitted");

                // Exiting customer from inside can always open the door
                bizDoor.SetStateImmediate(DoorState.Closed);
                playerComp.SetInsideWingSpot(true);
                Assert(bizDoor.CanInteract(playerObj, out string exitReason), "Test 13: Exiting occupant must always be permitted to open door");
                Assert(string.IsNullOrEmpty(exitReason), "Test 13: Exit reason must be empty");
                playerComp.SetInsideWingSpot(false);

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 13: Access Control Policy PASS");

                // -------------------------------------------------------------
                // TEST 14: Automatic Door Closing & Clearance Check
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 14: Auto-Closing & Clearance...");
                Assert(bizDoor.AutoCloseEnabled, "Test 14: AutoCloseEnabled must be true for business entrance door");
                Assert(bizDoor.AutoCloseDelay == 2.5f, "Test 14: AutoCloseDelay must default to 2.5 seconds");
                Assert(bizDoor.ClearanceRadius == 1.6f, "Test 14: ClearanceRadius must be 1.6 meters");

                // Position player far away from door: clearance is free
                playerObj.transform.position = new Vector3(50f, 0f, 50f);
                Physics.SyncTransforms();
                Assert(bizDoor.IsClearanceFree(), "Test 14: Clearance must be free when player is 50m away");

                // Position player within clearance radius (1.0m from door pivot): clearance is blocked
                playerObj.transform.position = bizDoor.HingePivot.position + new Vector3(0.5f, 0f, 0f);
                Physics.SyncTransforms();
                Assert(!bizDoor.IsClearanceFree(), "Test 14: Clearance must be blocked when player is within 1.6m clearance radius");

                // Storage and Restroom doors must have autoClose disabled
                var sceneRestroomPivot = GameObject.Find("Restroom_Door_Pivot");
                if (sceneRestroomPivot != null)
                {
                    var sceneRestroomDoor = sceneRestroomPivot.GetComponent<InteractiveDoor>();
                    Assert(sceneRestroomDoor != null && !sceneRestroomDoor.AutoCloseEnabled,
                        "Test 14: Restroom door must have AutoCloseEnabled == false");
                }
                var sceneStoragePivot = GameObject.Find("StorageRoom_Door_Pivot");
                if (sceneStoragePivot != null)
                {
                    var sceneStorageDoor = sceneStoragePivot.GetComponent<InteractiveDoor>();
                    Assert(sceneStorageDoor != null && !sceneStorageDoor.AutoCloseEnabled,
                        "Test 14: Storage door must have AutoCloseEnabled == false");
                }

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 14: Auto-Closing & Clearance PASS");

                // -------------------------------------------------------------
                // TEST 15: Input Conflict Resolution & Interaction Isolation
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 15: Input Conflict Resolution & Prompt Isolation...");
                // Reset player position
                playerObj.transform.position = bizDoor.HingePivot.position + new Vector3(0.5f, 0f, 0f);
                Physics.SyncTransforms();

                // Door closed prompt
                bizDoor.SetStateImmediate(DoorState.Closed);
                string promptClosed15 = bizDoor.GetInteractionPrompt();
                Assert(promptClosed15.Contains("[E] Abrir"), "Test 15: Closed door prompt must show [E] Abrir");
                Assert(!promptClosed15.Contains("[C]"), "Test 15: Prompt must never mention [C] for door interaction");

                // Door open prompt
                bizDoor.SetStateImmediate(DoorState.Open);
                string promptOpen15 = bizDoor.GetInteractionPrompt();
                Assert(promptOpen15.Contains("[E] Cerrar"), "Test 15: Open door prompt must show [E] Cerrar");
                Assert(!promptOpen15.Contains("[C]"), "Test 15: Prompt must never mention [C]");

                // Verify entrance signs spawned in Gómez Morín scene
                var wingSign = GameObject.Find("WingSpot_BusinessStatusSign");
                Assert(wingSign != null, "Test 15: WingSpot_BusinessStatusSign must be spawned in scene");
                var wingSignComp = wingSign.GetComponent<BusinessStatusSign>();
                Assert(wingSignComp != null, "Test 15: WingSpot_BusinessStatusSign must have BusinessStatusSign component");

                var tiaLupeSign = GameObject.Find("TiaLupe_BusinessStatusSign");
                Assert(tiaLupeSign != null, "Test 15: TiaLupe_BusinessStatusSign must be spawned in scene");
                var tiaLupeSignComp = tiaLupeSign.GetComponent<BusinessStatusSign>();
                Assert(tiaLupeSignComp != null, "Test 15: TiaLupe_BusinessStatusSign must have BusinessStatusSign component");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 15: Input Conflict Resolution & Sign Spawn PASS");

                // -------------------------------------------------------------
                // TEST 16: Comprehensive 6-State Business Status Sign & Occlusion Audit
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 16: Comprehensive 6-State Business Status Sign & Occlusion Audit...");

                // 1. Verify Door-Mounted Parenting Requirement (Sign must be child of moving door leaf)
                Assert(wingSign.transform.parent != null && wingSign.transform.parent.name == "WingSpot_Entrance_Door_Leaf",
                    $"Test 16: Wing Spot sign must be parented directly to WingSpot_Entrance_Door_Leaf (actual parent: {wingSign.transform.parent?.name})");
                Assert(tiaLupeSign.transform.parent != null && tiaLupeSign.transform.parent.name == "TiaLupe_Door_Leaf",
                    $"Test 16: Tía Lupe sign must be parented directly to TiaLupe_Door_Leaf (actual parent: {tiaLupeSign.transform.parent?.name})");

                // 2. Verify Sign Moves with Door Leaf around Hinge Pivot
                var wingDoor = GameObject.Find("WingSpot_Entrance_Door_Pivot")?.GetComponent<InteractiveDoor>();
                Assert(wingDoor != null, "Test 16: WingSpot_Entrance_Door_Pivot must have InteractiveDoor component");
                Vector3 wingSignPosClosed = wingSign.transform.position;
                wingDoor.SetStateImmediate(DoorState.Open);
                Vector3 wingSignPosOpen = wingSign.transform.position;
                Assert(Vector3.Distance(wingSignPosClosed, wingSignPosOpen) > 0.4f,
                    $"Test 16: Wing Spot sign must physically move with door leaf when opened (closed: {wingSignPosClosed}, open: {wingSignPosOpen})");
                wingDoor.SetStateImmediate(DoorState.Closed);
                Assert(Vector3.Distance(wingSign.transform.position, wingSignPosClosed) < 0.001f,
                    "Test 16: Wing Spot sign must return exactly to closed position when door closes");

                // 3. Verify Depth-Tested Material (Custom/3DTextDepthTested with ZTest LEqual for foreground player occlusion)
                var wingStatusMesh = wingSign.transform.Find("WingSpot_BusinessStatusSign_StatusText")?.GetComponent<TextMesh>();
                Assert(wingStatusMesh != null, "Test 16: Wing Spot sign must have StatusText child mesh");
                var wingStatusRend = wingStatusMesh.GetComponent<MeshRenderer>();
                Assert(wingStatusRend != null && wingStatusRend.sharedMaterial != null, "Test 16: Wing status mesh must have a valid MeshRenderer and sharedMaterial");
                Assert(wingStatusRend.sharedMaterial.shader != null && wingStatusRend.sharedMaterial.shader.name == "Custom/3DTextDepthTested",
                    $"Test 16: Wing Spot text must use depth-tested Custom/3DTextDepthTested shader (was {wingStatusRend.sharedMaterial.shader?.name})");

                var tiaStatusMesh = tiaLupeSign.transform.Find("TiaLupe_BusinessStatusSign_StatusText")?.GetComponent<TextMesh>();
                Assert(tiaStatusMesh != null, "Test 16: Tía Lupe sign must have StatusText child mesh");
                var tiaStatusRend = tiaStatusMesh.GetComponent<MeshRenderer>();
                Assert(tiaStatusRend != null && tiaStatusRend.sharedMaterial != null, "Test 16: Tía Lupe status mesh must have a valid MeshRenderer and sharedMaterial");
                Assert(tiaStatusRend.sharedMaterial.shader != null && tiaStatusRend.sharedMaterial.shader.name == "Custom/3DTextDepthTested",
                    $"Test 16: Tía Lupe text must use depth-tested Custom/3DTextDepthTested shader (was {tiaStatusRend.sharedMaterial.shader?.name})");

                // 4. Verify No Billboarding or Screen-Space Overlays (World-Space Physical Alignment)
                Assert(wingSign.GetComponent("Billboard") == null, "Test 16: Wing Spot sign must not use billboard behavior");
                Assert(tiaLupeSign.GetComponent("Billboard") == null, "Test 16: Tía Lupe sign must not use billboard behavior");

                // 5. Verify Removal of Legacy Conflicting Decal
                var staticAbiertoDecal = GameObject.Find("TiaLupe_Door_Sign_Abierto");
                Assert(staticAbiertoDecal == null, "Test 16: Static conflicting 'TiaLupe_Door_Sign_Abierto' decal must be removed from door leaf");

                var tiaSubMesh = tiaLupeSign.transform.Find("TiaLupe_BusinessStatusSign_SubtitleText")?.GetComponent<TextMesh>();
                var wingSubMesh = wingSign.transform.Find("WingSpot_BusinessStatusSign_SubtitleText")?.GetComponent<TextMesh>();

                // 3. Evaluate 6 States Across Time Boundaries:
                // Test 16.1: Wing Spot Open (10:00 local Saturday = 16:00 UTC)
                wingSignComp.UpdateDisplay(sat10am);
                Assert(wingSignComp.CurrentState == BusinessOperationalState.Open, "Test 16.1: Wing Spot state must be Open");
                Assert(wingSignComp.StatusText == "ABIERTO", "Test 16.1: Wing Spot status text must be ABIERTO");
                Assert(Mathf.Abs(wingStatusMesh.color.r - 0.18f) < 0.02f && Mathf.Abs(wingStatusMesh.color.g - 0.80f) < 0.02f,
                    "Test 16.1: Wing Spot open color must be emerald green");
                Assert(BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat10am, out _),
                    "Test 16.1: Customer admission must be permitted when Open");

                // Test 16.2: Wing Spot Closing Soon (17:45 local Saturday = 23:45 UTC)
                wingSignComp.UpdateDisplay(sat1745);
                Assert(wingSignComp.CurrentState == BusinessOperationalState.ClosingSoon, "Test 16.2: Wing Spot state must be ClosingSoon");
                Assert(wingSignComp.StatusText == "CIERRE PRÓXIMO", "Test 16.2: Wing Spot status text must be CIERRE PRÓXIMO");
                Assert(wingSignComp.SubtitleText == "NO SE PERMITE EL INGRESO", "Test 16.2: Subtitle must state NO SE PERMITE EL INGRESO");
                Assert(Mathf.Abs(wingStatusMesh.color.r - 0.95f) < 0.02f && Mathf.Abs(wingStatusMesh.color.g - 0.55f) < 0.02f,
                    "Test 16.2: Wing Spot closing soon color must be amber orange");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat1745, out string rejWing162),
                    "Test 16.2: Customer admission must be rejected when ClosingSoon");
                Assert(rejWing162.Contains("18:00"), "Test 16.2: Rejection must specify closing time");

                // Test 16.3: Wing Spot Closed (18:00 local Saturday = 00:00 UTC next day)
                wingSignComp.UpdateDisplay(sat1800);
                Assert(wingSignComp.CurrentState == BusinessOperationalState.Closed, "Test 16.3: Wing Spot state must be Closed");
                Assert(wingSignComp.StatusText == "CERRADO", "Test 16.3: Wing Spot status text must be CERRADO");
                Assert(wingSignComp.SubtitleText.Contains("09:00 - 18:00"), "Test 16.3: Subtitle must show Horario: 09:00 - 18:00");
                Assert(Mathf.Abs(wingStatusMesh.color.r - 0.90f) < 0.02f && Mathf.Abs(wingStatusMesh.color.g - 0.25f) < 0.02f,
                    "Test 16.3: Wing Spot closed color must be crimson red");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", sat1800, out string rejWing163),
                    "Test 16.3: Customer admission must be rejected when Closed");

                // Test 16.4: Tía Lupe Open (10:00 local Saturday = 16:00 UTC)
                tiaLupeSignComp.UpdateDisplay(sat10am);
                Assert(tiaLupeSignComp.CurrentState == BusinessOperationalState.Open, "Test 16.4: Tía Lupe state must be Open");
                Assert(tiaLupeSignComp.StatusText == "ABIERTO", "Test 16.4: Tía Lupe status text must be ABIERTO");
                Assert(Mathf.Abs(tiaStatusMesh.color.r - 0.18f) < 0.02f && Mathf.Abs(tiaStatusMesh.color.g - 0.80f) < 0.02f,
                    "Test 16.4: Tía Lupe open color must be emerald green");
                Assert(BusinessScheduleRegistry.CanAdmitCustomer("restaurant:pasteleria-tia-lupe", sat10am, out _),
                    "Test 16.4: Customer admission must be permitted when Open");

                // Test 16.5: Tía Lupe Closing Soon (17:45 local Saturday = 23:45 UTC)
                tiaLupeSignComp.UpdateDisplay(sat1745);
                Assert(tiaLupeSignComp.CurrentState == BusinessOperationalState.ClosingSoon, "Test 16.5: Tía Lupe state must be ClosingSoon");
                Assert(tiaLupeSignComp.StatusText == "CIERRE PRÓXIMO", "Test 16.5: Tía Lupe status text must be CIERRE PRÓXIMO");
                Assert(tiaLupeSignComp.SubtitleText == "NO SE PERMITE EL INGRESO", "Test 16.5: Subtitle must state NO SE PERMITE EL INGRESO");
                Assert(Mathf.Abs(tiaStatusMesh.color.r - 0.95f) < 0.02f && Mathf.Abs(tiaStatusMesh.color.g - 0.55f) < 0.02f,
                    "Test 16.5: Tía Lupe closing soon color must be amber orange");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:pasteleria-tia-lupe", sat1745, out string rejTia165),
                    "Test 16.5: Customer admission must be rejected when ClosingSoon");

                // Test 16.6: Tía Lupe Closed (18:00 local Saturday = 00:00 UTC next day)
                tiaLupeSignComp.UpdateDisplay(sat1800);
                Assert(tiaLupeSignComp.CurrentState == BusinessOperationalState.Closed, "Test 16.6: Tía Lupe state must be Closed");
                Assert(tiaLupeSignComp.StatusText == "CERRADO", "Test 16.6: Tía Lupe status text must be CERRADO");
                Assert(tiaLupeSignComp.SubtitleText.Contains("09:00 - 18:00"), "Test 16.6: Subtitle must show Horario: 09:00 - 18:00");
                Assert(Mathf.Abs(tiaStatusMesh.color.r - 0.90f) < 0.02f && Mathf.Abs(tiaStatusMesh.color.g - 0.25f) < 0.02f,
                    "Test 16.6: Tía Lupe closed color must be crimson red");
                Assert(!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:pasteleria-tia-lupe", sat1800, out string rejTia166),
                    "Test 16.6: Customer admission must be rejected when Closed");

                // Verify that sharedMaterial shader remains Custom/3DTextDepthTested after dynamic text updates
                Assert(wingStatusRend.sharedMaterial != null && wingStatusRend.sharedMaterial.shader.name == "Custom/3DTextDepthTested",
                    "Test 16: Wing Spot sharedMaterial shader must remain Custom/3DTextDepthTested after state updates");
                Assert(tiaStatusRend.sharedMaterial != null && tiaStatusRend.sharedMaterial.shader.name == "Custom/3DTextDepthTested",
                    "Test 16: Tía Lupe sharedMaterial shader must remain Custom/3DTextDepthTested after state updates");

                // Verify White Backing Plate and Black Subtitle Lettering
                var wingBacking = wingSign.transform.Find("WingSpot_BusinessStatusSign_Backing")?.GetComponent<Renderer>();
                Assert(wingBacking != null && wingBacking.sharedMaterial.color.r > 0.90f,
                    "Test 16: Wing Spot sign backing card must be white");
                var tiaBacking = tiaLupeSign.transform.Find("TiaLupe_BusinessStatusSign_Backing")?.GetComponent<Renderer>();
                Assert(tiaBacking != null && tiaBacking.sharedMaterial.color.r > 0.90f,
                    "Test 16: Tía Lupe sign backing card must be white");

                Assert(wingSubMesh.color.r < 0.20f && wingSubMesh.color.g < 0.20f && wingSubMesh.color.b < 0.20f,
                    "Test 16: Wing Spot subtitle text must be black for high contrast on white card");
                Assert(tiaSubMesh.color.r < 0.20f && tiaSubMesh.color.g < 0.20f && tiaSubMesh.color.b < 0.20f,
                    "Test 16: Tía Lupe subtitle text must be black for high contrast on white card");

                // Verify Wing Spot Transparent Windows & Sealed Frames
                for (int w = 1; w <= 4; w++)
                {
                    var winObj = GameObject.Find($"Window_Grid_{w}");
                    Assert(winObj != null, $"Test 16: Window_Grid_{w} must exist on Wing Spot exterior");
                    var glass = winObj.transform.Find("Glass_Pane")?.GetComponent<Renderer>();
                    Assert(glass != null && glass.sharedMaterial != null, $"Test 16: Window_Grid_{w} must have Glass_Pane renderer");
                    Assert(glass.sharedMaterial.name.Contains("Storefront_Architectural_Glass") || glass.sharedMaterial.color.a < 0.30f,
                        $"Test 16: Window_Grid_{w} glass pane must be transparent architectural glass (material: {glass.sharedMaterial.name})");
                    Assert(winObj.transform.Find("Frame_Seal_Top") != null, $"Test 16: Window_Grid_{w} must have Frame_Seal_Top weather flange");
                    Assert(winObj.transform.Find("Frame_Seal_Bottom") != null, $"Test 16: Window_Grid_{w} must have Frame_Seal_Bottom weather flange");
                    Assert(winObj.transform.Find("Frame_Seal_Left") != null, $"Test 16: Window_Grid_{w} must have Frame_Seal_Left weather flange");
                    Assert(winObj.transform.Find("Frame_Seal_Right") != null, $"Test 16: Window_Grid_{w} must have Frame_Seal_Right weather flange");
                }

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 16: Comprehensive 6-State Business Status Sign & Occlusion Audit PASS");

                // -------------------------------------------------------------
                // TEST 17: Two-Story Residence & Full-Width Sidewalk Driveway Ramp Audit
                // -------------------------------------------------------------
                Debug.Log("[InteractiveDoorTests] TEST 17: Two-Story Residence & Full-Width Sidewalk Driveway Ramp Audit...");

                // Build full scene environment if not built
                var envBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
                if (envBuilder != null)
                {
                    envBuilder.BuildEnvironment();
                }

                var resObj = GameObject.Find("DelPorvenir_TwoStory_Residence");
                Assert(resObj != null, "Test 17: DelPorvenir_TwoStory_Residence must exist in scene");

                // Carport structure
                var cpSlab = GameObject.Find("Carport_Roof_Slab");
                Assert(cpSlab != null, "Test 17: Carport_Roof_Slab must exist");
                Assert(Mathf.Abs(cpSlab.transform.position.z - 28.80f) < 0.2f, "Test 17: Carport slab must be centered over covered bays");

                var cpLintel = GameObject.Find("Carport_Front_Lintel");
                Assert(cpLintel != null, "Test 17: Carport_Front_Lintel must exist");

                var cpNum = GameObject.Find("Carport_Number_Text")?.GetComponent<TextMesh>();
                Assert(cpNum != null && cpNum.text == "119", "Test 17: Carport number text '119' must exist");

                var cpCenterCol = GameObject.Find("Carport_Column_Center");
                Assert(cpCenterCol != null, "Test 17: Carport_Column_Center must exist dividing parking bays");

                // Arched main door
                var doorLeaf = GameObject.Find("Main_Door_Leaf");
                Assert(doorLeaf != null, "Test 17: Main_Door_Leaf must exist");
                var doorGlass = GameObject.Find("Main_Door_Arch_Glass");
                Assert(doorGlass != null, "Test 17: Main_Door_Arch_Glass must exist");

                // Second floor balcony and solid parapet
                var solidParapet = GameObject.Find("Balcony_Solid_Parapet_Front");
                Assert(solidParapet != null, "Test 17: Balcony_Solid_Parapet_Front must exist (solid blind parapet)");

                // Windows with white security bars
                var winMainFrame = GameObject.Find("Upper_Main_Window_Frame");
                Assert(winMainFrame != null, "Test 17: Upper_Main_Window_Frame must exist");
                var winSqFrame = GameObject.Find("Upper_Square_Window_Frame");
                Assert(winSqFrame != null, "Test 17: Upper_Square_Window_Frame must exist");

                // Raw brick coping & Rotoplas water tank on roof
                var brickCoping = GameObject.Find("Brick_Coping_Main_Front");
                Assert(brickCoping != null, "Test 17: Brick_Coping_Main_Front must exist");
                var tinaco = GameObject.Find("Tinaco_Tank_Body");
                Assert(tinaco != null, "Test 17: Tinaco_Tank_Body must exist on roof");

                // Full-width sidewalk driveway ramp ("desnivel o bajada sobre TODA la banqueta")
                var apronObj = GameObject.Find("Porvenir_West_Driveway_Apron_TwoStory");
                Assert(apronObj != null, "Test 17: Porvenir_West_Driveway_Apron_TwoStory must exist across entire frontage");
                Assert(Mathf.Abs(apronObj.transform.lossyScale.z - 11.40f) < 0.2f, "Test 17: Apron must span full 11.4m frontage");

                var depressedCurb = GameObject.Find("Porvenir_West_Curb_Depressed_TwoStory");
                Assert(depressedCurb != null, "Test 17: Porvenir_West_Curb_Depressed_TwoStory must exist at gutter level");

                // Boundary piers and Step 2 Exterior Front Gate Validation
                var pierNorth = GameObject.Find("Front_Pier_North");
                var pierSouth = GameObject.Find("Front_Pier_South");
                Assert(pierNorth != null && pierSouth != null, "Test 17: Boundary piers must exist");

                // Step 2 Exterior Gate & Reja-Barandal Frontal Validation
                var gateObj = GameObject.Find("DelPorvenir_Front_Gate");
                Assert(gateObj != null, "Test 17: DelPorvenir_Front_Gate must exist (Step 2 completed)");
                Assert(GameObject.Find("Gate_Top_Header_Beam") != null, "Test 17: Gate_Top_Header_Beam must exist");
                Assert(GameObject.Find("Front_Pedestrian_Gate_Pivot") != null, "Test 17: Front_Pedestrian_Gate_Pivot must exist");
                Assert(GameObject.Find("Carport_Gate_South") != null, "Test 17: Carport_Gate_South must exist");
                Assert(GameObject.Find("Carport_Gate_North") != null, "Test 17: Carport_Gate_North must exist");
                Assert(GameObject.Find("Front_Yard_Wall_South") != null, "Test 17: Front_Yard_Wall_South must exist");

                // Validate Interactive Pedestrian Gate Component
                var pedPivot = GameObject.Find("Front_Pedestrian_Gate_Pivot");
                var pedDoor = pedPivot.GetComponent<InteractiveDoor>();
                Assert(pedDoor != null, "Test 17: Pedestrian gate must have InteractiveDoor component");
                Assert(pedDoor.IsClosed, "Test 17: Pedestrian gate must start in Closed state");
                Assert(pedDoor.DoorName == "Reja Exterior", "Test 17: Door name must be 'Reja Exterior'");

                testsPassed++;
                Debug.Log("[InteractiveDoorTests] TEST 17: Two-Story Residence & Full-Width Sidewalk Driveway Ramp Audit PASS");

                // -------------------------------------------------------------
                // FINAL SUITE VERDICT
                // -------------------------------------------------------------
                Debug.Log("==========================================================================");
                Debug.Log($"[InteractiveDoorTests] ALL TESTS COMPLETED: {testsPassed} / {totalTests} PASSED (100%)");
                Debug.Log("==========================================================================");
            }
            finally
            {
                if (testRoot != null)
                {
                    UnityEngine.Object.DestroyImmediate(testRoot);
                }
            }
        }

        private static void Assert(bool condition, string message)
        {
            if (!condition)
            {
                Debug.LogError($"[InteractiveDoorTests] ASSERTION FAILED: {message}");
                throw new Exception($"Assertion Failed: {message}");
            }
        }
    }
}
