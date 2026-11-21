using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Character;

namespace MyVirtualCommunity.Npc
{
    /// <summary>
    /// CamilaNpcController manages the 3D presentation and NavMesh navigation
    /// for Camila (agent:camila-npc), the autonomous explorer NPC (Milestone 94).
    ///
    /// Differences from ElenaNpcController, by design:
    /// - NO counter anchor and NO LateUpdate position clamping: Camila is free
    ///   to wander the whole slice. Her position is driven by authoritative
    ///   World Core move_to_place cycles, never by a fixed station.
    /// - Her NavMeshAgent stays ENABLED (speed 2.5, radius 0.5).
    /// - She polls World Core for her own AI cycles and walks to the
    ///   destination place the cycle proposes.
    ///
    /// INVARIANT (same as Elena): Unity is presentation-only. World Core
    /// remains authoritative; Unity never chooses destinations on its own —
    /// MoveToPlace() is only called from an authoritative AI cycle result.
    /// The place -> Unity position table below mirrors the canonical anchors
    /// in src/core/camila-world-state.ts (CAMILA_UNITY_ANCHORS); if the
    /// scene layout moves, update both.
    /// </summary>
    public class CamilaNpcController : MonoBehaviour
    {
        public const string CamilaAgentId = "agent:camila-npc";

        [Header("Explorer Start")]
        [SerializeField] private Vector3 startPosition = new Vector3(-8f, 0.44f, 8f);

        [Header("Presentation Parameters")]
        [SerializeField] private float lookAtSpeed = 4.0f;
        [SerializeField] private float detectionRadius = 6.0f;
        [SerializeField] private float aiCycleIntervalSeconds = 8.0f;

        [Header("Visual Feedback References")]
        [SerializeField] private Renderer characterRenderer;
        [SerializeField] private Color explorerJacketColor = new Color(0.10f, 0.45f, 0.42f);

        private NavMeshAgent navAgent;
        private Transform billboardTransform;
        private BobbleheadAnimator bobbleheadAnimator;
        private float cycleTimer;
        private bool cycleInFlight;
        private string currentDestinationPlaceId = "";

        public event Action<string, string> OnDialogueTriggered; // (Speaker, Text)

        /// <summary>Place id -> Unity scene position (mirror of CAMILA_UNITY_ANCHORS).</summary>
        public static readonly Dictionary<string, Vector3> PlaceAnchors =
            new Dictionary<string, Vector3>
            {
                { "street:blvd-gomez-morin", new Vector3(55f, 0.24f, 2.4f) },
                { "street:calle-del-porvenir", new Vector3(13.5f, 0.24f, 22.5f) },
                { "street:av-la-arboleda", new Vector3(101f, 0.24f, 22.5f) },
                { "building:tia-lupe-building", new Vector3(-22f, 0.24f, 8f) },
                { "building:wing-spot-building", new Vector3(-8f, 0.24f, 8f) },
                { "restaurant:wing-spot", new Vector3(-8f, 0.24f, 8f) },
                { "restaurant:pasteleria-tia-lupe", new Vector3(-22f, 0.24f, 8f) },
                { "building:del-porvenir-residence", new Vector3(10f, 0.24f, 32f) },
                { "building:dollar-2-go-building", new Vector3(45f, 0.24f, 15f) },
                { "building:acabados-hbc-building", new Vector3(85f, 0.24f, 10f) },
                { "building:catzoo-building", new Vector3(90f, 0.24f, 25f) },
                { "building:corporativo-arboleda-building", new Vector3(115f, 0.24f, 20f) },
            };

        /// <summary>Probe object id -> Unity scene position (mirror of CAMILA_PROBE_OBJECTS).</summary>
        public static readonly Dictionary<string, Vector3> ProbeObjectAnchors =
            new Dictionary<string, Vector3>
            {
                { "probe:ball", new Vector3(45f, 0.5f, 14f) },
                { "probe:small-goal", new Vector3(45f, 0.5f, 32f) },
                { "probe:cone-west", new Vector3(42f, 0.5f, 28f) },
                { "probe:cone-east", new Vector3(48f, 0.5f, 28f) },
                { "probe:trash-bag", new Vector3(-4f, 0.4f, 3.5f) },
                { "probe:trash-bin", new Vector3(103f, 0.6f, 30f) },
                { "probe:broom", new Vector3(-18f, 0.4f, 6f) },
                { "probe:puddle", new Vector3(13.5f, 0.25f, 25f) },
                { "probe:bucket", new Vector3(9f, 0.4f, 32f) },
                { "probe:watering-can", new Vector3(10f, 0.4f, 32.5f) },
                { "probe:umbrella", new Vector3(60f, 0.9f, 2.4f) },
                { "probe:bench", new Vector3(60f, 0.5f, 2.4f) },
                { "probe:book", new Vector3(60f, 0.85f, 2.4f) },
                { "probe:cup", new Vector3(60.6f, 0.85f, 2.4f) },
                { "probe:chalk", new Vector3(-8f, 0.3f, 2.4f) },
                { "probe:blank-wall", new Vector3(-2.5f, 1.2f, 8f) },
            };

        private void Awake()
        {
            transform.position = startPosition;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f);

            navAgent = GetComponent<NavMeshAgent>();
            if (navAgent == null)
            {
                navAgent = gameObject.AddComponent<NavMeshAgent>();
            }
            navAgent.speed = 2.5f;
            navAgent.radius = 0.5f;
            navAgent.acceleration = 8f;
            navAgent.angularSpeed = 120f;
            navAgent.stoppingDistance = 0.2f;

            BuildExplorerAvatar();
        }

        private void Start()
        {
            transform.position = startPosition;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f);

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
            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                return;
            }

            // Arrived at the destination the last cycle proposed?
            if (!string.IsNullOrEmpty(currentDestinationPlaceId) && navAgent != null
                && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh
                && !navAgent.pathPending && navAgent.remainingDistance <= navAgent.stoppingDistance + 0.05f)
            {
                currentDestinationPlaceId = "";
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
            // Billboard overhead nameplate continuously faces main camera.
            // NOTE: unlike Elena, there is NO position anchoring here — Camila
            // must be free to wander.
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
        /// Walks to a place, but ONLY when called from an authoritative AI
        /// cycle result. Never called from local input or timers.
        /// </summary>
        public bool MoveToPlace(string placeId)
        {
            if (string.IsNullOrEmpty(placeId) || !PlaceAnchors.TryGetValue(placeId, out Vector3 target))
            {
                Debug.LogWarning($"[CamilaNpcController] Unknown destination place \"{placeId}\" — ignoring.");
                return false;
            }

            currentDestinationPlaceId = placeId;
            if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh)
            {
                navAgent.SetDestination(target);
            }
            else
            {
                // No NavMesh in this slice yet: snap presentation to the anchor
                // (World Core still owns the logical location).
                transform.position = target;
                currentDestinationPlaceId = "";
            }
            return true;
        }

        /// <summary>Turns to look at a probe object (look_at proposals).</summary>
        public bool LookAtObject(string objectId)
        {
            if (string.IsNullOrEmpty(objectId) || !ProbeObjectAnchors.TryGetValue(objectId, out Vector3 target))
            {
                return false;
            }

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

        public string CurrentDestinationPlaceId => currentDestinationPlaceId;
    }
}
