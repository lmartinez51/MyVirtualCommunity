using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Character;
using MyVirtualCommunity.Environment;

namespace MyVirtualCommunity.Npc
{
    /// <summary>
    /// CamilaNpcController manages the 3D presentation, grounded sidewalk/waypoint locomotion,
    /// autonomous door interaction, and World Core AI cycle coordination for Camila
    /// (agent:camila-npc), the autonomous explorer NPC (Milestone 94).
    ///
    /// Design invariants:
    /// - NO counter anchor and NO LateUpdate position clamping: Camila is free to explore
    ///   the entire Blvd. Gómez Morín slice.
    /// - Unity is strictly presentation-only: MoveToPlace() is only driven by authoritative
    ///   World Core AI cycle results, and arrival / interruption is reported back to
    ///   POST /api/npc/agent:camila-npc/arrival so World Core commits Agent.locationId.
    /// - Grounded via downward Physics.Raycast (~(1 << 2)) on spawn and every walking frame
    ///   so her shoe soles rest flush on floors, sidewalks, curbs, and streets (zero floating).
    /// - Coherent autonomous door interaction: opens unlocked/permitted InteractiveDoors
    ///   along her path (e.g. Wing Spot, Pastelería La Tía Lupe, Restroom, Residence gate),
    ///   waits for them to swing open before walking through, respects business operating
    ///   hours and staff-only rooms, and schedules auto-close behind her.
    /// - Phase 2a (push_object): on an authoritative push cycle she walks to the object's
    ///   place, approaches the prop, kicks it (ball) or body-pushes it (other movable
    ///   props) via InteractiveWorldProp, waits for the physics to settle, and reports
    ///   the new position to POST /api/npc/agent:camila-npc/object-interaction so World
    ///   Core commits it. She never picks up, carries or drops anything (Phase 2b).
    /// </summary>
    public class CamilaNpcController : MonoBehaviour
    {
        public const string CamilaAgentId = "agent:camila-npc";

        [Header("Explorer Start")]
        [SerializeField] private Vector3 startPosition = new Vector3(-8f, 0.24f, 8f);

        [Header("Movement & Presentation Parameters")]
        [SerializeField] private float walkSpeed = 2.2f;
        [SerializeField] private float turnSpeed = 7.0f;
        [SerializeField] private float lookAtSpeed = 4.0f;
        [SerializeField] private float detectionRadius = 6.0f;
        [SerializeField] private float aiCycleIntervalSeconds = 8.0f;
        [SerializeField] private float doorApproachRange = 2.0f;
        [SerializeField] private float doorOpenWaitSeconds = 0.72f;

        [Header("Visual Feedback References")]
        [SerializeField] private Renderer characterRenderer;
        [SerializeField] private Color explorerJacketColor = new Color(0.10f, 0.45f, 0.42f);

        // Key architectural threshold coordinates measured from GomezMorinSceneBuilder
        private static readonly Vector3 WingSpotDoorInside = new Vector3(-6.75f, 0.24f, 6.55f);
        private static readonly Vector3 WingSpotDoorOutside = new Vector3(-6.75f, 0.24f, 4.85f);
        private static readonly Vector3 TiaLupeDoorInside = new Vector3(-2.70f, 0.24f, 6.15f);
        private static readonly Vector3 TiaLupeDoorOutside = new Vector3(-2.70f, 0.24f, 4.35f);
        private const float NorthSidewalkZ = 2.75f;
        private const float DelPorvenirSidewalkX = 7.50f;
        private const float CatZooPlazaCorridorX = 72.50f;
        private const float ArboledaSidewalkX = 94.25f;

        private NavMeshAgent navAgent;
        private Transform billboardTransform;
        private BobbleheadAnimator bobbleheadAnimator;

        // AI cycle & traversal state
        private float cycleTimer;
        private bool cycleInFlight;
        private bool arrivalReportInFlight;
        private string currentDestinationPlaceId = "";
        private readonly Queue<Vector3> waypointQueue = new Queue<Vector3>();
        private Vector3? lookAtTargetPosition;
        private float lookAtHoldTimer;

        // Phase 2a push state: a push cycle walks to the object's place first
        // (authoritative arrival), then approaches the prop and kicks/pushes it.
        private string pendingPushObjectId = "";
        private string pendingPushTowardsPlaceId = "";
        private bool walkingToPushObject;
        private bool pushReportInFlight;

        // Autonomous door-opening state
        private InteractiveDoor activeDoorOpening;
        private float doorOpenWaitTimer;
        private InteractiveDoor recentlyPassedDoor;

        public event Action<string, string> OnDialogueTriggered; // (Speaker, Text)

        /// <summary>
        /// Walkable Unity scene anchors aligned with GomezMorinSceneBuilder geometry
        /// (never inside solid exterior-only building boxes).
        /// </summary>
        public static readonly Dictionary<string, Vector3> PlaceAnchors =
            new Dictionary<string, Vector3>
            {
                { "street:blvd-gomez-morin", new Vector3(55f, 0.24f, 2.75f) },
                { "street:calle-del-porvenir", new Vector3(7.50f, 0.24f, 22.5f) },
                { "street:av-la-arboleda", new Vector3(94.25f, 0.24f, 22.5f) },
                { "building:tia-lupe-building", new Vector3(-2.70f, 0.24f, 6.35f) },
                { "restaurant:pasteleria-tia-lupe", new Vector3(-2.70f, 0.24f, 6.35f) },
                { "building:wing-spot-building", new Vector3(-8f, 0.24f, 8f) },
                { "restaurant:wing-spot", new Vector3(-8f, 0.24f, 8f) },
                { "building:del-porvenir-residence", new Vector3(7.50f, 0.24f, 26.5f) },
                { "building:dollar-2-go-building", new Vector3(45f, 0.24f, 6.2f) },
                { "building:acabados-hbc-building", new Vector3(85f, 0.24f, 2.85f) },
                { "building:catzoo-building", new Vector3(72.5f, 0.24f, 28.5f) },
                { "building:corporativo-arboleda-building", new Vector3(120f, 0.24f, 3.0f) },
            };

        /// <summary>Probe object id -> Unity scene position (mirror of CAMILA_PROBE_OBJECTS).</summary>
        public static readonly Dictionary<string, Vector3> ProbeObjectAnchors =
            new Dictionary<string, Vector3>
            {
                { "probe:ball", new Vector3(45f, 0.345f, 14f) },
                { "probe:small-goal", new Vector3(45f, 0.55f, 32f) },
                { "probe:cone-west", new Vector3(42f, 0.4f, 27.6f) },
                { "probe:cone-east", new Vector3(48f, 0.4f, 27.6f) },
                { "probe:trash-bag", new Vector3(-4f, 0.39f, 3.5f) },
                { "probe:trash-bin", new Vector3(107.55f, 0.24f, 30f) },
                { "probe:broom", new Vector3(-18f, 0.79f, 6f) },
                { "probe:puddle", new Vector3(13.5f, 0.005f, 25f) },
                { "probe:bucket", new Vector3(7.15f, 0.24f, 33.1f) },
                { "probe:watering-can", new Vector3(7.2f, 0.24f, 33.75f) },
                { "probe:umbrella", new Vector3(59.46f, 0.72f, 2.42f) },
                { "probe:bench", new Vector3(60f, 0.24f, 2.4f) },
                { "probe:book", new Vector3(60f, 0.71f, 2.4f) },
                { "probe:cup", new Vector3(60.48f, 0.75f, 2.4f) },
                { "probe:chalk", new Vector3(-8f, 0.265f, 2.4f) },
                { "probe:blank-wall", new Vector3(-2.5f, 1.24f, 8f) },
            };

        /// <summary>
        /// Probe object id -> seed place id (mirror of CAMILA_PROBE_OBJECTS placeId).
        /// A push first walks to the object's place via the authoritative arrival loop.
        /// </summary>
        public static readonly Dictionary<string, string> ProbeObjectPlaces =
            new Dictionary<string, string>
            {
                { "probe:ball", "building:dollar-2-go-building" },
                { "probe:small-goal", "building:dollar-2-go-building" },
                { "probe:cone-west", "building:dollar-2-go-building" },
                { "probe:cone-east", "building:dollar-2-go-building" },
                { "probe:trash-bag", "restaurant:wing-spot" },
                { "probe:trash-bin", "street:av-la-arboleda" },
                { "probe:broom", "building:tia-lupe-building" },
                { "probe:puddle", "street:calle-del-porvenir" },
                { "probe:bucket", "building:del-porvenir-residence" },
                { "probe:watering-can", "building:del-porvenir-residence" },
                { "probe:umbrella", "street:blvd-gomez-morin" },
                { "probe:bench", "street:blvd-gomez-morin" },
                { "probe:book", "street:blvd-gomez-morin" },
                { "probe:cup", "street:blvd-gomez-morin" },
                { "probe:chalk", "street:blvd-gomez-morin" },
                { "probe:blank-wall", "building:wing-spot-building" },
            };

        /// <summary>
        /// Probe object id -> scene GameObject name (GomezMorinSceneBuilder).
        /// Only props built as a single GameObject with an InteractiveWorldProp
        /// are listed; the goal is three separate boxes, the puddle is a recessed
        /// pothole group, and the bench/wall are fixed — none of those are pushable.
        /// </summary>
        public static readonly Dictionary<string, string> ProbeObjectGameObjectNames =
            new Dictionary<string, string>
            {
                { "probe:ball", "Probe_Ball" },
                { "probe:cone-west", "Probe_ConeWest" },
                { "probe:cone-east", "Probe_ConeEast" },
                { "probe:trash-bag", "Probe_TrashBag" },
                { "probe:trash-bin", "Probe_TrashBin" },
                { "probe:broom", "Probe_Broom" },
                { "probe:bucket", "Probe_Bucket" },
                { "probe:watering-can", "Probe_WateringCan" },
                { "probe:umbrella", "Probe_Umbrella" },
                { "probe:book", "Probe_Book" },
                { "probe:cup", "Probe_Cup" },
                { "probe:chalk", "Probe_Chalk" },
            };

        private void Awake()
        {
            transform.position = startPosition;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f);

            // Disable/remove NavMeshAgent if no baked NavMesh exists in this procedural slice
            navAgent = GetComponent<NavMeshAgent>();
            if (navAgent != null && !navAgent.isOnNavMesh)
            {
                Destroy(navAgent);
                navAgent = null;
            }
            else if (navAgent != null)
            {
                navAgent.speed = walkSpeed;
                navAgent.radius = 0.4f;
                navAgent.acceleration = 8f;
                navAgent.angularSpeed = 180f;
                navAgent.stoppingDistance = 0.25f;
            }

            EnsureDoorDetectionCollider();
            BuildExplorerAvatar();
        }

        private void Start()
        {
            transform.position = startPosition;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f);
            SnapToGround();

            // Trigger Camila's first exploration cycle shortly after startup (~2.5s)
            cycleTimer = Mathf.Max(0f, aiCycleIntervalSeconds - 2.5f);

            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnAiCycleExecuted += HandleAiCycleExecuted;
            }
        }

        private void OnDestroy()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnAiCycleExecuted -= HandleAiCycleExecuted;
            }
        }

        private void Update()
        {
            // 1. Update physical walking, door interaction, and Bobblehead locomotion animation
            UpdateLocomotionAndDoors();

            // 2. If currently holding a look_at gaze while idle, rotate smoothly toward the probe object
            if (!IsWalking && lookAtTargetPosition.HasValue)
            {
                Vector3 dir = lookAtTargetPosition.Value - transform.position;
                dir.y = 0f;
                if (dir.sqrMagnitude > 0.04f)
                {
                    transform.rotation = Quaternion.Slerp(
                        transform.rotation,
                        Quaternion.LookRotation(dir.normalized, Vector3.up),
                        Time.deltaTime * lookAtSpeed);
                }

                lookAtHoldTimer -= Time.deltaTime;
                if (lookAtHoldTimer <= 0f)
                {
                    lookAtTargetPosition = null;
                }
            }

            // 3. Poll World Core for next authoritative AI cycle when idle & connected
            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                return;
            }

            if (IsWalking || arrivalReportInFlight || pushReportInFlight)
            {
                return;
            }

            cycleTimer += Time.deltaTime;
            if (cycleTimer >= aiCycleIntervalSeconds && !cycleInFlight)
            {
                cycleTimer = 0f;
                cycleInFlight = true;
                StartCoroutine(WorldCoreClient.Instance.TriggerNpcAiCycle(
                    CamilaAgentId,
                    _ => { cycleInFlight = false; }));
            }
        }

        private void LateUpdate()
        {
            // Billboard overhead nameplate continuously faces main camera (or aerial camera).
            // NOTE: unlike Elena, there is NO position anchoring here — Camila wanders freely.
            if (billboardTransform != null)
            {
                Camera cam = Camera.main;
                if (cam == null) cam = FindFirstObjectByType<Camera>();
                if (cam != null)
                {
                    billboardTransform.rotation = cam.transform.rotation;
                }
            }
        }

        private void EnsureDoorDetectionCollider()
        {
            // Lightweight capsule collider on Layer 2 (Ignore Raycast) so InteractiveDoor anti-pinch
            // and auto-close clearance detect Camila without interfering with camera/ground raycasts.
            gameObject.layer = 2;
            var cap = GetComponent<CapsuleCollider>();
            if (cap == null)
            {
                cap = gameObject.AddComponent<CapsuleCollider>();
            }
            cap.height = 1.65f;
            cap.radius = 0.30f;
            cap.center = new Vector3(0f, 0.825f, 0f);
            cap.isTrigger = false;
        }

        /// <summary>
        /// Grounds Camila flush on the floor/sidewalk/street surface below her feet (zero floating).
        /// </summary>
        public void SnapToGround()
        {
            Vector3 origin = new Vector3(transform.position.x, transform.position.y + 1.4f, transform.position.z);
            if (Physics.Raycast(origin, Vector3.down, out RaycastHit hit, 4.5f, ~(1 << 2), QueryTriggerInteraction.Ignore))
            {
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            }
        }

        /// <summary>
        /// Returns true if Camila is currently physically inside Wing Spot dining hall.
        /// </summary>
        public bool IsInsideWingSpot()
        {
            Vector3 p = transform.position;
            return p.x >= -20.0f && p.x <= -5.0f && p.z >= 5.85f && p.z <= 18.25f;
        }

        /// <summary>
        /// Returns true if Camila is currently physically inside Pastelería La Tía Lupe.
        /// </summary>
        public bool IsInsideTiaLupe()
        {
            Vector3 p = transform.position;
            return p.x >= -5.15f && p.x <= 6.50f && p.z >= 5.30f && p.z <= 12.25f;
        }

        /// <summary>
        /// Used by InteractiveDoor.CanInteract so Camila can always exit an interior business
        /// she is already inside, while respecting operating hours when entering from outside.
        /// </summary>
        public bool IsInsideBusiness(string businessId)
        {
            if (string.IsNullOrEmpty(businessId)) return false;
            if (businessId == "restaurant:wing-spot") return IsInsideWingSpot();
            if (businessId == "restaurant:pasteleria-tia-lupe") return IsInsideTiaLupe();
            return false;
        }

        private void UpdateLocomotionAndDoors()
        {
            // Schedule auto-close once Camila clears a door she recently opened
            if (recentlyPassedDoor != null)
            {
                Vector3 doorPos = recentlyPassedDoor.InteractionAnchor.position;
                float distFlat = Vector2.Distance(
                    new Vector2(transform.position.x, transform.position.z),
                    new Vector2(doorPos.x, doorPos.z));
                if (distFlat > 1.85f)
                {
                    if (recentlyPassedDoor.AutoCloseEnabled && recentlyPassedDoor.IsOpen)
                    {
                        recentlyPassedDoor.ScheduleAutoClose();
                    }
                    recentlyPassedDoor = null;
                }
            }

            // Waiting for a door she just opened to swing clear before stepping through
            if (activeDoorOpening != null)
            {
                doorOpenWaitTimer -= Time.deltaTime;
                bobbleheadAnimator?.UpdateLocomotionState(0f, true);

                // Face the door while opening it
                Vector3 toDoor = activeDoorOpening.InteractionAnchor.position - transform.position;
                toDoor.y = 0f;
                if (toDoor.sqrMagnitude > 0.01f)
                {
                    transform.rotation = Quaternion.Slerp(
                        transform.rotation,
                        Quaternion.LookRotation(toDoor.normalized, Vector3.up),
                        Time.deltaTime * turnSpeed);
                }

                if (activeDoorOpening.IsOpen || doorOpenWaitTimer <= 0f)
                {
                    recentlyPassedDoor = activeDoorOpening;
                    activeDoorOpening = null;
                }
                return;
            }

            // Active NavMesh navigation (if a NavMesh is ever baked)
            if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh && !string.IsNullOrEmpty(currentDestinationPlaceId))
            {
                float speed = navAgent.velocity.magnitude;
                bobbleheadAnimator?.UpdateLocomotionState(speed, true);

                if (TryHandleBlockingDoorAhead(navAgent.steeringTarget))
                {
                    navAgent.isStopped = true;
                    return;
                }
                navAgent.isStopped = false;

                if (!navAgent.pathPending && navAgent.remainingDistance <= navAgent.stoppingDistance + 0.1f)
                {
                    CompleteCurrentWalk("arrived", $"Camila llegó a {currentDestinationPlaceId}.");
                }
                return;
            }

            // Procedural waypoint walking along sidewalks, streets, and doorways
            if (waypointQueue.Count == 0)
            {
                bobbleheadAnimator?.UpdateLocomotionState(0f, true);
                return;
            }

            Vector3 nextWp = waypointQueue.Peek();

            // Check if a closed InteractiveDoor blocks the immediate path toward nextWp
            if (TryHandleBlockingDoorAhead(nextWp))
            {
                bobbleheadAnimator?.UpdateLocomotionState(0f, true);
                return;
            }

            Vector3 currentPos = transform.position;
            Vector3 toWp = new Vector3(nextWp.x - currentPos.x, 0f, nextWp.z - currentPos.z);
            float dist = toWp.magnitude;

            if (dist <= 0.20f)
            {
                waypointQueue.Dequeue();
                if (waypointQueue.Count == 0)
                {
                    bobbleheadAnimator?.UpdateLocomotionState(0f, true);
                    SnapToGround();
                    CompleteCurrentWalk("arrived", $"Camila llegó a {currentDestinationPlaceId}.");
                }
                return;
            }

            Vector3 dir = toWp / dist;
            Quaternion targetRot = Quaternion.LookRotation(dir, Vector3.up);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, Time.deltaTime * turnSpeed);

            float step = Mathf.Min(dist, walkSpeed * Time.deltaTime);
            transform.position = new Vector3(currentPos.x + dir.x * step, currentPos.y, currentPos.z + dir.z * step);
            SnapToGround();

            bobbleheadAnimator?.UpdateLocomotionState(walkSpeed, true);
        }

        /// <summary>
        /// Checks whether an InteractiveDoor lies directly ahead of Camila on her path.
        /// Opens permitted doors cleanly; respects staff-only doors and closed business hours.
        /// Returns true if Camila must pause (waiting for door swing or blocked by closed business).
        /// </summary>
        private bool TryHandleBlockingDoorAhead(Vector3 nextWaypoint)
        {
            Vector3 pos = transform.position;
            Vector3 toWp = new Vector3(nextWaypoint.x - pos.x, 0f, nextWaypoint.z - pos.z);
            float wpDist = toWp.magnitude;
            if (wpDist < 0.05f) return false;
            Vector3 moveDir = toWp / wpDist;

            InteractiveDoor blockingDoor = null;
            float bestDist = float.MaxValue;

            for (int i = 0; i < InteractiveDoor.ActiveDoors.Count; i++)
            {
                var door = InteractiveDoor.ActiveDoors[i];
                if (door == null || !door.isActiveAndEnabled) continue;

                // Coherent explorer rule: never enter staff-only rooms
                if (!string.IsNullOrEmpty(door.DoorName) &&
                    (door.DoorName.IndexOf("Almacén", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     door.DoorName.IndexOf("Staff", StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    continue;
                }

                // Compute door opening center (leaf collider center when available, else anchor)
                Vector3 doorCenter = GetDoorOpeningCenter(door);
                Vector3 toDoor = new Vector3(doorCenter.x - pos.x, 0f, doorCenter.z - pos.z);
                float distToDoor = toDoor.magnitude;

                if (distToDoor > Mathf.Min(doorApproachRange, door.InteractionRange)) continue;
                if (distToDoor < 0.05f) continue;

                // Door must be roughly ahead of Camila along her path
                float alignment = Vector3.Dot(moveDir, toDoor / distToDoor);
                if (alignment < 0.35f) continue;

                // Door must lie between Camila and the waypoint (or right at the waypoint)
                if (distToDoor > wpDist + 0.85f) continue;

                if (distToDoor < bestDist)
                {
                    bestDist = distToDoor;
                    blockingDoor = door;
                }
            }

            if (blockingDoor == null) return false;

            // If door is already open, walk right through and remember it for auto-close
            if (blockingDoor.IsOpen)
            {
                recentlyPassedDoor = blockingDoor;
                return false;
            }

            // If door is already mid-opening, pause briefly until it swings clear
            if (blockingDoor.CurrentState == DoorState.Opening)
            {
                activeDoorOpening = blockingDoor;
                doorOpenWaitTimer = 0.45f;
                return true;
            }

            // Door is Closed or Closing -> attempt coherent interaction
            if (blockingDoor.CanInteract(gameObject, out string rejectionReason))
            {
                Debug.Log($"[CamilaNpcController] Opening '{blockingDoor.DoorName}' to continue exploring {currentDestinationPlaceId}.");
                blockingDoor.Interact(gameObject);
                activeDoorOpening = blockingDoor;
                doorOpenWaitTimer = doorOpenWaitSeconds;
                return true;
            }
            else
            {
                // Business is closed or admission denied: Camila respects the rule and picks another place
                Debug.Log($"[CamilaNpcController] '{blockingDoor.DoorName}' denied access ({rejectionReason}); interrupting traversal.");
                TriggerDialogue("Camila", $"Parece que {blockingDoor.DoorName} está cerrado ahorita... mejor exploro otro lugar.");
                waypointQueue.Clear();
                if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh)
                {
                    navAgent.ResetPath();
                }
                CompleteCurrentWalk("traversal-interrupted", $"Puerta cerrada o negocio fuera de horario: {rejectionReason}");
                return true;
            }
        }

        private static Vector3 GetDoorOpeningCenter(InteractiveDoor door)
        {
            if (door.DoorCollider != null)
            {
                return door.DoorCollider.bounds.center;
            }
            return door.InteractionAnchor.position;
        }

        private void CompleteCurrentWalk(string status, string message)
        {
            // Phase 2a: finishing the short approach walk to a prop means kick/push
            // it now — this walk is NOT a place arrival and reports nothing about location.
            if (walkingToPushObject)
            {
                walkingToPushObject = false;
                ExecutePushObject();
                return;
            }

            string finishedPlace = currentDestinationPlaceId;
            string walkStatus = status;
            currentDestinationPlaceId = "";
            waypointQueue.Clear();

            if (!string.IsNullOrEmpty(finishedPlace) && WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                arrivalReportInFlight = true;
                StartCoroutine(WorldCoreClient.Instance.ReportNpcArrival(
                    CamilaAgentId,
                    finishedPlace,
                    status,
                    message,
                    _ =>
                    {
                        arrivalReportInFlight = false;
                        // Wait a natural observation beat before choosing the next destination
                        cycleTimer = Mathf.Max(0f, aiCycleIntervalSeconds - 4.0f);
                        // Phase 2a: arrived at the pushed object's place — approach the prop.
                        // If the walk was interrupted (closed door), the push cannot proceed.
                        if (!string.IsNullOrEmpty(pendingPushObjectId))
                        {
                            if (walkStatus == "arrived")
                            {
                                BeginWalkToPushObject();
                            }
                            else
                            {
                                ReportPushFailed(pendingPushObjectId, $"No pude llegar a {finishedPlace}: {message}");
                            }
                        }
                    }));
            }
            else if (!string.IsNullOrEmpty(pendingPushObjectId))
            {
                // No arrival to report (already there / disconnected): go straight to the prop.
                BeginWalkToPushObject();
            }
        }

        /// <summary>
        /// Procedurally constructs a stylized Bobblehead character avatar for Camila.
        /// </summary>
        public void BuildExplorerAvatar()
        {
            gameObject.layer = 2; // Layer 2 = Ignore Raycast

            var oldAvatar = transform.Find("Avatar_Model");
            if (oldAvatar != null)
            {
                if (Application.isPlaying) Destroy(oldAvatar.gameObject);
                else DestroyImmediate(oldAvatar.gameObject);
            }

            var bobblehead = GetComponent<BobbleheadCharacter>();
            if (bobblehead == null) bobblehead = gameObject.AddComponent<BobbleheadCharacter>();
            bobblehead.Initialize(BobbleheadConfig.CreateCamilaConfig());

            bobbleheadAnimator = GetComponent<BobbleheadAnimator>();
            if (bobbleheadAnimator == null) bobbleheadAnimator = gameObject.AddComponent<BobbleheadAnimator>();
            bobbleheadAnimator.SetAttendantMode(false);
            bobbleheadAnimator.CacheInitialPoses();

            if (bobblehead.Torso != null)
            {
                characterRenderer = bobblehead.Torso.GetComponent<Renderer>();
            }

            Transform existingBillboard = transform.Find("Billboard_Nameplate");
            if (existingBillboard == null)
            {
                GameObject billboard = new GameObject("Billboard_Nameplate");
                billboard.transform.SetParent(transform, false);
                billboard.transform.localPosition = new Vector3(0f, 2.30f, 0f);
                billboard.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                billboardTransform = billboard.transform;

                TextMesh tm = billboard.AddComponent<TextMesh>();
                tm.text = "<b>Camila</b>\n<size=18><color=#7FE3D0>★ Explorer</color></size>";
                tm.fontSize = 28;
                tm.characterSize = 0.035f;
                tm.alignment = TextAlignment.Center;
                tm.anchor = TextAnchor.MiddleCenter;
                tm.color = Color.white;
            }
            else
            {
                billboardTransform = existingBillboard;
                if (billboardTransform != null)
                {
                    billboardTransform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                }
            }
        }

        /// <summary>
        /// Walks to a place along realistic sidewalks, streets, and doorways,
        /// ONLY when called from an authoritative AI cycle result.
        /// </summary>
        public bool MoveToPlace(string placeId)
        {
            if (string.IsNullOrEmpty(placeId) || !PlaceAnchors.TryGetValue(placeId, out Vector3 target))
            {
                Debug.LogWarning($"[CamilaNpcController] Unknown destination place \"{placeId}\" — ignoring.");
                return false;
            }

            currentDestinationPlaceId = placeId;
            lookAtTargetPosition = null;
            activeDoorOpening = null;

            if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh)
            {
                navAgent.SetDestination(target);
                return true;
            }

            BuildWalkableRoute(placeId, target);
            Debug.Log($"[CamilaNpcController] Starting walk to \"{placeId}\" ({waypointQueue.Count} waypoints).");
            return true;
        }

        /// <summary>
        /// Builds a wall-free corridor route from Camila's current position to the target place,
        /// always routing through actual doorways (Wing Spot & Tía Lupe) and sidewalks.
        /// </summary>
        private void BuildWalkableRoute(string destinationPlaceId, Vector3 target)
        {
            waypointQueue.Clear();
            Vector3 pos = transform.position;

            bool targetIsWingSpot = destinationPlaceId == "restaurant:wing-spot" || destinationPlaceId == "building:wing-spot-building";
            bool targetIsTiaLupe = destinationPlaceId == "restaurant:pasteleria-tia-lupe" || destinationPlaceId == "building:tia-lupe-building";

            // 1. Exit current interior through its real doorway first
            if (IsInsideWingSpot() && !targetIsWingSpot)
            {
                EnqueueWaypoint(WingSpotDoorInside);
                EnqueueWaypoint(WingSpotDoorOutside);
                EnqueueWaypoint(new Vector3(WingSpotDoorOutside.x, 0.24f, NorthSidewalkZ));
            }
            else if (IsInsideTiaLupe() && !targetIsTiaLupe)
            {
                EnqueueWaypoint(TiaLupeDoorInside);
                EnqueueWaypoint(TiaLupeDoorOutside);
                EnqueueWaypoint(new Vector3(TiaLupeDoorOutside.x, 0.24f, NorthSidewalkZ));
            }
            else if (!IsInsideWingSpot() && !IsInsideTiaLupe() && pos.z > 5.2f && Mathf.Abs(target.x - pos.x) > 8.0f)
            {
                // Return south along current side-street / plaza corridor to the North Sidewalk before crossing laterally
                EnqueueWaypoint(new Vector3(pos.x, 0.24f, NorthSidewalkZ));
            }

            // 2. Approach destination along the North Sidewalk and enter through its doorway / side street
            if (targetIsWingSpot)
            {
                if (!IsInsideWingSpot())
                {
                    EnqueueWaypoint(new Vector3(WingSpotDoorOutside.x, 0.24f, NorthSidewalkZ));
                    EnqueueWaypoint(WingSpotDoorOutside);
                    EnqueueWaypoint(WingSpotDoorInside);
                }
                EnqueueWaypoint(target);
            }
            else if (targetIsTiaLupe)
            {
                if (!IsInsideTiaLupe())
                {
                    EnqueueWaypoint(new Vector3(TiaLupeDoorOutside.x, 0.24f, NorthSidewalkZ));
                    EnqueueWaypoint(TiaLupeDoorOutside);
                    EnqueueWaypoint(TiaLupeDoorInside);
                }
                EnqueueWaypoint(target);
            }
            else if (destinationPlaceId == "street:calle-del-porvenir" || destinationPlaceId == "building:del-porvenir-residence")
            {
                EnqueueWaypoint(new Vector3(DelPorvenirSidewalkX, 0.24f, NorthSidewalkZ));
                EnqueueWaypoint(target);
            }
            else if (destinationPlaceId == "building:catzoo-building")
            {
                EnqueueWaypoint(new Vector3(CatZooPlazaCorridorX, 0.24f, NorthSidewalkZ));
                EnqueueWaypoint(target);
            }
            else if (destinationPlaceId == "street:av-la-arboleda")
            {
                EnqueueWaypoint(new Vector3(ArboledaSidewalkX, 0.24f, NorthSidewalkZ));
                EnqueueWaypoint(target);
            }
            else
            {
                // Blvd. Gómez Morín, Dollar 2 Go plaza, Acabados HRC, Corporativo Arboleda
                if (target.z > 3.5f)
                {
                    EnqueueWaypoint(new Vector3(target.x, 0.24f, NorthSidewalkZ));
                }
                EnqueueWaypoint(target);
            }
        }

        private void EnqueueWaypoint(Vector3 wp)
        {
            // Avoid enqueueing duplicate consecutive waypoints
            Vector3 last = waypointQueue.Count > 0 ? GetLastEnqueuedWaypoint() : transform.position;
            float flatDist = Vector2.Distance(new Vector2(last.x, last.z), new Vector2(wp.x, wp.z));
            if (flatDist > 0.25f)
            {
                waypointQueue.Enqueue(wp);
            }
        }

        private Vector3 GetLastEnqueuedWaypoint()
        {
            Vector3 last = transform.position;
            foreach (var w in waypointQueue)
            {
                last = w;
            }
            return last;
        }

        /// <summary>Turns to look at a probe object (look_at proposals).</summary>
        public bool LookAtObject(string objectId)
        {
            if (string.IsNullOrEmpty(objectId) || !ProbeObjectAnchors.TryGetValue(objectId, out Vector3 target))
            {
                return false;
            }

            lookAtTargetPosition = target;
            lookAtHoldTimer = 3.5f;

            Vector3 dir = target - transform.position;
            dir.y = 0f;
            if (dir.sqrMagnitude > 0.04f)
            {
                transform.rotation = Quaternion.Slerp(
                    transform.rotation, Quaternion.LookRotation(dir.normalized, Vector3.up),
                    Time.deltaTime * lookAtSpeed);
            }
            return true;
        }

        // =====================================================================
        // Phase 2a: push_object — walk to the prop, kick / push it, report back.
        // Presentation-only: the decision (what to push, toward where) came from
        // an authoritative World Core cycle; Unity only performs it physically
        // and reports the resulting position. A failed push commits nothing.
        // =====================================================================

        /// <summary>
        /// Starts a push: walks to the object's place through the authoritative
        /// arrival loop; the approach + kick happen once arrival is reported.
        /// </summary>
        public void StartPushObject(string objectId, string pushTowardsPlaceId)
        {
            if (string.IsNullOrEmpty(objectId))
            {
                Debug.LogWarning("[CamilaNpcController] push_object without targetObjectId — ignoring.");
                return;
            }
            if (!ProbeObjectPlaces.TryGetValue(objectId, out string placeId))
            {
                Debug.LogWarning($"[CamilaNpcController] Unknown push target \"{objectId}\" — ignoring.");
                return;
            }

            pendingPushObjectId = objectId;
            pendingPushTowardsPlaceId = pushTowardsPlaceId ?? "";

            if (!MoveToPlace(placeId))
            {
                ReportPushFailed(objectId, $"No sé cómo llegar a {placeId}.");
            }
        }

        /// <summary>
        /// After arriving at the object's place, walks the last metres to stand
        /// next to the prop (stopping 0.7 m short so she does not collide with it).
        /// </summary>
        private void BeginWalkToPushObject()
        {
            string objectId = pendingPushObjectId;
            if (string.IsNullOrEmpty(objectId)) return;

            GameObject propObject = FindProbePropObject(objectId);
            if (propObject == null)
            {
                ReportPushFailed(objectId, $"No encontré el objeto {objectId} en la escena.");
                return;
            }

            Vector3 propPos = propObject.transform.position;
            Vector3 toProp = new Vector3(propPos.x - transform.position.x, 0f, propPos.z - transform.position.z);
            Vector3 approach = propPos;
            if (toProp.sqrMagnitude > 0.04f)
            {
                Vector3 away = toProp.normalized;
                approach = new Vector3(propPos.x - away.x * 0.7f, propPos.y, propPos.z - away.z * 0.7f);
            }

            walkingToPushObject = true;
            waypointQueue.Clear();
            EnqueueWaypoint(approach);
            Debug.Log($"[CamilaNpcController] Acercándome a {objectId} para empujarlo.");
        }

        /// <summary>
        /// Kicks (ball) or body-pushes (other movable props) the prop in the
        /// cycle's push direction, then waits for the physics to settle before
        /// reporting the real resting position to World Core.
        /// </summary>
        private void ExecutePushObject()
        {
            string objectId = pendingPushObjectId;
            string towardsPlaceId = pendingPushTowardsPlaceId;
            pendingPushObjectId = "";
            pendingPushTowardsPlaceId = "";

            if (string.IsNullOrEmpty(objectId)) return;

            GameObject propObject = FindProbePropObject(objectId);
            InteractiveWorldProp prop = propObject != null
                ? propObject.GetComponent<InteractiveWorldProp>()
                : null;
            if (prop == null)
            {
                ReportPushFailed(objectId, $"El objeto {objectId} no tiene InteractiveWorldProp.");
                return;
            }

            // Push direction: toward the cycle's target place anchor, else away from Camila.
            Vector3 propPos = propObject.transform.position;
            Vector3 dir;
            if (!string.IsNullOrEmpty(towardsPlaceId) &&
                PlaceAnchors.TryGetValue(towardsPlaceId, out Vector3 anchor))
            {
                dir = new Vector3(anchor.x - propPos.x, 0f, anchor.z - propPos.z);
            }
            else
            {
                dir = new Vector3(propPos.x - transform.position.x, 0f, propPos.z - transform.position.z);
            }
            if (dir.sqrMagnitude < 0.01f) dir = Vector3.forward;
            dir.y = 0f;
            dir.Normalize();

            // Face the push direction, then kick or shove.
            transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
            if (prop.CanKick)
            {
                prop.Kick(transform);
                Debug.Log($"[CamilaNpcController] ¡Pateé {objectId} hacia {towardsPlaceId}!");
            }
            else
            {
                prop.ApplyBodyPush(dir, walkSpeed);
                Debug.Log($"[CamilaNpcController] Empujé {objectId} hacia {towardsPlaceId}.");
            }
            TriggerDialogue("Camila", "¡Allá va! " + (string.IsNullOrEmpty(towardsPlaceId) ? "" : $"Hacia {towardsPlaceId}."));

            pushReportInFlight = true;
            StartCoroutine(PushSettleAndReport(prop, objectId));
        }

        /// <summary>
        /// Lets the prop's physics settle, then reports its real resting position.
        /// </summary>
        private System.Collections.IEnumerator PushSettleAndReport(InteractiveWorldProp prop, string objectId)
        {
            yield return new WaitForSeconds(1.2f);

            if (prop == null)
            {
                ReportPushFailed(objectId, "El objeto desapareció antes de reportar el empuje.");
                pushReportInFlight = false;
                yield break;
            }

            Vector3 restingPos = prop.transform.position;
            if (WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                StartCoroutine(WorldCoreClient.Instance.ReportObjectInteraction(
                    CamilaAgentId,
                    objectId,
                    "applied",
                    restingPos,
                    $"Camila empujó {objectId}; quedó en ({restingPos.x:F2}, {restingPos.y:F2}, {restingPos.z:F2}).",
                    _ =>
                    {
                        pushReportInFlight = false;
                        cycleTimer = Mathf.Max(0f, aiCycleIntervalSeconds - 4.0f);
                    }));
            }
            else
            {
                pushReportInFlight = false;
                Debug.LogWarning("[CamilaNpcController] Sin conexión: el empuje no se reportó a World Core.");
            }
        }

        /// <summary>
        /// Reports a failed push so World Core clears the pending push without
        /// committing any position change. Safe to call when disconnected.
        /// </summary>
        private void ReportPushFailed(string objectId, string message)
        {
            pendingPushObjectId = "";
            pendingPushTowardsPlaceId = "";
            walkingToPushObject = false;

            if (string.IsNullOrEmpty(objectId)) return;
            if (WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                pushReportInFlight = true;
                StartCoroutine(WorldCoreClient.Instance.ReportObjectInteraction(
                    CamilaAgentId,
                    objectId,
                    "failed",
                    Vector3.zero,
                    message,
                    _ => { pushReportInFlight = false; }));
            }
            Debug.LogWarning($"[CamilaNpcController] Empuje fallido ({objectId}): {message}");
        }

        private GameObject FindProbePropObject(string objectId)
        {
            if (!ProbeObjectGameObjectNames.TryGetValue(objectId, out string goName)) return null;
            return GameObject.Find(goName);
        }

        /// <summary>
        /// Reacts to authoritative AI cycle execution (Elena + Camila share
        /// this event; Camila only acts on her own cycles).
        /// </summary>
        public void HandleAiCycleExecuted(NpcAiCycleData cycleData)
        {
            if (cycleData == null || cycleData.agentId != CamilaAgentId || cycleData.proposal == null) return;

            if (cycleData.status != "executed" && cycleData.status != "noop") return;

            if (cycleData.proposal.actionType == "move_to_place")
            {
                MoveToPlace(cycleData.proposal.destinationPlaceId);
            }
            else if (cycleData.proposal.actionType == "look_at")
            {
                LookAtObject(cycleData.proposal.targetObjectId);
                TriggerDialogue("Camila", "¡Mira esto! " + (cycleData.proposal.reasoningContext ?? ""));
            }
            else if (cycleData.proposal.actionType == "push_object")
            {
                StartPushObject(cycleData.proposal.targetObjectId, cycleData.proposal.pushTowardsPlaceId);
            }
        }

        public void TriggerDialogue(string speaker, string text)
        {
            OnDialogueTriggered?.Invoke(speaker, text);
            var hud = FindFirstObjectByType<UI.ProductHudController>();
            if (hud != null)
            {
                hud.ShowDialogue(speaker, text);
            }
        }

        public bool IsWalking => waypointQueue.Count > 0 || activeDoorOpening != null || !string.IsNullOrEmpty(currentDestinationPlaceId);
        public string CurrentDestinationPlaceId => currentDestinationPlaceId;
    }
}
