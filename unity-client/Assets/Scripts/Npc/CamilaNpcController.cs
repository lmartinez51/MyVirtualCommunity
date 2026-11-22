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
        private static readonly Vector3 WingSpotDoorInside = new Vector3(-6.75f, 0.24f, 6.95f);
        private static readonly Vector3 WingSpotDoorOutside = new Vector3(-6.75f, 0.24f, 4.85f);
        private static readonly Vector3 TiaLupeDoorInside = new Vector3(-2.70f, 0.24f, 6.35f);
        private static readonly Vector3 TiaLupeDoorOutside = new Vector3(-2.70f, 0.24f, 4.35f);
        private const float NorthSidewalkZ = 2.75f;
        private const float DelPorvenirSidewalkX = 7.50f;
        private const float CatZooPlazaCorridorX = 72.50f;
        private const float ArboledaSidewalkX = 94.25f;

        private NavMeshAgent navAgent;
        private Transform billboardTransform;
        private BobbleheadAnimator bobbleheadAnimator;
        private Player.PlayerController cachedPlayerController;
        private Camera cachedMainCamera;

        // AI cycle, hydration & traversal state
        private bool hasHydratedFromWorldCore;
        private bool hydrationInFlight;
        private float cycleTimer;
        private bool cycleInFlight;
        private bool arrivalReportInFlight;
        private string currentDestinationPlaceId = "";
        private readonly Queue<Vector3> waypointQueue = new Queue<Vector3>();
        private Vector3? lookAtTargetPosition;
        private float lookAtHoldTimer;

        // Phase 2a/2b ("Manos Libres"): push, pick_up, carry, drop, sit, substance state
        private string pendingPushObjectId = "";
        private string pendingPushTowardsPlaceId = "";
        private string pendingPushTowardsObjectId = "";
        private string pendingPickUpObjectId = "";
        private string pendingDropNearObjectId = "";
        private string pendingSitTargetId = "";
        private string pendingSubstanceMode = ""; // "scoop" or "pour_or_apply"
        private string pendingSubstanceTargetId = "";
        private bool walkingToPushObject;
        private bool walkingToPickUpObject;
        private bool walkingToDropObject;
        private bool walkingToSitTarget;
        private bool walkingToSubstanceTarget;
        private bool isSeatedOnBench;
        private bool pushReportInFlight;
        private InteractiveWorldProp heldProp;

        // Autonomous door-opening & obstacle avoidance state
        private InteractiveDoor activeDoorOpening;
        private float doorOpenWaitTimer;
        private InteractiveDoor recentlyPassedDoor;
        private float obstacleBlockedTimer;

        // Comic-book floating thought bubble state
        private string activeThoughtText = "";
        private string activeThoughtHeader = "Camila piensa...";
        private float thoughtBubbleTimer;
        private const float ThoughtBubbleDuration = 7.5f;
        private static Texture2D comicBubbleTexture;
        private static Texture2D comicDotTexture;
        private GUIStyle comicBubbleStyle;
        private GUIStyle comicHeaderStyle;
        private GUIStyle comicBodyStyle;

        public event Action<string, string> OnDialogueTriggered; // (Speaker, Text)

        /// <summary>
        /// Walkable Unity scene anchors aligned with GomezMorinSceneBuilder geometry
        /// (never inside solid exterior-only building boxes or north of Lot_Angled_Rear_Fence).
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
                { "building:dollar-2-go-building", new Vector3(58f, 0.12f, 8.0f) },
                { "building:acabados-hbc-building", new Vector3(85f, 0.24f, 2.85f) },
                { "building:catzoo-building", new Vector3(72.5f, 0.12f, 24.8f) },
                { "building:corporativo-arboleda-building", new Vector3(115.5f, 0.24f, 3.1f) },
            };

        /// <summary>Probe object id -> Unity scene position (mirror of CAMILA_PROBE_OBJECTS).</summary>
        public static readonly Dictionary<string, Vector3> ProbeObjectAnchors =
            new Dictionary<string, Vector3>
            {
                { "probe:ball", new Vector3(68f, 0.345f, 11.5f) },
                { "probe:small-goal", new Vector3(68f, 0.12f, 18f) },
                { "probe:cone-west", new Vector3(65f, 0.4f, 14.5f) },
                { "probe:cone-east", new Vector3(71f, 0.4f, 14.5f) },
                { "probe:trash-bag", new Vector3(19.78f, 0.24f, 1.25f) },
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
                { "probe:orange-sculpture", new Vector3(113f, 2.5f, 5.4f) },
                { "probe:tile-sample", new Vector3(82.8f, 0.265f, 3.15f) },
                { "probe:cat-bowl", new Vector3(74.6f, 0.24f, 25.0f) },
                { "probe:sand-pile", new Vector3(27.5f, 0.12f, 11.2f) },
                { "probe:shovel", new Vector3(29.0f, 0.12f, 11.0f) },
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
                { "probe:trash-bag", "street:blvd-gomez-morin" },
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
                { "probe:orange-sculpture", "building:corporativo-arboleda-building" },
                { "probe:tile-sample", "building:acabados-hbc-building" },
                { "probe:cat-bowl", "building:catzoo-building" },
                { "probe:sand-pile", "building:dollar-2-go-building" },
                { "probe:shovel", "building:dollar-2-go-building" },
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
                { "probe:tile-sample", "Probe_TileSample" },
                { "probe:cat-bowl", "Probe_CatBowl" },
                { "probe:shovel", "Probe_Shovel" },
                { "probe:sand-pile", "Probe_SandPile" },
                { "probe:puddle", "Probe_Puddle" },
                { "probe:bench", "Probe_Bench" },
                { "probe:blank-wall", "Probe_BlankWall" },
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
            if (thoughtBubbleTimer > 0f)
            {
                thoughtBubbleTimer = Mathf.Max(0f, thoughtBubbleTimer - Time.deltaTime);
            }

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

            // 3. Hydrate Camila's physical location from World Core before running her first cycle
            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                return;
            }

            if (!hasHydratedFromWorldCore)
            {
                if (!hydrationInFlight)
                {
                    hydrationInFlight = true;
                    StartCoroutine(WorldCoreClient.Instance.FetchNpcPerception(
                        CamilaAgentId,
                        OnCamilaHydratedFromWorldCore));
                }
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
                string liveContextJson = BuildLiveSensoryJson();
                StartCoroutine(WorldCoreClient.Instance.TriggerNpcAiCycle(
                    CamilaAgentId,
                    _ => { cycleInFlight = false; },
                    liveContextJson));
            }
        }

        private void OnCamilaHydratedFromWorldCore(NpcPerceptionData perception)
        {
            hydrationInFlight = false;
            hasHydratedFromWorldCore = true;

            if (perception == null) return;

            if (!string.IsNullOrEmpty(perception.locationId) &&
                PlaceAnchors.TryGetValue(perception.locationId, out Vector3 anchorPos))
            {
                transform.position = anchorPos;
                SnapToGround();
                Debug.Log($"[CamilaNpcController] Hydrated physical position to World Core location '{perception.locationId}' ({transform.position}).");
            }

            // Re-attach held prop if Camila was carrying one when the session resumed
            if (perception.heldObject != null && !string.IsNullOrEmpty(perception.heldObject.id))
            {
                GameObject propObj = FindProbePropObject(perception.heldObject.id);
                var prop = propObj != null ? propObj.GetComponent<InteractiveWorldProp>() : null;
                if (prop != null && prop.PickUp(transform))
                {
                    heldProp = prop;
                    Debug.Log($"[CamilaNpcController] Re-hydrated held prop '{perception.heldObject.id}'.");
                }
            }
        }

        private string BuildLiveSensoryJson()
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            Vector3 cPos = transform.position;
            if (cachedPlayerController == null) cachedPlayerController = FindFirstObjectByType<Player.PlayerController>();
            var player = cachedPlayerController;
            if (player == null)
            {
                return $"{{\"camilaPosition\":{{\"x\":{cPos.x.ToString(inv)},\"y\":{cPos.y.ToString(inv)},\"z\":{cPos.z.ToString(inv)}}}}}";
            }

            Vector3 pPos = player.transform.position;
            string heldId = player.HeldProp != null ? player.HeldProp.ProbeObjectId : null;
            string heldField = string.IsNullOrEmpty(heldId)
                ? "null"
                : $"\"{heldId.Replace("\"", "")}\"";
            return $"{{\"camilaPosition\":{{\"x\":{cPos.x.ToString(inv)},\"y\":{cPos.y.ToString(inv)},\"z\":{cPos.z.ToString(inv)}}},\"playerPosition\":{{\"x\":{pPos.x.ToString(inv)},\"y\":{pPos.y.ToString(inv)},\"z\":{pPos.z.ToString(inv)}}},\"playerHeldObjectId\":{heldField}}}";
        }

        private void LateUpdate()
        {
            // Billboard overhead nameplate continuously faces main camera (or aerial camera).
            // NOTE: unlike Elena, there is NO position anchoring here — Camila wanders freely.
            if (billboardTransform != null)
            {
                if (cachedMainCamera == null) cachedMainCamera = Camera.main ?? FindFirstObjectByType<Camera>();
                if (cachedMainCamera != null)
                {
                    billboardTransform.rotation = cachedMainCamera.transform.rotation;
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
        /// Skips furniture/props like Probe_Bench and InteractiveWorldProp so Camila never climbs
        /// on top of benches or movable objects when approaching them.
        /// </summary>
        public void SnapToGround()
        {
            Vector3 origin = new Vector3(transform.position.x, transform.position.y + 1.4f, transform.position.z);
            RaycastHit[] hits = Physics.RaycastAll(origin, Vector3.down, 4.5f, ~(1 << 2), QueryTriggerInteraction.Ignore);
            float bestY = float.MinValue;
            bool found = false;

            for (int i = 0; i < hits.Length; i++)
            {
                var h = hits[i];
                if (h.collider == null) continue;
                if (h.collider.GetComponentInParent<InteractiveWorldProp>() != null) continue;
                if (IsNonWalkablePropCollider(h.collider.transform)) continue;

                if (h.point.y > bestY)
                {
                    bestY = h.point.y;
                    found = true;
                }
            }

            if (found)
            {
                transform.position = new Vector3(transform.position.x, bestY, transform.position.z);
            }
        }

        private static bool IsNonWalkablePropCollider(Transform t)
        {
            while (t != null)
            {
                if (t.name.StartsWith("Probe_Bench", StringComparison.OrdinalIgnoreCase) ||
                    t.name.StartsWith("Probe_SmallGoal", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
                t = t.parent;
            }
            return false;
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
            float step = Mathf.Min(dist, walkSpeed * Time.deltaTime);

            // Solid obstacle guard: never walk through fences (e.g. Lot_Angled_Rear_Fence), walls, or buildings
            if (TryFindBlockingObstacle(currentPos, dir, step + 0.36f, out RaycastHit obstacleHit))
            {
                Vector3 slideDir = Vector3.ProjectOnPlane(dir, new Vector3(obstacleHit.normal.x, 0f, obstacleHit.normal.z));
                slideDir.y = 0f;
                if (slideDir.sqrMagnitude > 0.04f && !TryFindBlockingObstacle(currentPos, slideDir.normalized, step + 0.32f, out _))
                {
                    dir = slideDir.normalized;
                    obstacleBlockedTimer = 0f;
                }
                else
                {
                    obstacleBlockedTimer += Time.deltaTime;
                    bobbleheadAnimator?.UpdateLocomotionState(0f, true);
                    if (obstacleBlockedTimer >= 1.2f)
                    {
                        obstacleBlockedTimer = 0f;
                        Debug.Log($"[CamilaNpcController] Blocked by solid obstacle '{obstacleHit.collider.name}'; interrupting walk.");
                        ShowThoughtBubble("Hmm, hay una cerca o muro aquí... mejor rodeo por otro lado.", "Camila piensa...");
                        CompleteCurrentWalk("traversal-interrupted", $"Obstáculo físico en el camino ({obstacleHit.collider.name}).");
                    }
                    return;
                }
            }
            else
            {
                obstacleBlockedTimer = 0f;
            }

            Quaternion targetRot = Quaternion.LookRotation(dir, Vector3.up);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, Time.deltaTime * turnSpeed);

            transform.position = new Vector3(currentPos.x + dir.x * step, currentPos.y, currentPos.z + dir.z * step);
            SnapToGround();

            bobbleheadAnimator?.UpdateLocomotionState(walkSpeed, true);
        }

        private bool IsNearOpenOrPassingDoor(Vector3 pos)
        {
            for (int i = 0; i < InteractiveDoor.ActiveDoors.Count; i++)
            {
                var d = InteractiveDoor.ActiveDoors[i];
                if (d == null || !d.isActiveAndEnabled) continue;
                if (!d.IsOpen && d.CurrentState != DoorState.Opening && d != recentlyPassedDoor) continue;
                Vector3 c = GetDoorOpeningCenter(d);
                if (Vector2.Distance(new Vector2(pos.x, pos.z), new Vector2(c.x, c.z)) <= 2.1f)
                {
                    return true;
                }
            }
            return false;
        }

        private bool TryFindBlockingObstacle(Vector3 originPos, Vector3 moveDir, float checkDistance, out RaycastHit blockingHit)
        {
            Vector3 castOrigin = originPos + Vector3.up * 0.85f;
            bool passingOpenDoor = IsNearOpenOrPassingDoor(originPos);
            float castRadius = passingOpenDoor ? 0.14f : 0.22f;
            RaycastHit[] hits = Physics.SphereCastAll(castOrigin, castRadius, moveDir, checkDistance, ~(1 << 2), QueryTriggerInteraction.Ignore);
            float nearestDist = float.MaxValue;
            blockingHit = default;
            bool found = false;

            for (int i = 0; i < hits.Length; i++)
            {
                var h = hits[i];
                if (h.collider == null) continue;
                // Ignore floors, curbs, and shallow ramps
                if (h.normal.y > 0.55f) continue;
                // Ignore movable world props and InteractiveDoors (doors are handled by TryHandleBlockingDoorAhead)
                if (h.collider.GetComponentInParent<InteractiveWorldProp>() != null) continue;
                if (h.collider.GetComponentInParent<InteractiveDoor>() != null) continue;
                // When walking cleanly through an open narrow doorway (e.g. Wing Spot 0.95m frame),
                // ignore immediate door jamb/frame trim so Camila never snags exiting/entering.
                if (passingOpenDoor)
                {
                    string colName = h.collider.name;
                    if (colName.IndexOf("Door_Frame", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        colName.IndexOf("Pasillo_Back_Jamb", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        colName.IndexOf("Facade_Red_", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        colName.IndexOf("TiaLupe_Door", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        continue;
                    }
                }

                if (h.distance < nearestDist)
                {
                    nearestDist = h.distance;
                    blockingHit = h;
                    found = true;
                }
            }
            return found;
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
            // Phase 2a/2b: finishing the short approach walk to a prop executes push / pick_up / drop now
            if (walkingToPushObject)
            {
                walkingToPushObject = false;
                ExecutePushObject();
                return;
            }
            if (walkingToPickUpObject)
            {
                walkingToPickUpObject = false;
                ExecutePickUpObject();
                return;
            }
            if (walkingToDropObject)
            {
                walkingToDropObject = false;
                ExecuteDropObject();
                return;
            }
            if (walkingToSitTarget)
            {
                walkingToSitTarget = false;
                ExecuteSitNow();
                return;
            }
            if (walkingToSubstanceTarget)
            {
                walkingToSubstanceTarget = false;
                ExecuteSubstanceActionNow();
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

            EnsureStandingUp();
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
        /// Starts a push: approaches the prop directly (Camila is already at its place)
        /// and kicks / body-pushes it toward pushTowardsObjectId, pushTowardsPlaceId, or away.
        /// </summary>
        public void StartPushObject(string objectId, string pushTowardsPlaceId, string pushTowardsObjectId = null)
        {
            if (string.IsNullOrEmpty(objectId))
            {
                Debug.LogWarning("[CamilaNpcController] push_object without targetObjectId — ignoring.");
                return;
            }

            EnsureStandingUp();
            pendingPushObjectId = objectId;
            pendingPushTowardsPlaceId = pushTowardsPlaceId ?? "";
            pendingPushTowardsObjectId = pushTowardsObjectId ?? "";

            // Camila is already at the object's location (validated by World Core): walk straight to the prop!
            BeginWalkToPushObject();
        }

        /// <summary>
        /// Phase 2b ("Manos Libres"): walks up to a movable/carriable prop, picks it up
        /// into Camila's hands, and reports success/failure to World Core.
        /// </summary>
        public void StartPickUpObject(string objectId)
        {
            if (string.IsNullOrEmpty(objectId)) return;

            GameObject propObject = FindProbePropObject(objectId);
            if (propObject == null)
            {
                ReportPushFailed(objectId, $"No encontré el objeto {objectId} en la escena.");
                return;
            }

            EnsureStandingUp();
            pendingPickUpObjectId = objectId;
            Vector3 propPos = propObject.transform.position;
            Vector3 toProp = new Vector3(propPos.x - transform.position.x, 0f, propPos.z - transform.position.z);
            Vector3 approach = propPos;
            if (toProp.sqrMagnitude > 0.09f)
            {
                Vector3 away = toProp.normalized;
                approach = new Vector3(propPos.x - away.x * 0.75f, propPos.y, propPos.z - away.z * 0.75f);
            }

            walkingToPickUpObject = true;
            waypointQueue.Clear();
            EnqueueWaypoint(approach);
            if (waypointQueue.Count == 0)
            {
                walkingToPickUpObject = false;
                ExecutePickUpObject();
            }
        }

        private void ExecutePickUpObject()
        {
            string objectId = pendingPickUpObjectId;
            pendingPickUpObjectId = "";
            if (string.IsNullOrEmpty(objectId)) return;

            GameObject propObject = FindProbePropObject(objectId);
            InteractiveWorldProp prop = propObject != null ? propObject.GetComponent<InteractiveWorldProp>() : null;
            if (prop == null || !prop.PickUp(transform))
            {
                ReportPushFailed(objectId, $"No pude recoger {objectId}.");
                return;
            }

            heldProp = prop;
            Debug.Log($"[CamilaNpcController] Recogí '{objectId}' con mis manos.");

            pushReportInFlight = true;
            if (WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                StartCoroutine(WorldCoreClient.Instance.ReportObjectInteraction(
                    CamilaAgentId,
                    objectId,
                    "applied",
                    transform.position,
                    $"Camila recogió {objectId}.",
                    _ =>
                    {
                        pushReportInFlight = false;
                        cycleTimer = Mathf.Max(0f, aiCycleIntervalSeconds - 4.0f);
                    }));
            }
            else
            {
                pushReportInFlight = false;
            }
        }

        /// <summary>
        /// Phase 2b ("Manos Libres"): drops Camila's currently carried prop here
        /// (optionally walking near nearObjectId first) and reports its settled position.
        /// </summary>
        public void StartDropObject(string nearObjectId = null)
        {
            if (heldProp == null)
            {
                Debug.LogWarning("[CamilaNpcController] drop_object called while holding nothing.");
                return;
            }

            pendingDropNearObjectId = nearObjectId ?? "";
            if (!string.IsNullOrEmpty(pendingDropNearObjectId))
            {
                Vector3 targetPos;
                GameObject nearObj = FindProbePropObject(pendingDropNearObjectId);
                if (nearObj != null)
                {
                    targetPos = nearObj.transform.position;
                }
                else if (ProbeObjectAnchors.TryGetValue(pendingDropNearObjectId, out Vector3 fallbackAnchor))
                {
                    targetPos = fallbackAnchor;
                }
                else
                {
                    ExecuteDropObject();
                    return;
                }

                Vector3 toTarget = new Vector3(targetPos.x - transform.position.x, 0f, targetPos.z - transform.position.z);
                if (toTarget.magnitude > 1.35f)
                {
                    Vector3 dir = toTarget.normalized;
                    Vector3 standPos = new Vector3(targetPos.x - dir.x * 1.15f, targetPos.y, targetPos.z - dir.z * 1.15f);
                    walkingToDropObject = true;
                    waypointQueue.Clear();
                    EnqueueWaypoint(standPos);
                    if (waypointQueue.Count > 0) return;
                }
            }

            ExecuteDropObject();
        }

        private void ExecuteDropObject()
        {
            pendingDropNearObjectId = "";
            if (heldProp == null) return;

            InteractiveWorldProp dropped = heldProp;
            string objectId = dropped.ProbeObjectId;
            heldProp = null;

            dropped.Drop(transform);
            Debug.Log($"[CamilaNpcController] Dejé '{objectId}' en el lugar.");

            pushReportInFlight = true;
            StartCoroutine(PushSettleAndReport(dropped, objectId));
        }

        /// <summary>
        /// Walks the last metres to stand next to the prop (stopping 0.7 m short).
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
            if (waypointQueue.Count == 0)
            {
                walkingToPushObject = false;
                ExecutePushObject();
            }
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
            string towardsObjectId = pendingPushTowardsObjectId;
            pendingPushObjectId = "";
            pendingPushTowardsPlaceId = "";
            pendingPushTowardsObjectId = "";

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

            // Push direction: toward pushTowardsObjectId (live object!), else pushTowardsPlaceId, else away from Camila.
            Vector3 propPos = propObject.transform.position;
            Vector3 dir = Vector3.zero;
            if (!string.IsNullOrEmpty(towardsObjectId))
            {
                GameObject targetObj = FindProbePropObject(towardsObjectId);
                if (targetObj != null)
                {
                    dir = new Vector3(targetObj.transform.position.x - propPos.x, 0f, targetObj.transform.position.z - propPos.z);
                }
                else if (ProbeObjectAnchors.TryGetValue(towardsObjectId, out Vector3 objAnchor))
                {
                    dir = new Vector3(objAnchor.x - propPos.x, 0f, objAnchor.z - propPos.z);
                }
            }
            if (dir.sqrMagnitude < 0.01f && !string.IsNullOrEmpty(towardsPlaceId) &&
                PlaceAnchors.TryGetValue(towardsPlaceId, out Vector3 anchor))
            {
                dir = new Vector3(anchor.x - propPos.x, 0f, anchor.z - propPos.z);
            }
            if (dir.sqrMagnitude < 0.01f)
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
                Debug.Log($"[CamilaNpcController] ¡Pateé {objectId} hacia {towardsObjectId ?? towardsPlaceId}!");
            }
            else
            {
                prop.ApplyBodyPush(dir, walkSpeed);
                Debug.Log($"[CamilaNpcController] Empujé {objectId} hacia {towardsObjectId ?? towardsPlaceId}.");
            }

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

            if (cycleData.status != "executed" && cycleData.status != "noop")
            {
                Debug.LogWarning($"[CamilaNpcController] AI cycle '{cycleData.proposal.actionType}' status='{cycleData.status}' — Camila will adapt next cycle.");
                ShowThoughtBubble("Hmm, así no se pudo... mejor pruebo otra cosa.", "Camila piensa...");
                cycleTimer = Mathf.Max(cycleTimer, aiCycleIntervalSeconds - 3.5f);
                return;
            }

            if (cycleData.proposal.actionType == "move_to_place")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila piensa...");
                }
                MoveToPlace(cycleData.proposal.destinationPlaceId);
            }
            else if (cycleData.proposal.actionType == "look_at")
            {
                LookAtObject(cycleData.proposal.targetObjectId);
                string thought = !string.IsNullOrEmpty(cycleData.proposal.reasoningContext)
                    ? cycleData.proposal.reasoningContext
                    : "¡Mira esto!";
                ShowThoughtBubble(thought, "Camila observa...");
                OnDialogueTriggered?.Invoke("Camila", thought);
            }
            else if (cycleData.proposal.actionType == "observe")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext) &&
                    cycleData.proposal.reasoningContext.IndexOf("Traversal already in progress", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila piensa...");
                }
            }
            else if (cycleData.proposal.actionType == "push_object")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila decide...");
                }
                StartPushObject(
                    cycleData.proposal.targetObjectId,
                    cycleData.proposal.pushTowardsPlaceId,
                    cycleData.proposal.pushTowardsObjectId);
            }
            else if (cycleData.proposal.actionType == "pick_up_object")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila recoge...");
                }
                StartPickUpObject(cycleData.proposal.targetObjectId);
            }
            else if (cycleData.proposal.actionType == "drop_object")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila deja...");
                }
                StartDropObject(cycleData.proposal.nearObjectId);
            }
            else if (cycleData.proposal.actionType == "sit")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila descansa...");
                }
                StartSit(cycleData.proposal.targetObjectId);
            }
            else if (cycleData.proposal.actionType == "stand_up")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila se levanta...");
                }
                EnsureStandingUp();
            }
            else if (cycleData.proposal.actionType == "scoop")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila recoge...");
                }
                StartSubstanceAction("scoop", cycleData.proposal.targetObjectId);
            }
            else if (cycleData.proposal.actionType == "pour_or_apply")
            {
                if (!string.IsNullOrEmpty(cycleData.proposal.reasoningContext))
                {
                    ShowThoughtBubble(cycleData.proposal.reasoningContext, "Camila prueba...");
                }
                StartSubstanceAction("pour_or_apply", cycleData.proposal.targetObjectId);
            }
        }

        private void EnsureStandingUp()
        {
            if (bobbleheadAnimator != null && bobbleheadAnimator.IsSitting)
            {
                bobbleheadAnimator.SetSitting(false);
                if (isSeatedOnBench)
                {
                    // Step cleanly off the front edge of the bench onto the sidewalk
                    transform.position += transform.forward * 0.55f;
                    isSeatedOnBench = false;
                }
                SnapToGround();
            }
        }

        public void StartSit(string targetObjectId)
        {
            pendingSitTargetId = targetObjectId ?? "";
            if (!string.IsNullOrEmpty(pendingSitTargetId) && pendingSitTargetId == "probe:bench")
            {
                GameObject benchObj = FindProbePropObject("probe:bench");
                Vector3 benchPos = benchObj != null ? benchObj.transform.position : new Vector3(60f, 0.24f, 2.15f);
                Vector3 frontOfBench = new Vector3(benchPos.x, 0.24f, benchPos.z - 0.55f);
                if (Vector2.Distance(new Vector2(transform.position.x, transform.position.z), new Vector2(frontOfBench.x, frontOfBench.z)) > 0.65f)
                {
                    EnsureStandingUp();
                    walkingToSitTarget = true;
                    waypointQueue.Clear();
                    EnqueueWaypoint(frontOfBench);
                    if (waypointQueue.Count > 0) return;
                }
            }
            ExecuteSitNow();
        }

        private void ExecuteSitNow()
        {
            string targetId = pendingSitTargetId;
            pendingSitTargetId = "";
            if (targetId == "probe:bench")
            {
                GameObject benchObj = FindProbePropObject("probe:bench");
                Vector3 benchPos = benchObj != null ? benchObj.transform.position : new Vector3(60f, 0.24f, 2.15f);
                // Seat Camila cleanly on the bench facing south toward the boulevard (seat top = 0.685m; Pelvis at ~0.45m)
                transform.position = new Vector3(benchPos.x - 0.22f, benchPos.y + 0.25f, benchPos.z - 0.08f);
                transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                isSeatedOnBench = true;
                bobbleheadAnimator?.SetSitting(true, onBench: true);
            }
            else
            {
                SnapToGround();
                isSeatedOnBench = false;
                bobbleheadAnimator?.SetSitting(true, onBench: false);
            }
        }

        public void StartSubstanceAction(string mode, string targetObjectId)
        {
            EnsureStandingUp();
            pendingSubstanceMode = mode ?? "";
            pendingSubstanceTargetId = targetObjectId ?? "";

            if (!string.IsNullOrEmpty(pendingSubstanceTargetId))
            {
                GameObject targetGo = FindProbePropObject(pendingSubstanceTargetId);
                Vector3 targetPos;
                if (targetGo != null)
                {
                    targetPos = targetGo.transform.position;
                }
                else if (ProbeObjectAnchors.TryGetValue(pendingSubstanceTargetId, out Vector3 fallbackPos))
                {
                    targetPos = fallbackPos;
                }
                else
                {
                    ExecuteSubstanceActionNow();
                    return;
                }

                Vector3 toTarget = new Vector3(targetPos.x - transform.position.x, 0f, targetPos.z - transform.position.z);
                float stopDist = (pendingSubstanceTargetId == "probe:puddle" || pendingSubstanceTargetId == "probe:sand-pile") ? 1.15f : 0.95f;
                if (toTarget.magnitude > stopDist + 0.35f)
                {
                    Vector3 dir = toTarget.normalized;
                    Vector3 approachPos = new Vector3(targetPos.x - dir.x * stopDist, transform.position.y, targetPos.z - dir.z * stopDist);
                    walkingToSubstanceTarget = true;
                    waypointQueue.Clear();
                    EnqueueWaypoint(approachPos);
                    if (waypointQueue.Count > 0) return;
                }
            }

            ExecuteSubstanceActionNow();
        }

        private void ExecuteSubstanceActionNow()
        {
            string mode = pendingSubstanceMode;
            string targetId = pendingSubstanceTargetId;
            pendingSubstanceMode = "";
            pendingSubstanceTargetId = "";

            if (!string.IsNullOrEmpty(targetId))
            {
                GameObject targetGo = FindProbePropObject(targetId);
                Vector3 lookPos = targetGo != null
                    ? targetGo.transform.position
                    : (ProbeObjectAnchors.TryGetValue(targetId, out Vector3 p) ? p : transform.position + transform.forward);
                Vector3 dir = lookPos - transform.position;
                dir.y = 0f;
                if (dir.sqrMagnitude > 0.01f)
                {
                    transform.rotation = Quaternion.LookRotation(dir.normalized, Vector3.up);
                }
            }

            bobbleheadAnimator?.TriggerActionDip();
            var substances = WorldSubstanceController.Instance;

            if (mode == "scoop")
            {
                if (heldProp == null) return;
                if (targetId == "probe:sand-pile")
                {
                    heldProp.SetContents(PropContentType.Sand);
                }
                else if (targetId == "probe:puddle")
                {
                    heldProp.SetContents(PropContentType.Water);
                    substances?.ScoopWaterFromPothole(0.25f);
                }
                else
                {
                    GameObject sourceGo = FindProbePropObject(targetId);
                    var sourceProp = sourceGo != null ? sourceGo.GetComponent<InteractiveWorldProp>() : null;
                    if (sourceProp != null && sourceProp.CurrentContent != PropContentType.None)
                    {
                        heldProp.SetContents(sourceProp.CurrentContent);
                        sourceProp.SetContents(PropContentType.None);
                    }
                }
                return;
            }

            if (mode == "pour_or_apply" && heldProp != null)
            {
                string heldId = heldProp.ProbeObjectId;
                PropContentType content = heldProp.CurrentContent;

                if (content == PropContentType.Water)
                {
                    heldProp.SetContents(PropContentType.None);
                    if (targetId == "probe:puddle")
                    {
                        substances?.AddWaterToPothole(0.25f);
                    }
                    else if (!string.IsNullOrEmpty(targetId))
                    {
                        GameObject targetGo = FindProbePropObject(targetId);
                        var targetProp = targetGo != null ? targetGo.GetComponent<InteractiveWorldProp>() : null;
                        if (targetProp != null)
                        {
                            targetProp.SetContents(PropContentType.Water);
                        }
                        else
                        {
                            substances?.SpawnWaterSplash(transform.position + transform.forward * 0.75f);
                        }
                    }
                    else
                    {
                        substances?.SpawnWaterSplash(transform.position + transform.forward * 0.75f);
                    }
                }
                else if (content == PropContentType.Sand)
                {
                    heldProp.SetContents(PropContentType.None);
                    if (targetId == "probe:puddle")
                    {
                        substances?.AddSandToPothole(0.34f);
                    }
                    else if (targetId == "probe:bucket")
                    {
                        GameObject bucketGo = FindProbePropObject("probe:bucket");
                        bucketGo?.GetComponent<InteractiveWorldProp>()?.SetContents(PropContentType.Sand);
                    }
                    else
                    {
                        substances?.SpawnSandMound(transform.position + transform.forward * 0.85f);
                    }
                }
                else if (heldId == "probe:chalk")
                {
                    if (targetId == "probe:blank-wall")
                    {
                        substances?.AddChalkDrawing();
                    }
                    else if (!string.IsNullOrEmpty(targetId))
                    {
                        GameObject targetGo = FindProbePropObject(targetId);
                        Vector3 markPos = targetGo != null ? targetGo.transform.position : (transform.position + transform.forward * 0.7f);
                        substances?.SpawnChalkMarkOnSurface(markPos);
                    }
                    else
                    {
                        substances?.SpawnChalkMarkOnSurface(transform.position + transform.forward * 0.7f);
                    }
                }
                else if (heldId == "probe:trash-bag" && targetId == "probe:trash-bin")
                {
                    GameObject binGo = FindProbePropObject("probe:trash-bin");
                    GameObject bagGo = heldProp.gameObject;
                    heldProp = null;
                    substances?.DisposeTrashBagInBin(bagGo, binGo);
                }
            }
        }

        public void ShowThoughtBubble(string text, string header = "Camila piensa...")
        {
            if (string.IsNullOrWhiteSpace(text)) return;
            activeThoughtText = text.Trim();
            activeThoughtHeader = header;
            thoughtBubbleTimer = ThoughtBubbleDuration;
        }

        public void TriggerDialogue(string speaker, string text)
        {
            ShowThoughtBubble(text, "Camila dice:");
            OnDialogueTriggered?.Invoke(speaker, text);
        }

        private void OnGUI()
        {
            if (thoughtBubbleTimer <= 0f || string.IsNullOrEmpty(activeThoughtText)) return;
            if (UI.ProductHudController.Instance != null && UI.ProductHudController.Instance.IsModalActive) return;

            Camera cam = Camera.main != null ? Camera.main : FindFirstObjectByType<Camera>();
            if (cam == null) return;

            EnsureComicBubbleResources();

            // Fade smoothly in & out
            float fadeIn = Mathf.Clamp01((ThoughtBubbleDuration - thoughtBubbleTimer) / 0.25f);
            float fadeOut = Mathf.Clamp01(thoughtBubbleTimer / 0.85f);
            float alpha = Mathf.Min(fadeIn, fadeOut);
            if (alpha <= 0.01f) return;

            // Measure dynamic comic bubble size
            float maxBubbleWidth = 310f;
            float innerPadX = 18f;
            float innerPadTop = 12f;
            float innerPadBottom = 13f;

            GUIContent headerContent = new GUIContent(activeThoughtHeader);
            GUIContent bodyContent = new GUIContent(activeThoughtText);

            float textWidth = maxBubbleWidth - innerPadX * 2f;
            float bodyHeight = comicBodyStyle.CalcHeight(bodyContent, textWidth);
            float headerHeight = 18f;
            float bubbleWidth = maxBubbleWidth;
            float bubbleHeight = Mathf.Clamp(innerPadTop + headerHeight + 3f + bodyHeight + innerPadBottom, 56f, 175f);

            // Project world anchor directly above Camila's head
            Vector3 headWorld = transform.position + Vector3.up * 2.55f;
            Vector3 screenPos = cam.WorldToScreenPoint(headWorld);
            float camDist = Vector3.Distance(cam.transform.position, transform.position);
            bool onScreenNear = screenPos.z > 0.3f
                && camDist <= 46f
                && screenPos.x >= -40f && screenPos.x <= Screen.width + 40f
                && screenPos.y >= 20f && screenPos.y <= Screen.height + 40f;

            Color prevColor = GUI.color;
            GUI.color = new Color(1f, 1f, 1f, alpha);

            if (onScreenNear)
            {
                float headGuiX = screenPos.x;
                float headGuiY = Screen.height - screenPos.y;

                // Position comic cloud above Camila's head with room for 3 trailing thought circles
                float trailGap = 32f;
                float bx = Mathf.Clamp(headGuiX - bubbleWidth * 0.5f, 16f, Screen.width - bubbleWidth - 16f);
                float by = Mathf.Clamp(headGuiY - bubbleHeight - trailGap, 56f, Screen.height - bubbleHeight - 70f);

                // Soft offset comic shadow
                GUI.color = new Color(0.06f, 0.08f, 0.14f, 0.28f * alpha);
                GUI.Box(new Rect(bx + 4f, by + 5f, bubbleWidth, bubbleHeight), GUIContent.none, comicBubbleStyle);

                // Crisp comic thought bubble cloud
                GUI.color = new Color(1f, 1f, 1f, alpha);
                GUI.Box(new Rect(bx, by, bubbleWidth, bubbleHeight), GUIContent.none, comicBubbleStyle);

                // 3 descending comic thought circles curving toward Camila's head
                float anchorX = Mathf.Clamp(headGuiX, bx + 28f, bx + bubbleWidth - 28f);
                float startY = by + bubbleHeight - 3f;
                float d1 = 15f;
                float d2 = 10.5f;
                float d3 = 7f;
                GUI.DrawTexture(new Rect(anchorX - d1 * 0.5f - 2f, startY + 2f, d1, d1), comicDotTexture);
                GUI.DrawTexture(new Rect(anchorX - d2 * 0.5f + 2f, startY + 17f, d2, d2), comicDotTexture);
                GUI.DrawTexture(new Rect(anchorX - d3 * 0.5f + 4f, startY + 28f, d3, d3), comicDotTexture);

                // Comic header & body text
                GUI.Label(new Rect(bx + innerPadX, by + innerPadTop, textWidth, headerHeight), headerContent, comicHeaderStyle);
                GUI.Label(new Rect(bx + innerPadX, by + innerPadTop + headerHeight + 2f, textWidth, bubbleHeight - innerPadTop - headerHeight - innerPadBottom), bodyContent, comicBodyStyle);
            }
            else
            {
                // Off-screen / distant fallback: compact comic thought card at bottom-center above prompt
                float cardW = Mathf.Min(420f, Screen.width - 40f);
                float cardTextW = cardW - innerPadX * 2f;
                float cardBodyH = comicBodyStyle.CalcHeight(bodyContent, cardTextW);
                float cardH = Mathf.Clamp(innerPadTop + headerHeight + 3f + cardBodyH + innerPadBottom, 58f, 145f);
                float cx = (Screen.width - cardW) * 0.5f;
                float cy = Screen.height - cardH - 102f;

                GUI.color = new Color(0.06f, 0.08f, 0.14f, 0.28f * alpha);
                GUI.Box(new Rect(cx + 4f, cy + 5f, cardW, cardH), GUIContent.none, comicBubbleStyle);

                GUI.color = new Color(1f, 1f, 1f, alpha);
                GUI.Box(new Rect(cx, cy, cardW, cardH), GUIContent.none, comicBubbleStyle);
                GUI.Label(new Rect(cx + innerPadX, cy + innerPadTop, cardTextW, headerHeight), headerContent, comicHeaderStyle);
                GUI.Label(new Rect(cx + innerPadX, cy + innerPadTop + headerHeight + 2f, cardTextW, cardH - innerPadTop - headerHeight - innerPadBottom), bodyContent, comicBodyStyle);
            }

            GUI.color = prevColor;
        }

        private void EnsureComicBubbleResources()
        {
            if (comicBubbleTexture == null)
            {
                comicBubbleTexture = CreateRoundedComicBubbleTexture(96, 96, 28, 3.2f);
            }
            if (comicDotTexture == null)
            {
                comicDotTexture = CreateComicDotTexture(48, 3.2f);
            }
            if (comicBubbleStyle == null)
            {
                comicBubbleStyle = new GUIStyle
                {
                    normal = { background = comicBubbleTexture },
                    border = new RectOffset(32, 32, 32, 32),
                    padding = new RectOffset(0, 0, 0, 0)
                };
            }
            if (comicHeaderStyle == null)
            {
                comicHeaderStyle = new GUIStyle(GUI.skin.label)
                {
                    fontSize = 11,
                    fontStyle = FontStyle.Bold,
                    alignment = TextAnchor.UpperLeft,
                    wordWrap = false,
                    normal = { textColor = new Color(0.07f, 0.44f, 0.42f, 1f) }
                };
            }
            if (comicBodyStyle == null)
            {
                comicBodyStyle = new GUIStyle(GUI.skin.label)
                {
                    fontSize = 13,
                    fontStyle = FontStyle.Italic,
                    alignment = TextAnchor.UpperLeft,
                    wordWrap = true,
                    normal = { textColor = new Color(0.11f, 0.13f, 0.18f, 1f) }
                };
            }
        }

        private static Texture2D CreateRoundedComicBubbleTexture(int width, int height, float radius, float borderWidth)
        {
            var tex = new Texture2D(width, height, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;

            Color fillCol = new Color(1.0f, 0.992f, 0.965f, 0.97f);   // Warm comic paper white
            Color inkCol = new Color(0.11f, 0.13f, 0.18f, 1.0f);       // Bold comic ink outline
            Color clearCol = new Color(0f, 0f, 0f, 0f);

            float halfW = width * 0.5f;
            float halfH = height * 0.5f;
            float innerHalfW = halfW - radius - 1f;
            float innerHalfH = halfH - radius - 1f;

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    float px = Mathf.Abs((x + 0.5f) - halfW) - innerHalfW;
                    float py = Mathf.Abs((y + 0.5f) - halfH) - innerHalfH;
                    float dx = Mathf.Max(px, 0f);
                    float dy = Mathf.Max(py, 0f);
                    float dist = Mathf.Sqrt(dx * dx + dy * dy) + Mathf.Min(Mathf.Max(px, py), 0f) - radius;

                    if (dist > 0.75f)
                    {
                        tex.SetPixel(x, y, clearCol);
                    }
                    else if (dist > -0.75f)
                    {
                        float a = Mathf.Clamp01(0.5f - dist / 1.5f);
                        tex.SetPixel(x, y, new Color(inkCol.r, inkCol.g, inkCol.b, a));
                    }
                    else if (dist > -(borderWidth + 0.75f))
                    {
                        float t = Mathf.Clamp01((dist + borderWidth + 0.75f) / 1.5f);
                        tex.SetPixel(x, y, Color.Lerp(fillCol, inkCol, t));
                    }
                    else
                    {
                        tex.SetPixel(x, y, fillCol);
                    }
                }
            }
            tex.Apply();
            return tex;
        }

        private static Texture2D CreateComicDotTexture(int size, float borderWidth)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;

            Color fillCol = new Color(1.0f, 0.992f, 0.965f, 0.98f);
            Color inkCol = new Color(0.11f, 0.13f, 0.18f, 1.0f);
            Color clearCol = new Color(0f, 0f, 0f, 0f);

            float center = size * 0.5f;
            float radius = center - 1.5f;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) - center;
                    float dy = (y + 0.5f) - center;
                    float dist = Mathf.Sqrt(dx * dx + dy * dy) - radius;

                    if (dist > 0.75f)
                    {
                        tex.SetPixel(x, y, clearCol);
                    }
                    else if (dist > -0.75f)
                    {
                        float a = Mathf.Clamp01(0.5f - dist / 1.5f);
                        tex.SetPixel(x, y, new Color(inkCol.r, inkCol.g, inkCol.b, a));
                    }
                    else if (dist > -(borderWidth + 0.75f))
                    {
                        float t = Mathf.Clamp01((dist + borderWidth + 0.75f) / 1.5f);
                        tex.SetPixel(x, y, Color.Lerp(fillCol, inkCol, t));
                    }
                    else
                    {
                        tex.SetPixel(x, y, fillCol);
                    }
                }
            }
            tex.Apply();
            return tex;
        }

        public bool IsWalking => waypointQueue.Count > 0 || activeDoorOpening != null || !string.IsNullOrEmpty(currentDestinationPlaceId);
        public string CurrentDestinationPlaceId => currentDestinationPlaceId;
    }
}
