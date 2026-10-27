using System;
using UnityEngine;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.UI;
using MyVirtualCommunity.Character;
using MyVirtualCommunity.Environment;

namespace MyVirtualCommunity.Player
{
    /// <summary>
    /// PlayerController handles third-person movement presentation and contextual interaction triggers.
    /// 
    /// INVARIANT (Section 24):
    /// Unity may interpolate/render movement locally, but authoritative state transitions
    /// (entering buildings, requesting service) are validated and committed solely by World Core.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float walkSpeed = 3.5f;
        [SerializeField] private float runSpeed = 6.0f;
        [SerializeField] private float rotationSmoothTime = 0.1f;
        [SerializeField] private float gravity = -9.81f;

        [Header("Interaction Proximity")]
        [SerializeField] private float doorInteractionRadius = 2.0f;
        [SerializeField] private float counterInteractionRadius = 2.2f;

        [Header("Spawn Configuration (Milestone 98)")]
        [SerializeField] private PlayerSpawnConfig spawnConfig = new PlayerSpawnConfig();

        [Header("Threshold References (World Coordinates)")]
        [SerializeField] private Vector3 entranceExteriorPosition = new Vector3(-6.75f, 0.24f, 5.30f);
        [SerializeField] private Vector3 entranceInteriorPosition = new Vector3(-6.75f, 0.24f, 6.25f);
        [SerializeField] private Vector3 doorPosition = new Vector3(-6.75f, 0.24f, 5.80f);
        [SerializeField] private Vector3 serviceCounterPosition = new Vector3(-10.90f, 0.24f, 10.45f);

        private CharacterController characterController;
        private Transform cameraTransform;
        private BobbleheadAnimator bobbleheadAnimator;
        private float rotationVelocity;
        private float verticalVelocity;
        private bool isInsideWingSpot = false;

        public event Action<string> OnPromptAvailable;
        public event Action OnPromptCleared;

        private void Awake()
        {
            characterController = GetComponent<CharacterController>();
            if (characterController != null)
            {
                characterController.height = 1.75f;
                characterController.center = new Vector3(0f, 0.875f, 0f);
                characterController.radius = 0.38f;
                characterController.skinWidth = 0.015f;
                characterController.stepOffset = 0.35f;
                characterController.minMoveDistance = 0.001f;
            }

            // Hide old primitive capsule mesh on root if present
            var rootRend = GetComponent<MeshRenderer>();
            if (rootRend != null) rootRend.enabled = false;

            BuildPlayerAvatar();
            SyncWorldThresholds();
        }

        public bool IsInputLocked { get; set; } = false;

        public void SyncWorldThresholds()
        {
            var doorObj = GameObject.Find("Door_Frame_Header") ?? GameObject.Find("Door_Frame_Outer");
            if (doorObj != null)
            {
                float dx = doorObj.transform.position.x;
                float dz = doorObj.transform.position.z;
                doorPosition = new Vector3(dx, 0.24f, dz);
                entranceExteriorPosition = new Vector3(dx, 0.24f, dz - 0.50f);
                entranceInteriorPosition = new Vector3(dx, 0.24f, dz + 0.45f);
            }
            else
            {
                doorPosition = new Vector3(-6.75f, 0.24f, 5.80f);
                entranceExteriorPosition = new Vector3(-6.75f, 0.24f, 5.30f);
                entranceInteriorPosition = new Vector3(-6.75f, 0.24f, 6.25f);
            }

            var posObj = GameObject.Find("POS Terminal 1");
            if (posObj != null)
            {
                serviceCounterPosition = new Vector3(posObj.transform.position.x, 0.24f, posObj.transform.position.z - 0.75f);
            }
            else
            {
                var counterObj = GameObject.Find("Counter_Main_Base");
                if (counterObj != null)
                {
                    float cx = counterObj.transform.position.x;
                    float cz = counterObj.transform.position.z;
                    serviceCounterPosition = new Vector3(cx - 2.50f, 0.24f, cz - 0.80f);
                }
                else
                {
                    serviceCounterPosition = new Vector3(-10.90f, 0.24f, 11.20f);
                }
            }
        }

        public void BuildPlayerAvatar()
        {
            gameObject.layer = 2; // Layer 2 = Ignore Raycast (so camera never clips player)

            if (characterController == null) characterController = GetComponent<CharacterController>();
            if (characterController != null)
            {
                characterController.height = 1.75f;
                characterController.center = new Vector3(0f, 0.875f, 0f);
                characterController.radius = 0.38f;
                characterController.skinWidth = 0.015f;
                characterController.minMoveDistance = 0.001f;
            }

            // Hide/disable legacy capsule mesh renderer & clear filter
            var rootRend = GetComponent<MeshRenderer>();
            if (rootRend != null) rootRend.enabled = false;
            var rootFilter = GetComponent<MeshFilter>();
            if (rootFilter != null) rootFilter.sharedMesh = null;

            // Remove legacy visor if present
            var oldVisor = transform.Find("Player_Visor");
            if (oldVisor != null)
            {
                if (Application.isPlaying) Destroy(oldVisor.gameObject);
                else DestroyImmediate(oldVisor.gameObject);
            }

            // Construct stylized Bobblehead Character avatar using saved profile (or default fallback)
            var bobblehead = GetComponent<BobbleheadCharacter>();
            if (bobblehead == null) bobblehead = gameObject.AddComponent<BobbleheadCharacter>();
            BobbleheadConfig effectiveConfig = BobbleheadProfileManager.GetEffectivePlayerConfig();
            bobblehead.Initialize(effectiveConfig);

            bobbleheadAnimator = GetComponent<BobbleheadAnimator>();
            if (bobbleheadAnimator == null) bobbleheadAnimator = gameObject.AddComponent<BobbleheadAnimator>();
            bobbleheadAnimator.SetAttendantMode(false);
            bobbleheadAnimator.CacheInitialPoses();
        }

        /// <summary>
        /// Phase B: Returns the current BobbleheadConfig active on the player avatar.
        /// </summary>
        public BobbleheadConfig CurrentBobbleheadConfig
        {
            get
            {
                var bobblehead = GetComponent<BobbleheadCharacter>();
                return bobblehead != null ? bobblehead.CurrentConfig : BobbleheadProfileManager.GetEffectivePlayerConfig();
            }
        }

        /// <summary>
        /// Phase B & C: Applies a cosmetic customization config to the player's 3D avatar.
        /// If appearance geometry changed (hairStyle, faceShape, facialHair, bodyPresentation),
        /// rebuilds visual components cleanly and refreshes animator base poses.
        /// If only colors changed, performs in-place recoloring.
        /// </summary>
        public void ApplyCustomizationConfig(BobbleheadConfig newConfig)
        {
            var bobblehead = GetComponent<BobbleheadCharacter>();
            if (bobblehead == null || newConfig == null) return;

            var current = bobblehead.CurrentConfig;
            bool geometryChanged = current == null ||
                                   current.hairStyle != newConfig.hairStyle ||
                                   current.headwear != newConfig.headwear ||
                                   current.faceShape != newConfig.faceShape ||
                                   current.facialHair != newConfig.facialHair ||
                                   current.bodyPresentation != newConfig.bodyPresentation ||
                                   current.outfitType != newConfig.outfitType ||
                                   Mathf.Abs(current.headScale - newConfig.headScale) > 0.001f ||
                                   Mathf.Abs(current.totalHeight - newConfig.totalHeight) > 0.001f;

            if (geometryChanged)
            {
                bobblehead.RebuildWithConfig(newConfig);
                if (bobbleheadAnimator == null) bobbleheadAnimator = GetComponent<BobbleheadAnimator>();
                bobbleheadAnimator?.CacheInitialPoses();
            }
            else
            {
                bobblehead.ApplyColors(newConfig);
            }
        }

        private void Start()
        {
            SyncWorldThresholds();

            // Ground the player securely on initial spawn (accounting for CharacterController contact skin)
            if (Physics.Raycast(transform.position + Vector3.up * 1.5f, Vector3.down, out RaycastHit spawnHit, 5.0f, ~(1 << 2)))
            {
                float skinOffset = characterController != null ? characterController.skinWidth : 0f;
                transform.position = new Vector3(transform.position.x, spawnHit.point.y + skinOffset, transform.position.z);
            }

            if (Camera.main != null)
            {
                cameraTransform = Camera.main.transform;
            }

            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated += HandleWorldStateHydrated;
            }
        }

        private void OnDestroy()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated -= HandleWorldStateHydrated;
            }
        }

        private void Update()
        {
            if (transform.position.y < -5f)
            {
                TeleportTo(isInsideWingSpot ? entranceInteriorPosition : entranceExteriorPosition, isInsideWingSpot ? Quaternion.identity : Quaternion.Euler(0f, 180f, 0f));
            }

            // If any modal (menu, pause, or avatar customization) is open, or input is locked, pause movement and world interaction
            bool isTeleporting = QuickTravelController.Instance != null && QuickTravelController.Instance.IsTeleporting;
            bool isUiModalActive = ProductHudController.Instance != null && ProductHudController.Instance.IsModalActive;
            if (IsInputLocked || isTeleporting || isUiModalActive)
            {
                bobbleheadAnimator?.UpdateLocomotionState(0f, true);
                return;
            }

            HandleMovement();
            CheckContinuousThresholdCrossing();
            CheckInteractionProximity();
            HandleInteractionInput();
        }

        private void HandleMovement()
        {
            if (cameraTransform == null && Camera.main != null)
            {
                cameraTransform = Camera.main.transform;
            }

            float horizontal = Input.GetAxisRaw("Horizontal");
            float vertical = Input.GetAxisRaw("Vertical");
            Vector3 direction = new Vector3(horizontal, 0f, vertical).normalized;

            bool isRunning = Input.GetKey(KeyCode.LeftShift);
            float currentSpeed = isRunning ? runSpeed : walkSpeed;
            Vector3 moveMotion = Vector3.zero;

            if (direction.magnitude >= 0.1f)
            {
                float targetAngle = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
                if (cameraTransform != null)
                {
                    targetAngle += cameraTransform.eulerAngles.y;
                }

                float angle = Mathf.SmoothDampAngle(transform.eulerAngles.y, targetAngle, ref rotationVelocity, rotationSmoothTime);
                transform.rotation = Quaternion.Euler(0f, angle, 0f);

                Vector3 moveDir = Quaternion.Euler(0f, targetAngle, 0f) * Vector3.forward;
                moveMotion = moveDir.normalized * currentSpeed;
            }

            // Maintain firm ground stick force when grounded; apply gravity when airborne
            if (characterController.isGrounded)
            {
                verticalVelocity = -3.0f;
            }
            else
            {
                verticalVelocity += gravity * Time.deltaTime;
            }

            // Combined single Move call eliminates physics jitter and maintains continuous isGrounded contact
            Vector3 finalVelocity = moveMotion + Vector3.up * verticalVelocity;
            characterController.Move(finalVelocity * Time.deltaTime);

            bobbleheadAnimator?.UpdateLocomotionState(direction.magnitude >= 0.1f ? currentSpeed : 0f, characterController.isGrounded);
        }

        private float lastAdmissionFeedbackTime = 0f;

        public void ShowAdmissionFeedback(string message)
        {
            if (string.IsNullOrEmpty(message)) return;
            if (Time.time - lastAdmissionFeedbackTime < 2.0f) return;
            lastAdmissionFeedbackTime = Time.time;

            if (ProductHudController.Instance != null)
            {
                ProductHudController.Instance.ShowToast(message);
            }
            else
            {
                OnPromptAvailable?.Invoke(message);
            }
            Debug.LogWarning($"[PlayerController] Admission feedback: {message}");
        }

        private void CheckContinuousThresholdCrossing()
        {
            if (Mathf.Abs(doorPosition.x) < 1.0f) return;

            float px = transform.position.x;
            float pz = transform.position.z;

            // Doorway corridor in X: doorPosition.x +/- 0.55m (-7.30m to -6.20m)
            if (px >= doorPosition.x - 0.55f && px <= doorPosition.x + 0.55f)
            {
                // Walking across doorway from outside into the restaurant
                if (!isInsideWingSpot && pz >= doorPosition.z + 0.15f && pz <= doorPosition.z + 1.20f)
                {
                    // Check authoritative business schedule admission against simulation clock
                    if (!BusinessScheduleRegistry.CanAdmitCustomer("restaurant:wing-spot", BusinessScheduleRegistry.GetAuthoritativeTimeUtc(), out string reason))
                    {
                        // Deny entry: safely retain player on porch exterior without committing interior state
                        Vector3 pushBack = transform.position;
                        pushBack.z = doorPosition.z - 0.20f;
                        TeleportTo(pushBack, transform.rotation);
                        ShowAdmissionFeedback(reason);
                        return;
                    }

                    EnterRestaurant(false); // Seamless walk-in: no teleport snap
                    currentTargetDoor?.ScheduleAutoClose();
                }
                // Walking across doorway from inside to outside (exits are always permitted)
                else if (isInsideWingSpot && pz <= doorPosition.z - 0.15f && pz >= doorPosition.z - 1.50f)
                {
                    ExitRestaurant(false); // Seamless walk-out: no teleport snap
                    currentTargetDoor?.ScheduleAutoClose();
                }
            }
        }

        private InteractiveDoor currentTargetDoor = null;

        private InteractiveDoor FindBestInteractiveDoor()
        {
            InteractiveDoor bestDoor = null;
            float bestScore = float.MaxValue;

            Vector3 playerPos = transform.position;
            Vector3 playerForward = transform.forward;

            for (int i = 0; i < InteractiveDoor.ActiveDoors.Count; i++)
            {
                var door = InteractiveDoor.ActiveDoors[i];
                if (door == null || !door.isActiveAndEnabled) continue;

                Vector3 doorPos = door.InteractionAnchor != null ? door.InteractionAnchor.position : door.HingePivot.position;
                Vector3 diff = doorPos - playerPos;
                diff.y *= 0.5f;
                float dist = diff.magnitude;

                if (dist <= door.InteractionRange)
                {
                    Vector3 toDoorFlat = new Vector3(doorPos.x - playerPos.x, 0f, doorPos.z - playerPos.z).normalized;
                    float facingDot = Vector3.Dot(playerForward, toDoorFlat);
                    // Composite distance score favoring the door the player is facing
                    float score = dist - (facingDot * 0.45f);
                    if (score < bestScore)
                    {
                        bestScore = score;
                        bestDoor = door;
                    }
                }
            }
            return bestDoor;
        }

        private void CheckInteractionProximity()
        {
            if (Mathf.Abs(doorPosition.x) < 1.0f)
            {
                SyncWorldThresholds();
            }

            currentTargetDoor = FindBestInteractiveDoor();

            float distToCounter = Vector3.Distance(transform.position, serviceCounterPosition);

            if (isInsideWingSpot && distToCounter <= counterInteractionRadius)
            {
                OnPromptAvailable?.Invoke("[E] Solicitar Servicio (Hablar con Elena)  |  [M] Ver Menú");
            }
            else if (currentTargetDoor != null)
            {
                OnPromptAvailable?.Invoke(currentTargetDoor.GetInteractionPrompt());
            }
            else
            {
                OnPromptCleared?.Invoke();
            }
        }

        private void HandleInteractionInput()
        {
            // Direct [M] key shortcut toggles the official restaurant menu modal
            if (Input.GetKeyDown(KeyCode.M))
            {
                if (ProductHudController.Instance != null && !ProductHudController.Instance.IsPauseMenuOpen && !ProductHudController.Instance.IsExitConfirmOpen)
                {
                    ProductHudController.Instance.ToggleMenuModal();
                }
            }

            // [C] key is strictly isolated for Avatar Customization modal and never mutates door state

            if (Input.GetKeyDown(KeyCode.E))
            {
                float distToCounter = Vector3.Distance(transform.position, serviceCounterPosition);

                if (isInsideWingSpot && distToCounter <= counterInteractionRadius)
                {
                    var attendant = WorldCoreClient.Instance?.CurrentLocationView?.location?.attendant;
                    bool isServiceActive = attendant != null && attendant.interactionState == "service-accepted";

                    if (isServiceActive)
                    {
                        InquireService();
                    }
                    else
                    {
                        RequestService();
                    }
                }
                else if (currentTargetDoor != null)
                {
                    if (!currentTargetDoor.CanInteract(gameObject, out string rejectionReason))
                    {
                        ShowAdmissionFeedback(rejectionReason);
                    }
                    else
                    {
                        currentTargetDoor.Interact(gameObject);
                    }
                }
            }
        }

        public void EnterRestaurant(bool snapToThreshold = true)
        {
            if (ProductHudController.Instance != null) ProductHudController.Instance.CloseMenuModal();

            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                // Standalone presentation mode: allow entry and interior exploration
                isInsideWingSpot = true;
                if (snapToThreshold)
                {
                    TeleportTo(entranceInteriorPosition, Quaternion.identity);
                }
                Debug.Log("[PlayerController] Entered Wing Spot (Offline/Local Presentation Mode)");
                return;
            }

            string payload = "{\"restaurantId\":\"restaurant:wing-spot\"}";
            StartCoroutine(WorldCoreClient.Instance.SendCommand("enterRestaurant", payload, (res) =>
            {
                if (res != null && res.success)
                {
                    isInsideWingSpot = true;
                    if (snapToThreshold)
                    {
                        TeleportTo(entranceInteriorPosition, Quaternion.identity);
                    }
                    Debug.Log("[PlayerController] Authoritatively entered Wing Spot");

                    // Trigger Elena's AI cycle upon player entry
                    StartCoroutine(WorldCoreClient.Instance.TriggerNpcAiCycle("agent:elena-npc", null));
                }
                else if (res != null && (res.code == "network-error" || res.code == "domain-error"))
                {
                    isInsideWingSpot = true;
                    if (snapToThreshold)
                    {
                        TeleportTo(entranceInteriorPosition, Quaternion.identity);
                    }
                    Debug.Log($"[PlayerController] Entered Wing Spot via fallback ({res.code})");
                }
                else
                {
                    Debug.LogWarning($"[PlayerController] Enter rejected: {res?.message}");
                }
            }));
        }

        public void ExitRestaurant(bool snapToThreshold = true)
        {
            if (ProductHudController.Instance != null) ProductHudController.Instance.CloseMenuModal();

            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                isInsideWingSpot = false;
                if (snapToThreshold)
                {
                    TeleportTo(entranceExteriorPosition, Quaternion.Euler(0f, 180f, 0f));
                }
                Debug.Log("[PlayerController] Exited Wing Spot (Offline/Local Presentation Mode)");
                return;
            }

            string payload = "{\"restaurantId\":\"restaurant:wing-spot\"}";
            StartCoroutine(WorldCoreClient.Instance.SendCommand("exitRestaurant", payload, (res) =>
            {
                if (res != null && res.success)
                {
                    isInsideWingSpot = false;
                    if (snapToThreshold)
                    {
                        TeleportTo(entranceExteriorPosition, Quaternion.Euler(0f, 180f, 0f));
                    }
                    Debug.Log("[PlayerController] Authoritatively exited Wing Spot to Blvd. Gómez Morín");
                }
                else if (res != null && (res.code == "network-error" || res.code == "domain-error"))
                {
                    isInsideWingSpot = false;
                    if (snapToThreshold)
                    {
                        TeleportTo(entranceExteriorPosition, Quaternion.Euler(0f, 180f, 0f));
                    }
                    Debug.Log($"[PlayerController] Exited Wing Spot via fallback ({res.code})");
                }
                else
                {
                    Debug.LogWarning($"[PlayerController] Exit rejected: {res?.message}");
                }
            }));
        }

        public void TeleportTo(Vector3 targetPos, Quaternion targetRot)
        {
            if (characterController != null) characterController.enabled = false;
            float skinOffset = characterController != null ? characterController.skinWidth : 0f;
            transform.position = new Vector3(targetPos.x, targetPos.y + skinOffset, targetPos.z);
            transform.rotation = targetRot;
            verticalVelocity = 0f;
            if (characterController != null) characterController.enabled = true;

            var cam = FindFirstObjectByType<ThirdPersonCamera>();
            if (cam != null)
            {
                cam.ResetCameraView(targetRot.eulerAngles.y, 10f);
            }
        }

        public void RequestService()
        {
            var elena = FindFirstObjectByType<Npc.ElenaNpcController>();
            if (elena != null)
            {
                elena.TriggerGreeting();
            }

            if (ProductHudController.Instance != null)
            {
                ProductHudController.Instance.OpenMenuModal();
            }

            if (WorldCoreClient.Instance == null || !WorldCoreClient.Instance.IsConnected)
            {
                Debug.Log("[PlayerController] Service requested locally in offline/presentation mode.");
                return;
            }

            string payload = "{\"restaurantId\":\"restaurant:wing-spot\"}";
            StartCoroutine(WorldCoreClient.Instance.SendCommand("requestRestaurantService", payload, (res) =>
            {
                if (res != null && res.success)
                {
                    Debug.Log("[PlayerController] Service request authoritatively accepted by Elena Morales");
                    InquireService();
                }
                else if (res != null && res.code == "service-already-active")
                {
                    Debug.Log("[PlayerController] Service session is already active with Elena Morales; inquiring menu...");
                    InquireService();
                }
                else
                {
                    Debug.LogWarning($"[PlayerController] Service request server note ({res?.code}: {res?.message}); presentation mode active");
                }
            }));
        }

        public void InquireService()
        {
            var elena = FindFirstObjectByType<Npc.ElenaNpcController>();
            if (elena != null)
            {
                elena.TriggerDialogue("Elena Morales", "¡Aquí tienes nuestro menú de Wing Spot! Contamos con Boneless Wings ($12.00), Traditional Wings ($14.00) y Papas Sazonadas ($4.50). Puedes presionar [M] o [Esc] para cerrar el menú.");
            }

            if (ProductHudController.Instance != null)
            {
                ProductHudController.Instance.OpenMenuModal();
            }

            if (WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                string payload = "{\"staffNpcId\":\"agent:elena-npc\"}";
                StartCoroutine(WorldCoreClient.Instance.SendCommand("inquireRestaurantService", payload, (res) =>
                {
                    Debug.Log($"[PlayerController] Inquire service server status: {res?.code}");
                }));
            }
        }

        private bool hasInitializedPosition = false;

        private void HandleWorldStateHydrated(LocationViewData view)
        {
            if (view?.location != null)
            {
                bool serverInside = view.location.id == "restaurant:wing-spot";
                if (!hasInitializedPosition)
                {
                    hasInitializedPosition = true;
                    isInsideWingSpot = serverInside;
                    if (isInsideWingSpot)
                    {
                        TeleportTo(entranceInteriorPosition, Quaternion.identity);
                        Debug.Log("[PlayerController] Initialized position from authoritative persistence: Inside Wing Spot");
                    }
                    else
                    {
                        // Milestone 98 Requirement A: Default session spawn at configured Del Porvenir / Blvd. Gómez Morín corner
                        Vector3 spawnPos = spawnConfig != null ? spawnConfig.initialSpawnPosition : new Vector3(6.5f, 0.24f, 2.6f);
                        Quaternion spawnRot = spawnConfig != null ? spawnConfig.InitialSpawnRotation : Quaternion.Euler(0f, 110f, 0f);
                        TeleportTo(spawnPos, spawnRot);
                        Debug.Log($"[PlayerController] Initialized position from spawn configuration at Del Porvenir / Blvd. Gómez Morín corner: {spawnPos}");
                    }
                }
                else
                {
                    isInsideWingSpot = serverInside;
                }
            }
        }

        public bool IsInsideWingSpot { get => isInsideWingSpot; set => isInsideWingSpot = value; }
        public void SetInsideWingSpot(bool inside) => isInsideWingSpot = inside;
        public PlayerSpawnConfig SpawnConfig => spawnConfig;
        public Vector3 EntranceInteriorPosition => entranceInteriorPosition;
        public Vector3 EntranceExteriorPosition => entranceExteriorPosition;
        public Vector3 DoorPosition => doorPosition;
        public float DoorInteractionRadius => doorInteractionRadius;
    }
}
