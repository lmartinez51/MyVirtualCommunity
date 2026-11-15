using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using MyVirtualCommunity.UI;
using MyVirtualCommunity.Npc;

namespace MyVirtualCommunity.Player
{
    public enum AerialViewMode
    {
        GroundView = 0,
        DroneFreeFlight = 1,
        SatelliteTopDown = 2
    }

    /// <summary>
    /// AerialInspectionController provides the Dual Aerial Inspection System adapted for the
    /// Blvd. Manuel Gómez Morín & Manzana Rincones de Santa Rita scene:
    /// - Modalidad 1: 3D Free-Flying Quadcopter Drone ([V]) with 6-DOF physics, gimbal pitch/nadir toggle ([R]),
    ///   optical zoom (scroll wheel), 1st-person FPV vs 3rd-person animated quadcopter chase view ([F]),
    ///   and DJI-inspired tactical telemetry OSD.
    /// - Modalidad 2: Google Maps / Earth Satellite View ([G]) with left-click drag panning, scroll altitude zoom,
    ///   58° 3D oblique tilt vs 90° top-down nadir ([R]), compass rotation & North-Up reset ([N]),
    ///   live ground-cursor coordinate inspector, clickable hybrid landmark pins, and ground teleport ([T]).
    /// - Floating Google Maps Layer Switcher thumbnail card in GroundView with live overhead RenderTexture preview.
    /// </summary>
    public class AerialInspectionController : MonoBehaviour
    {
        public static AerialInspectionController Instance { get; private set; }

        public static bool IsAerialModeActive =>
            Instance != null && Instance.CurrentMode != AerialViewMode.GroundView;

        [Header("Scene Airspace Bounds (Gómez Morín + Manzana Rincones)")]
        [SerializeField] private float minBoundsX = -65f;
        [SerializeField] private float maxBoundsX = 175f;
        [SerializeField] private float minBoundsZ = -45f;
        [SerializeField] private float maxBoundsZ = 165f;
        [SerializeField] private float minDroneAltitude = 1.5f;
        [SerializeField] private float maxDroneAltitude = 240f;
        [SerializeField] private float minSatelliteAltitude = 12f;
        [SerializeField] private float maxSatelliteAltitude = 260f;

        [Header("Drone Flight Settings")]
        [SerializeField] private float cineHorizontalSpeed = 16f;
        [SerializeField] private float sportHorizontalSpeed = 36f;
        [SerializeField] private float cineVerticalSpeed = 10f;
        [SerializeField] private float sportVerticalSpeed = 22f;
        [SerializeField] private float mouseSensitivity = 2.2f;

        private AerialViewMode currentMode = AerialViewMode.GroundView;
        public AerialViewMode CurrentMode => currentMode;

        private PlayerController player;
        private ThirdPersonCamera thirdPersonCamera;
        private ElenaNpcController elenaNpc;
        private Camera aerialCamera;
        private RenderTexture miniSatellitePreviewRT;
        private float lastMiniPreviewRenderTime = -999f;

        // Floating Google Maps Launcher Card (Bottom-Left in Ground View)
        private Rect googleMapsLauncherRect = new Rect(15f, 0f, 122f, 134f);

        // Modalidad 1: 3D Free-Flying Drone State
        private Vector3 dronePosition = new Vector3(6.5f, 24f, -6f);
        private Vector3 droneVelocity = Vector3.zero;
        private float droneVerticalVelocity = 0f;
        private float droneYaw = 0f;
        private float dronePitch = 32f; // Positive pitch looks downward (89.5 = Nadir sky-to-ground)
        private float droneCurrentFov = 60f;
        private float droneTargetFov = 60f;
        private bool droneThirdPersonChaseView = false;
        private bool droneShowWorldMarkers = true;
        private bool isDroneCursorLocked = true;
        private GameObject droneVisualModel;
        private Transform[] droneRotorTransforms;
        private Vector3? droneAutoTargetPosition;

        // Modalidad 2: Google Maps / Earth Satellite View State
        private Vector2 satelliteFocusXZ = new Vector2(45f, 45f);
        private Vector2 satelliteTargetFocusXZ = new Vector2(45f, 45f);
        private float satelliteHeight = 85f;
        private float satelliteTargetHeight = 85f;
        private float satelliteYaw = 0f;
        private float satelliteTargetYaw = 0f;
        private bool satellite3DObliqueTilt = false;
        private bool satelliteShowHybridLabels = true;
        private bool isSatelliteDragging = false;
        private Vector2 satelliteDragLastMousePos = Vector2.zero;
        private float lastLeftClickTime = -10f;
        private Vector2 lastLeftClickPos = Vector2.zero;

        // Live Ground Cursor Inspector State (Satellite & Unlocked Drone)
        private bool hasCursorGroundHit = false;
        private Vector3 cursorGroundHitPoint = Vector3.zero;
        private string cursorGroundZoneLabel = "";

        private struct WorldLandmarkPin
        {
            public Vector3 position;
            public string label;
            public Color bgColor;
            public Color textColor;
            public float width;
            public float focusAltitudeDrone;
            public float focusAltitudeSat;

            public WorldLandmarkPin(Vector3 pos, string lbl, Color bg, Color txt, float w, float altDrone = 24f, float altSat = 52f)
            {
                position = pos;
                label = lbl;
                bgColor = bg;
                textColor = txt;
                width = w;
                focusAltitudeDrone = altDrone;
                focusAltitudeSat = altSat;
            }
        }

        private List<WorldLandmarkPin> sceneLandmarks;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
            }
            else if (Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            InitializeLandmarkCatalog();
        }

        private void Start()
        {
            RefreshReferences();
            EnsureAerialCameraAndResources();
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
            CleanupAerialCameraResources();
        }

        private void RefreshReferences()
        {
            if (player == null) player = FindFirstObjectByType<PlayerController>();
            if (thirdPersonCamera == null)
            {
                thirdPersonCamera = Camera.main != null
                    ? Camera.main.GetComponent<ThirdPersonCamera>()
                    : FindFirstObjectByType<ThirdPersonCamera>();
            }
            if (elenaNpc == null) elenaNpc = FindFirstObjectByType<ElenaNpcController>();
        }

        private void InitializeLandmarkCatalog()
        {
            sceneLandmarks = new List<WorldLandmarkPin>
            {
                // Frente Comercial Blvd. Manuel Gómez Morín
                new WorldLandmarkPin(
                    new Vector3(45f, 1.5f, -14f),
                    "🛣️ Blvd. Gómez Morín",
                    new Color(0.14f, 0.22f, 0.34f, 0.90f),
                    new Color(0.85f, 0.94f, 1f),
                    152f, 26f, 65f),

                new WorldLandmarkPin(
                    new Vector3(-12.2f, 4.8f, 11.5f),
                    "🍰 Pastelería La Tía Lupe",
                    new Color(0.52f, 0.18f, 0.38f, 0.92f),
                    new Color(1f, 0.90f, 0.96f),
                    168f, 20f, 42f),

                new WorldLandmarkPin(
                    new Vector3(-1.5f, 5.2f, 11.5f),
                    "🍗 Wing Spot Gómez Morín",
                    new Color(0.68f, 0.26f, 0.10f, 0.92f),
                    new Color(1f, 0.94f, 0.78f),
                    174f, 20f, 42f),

                new WorldLandmarkPin(
                    new Vector3(3.2f, 4.5f, 26.5f),
                    "🏠 Residencia Del Porvenir",
                    new Color(0.38f, 0.32f, 0.24f, 0.90f),
                    new Color(0.96f, 0.92f, 0.84f),
                    172f, 20f, 44f),

                new WorldLandmarkPin(
                    new Vector3(13.5f, 1.8f, 22.0f),
                    "🛣️ C. Del Porvenir (Sur)",
                    new Color(0.16f, 0.26f, 0.38f, 0.88f),
                    new Color(0.85f, 0.94f, 1f),
                    156f, 22f, 48f),

                new WorldLandmarkPin(
                    new Vector3(30.0f, 1.8f, 16.0f),
                    "🅿️ Plaza & Estacionamiento",
                    new Color(0.22f, 0.28f, 0.36f, 0.88f),
                    new Color(0.88f, 0.94f, 1f),
                    172f, 24f, 54f),

                new WorldLandmarkPin(
                    new Vector3(45.0f, 5.5f, 15.0f),
                    "🛒 Dollar 2 Go",
                    new Color(0.12f, 0.38f, 0.68f, 0.92f),
                    new Color(0.85f, 0.96f, 1f),
                    126f, 22f, 48f),

                new WorldLandmarkPin(
                    new Vector3(85.0f, 6.0f, 13.0f),
                    "🏢 Acabados HRC",
                    new Color(0.18f, 0.44f, 0.34f, 0.92f),
                    new Color(0.82f, 1f, 0.92f),
                    134f, 22f, 48f),

                new WorldLandmarkPin(
                    new Vector3(85.0f, 4.8f, 29.0f),
                    "🐾 CatZoo Clínica Felina",
                    new Color(0.10f, 0.48f, 0.48f, 0.92f),
                    new Color(0.80f, 1f, 0.98f),
                    164f, 22f, 48f),

                new WorldLandmarkPin(
                    new Vector3(101.0f, 1.8f, 22.0f),
                    "🛣️ Av. La Arboleda (Sur)",
                    new Color(0.16f, 0.26f, 0.38f, 0.88f),
                    new Color(0.85f, 0.94f, 1f),
                    160f, 24f, 52f),

                new WorldLandmarkPin(
                    new Vector3(131.5f, 14.0f, 21.0f),
                    "🏙️ Corporativo Arboleda",
                    new Color(0.14f, 0.32f, 0.58f, 0.92f),
                    new Color(0.84f, 0.95f, 1f),
                    166f, 30f, 64f),

                // Manzana Rincones de Santa Rita (feat/rincones-block-terrain)
                new WorldLandmarkPin(
                    new Vector3(13.5f, 1.8f, 85.5f),
                    "🛣️ C. Del Porvenir (Norte)",
                    new Color(0.18f, 0.32f, 0.46f, 0.90f),
                    new Color(0.86f, 0.95f, 1f),
                    168f, 28f, 68f),

                new WorldLandmarkPin(
                    new Vector3(58.5f, 1.5f, 62.0f),
                    "🔄 Circuito Interno Rincones",
                    new Color(0.46f, 0.34f, 0.16f, 0.92f),
                    new Color(1f, 0.94f, 0.78f),
                    182f, 32f, 78f),

                new WorldLandmarkPin(
                    new Vector3(58.5f, 1.5f, 96.0f),
                    "📐 Manzana Rincones (Terreno)",
                    new Color(0.36f, 0.44f, 0.22f, 0.90f),
                    new Color(0.92f, 1f, 0.82f),
                    188f, 38f, 95f),

                new WorldLandmarkPin(
                    new Vector3(101.0f, 1.8f, 97.5f),
                    "🛣️ Av. La Arboleda (Norte)",
                    new Color(0.18f, 0.32f, 0.46f, 0.90f),
                    new Color(0.86f, 0.95f, 1f),
                    172f, 28f, 68f),

                new WorldLandmarkPin(
                    new Vector3(56.5f, 1.8f, 140.5f),
                    "🛣️ Calle Rosaleda (Norte)",
                    new Color(0.55f, 0.38f, 0.10f, 0.92f),
                    new Color(1f, 0.95f, 0.72f),
                    172f, 32f, 78f)
            };
        }

        private void Update()
        {
            RefreshReferences();

            bool isModalActive = ProductHudController.Instance != null && ProductHudController.Instance.IsModalActive;
            bool isTeleporting = QuickTravelController.Instance != null && QuickTravelController.Instance.IsTeleporting;

            if (isModalActive || isTeleporting)
            {
                return;
            }

            // Toggle Drone Mode [V]
            if (Input.GetKeyDown(KeyCode.V))
            {
                SetAerialViewMode(currentMode == AerialViewMode.DroneFreeFlight
                    ? AerialViewMode.GroundView
                    : AerialViewMode.DroneFreeFlight);
                return;
            }

            // Toggle Satellite View Mode [G]
            if (Input.GetKeyDown(KeyCode.G))
            {
                SetAerialViewMode(currentMode == AerialViewMode.SatelliteTopDown
                    ? AerialViewMode.GroundView
                    : AerialViewMode.SatelliteTopDown);
                return;
            }

            if (currentMode == AerialViewMode.GroundView)
            {
                UpdateMiniSatellitePreviewRender();
                return;
            }

            if (currentMode == AerialViewMode.DroneFreeFlight)
            {
                HandleDroneFreeFlightUpdate();
            }
            else if (currentMode == AerialViewMode.SatelliteTopDown)
            {
                HandleSatelliteTopDownUpdate();
            }
        }

        public void SetAerialViewMode(AerialViewMode newMode)
        {
            if (currentMode == newMode) return;

            RefreshReferences();
            EnsureAerialCameraAndResources();

            AerialViewMode prevMode = currentMode;
            currentMode = newMode;

            Vector3 playerPos = player != null ? player.transform.position : new Vector3(6.5f, 0.24f, 2.6f);
            float playerYaw = player != null ? player.transform.eulerAngles.y : 0f;

            if (newMode == AerialViewMode.GroundView)
            {
                if (aerialCamera != null)
                {
                    aerialCamera.targetTexture = null;
                    aerialCamera.enabled = false;
                }
                if (droneVisualModel != null && droneVisualModel.activeSelf)
                {
                    droneVisualModel.SetActive(false);
                }

                // Restore cursor unlocked/locked state cleanly for GroundView
                SetCursorLock(false);
                return;
            }

            if (newMode == AerialViewMode.DroneFreeFlight)
            {
                if (prevMode == AerialViewMode.SatelliteTopDown)
                {
                    dronePosition = new Vector3(
                        satelliteFocusXZ.x,
                        Mathf.Clamp(satelliteHeight * 0.55f, 18f, 68f),
                        satelliteFocusXZ.y);
                    droneYaw = satelliteYaw;
                    dronePitch = 40f;
                }
                else
                {
                    Vector3 flatFwd = player != null
                        ? new Vector3(player.transform.forward.x, 0f, player.transform.forward.z).normalized
                        : Vector3.forward;
                    if (flatFwd.sqrMagnitude < 0.01f) flatFwd = Vector3.forward;

                    dronePosition = playerPos + new Vector3(0f, 22f, 0f) - (flatFwd * 10f);
                    droneYaw = playerYaw;
                    dronePitch = 34f;
                }

                droneVelocity = Vector3.zero;
                droneVerticalVelocity = 0f;
                droneTargetFov = 60f;
                droneCurrentFov = 60f;
                droneAutoTargetPosition = null;

                if (aerialCamera != null)
                {
                    aerialCamera.targetTexture = null;
                    aerialCamera.depth = 25f;
                    aerialCamera.fieldOfView = droneCurrentFov;
                    aerialCamera.transform.position = dronePosition;
                    aerialCamera.transform.rotation = Quaternion.Euler(dronePitch, droneYaw, 0f);
                    aerialCamera.enabled = true;
                }

                EnsureDrone3DVisualModel();
                if (droneVisualModel != null)
                {
                    droneVisualModel.SetActive(droneThirdPersonChaseView);
                }

                SetCursorLock(true);
            }
            else if (newMode == AerialViewMode.SatelliteTopDown)
            {
                if (prevMode == AerialViewMode.DroneFreeFlight)
                {
                    satelliteFocusXZ = new Vector2(dronePosition.x, dronePosition.z);
                    satelliteTargetFocusXZ = satelliteFocusXZ;
                    satelliteHeight = Mathf.Clamp(dronePosition.y * 1.45f, 38f, 185f);
                    satelliteTargetHeight = satelliteHeight;
                    satelliteYaw = droneYaw;
                    satelliteTargetYaw = droneYaw;
                }
                else
                {
                    // Center above player or slightly north toward Rincones block
                    satelliteFocusXZ = new Vector2(
                        Mathf.Clamp(playerPos.x, minBoundsX, maxBoundsX),
                        Mathf.Clamp(playerPos.z + 14f, minBoundsZ, maxBoundsZ));
                    satelliteTargetFocusXZ = satelliteFocusXZ;
                    satelliteHeight = 78f;
                    satelliteTargetHeight = 78f;
                    satelliteYaw = 0f; // North-Up default like Google Maps
                    satelliteTargetYaw = 0f;
                }

                isSatelliteDragging = false;

                if (droneVisualModel != null && droneVisualModel.activeSelf)
                {
                    droneVisualModel.SetActive(false);
                }

                if (aerialCamera != null)
                {
                    aerialCamera.targetTexture = null;
                    aerialCamera.depth = 25f;
                    aerialCamera.fieldOfView = 50f;
                    UpdateSatelliteCameraTransformImmediate();
                    aerialCamera.enabled = true;
                }

                // Always keep cursor unlocked in Satellite mode for click-and-drag panning and pin clicking
                SetCursorLock(false);
            }
        }

        private void SetCursorLock(bool locked)
        {
            isDroneCursorLocked = locked;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        private void EnsureAerialCameraAndResources()
        {
            if (aerialCamera == null)
            {
                GameObject camGo = new GameObject("Aerial_Drone_Satellite_Camera");
                aerialCamera = camGo.AddComponent<Camera>();
                aerialCamera.nearClipPlane = 0.25f;
                aerialCamera.farClipPlane = 700f;
                aerialCamera.fieldOfView = 60f;
                aerialCamera.depth = 25f;

                Camera mainCam = Camera.main;
                if (mainCam != null)
                {
                    aerialCamera.clearFlags = mainCam.clearFlags;
                    aerialCamera.backgroundColor = mainCam.backgroundColor;
                    aerialCamera.cullingMask = mainCam.cullingMask;

                    var mainUrp = mainCam.GetComponent<UniversalAdditionalCameraData>();
                    var aerialUrp = camGo.GetComponent<UniversalAdditionalCameraData>();
                    if (aerialUrp == null)
                    {
                        aerialUrp = camGo.AddComponent<UniversalAdditionalCameraData>();
                    }
                    if (mainUrp != null && aerialUrp != null)
                    {
                        aerialUrp.renderPostProcessing = mainUrp.renderPostProcessing;
                        aerialUrp.antialiasing = mainUrp.antialiasing;
                        aerialUrp.renderShadows = true;
                    }
                }
                else
                {
                    aerialCamera.clearFlags = CameraClearFlags.SolidColor;
                    aerialCamera.backgroundColor = new Color(0.45f, 0.68f, 0.92f, 1f);
                }

                aerialCamera.enabled = false;
            }

            if (miniSatellitePreviewRT == null)
            {
                miniSatellitePreviewRT = new RenderTexture(192, 192, 16, RenderTextureFormat.ARGB32);
                miniSatellitePreviewRT.name = "GoogleMaps_MiniPreview_RT";
                miniSatellitePreviewRT.Create();
            }
        }

        private void EnsureDrone3DVisualModel()
        {
            if (droneVisualModel != null) return;

            droneVisualModel = new GameObject("Player_Quadcopter_Drone_3D");
            droneVisualModel.layer = 2; // Ignore Raycast

            Shader litShader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            Material bodyMat = CreateDroneMaterial(litShader, new Color(0.16f, 0.19f, 0.24f));
            Material accentCyanMat = CreateDroneMaterial(litShader, new Color(0.08f, 0.85f, 0.98f));
            Material armMat = CreateDroneMaterial(litShader, new Color(0.26f, 0.30f, 0.36f));
            Material rotorMat = CreateDroneMaterial(litShader, new Color(0.08f, 0.09f, 0.11f));
            Material gimbalLensMat = CreateDroneMaterial(litShader, new Color(0.95f, 0.25f, 0.22f));

            // Central fuselage
            GameObject core = GameObject.CreatePrimitive(PrimitiveType.Cube);
            core.name = "Drone_Fuselage";
            core.layer = 2;
            core.transform.SetParent(droneVisualModel.transform);
            core.transform.localPosition = Vector3.zero;
            core.transform.localScale = new Vector3(0.46f, 0.16f, 0.68f);
            Destroy(core.GetComponent<Collider>());
            if (bodyMat != null) core.GetComponent<Renderer>().sharedMaterial = bodyMat;

            // Top glowing telemetry canopy stripe
            GameObject canopy = GameObject.CreatePrimitive(PrimitiveType.Cube);
            canopy.name = "Drone_Canopy_LED";
            canopy.layer = 2;
            canopy.transform.SetParent(droneVisualModel.transform);
            canopy.transform.localPosition = new Vector3(0f, 0.09f, 0.02f);
            canopy.transform.localScale = new Vector3(0.28f, 0.04f, 0.48f);
            Destroy(canopy.GetComponent<Collider>());
            if (accentCyanMat != null) canopy.GetComponent<Renderer>().sharedMaterial = accentCyanMat;

            // Underslung 4K Gimbal Camera sphere
            GameObject gimbal = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            gimbal.name = "Drone_4K_Gimbal";
            gimbal.layer = 2;
            gimbal.transform.SetParent(droneVisualModel.transform);
            gimbal.transform.localPosition = new Vector3(0f, -0.14f, 0.24f);
            gimbal.transform.localScale = new Vector3(0.20f, 0.20f, 0.20f);
            Destroy(gimbal.GetComponent<Collider>());
            if (gimbalLensMat != null) gimbal.GetComponent<Renderer>().sharedMaterial = gimbalLensMat;

            // 4 Diagonal Quadcopter Arms + Spinning Rotors
            droneRotorTransforms = new Transform[4];
            Vector3[] motorOffsets = new Vector3[]
            {
                new Vector3(-0.48f, 0.04f,  0.48f), // Front-Left
                new Vector3( 0.48f, 0.04f,  0.48f), // Front-Right
                new Vector3(-0.48f, 0.04f, -0.48f), // Rear-Left
                new Vector3( 0.48f, 0.04f, -0.48f)  // Rear-Right
            };

            for (int i = 0; i < 4; i++)
            {
                Vector3 mPos = motorOffsets[i];
                GameObject arm = GameObject.CreatePrimitive(PrimitiveType.Cube);
                arm.name = $"Drone_Arm_{i}";
                arm.layer = 2;
                arm.transform.SetParent(droneVisualModel.transform);
                arm.transform.localPosition = mPos * 0.5f;
                float angleY = Mathf.Atan2(mPos.x, mPos.z) * Mathf.Rad2Deg;
                arm.transform.localRotation = Quaternion.Euler(0f, angleY, 0f);
                arm.transform.localScale = new Vector3(0.07f, 0.05f, 0.68f);
                Destroy(arm.GetComponent<Collider>());
                if (armMat != null) arm.GetComponent<Renderer>().sharedMaterial = armMat;

                // Motor pod
                GameObject pod = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                pod.name = $"Drone_Motor_{i}";
                pod.layer = 2;
                pod.transform.SetParent(droneVisualModel.transform);
                pod.transform.localPosition = mPos;
                pod.transform.localScale = new Vector3(0.14f, 0.06f, 0.14f);
                Destroy(pod.GetComponent<Collider>());
                if (accentCyanMat != null) pod.GetComponent<Renderer>().sharedMaterial = accentCyanMat;

                // Spinning Propeller Blade Hub
                GameObject rotorHub = new GameObject($"Drone_RotorHub_{i}");
                rotorHub.layer = 2;
                rotorHub.transform.SetParent(droneVisualModel.transform);
                rotorHub.transform.localPosition = mPos + new Vector3(0f, 0.07f, 0f);

                GameObject blade1 = GameObject.CreatePrimitive(PrimitiveType.Cube);
                blade1.layer = 2;
                blade1.transform.SetParent(rotorHub.transform);
                blade1.transform.localPosition = Vector3.zero;
                blade1.transform.localScale = new Vector3(0.46f, 0.012f, 0.045f);
                Destroy(blade1.GetComponent<Collider>());
                if (rotorMat != null) blade1.GetComponent<Renderer>().sharedMaterial = rotorMat;

                GameObject blade2 = GameObject.CreatePrimitive(PrimitiveType.Cube);
                blade2.layer = 2;
                blade2.transform.SetParent(rotorHub.transform);
                blade2.transform.localPosition = Vector3.zero;
                blade2.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
                blade2.transform.localScale = new Vector3(0.46f, 0.012f, 0.045f);
                Destroy(blade2.GetComponent<Collider>());
                if (rotorMat != null) blade2.GetComponent<Renderer>().sharedMaterial = rotorMat;

                droneRotorTransforms[i] = rotorHub.transform;
            }

            droneVisualModel.SetActive(false);
        }

        private static Material CreateDroneMaterial(Shader shader, Color col)
        {
            if (shader == null) return null;
            Material m = new Material(shader);
            m.color = col;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", col);
            return m;
        }

        private void UpdateMiniSatellitePreviewRender()
        {
            EnsureAerialCameraAndResources();

            if (Time.unscaledTime - lastMiniPreviewRenderTime < 0.28f) return;
            lastMiniPreviewRenderTime = Time.unscaledTime;

            if (aerialCamera == null || miniSatellitePreviewRT == null) return;

            Vector3 focusPos = player != null ? player.transform.position : new Vector3(6.5f, 0f, 2.6f);

            bool prevEnabled = aerialCamera.enabled;
            RenderTexture prevRT = aerialCamera.targetTexture;
            Vector3 prevPos = aerialCamera.transform.position;
            Quaternion prevRot = aerialCamera.transform.rotation;
            float prevFov = aerialCamera.fieldOfView;

            // Position overhead at 58m above the player looking straight down (North-Up)
            aerialCamera.enabled = false;
            aerialCamera.targetTexture = miniSatellitePreviewRT;
            aerialCamera.fieldOfView = 52f;
            aerialCamera.transform.position = new Vector3(focusPos.x, 58f, focusPos.z);
            aerialCamera.transform.rotation = Quaternion.Euler(89.9f, 0f, 0f);
            aerialCamera.Render();

            aerialCamera.targetTexture = prevRT;
            aerialCamera.transform.position = prevPos;
            aerialCamera.transform.rotation = prevRot;
            aerialCamera.fieldOfView = prevFov;
            aerialCamera.enabled = prevEnabled;
        }

        // =====================================================================
        // MODALIDAD 1: 3D FREE-FLYING DRONE UPDATE
        // =====================================================================
        private void HandleDroneFreeFlightUpdate()
        {
            EnsureAerialCameraAndResources();
            EnsureDrone3DVisualModel();

            float dt = Mathf.Clamp(Time.unscaledDeltaTime, 0.001f, 0.05f);

            // Toggle cursor lock with Tab or Alt so user can click HUD buttons or world pins
            if (Input.GetKeyDown(KeyCode.Tab) || Input.GetKeyDown(KeyCode.LeftAlt) || Input.GetKeyDown(KeyCode.RightAlt))
            {
                SetCursorLock(!isDroneCursorLocked);
            }
            else if (!isDroneCursorLocked && Input.GetMouseButtonDown(0) && !IsMouseOverAerialUI(Input.mousePosition))
            {
                SetCursorLock(true);
            }

            // 1. Quick Gimbal 90-degree Top-Down Nadir toggle [R]
            if (Input.GetKeyDown(KeyCode.R))
            {
                dronePitch = (dronePitch < 82f) ? 89.5f : 34f;
            }

            // 2. Toggle 1st-Person FPV vs 3rd-Person Quadcopter Chase View [F]
            if (Input.GetKeyDown(KeyCode.F))
            {
                droneThirdPersonChaseView = !droneThirdPersonChaseView;
                if (droneVisualModel != null)
                {
                    droneVisualModel.SetActive(droneThirdPersonChaseView);
                }
            }

            // 3. Toggle World Landmark Markers [H]
            if (Input.GetKeyDown(KeyCode.H))
            {
                droneShowWorldMarkers = !droneShowWorldMarkers;
            }

            // 4. Quick Teleport Player to ground below Drone [T]
            if (Input.GetKeyDown(KeyCode.T))
            {
                TeleportPlayerToGroundPosition(dronePosition.x, dronePosition.z);
                return;
            }

            // 5. Quick Sector Hotkeys [1..6] for Gómez Morín & Rincones de Santa Rita
            CheckAerialSectorHotkeys(isDrone: true);

            // 6. Mouse Look (when cursor is locked or right mouse button held)
            if (isDroneCursorLocked || Input.GetMouseButton(1))
            {
                float mouseX = Input.GetAxis("Mouse X") * mouseSensitivity;
                float mouseY = Input.GetAxis("Mouse Y") * mouseSensitivity;
                droneYaw += mouseX;
                dronePitch = Mathf.Clamp(dronePitch - mouseY, -40f, 89.8f);
            }

            // 7. Scroll Wheel Optical Zoom (FOV 22° telephoto to 78° wide angle)
            float scroll = Input.mouseScrollDelta.y * 0.15f;
            if (Mathf.Abs(scroll) > 0.001f)
            {
                droneTargetFov = Mathf.Clamp(droneTargetFov - scroll * 14f, 22f, 78f);
            }
            droneCurrentFov = Mathf.Lerp(droneCurrentFov, droneTargetFov, dt * 10f);

            // 8. 6-DOF Drone Flight Movement (Horizontal WASD + Vertical Space/E Up, Q/C/Ctrl Down)
            float horizX = Input.GetAxisRaw("Horizontal");
            float horizZ = Input.GetAxisRaw("Vertical");
            Vector2 moveInput = new Vector2(horizX, horizZ);
            if (moveInput.sqrMagnitude > 1f) moveInput.Normalize();

            float verticalInput = 0f;
            if (Input.GetKey(KeyCode.Space) || Input.GetKey(KeyCode.E)) verticalInput += 1f;
            if (Input.GetKey(KeyCode.Q) || Input.GetKey(KeyCode.C) || Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl))
            {
                verticalInput -= 1f;
            }

            // Cancel auto-fly if user manually pilots
            if (moveInput.sqrMagnitude > 0.01f || Mathf.Abs(verticalInput) > 0.01f)
            {
                droneAutoTargetPosition = null;
            }

            bool isSportTurbo = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            float maxHorizSpeed = isSportTurbo ? sportHorizontalSpeed : cineHorizontalSpeed;
            float maxVertSpeed = isSportTurbo ? sportVerticalSpeed : cineVerticalSpeed;

            if (droneAutoTargetPosition.HasValue)
            {
                Vector3 toTarget = droneAutoTargetPosition.Value - dronePosition;
                if (toTarget.magnitude < 1.0f)
                {
                    droneAutoTargetPosition = null;
                    droneVelocity = Vector3.zero;
                    droneVerticalVelocity = 0f;
                }
                else
                {
                    dronePosition = Vector3.Lerp(dronePosition, droneAutoTargetPosition.Value, dt * 4.5f);
                    droneVelocity = toTarget * 2.5f;
                }
            }
            else
            {
                Quaternion flatYawRot = Quaternion.Euler(0f, droneYaw, 0f);
                Vector3 desiredHorizVel = (flatYawRot * new Vector3(moveInput.x, 0f, moveInput.y)) * maxHorizSpeed;
                droneVelocity = Vector3.Lerp(droneVelocity, desiredHorizVel, dt * 7.5f);
                droneVerticalVelocity = Mathf.Lerp(droneVerticalVelocity, verticalInput * maxVertSpeed, dt * 7.5f);

                dronePosition += new Vector3(droneVelocity.x, droneVerticalVelocity, droneVelocity.z) * dt;
            }

            // Clamp within Gómez Morín + Manzana Rincones airspace
            dronePosition.x = Mathf.Clamp(dronePosition.x, minBoundsX, maxBoundsX);
            dronePosition.y = Mathf.Clamp(dronePosition.y, minDroneAltitude, maxDroneAltitude);
            dronePosition.z = Mathf.Clamp(dronePosition.z, minBoundsZ, maxBoundsZ);

            // Update 3D Quadcopter visual model & rotor spin
            if (droneVisualModel != null)
            {
                if (droneVisualModel.activeSelf != droneThirdPersonChaseView)
                {
                    droneVisualModel.SetActive(droneThirdPersonChaseView);
                }

                if (droneThirdPersonChaseView)
                {
                    Vector3 localVel = Quaternion.Inverse(Quaternion.Euler(0f, droneYaw, 0f)) * droneVelocity;
                    float tiltPitch = Mathf.Clamp(localVel.z * 0.65f, -18f, 18f);
                    float tiltRoll = Mathf.Clamp(-localVel.x * 0.65f, -18f, 18f);
                    droneVisualModel.transform.position = dronePosition;
                    droneVisualModel.transform.rotation = Quaternion.Euler(tiltPitch, droneYaw, tiltRoll);

                    if (droneRotorTransforms != null)
                    {
                        float spinSpeed = isSportTurbo ? 2600f : 1650f;
                        for (int i = 0; i < droneRotorTransforms.Length; i++)
                        {
                            if (droneRotorTransforms[i] != null)
                            {
                                droneRotorTransforms[i].Rotate(0f, spinSpeed * dt * ((i % 2 == 0) ? 1f : -1f), 0f, Space.Self);
                            }
                        }
                    }
                }
            }

            // Position aerial camera (either 1st-person gimbal or 3rd-person chase behind quadcopter)
            if (aerialCamera != null)
            {
                aerialCamera.enabled = true;
                aerialCamera.fieldOfView = droneCurrentFov;
                Quaternion camRot = Quaternion.Euler(dronePitch, droneYaw, 0f);
                if (droneThirdPersonChaseView)
                {
                    Vector3 chaseOffset = camRot * new Vector3(0f, 0.65f, -3.2f);
                    aerialCamera.transform.position = dronePosition + chaseOffset;
                    aerialCamera.transform.rotation = camRot;
                }
                else
                {
                    aerialCamera.transform.position = dronePosition;
                    aerialCamera.transform.rotation = camRot;
                }
            }
        }

        // =====================================================================
        // MODALIDAD 2: GOOGLE MAPS / EARTH SATELLITE TOP-DOWN UPDATE
        // =====================================================================
        private void HandleSatelliteTopDownUpdate()
        {
            EnsureAerialCameraAndResources();

            // Always keep cursor unlocked in Satellite mode
            if (Cursor.lockState != CursorLockMode.None || !Cursor.visible)
            {
                SetCursorLock(false);
            }

            float dt = Mathf.Clamp(Time.unscaledDeltaTime, 0.001f, 0.05f);

            // 1. Toggle 90° True Satellite Nadir vs 58° Google Earth 3D Oblique tilt [R]
            if (Input.GetKeyDown(KeyCode.R))
            {
                satellite3DObliqueTilt = !satellite3DObliqueTilt;
            }

            // 2. Reset Compass North-Up [N]
            if (Input.GetKeyDown(KeyCode.N))
            {
                satelliteTargetYaw = 0f;
            }

            // 3. Toggle Hybrid Labels [H]
            if (Input.GetKeyDown(KeyCode.H))
            {
                satelliteShowHybridLabels = !satelliteShowHybridLabels;
            }

            // 4. Teleport Player to ground [T] (Shift+T = teleport to cursor ground point, T = teleport to map center)
            if (Input.GetKeyDown(KeyCode.T))
            {
                bool useCursorTarget = (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift)) && hasCursorGroundHit;
                float tx = useCursorTarget ? cursorGroundHitPoint.x : satelliteFocusXZ.x;
                float tz = useCursorTarget ? cursorGroundHitPoint.z : satelliteFocusXZ.y;
                TeleportPlayerToGroundPosition(tx, tz);
                return;
            }

            // 5. Quick Sector Hotkeys [1..6]
            CheckAerialSectorHotkeys(isDrone: false);

            // 6. Scroll Wheel Altitude Zoom (12m Street-level close-up to 260m full Rincones block overview)
            float scroll = Input.mouseScrollDelta.y * 0.15f;
            if (Mathf.Abs(scroll) > 0.001f)
            {
                float zoomStep = Mathf.Max(4.5f, satelliteTargetHeight * 0.18f);
                satelliteTargetHeight = Mathf.Clamp(satelliteTargetHeight - scroll * zoomStep * 2.2f, minSatelliteAltitude, maxSatelliteAltitude);
            }

            // 7. Left-Click & Drag Map Panning + Double-Click to Center
            Vector2 mousePos = Input.mousePosition;
            bool overUI = IsMouseOverAerialUI(mousePos);

            if (Input.GetMouseButtonDown(0) && !overUI)
            {
                float timeSinceLastClick = Time.unscaledTime - lastLeftClickTime;
                if (timeSinceLastClick < 0.30f && Vector2.Distance(mousePos, lastLeftClickPos) < 12f && hasCursorGroundHit)
                {
                    // Double-click on ground: smoothly center satellite focus on clicked coordinate!
                    satelliteTargetFocusXZ = new Vector2(
                        Mathf.Clamp(cursorGroundHitPoint.x, minBoundsX, maxBoundsX),
                        Mathf.Clamp(cursorGroundHitPoint.z, minBoundsZ, maxBoundsZ));
                    isSatelliteDragging = false;
                }
                else
                {
                    isSatelliteDragging = true;
                    satelliteDragLastMousePos = mousePos;
                }
                lastLeftClickTime = Time.unscaledTime;
                lastLeftClickPos = mousePos;
            }
            else if (Input.GetMouseButtonUp(0))
            {
                isSatelliteDragging = false;
            }

            if (isSatelliteDragging && Input.GetMouseButton(0))
            {
                Vector2 mouseDelta = mousePos - satelliteDragLastMousePos;
                satelliteDragLastMousePos = mousePos;

                // Scale pan speed proportionally to camera altitude so ground sticks under the cursor
                float panUnitsPerPixel = (satelliteHeight / Mathf.Max(360f, (float)Screen.height)) * 1.18f;
                Quaternion yawRot = Quaternion.Euler(0f, satelliteYaw, 0f);
                Vector3 worldPan = yawRot * new Vector3(-mouseDelta.x * panUnitsPerPixel, 0f, -mouseDelta.y * panUnitsPerPixel);
                satelliteTargetFocusXZ += new Vector2(worldPan.x, worldPan.z);
            }

            // 8. Right-Click Drag or Q/E Keys to rotate compass bearing
            if (Input.GetMouseButton(1))
            {
                float mouseX = Input.GetAxis("Mouse X") * mouseSensitivity;
                satelliteTargetYaw += mouseX * 1.6f;
            }
            if (Input.GetKey(KeyCode.Q)) satelliteTargetYaw -= 65f * dt;
            if (Input.GetKey(KeyCode.E)) satelliteTargetYaw += 65f * dt;

            // 9. Smooth WASD / Arrow Keys Panning
            float horizX = Input.GetAxisRaw("Horizontal");
            float horizZ = Input.GetAxisRaw("Vertical");
            Vector2 moveInput = new Vector2(horizX, horizZ);
            if (moveInput.sqrMagnitude > 0.01f)
            {
                if (moveInput.sqrMagnitude > 1f) moveInput.Normalize();
                bool fastPan = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
                float panSpeed = Mathf.Clamp(satelliteHeight * 0.85f, 18f, 105f) * (fastPan ? 1.85f : 1.0f);
                Quaternion yawRot = Quaternion.Euler(0f, satelliteYaw, 0f);
                Vector3 step = (yawRot * new Vector3(moveInput.x, 0f, moveInput.y)) * (panSpeed * dt);
                satelliteTargetFocusXZ += new Vector2(step.x, step.z);
            }

            // Clamp focus within Gómez Morín + Manzana Rincones bounds
            satelliteTargetFocusXZ.x = Mathf.Clamp(satelliteTargetFocusXZ.x, minBoundsX, maxBoundsX);
            satelliteTargetFocusXZ.y = Mathf.Clamp(satelliteTargetFocusXZ.y, minBoundsZ, maxBoundsZ);

            // Smooth interpolation
            satelliteFocusXZ = Vector2.Lerp(satelliteFocusXZ, satelliteTargetFocusXZ, dt * 11f);
            satelliteHeight = Mathf.Lerp(satelliteHeight, satelliteTargetHeight, dt * 9f);
            satelliteYaw = Mathf.LerpAngle(satelliteYaw, satelliteTargetYaw, dt * 10f);

            UpdateSatelliteCameraTransformImmediate();
            UpdateCursorGroundInspector();
        }

        private void UpdateSatelliteCameraTransformImmediate()
        {
            if (aerialCamera == null) return;

            float targetPitch = satellite3DObliqueTilt ? 58f : 89.9f;
            Quaternion camRot = Quaternion.Euler(targetPitch, satelliteYaw, 0f);

            if (satellite3DObliqueTilt)
            {
                // Offset camera backward along pitch ray so satelliteFocusXZ remains centered in the viewport
                float horizBackDist = satelliteHeight / Mathf.Tan(targetPitch * Mathf.Deg2Rad);
                Quaternion flatYaw = Quaternion.Euler(0f, satelliteYaw, 0f);
                Vector3 backOffset = flatYaw * new Vector3(0f, 0f, -horizBackDist);
                aerialCamera.transform.position = new Vector3(satelliteFocusXZ.x, satelliteHeight, satelliteFocusXZ.y) + backOffset;
            }
            else
            {
                aerialCamera.transform.position = new Vector3(satelliteFocusXZ.x, satelliteHeight, satelliteFocusXZ.y);
            }

            aerialCamera.transform.rotation = camRot;
            aerialCamera.fieldOfView = 50f;
        }

        private void UpdateCursorGroundInspector()
        {
            hasCursorGroundHit = false;
            if (aerialCamera == null) return;

            Ray ray = aerialCamera.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out RaycastHit hit, 600f, ~(1 << 2)))
            {
                hasCursorGroundHit = true;
                cursorGroundHitPoint = hit.point;
                cursorGroundZoneLabel = ClassifyWorldZone(hit.point.x, hit.point.z);
            }
        }

        public static string ClassifyWorldZone(float x, float z)
        {
            if (z < 0f)
            {
                return "Blvd. Manuel Gómez Morín";
            }
            if (z <= 42f)
            {
                if (x < -6.5f) return "Pastelería La Tía Lupe";
                if (x <= 8.5f) return z <= 18.8f ? "Wing Spot Gómez Morín" : "Residencia Del Porvenir";
                if (x <= 18.5f) return "Calle Del Porvenir (Frente)";
                if (x <= 75.5f)
                {
                    if (x >= 36f && x <= 54f && z >= 8f && z <= 22f) return "Dollar 2 Go";
                    return "Estacionamiento Comercial";
                }
                if (x <= 94.5f) return z < 22f ? "Acabados HRC" : "CatZoo Clínica Felina";
                if (x <= 107.5f) return "Av. La Arboleda (Frente)";
                return "Corporativo Arboleda";
            }
            else
            {
                // Manzana Rincones de Santa Rita (Z > 42)
                if (x >= 7.5f && x <= 19.5f && z <= 128f) return "Calle Del Porvenir (Norte)";
                if (x >= 94f && x <= 108f && z <= 152f) return "Av. La Arboleda (Norte)";
                // Diagonal Calle Rosaleda check
                float expectedRosaledaZ = 125.9f + ((x - 12.5f) / 87.9f) * (155.2f - 125.9f);
                if (x >= 10f && x <= 104f && Mathf.Abs(z - expectedRosaledaZ) <= 8.5f)
                {
                    return "Calle Rosaleda";
                }
                if (x >= 40f && x <= 78f && z >= 42f && z <= 107f)
                {
                    return "Manzana Rincones (Circuito / Interior)";
                }
                return "Manzana Rincones de Santa Rita";
            }
        }

        private void CheckAerialSectorHotkeys(bool isDrone)
        {
            if (Input.GetKeyDown(KeyCode.Alpha1)) JumpToSector(1, isDrone);
            else if (Input.GetKeyDown(KeyCode.Alpha2)) JumpToSector(2, isDrone);
            else if (Input.GetKeyDown(KeyCode.Alpha3)) JumpToSector(3, isDrone);
            else if (Input.GetKeyDown(KeyCode.Alpha4)) JumpToSector(4, isDrone);
            else if (Input.GetKeyDown(KeyCode.Alpha5)) JumpToSector(5, isDrone);
            else if (Input.GetKeyDown(KeyCode.Alpha6)) JumpToSector(6, isDrone);
        }

        public void JumpToSector(int sectorIndex, bool isDrone)
        {
            Vector2 targetXZ;
            float targetAlt;
            float targetPitch = 36f;

            switch (sectorIndex)
            {
                case 1:
                    // Sector 1: Esquina Tía Lupe & Wing Spot & Del Porvenir Sur
                    targetXZ = new Vector2(-2f, 10f);
                    targetAlt = isDrone ? 20f : 46f;
                    targetPitch = 34f;
                    break;
                case 2:
                    // Sector 2: Plaza Comercial & Dollar 2 Go
                    targetXZ = new Vector2(45f, 16f);
                    targetAlt = isDrone ? 24f : 55f;
                    targetPitch = 36f;
                    break;
                case 3:
                    // Sector 3: Acabados HRC & CatZoo Clínica Felina
                    targetXZ = new Vector2(85f, 20f);
                    targetAlt = isDrone ? 24f : 54f;
                    targetPitch = 36f;
                    break;
                case 4:
                    // Sector 4: Av. La Arboleda & Corporativo Arboleda
                    targetXZ = new Vector2(126f, 20f);
                    targetAlt = isDrone ? 28f : 64f;
                    targetPitch = 38f;
                    break;
                case 5:
                    // Sector 5: Circuito Interno — Rincones de Santa Rita
                    targetXZ = new Vector2(58f, 68f);
                    targetAlt = isDrone ? 34f : 85f;
                    targetPitch = 42f;
                    break;
                case 6:
                default:
                    // Sector 6: Calle Rosaleda & Manzana Completa Rincones
                    targetXZ = isDrone ? new Vector2(56f, 132f) : new Vector2(58f, 75f);
                    targetAlt = isDrone ? 38f : 185f;
                    targetPitch = 44f;
                    break;
            }

            if (isDrone)
            {
                droneAutoTargetPosition = new Vector3(targetXZ.x, targetAlt, targetXZ.y);
                dronePitch = targetPitch;
            }
            else
            {
                satelliteTargetFocusXZ = targetXZ;
                satelliteTargetHeight = targetAlt;
            }
        }

        public void TeleportPlayerToGroundPosition(float targetX, float targetZ)
        {
            RefreshReferences();
            if (player == null)
            {
                SetAerialViewMode(AerialViewMode.GroundView);
                return;
            }

            float clampedX = Mathf.Clamp(targetX, minBoundsX + 6f, maxBoundsX - 6f);
            float clampedZ = Mathf.Clamp(targetZ, minBoundsZ + 6f, maxBoundsZ - 6f);

            // Raycast downward from high above to find surface height (excluding Ignore Raycast layer 2)
            float groundY = 0.24f;
            if (Physics.Raycast(new Vector3(clampedX, 90f, clampedZ), Vector3.down, out RaycastHit hit, 140f, ~(1 << 2)))
            {
                groundY = hit.point.y;

                // Safety check: if landing on a building roof (> 2.0m high), nudge south toward sidewalk/street
                if (groundY > 2.0f)
                {
                    if (Physics.Raycast(new Vector3(clampedX, 90f, 2.5f), Vector3.down, out RaycastHit sidewalkHit, 140f, ~(1 << 2)) &&
                        sidewalkHit.point.y <= 1.5f)
                    {
                        clampedZ = 2.5f;
                        groundY = sidewalkHit.point.y;
                        ProductHudController.Instance?.ShowToast("📍 Aterrizaje ajustado a la banqueta frente al edificio.");
                    }
                }
            }

            // Check if landing coordinate is outside Wing Spot while player was marked inside
            bool landedInsideWingSpot = (clampedX >= -14.0f && clampedX <= 8.5f && clampedZ >= 5.5f && clampedZ <= 18.5f);
            if (player.IsInsideWingSpot && !landedInsideWingSpot)
            {
                player.ExitRestaurant(false);
            }
            else if (!player.IsInsideWingSpot && landedInsideWingSpot)
            {
                // Land just in front of Wing Spot entrance on the sidewalk so we don't bypass schedule rules
                clampedX = -6.75f;
                clampedZ = 3.2f;
                groundY = 0.24f;
            }

            Quaternion arrivalRot = Quaternion.Euler(0f, currentMode == AerialViewMode.DroneFreeFlight ? droneYaw : satelliteYaw, 0f);
            player.TeleportTo(new Vector3(clampedX, groundY, clampedZ), arrivalRot);

            SetAerialViewMode(AerialViewMode.GroundView);
            ProductHudController.Instance?.ShowToast($"🚁 Aterrizaje en {ClassifyWorldZone(clampedX, clampedZ)} (X={clampedX:F1}, Z={clampedZ:F1})");
        }

        // =====================================================================
        // UI & HUD RENDERING (Called from ProductHudController.OnGUI)
        // =====================================================================
        public bool IsMouseOverAerialUI(Vector2 screenMousePos)
        {
            if (Screen.width <= 0 || Screen.height <= 0) return false;
            Vector2 guiMouse = new Vector2(screenMousePos.x, Screen.height - screenMousePos.y);

            if (currentMode == AerialViewMode.GroundView)
            {
                googleMapsLauncherRect = new Rect(15f, Screen.height - 190f, 122f, 134f);
                return googleMapsLauncherRect.Contains(guiMouse);
            }

            if (currentMode == AerialViewMode.DroneFreeFlight)
            {
                // Top telemetry & sector bar
                if (new Rect(Screen.width * 0.5f - 430f, 52f, 860f, 50f).Contains(guiMouse)) return true;
                // Bottom flight deck
                if (new Rect(Screen.width * 0.5f - 450f, Screen.height - 52f, 900f, 38f).Contains(guiMouse)) return true;
                return false;
            }

            if (currentMode == AerialViewMode.SatelliteTopDown)
            {
                // Top Omni-Bar
                if (new Rect(15f, 54f, 920f, 70f).Contains(guiMouse)) return true;
                // Bottom-Left Layer Switcher card
                if (new Rect(15f, Screen.height - 152f, 260f, 100f).Contains(guiMouse)) return true;
                // Bottom-Right Zoom, Compass & Teleport dock
                if (new Rect(Screen.width - 250f, Screen.height - 190f, 235f, 142f).Contains(guiMouse)) return true;
                return false;
            }

            return false;
        }

        public void DrawGoogleMapsLayerSwitcherCard()
        {
            if (currentMode != AerialViewMode.GroundView) return;

            float cardW = 122f;
            float cardH = 134f;
            float cardX = 15f;
            float cardY = Screen.height - cardH - 54f;
            googleMapsLauncherRect = new Rect(cardX, cardY, cardW, cardH);

            Color prevColor = GUI.color;

            // Glass / white border frame like Google Maps Satellite widget
            GUI.color = new Color(0.95f, 0.98f, 1f, 0.94f);
            GUI.DrawTexture(googleMapsLauncherRect, Texture2D.whiteTexture);

            Rect innerDark = new Rect(cardX + 3f, cardY + 3f, cardW - 6f, cardH - 6f);
            GUI.color = new Color(0.06f, 0.09f, 0.14f, 0.96f);
            GUI.DrawTexture(innerDark, Texture2D.whiteTexture);
            GUI.color = prevColor;

            // Live Overhead RenderTexture Preview inside the square
            Rect thumbRect = new Rect(cardX + 5f, cardY + 5f, cardW - 10f, 78f);
            if (miniSatellitePreviewRT != null)
            {
                GUI.DrawTexture(thumbRect, miniSatellitePreviewRT, ScaleMode.ScaleAndCrop, false);
            }

            // Player dot in center of live satellite thumbnail
            GUI.color = new Color(0.15f, 0.55f, 1f, 0.95f);
            GUI.DrawTexture(new Rect(thumbRect.center.x - 4f, thumbRect.center.y - 4f, 8f, 8f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            // Top badge inside thumbnail: "VISTA AÉREA"
            Rect badgeRect = new Rect(thumbRect.x + 3f, thumbRect.y + 3f, thumbRect.width - 6f, 16f);
            GUI.color = new Color(0.02f, 0.05f, 0.10f, 0.84f);
            GUI.DrawTexture(badgeRect, Texture2D.whiteTexture);
            GUI.color = prevColor;

            GUIStyle badgeStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 9,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.55f, 0.92f, 1f) }
            };
            GUI.Label(badgeRect, "🛰️ VISTA AÉREA", badgeStyle);

            // Clicking the thumbnail itself opens Google Maps Satellite View
            if (GUI.Button(thumbRect, GUIContent.none, GUIStyle.none))
            {
                SetAerialViewMode(AerialViewMode.SatelliteTopDown);
            }

            GUIStyle modeBtnStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = 10,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.95f, 0.98f, 1f) }
            };

            Rect satBtnRect = new Rect(cardX + 5f, cardY + 86f, cardW - 10f, 20f);
            GUI.color = new Color(0.18f, 0.58f, 0.96f, 0.95f);
            if (GUI.Button(satBtnRect, "🛰️ Satélite [G]", modeBtnStyle))
            {
                SetAerialViewMode(AerialViewMode.SatelliteTopDown);
            }

            Rect droneBtnRect = new Rect(cardX + 5f, cardY + 108f, cardW - 10f, 20f);
            GUI.color = new Color(0.16f, 0.78f, 0.58f, 0.95f);
            if (GUI.Button(droneBtnRect, "🚁 Dron 3D [V]", modeBtnStyle))
            {
                SetAerialViewMode(AerialViewMode.DroneFreeFlight);
            }
            GUI.color = prevColor;
        }

        public void DrawActiveAerialHUD()
        {
            if (currentMode == AerialViewMode.DroneFreeFlight)
            {
                DrawDroneFlightHUD();
            }
            else if (currentMode == AerialViewMode.SatelliteTopDown)
            {
                DrawSatelliteMapHUD();
            }
        }

        private void DrawDroneFlightHUD()
        {
            Color prevColor = GUI.color;

            // 1. Draw 3D World-Space Markers for Player & Gómez Morín / Rincones Landmarks
            if (droneShowWorldMarkers)
            {
                DrawAerialWorldProjectedMarkers(isSatelliteMode: false);
            }

            // 2. Top Telemetry Header Bar (DJI Mavic / Tactical Drone OSD)
            Rect topHudRect = new Rect(Screen.width * 0.5f - 430f, 52f, 860f, 48f);
            GUI.color = new Color(0.03f, 0.06f, 0.11f, 0.90f);
            GUI.DrawTexture(topHudRect, Texture2D.whiteTexture);
            GUI.color = new Color(0.15f, 0.88f, 0.98f, 0.95f);
            GUI.DrawTexture(new Rect(topHudRect.x, topHudRect.y, topHudRect.width, 2f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            float horizSpeed = new Vector2(droneVelocity.x, droneVelocity.z).magnitude;
            Vector3 playerPos = player != null ? player.transform.position : Vector3.zero;
            float distFromPlayer = Vector3.Distance(dronePosition, playerPos);
            bool isSport = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            bool isNadir90 = dronePitch >= 82f;

            GUIStyle telemetryStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 11,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.88f, 0.97f, 1f) }
            };

            string modeTag = isSport ? "⚡ MODO SPORT" : "🚁 MODO CINE";
            string gimbalTag = isNadir90
                ? "📐 GIMBAL: -89.5° (CENITAL CIELO→SUELO)"
                : $"📐 GIMBAL: -{dronePitch:F0}°";
            string zoomFactor = $"{(60f / Mathf.Max(20f, droneCurrentFov)):F1}x";
            string zoneName = ClassifyWorldZone(dronePosition.x, dronePosition.z);

            string telemetryLine =
                $"{modeTag}  |  📍 {zoneName} (X={dronePosition.x:F0}, Z={dronePosition.z:F0})  |  ALT: {dronePosition.y:F1}m  |  VEL: {horizSpeed:F1}m/s  |  DIST: {distFromPlayer:F0}m  |  {gimbalTag}  |  ZOOM: {zoomFactor}";
            GUI.Label(new Rect(topHudRect.x + 8f, topHudRect.y + 3f, topHudRect.width - 16f, 20f), telemetryLine, telemetryStyle);

            // Quick Sector Jump Buttons [1..6] inside top bar
            GUILayout.BeginArea(new Rect(topHudRect.x + 8f, topHudRect.y + 24f, topHudRect.width - 16f, 22f));
            GUILayout.BeginHorizontal();
            GUIStyle secBtn = new GUIStyle(GUI.skin.button) { fontSize = 9, fontStyle = FontStyle.Bold };
            if (GUILayout.Button("[1] Tía Lupe / Wing Spot", secBtn, GUILayout.Height(19f))) JumpToSector(1, true);
            if (GUILayout.Button("[2] Dollar 2 Go / Plaza", secBtn, GUILayout.Height(19f))) JumpToSector(2, true);
            if (GUILayout.Button("[3] HRC / CatZoo", secBtn, GUILayout.Height(19f))) JumpToSector(3, true);
            if (GUILayout.Button("[4] Corp. Arboleda", secBtn, GUILayout.Height(19f))) JumpToSector(4, true);
            if (GUILayout.Button("[5] Circuito Rincones", secBtn, GUILayout.Height(19f))) JumpToSector(5, true);
            if (GUILayout.Button("[6] Calle Rosaleda", secBtn, GUILayout.Height(19f))) JumpToSector(6, true);
            if (GUILayout.Button(droneShowWorldMarkers ? "🏷️ Pines: ON [H]" : "🏷️ Pines: OFF [H]", secBtn, GUILayout.Height(19f)))
            {
                droneShowWorldMarkers = !droneShowWorldMarkers;
            }
            GUILayout.EndHorizontal();
            GUILayout.EndArea();

            // 3. Center Gimbal Crosshair & Horizon Framing Brackets
            float cx = Screen.width * 0.5f;
            float cy = Screen.height * 0.5f;
            GUI.color = new Color(0.20f, 0.95f, 1f, 0.65f);
            GUI.DrawTexture(new Rect(cx - 24f, cy - 1f, 16f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx + 8f, cy - 1f, 16f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - 1f, cy - 24f, 2f, 16f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - 1f, cy + 8f, 2f, 16f), Texture2D.whiteTexture);

            float bw = 150f;
            float bh = 95f;
            GUI.DrawTexture(new Rect(cx - bw, cy - bh, 22f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - bw, cy - bh, 2f, 22f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx + bw - 22f, cy - bh, 22f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx + bw - 2f, cy - bh, 2f, 22f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - bw, cy + bh - 2f, 22f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - bw, cy + bh - 22f, 2f, 22f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx + bw - 22f, cy + bh - 2f, 22f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx + bw - 2f, cy + bh - 22f, 2f, 22f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            // 4. Bottom Drone Flight Control Deck
            Rect bottomDeck = new Rect(Screen.width * 0.5f - 450f, Screen.height - 46f, 900f, 34f);
            GUI.color = new Color(0.03f, 0.06f, 0.11f, 0.92f);
            GUI.DrawTexture(bottomDeck, Texture2D.whiteTexture);
            GUI.color = prevColor;

            GUIStyle deckTextStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 11,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.92f, 0.97f, 1f) }
            };

            string chaseTag = droneThirdPersonChaseView
                ? "[F] Vista: 3ra Persona (Cuadricóptero)"
                : "[F] Vista: 1ra Persona (Gimbal FPV)";
            string cursorTag = isDroneCursorLocked ? "[Tab] Liberar Cursor" : "[Tab] Fijar Cursor";

            string controlsHint =
                $"WASD: Volar | Espacio/E: Subir | Q/Ctrl: Bajar | Shift: Turbo | [R]: Mirar 90° | {chaseTag} | {cursorTag} | [T]: Aterrizar Aquí | [G]: Satélite | [V/Esc]: Salir";

            GUI.Label(bottomDeck, controlsHint, deckTextStyle);
        }

        private void DrawSatelliteMapHUD()
        {
            Color prevColor = GUI.color;

            // 1. Draw Hybrid Map Pins & Street/Infrastructure Labels over the 3D World
            if (satelliteShowHybridLabels)
            {
                DrawAerialWorldProjectedMarkers(isSatelliteMode: true);
            }

            // 2. Top Google Maps Search / Coordinates Omni-Bar + Sector Pills + Live Cursor Inspector
            Rect omniBar = new Rect(15f, 54f, 920f, 66f);
            GUI.color = new Color(0.06f, 0.09f, 0.14f, 0.95f);
            GUI.DrawTexture(omniBar, Texture2D.whiteTexture);
            GUI.color = new Color(0.25f, 0.65f, 1f, 0.95f);
            GUI.DrawTexture(new Rect(omniBar.x, omniBar.y, 4f, omniBar.height), Texture2D.whiteTexture);
            GUI.color = prevColor;

            GUIStyle searchTitleStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 12,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleLeft,
                normal = { textColor = Color.white }
            };

            string tiltDesc = satellite3DObliqueTilt ? "Relieve 3D Oblicuo (58°)" : "Cenital 90° (Cielo → Suelo)";
            string centerZone = ClassifyWorldZone(satelliteFocusXZ.x, satelliteFocusXZ.y);
            string omniTitle =
                $"🛰️ Vista Satelital — {centerZone}  |  Centro: X={satelliteFocusXZ.x:F1}m, Z={satelliteFocusXZ.y:F1}m  |  Altitud: {satelliteHeight:F0}m  |  {tiltDesc}";

            GUI.Label(new Rect(omniBar.x + 12f, omniBar.y + 3f, omniBar.width - 20f, 20f), omniTitle, searchTitleStyle);

            // Live Ground Cursor Coordinate Inspector Line (Improvement #1)
            GUIStyle cursorInspectorStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 11,
                fontStyle = FontStyle.Normal,
                alignment = TextAnchor.MiddleLeft,
                normal = { textColor = new Color(0.55f, 0.95f, 0.78f) }
            };

            string cursorLine = hasCursorGroundHit
                ? $"🎯 Cursor en Terreno: X = {cursorGroundHitPoint.x:F2} m,  Z = {cursorGroundHitPoint.z:F2} m,  Y = {cursorGroundHitPoint.y:F2} m   •   Zona: {cursorGroundZoneLabel}   (Doble clic: Centrar | Shift+T: Aterrizar en cursor)"
                : "🎯 Mueve el cursor sobre el terreno para inspeccionar coordenadas exactas (X, Z) en metros...";
            GUI.Label(new Rect(omniBar.x + 12f, omniBar.y + 22f, omniBar.width - 20f, 18f), cursorLine, cursorInspectorStyle);

            // Sector Jump Pills inside Omni-Bar row 3
            GUILayout.BeginArea(new Rect(omniBar.x + 10f, omniBar.y + 42f, omniBar.width - 20f, 20f));
            GUILayout.BeginHorizontal();
            GUIStyle pillStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = 10,
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.92f, 0.97f, 1f) }
            };

            if (GUILayout.Button("📍 [1] Tía Lupe / Wing Spot", pillStyle, GUILayout.Height(19f))) JumpToSector(1, false);
            if (GUILayout.Button("📍 [2] Dollar 2 Go", pillStyle, GUILayout.Height(19f))) JumpToSector(2, false);
            if (GUILayout.Button("📍 [3] HRC / CatZoo", pillStyle, GUILayout.Height(19f))) JumpToSector(3, false);
            if (GUILayout.Button("📍 [4] Corp. Arboleda", pillStyle, GUILayout.Height(19f))) JumpToSector(4, false);
            if (GUILayout.Button("🔄 [5] Circuito Rincones", pillStyle, GUILayout.Height(19f))) JumpToSector(5, false);
            if (GUILayout.Button("🗺️ [6] Manzana Completa", pillStyle, GUILayout.Height(19f))) JumpToSector(6, false);
            if (GUILayout.Button("🧍 Ir a Jugador", pillStyle, GUILayout.Height(19f)))
            {
                if (player != null)
                {
                    satelliteTargetFocusXZ = new Vector2(player.transform.position.x, player.transform.position.z);
                    satelliteTargetHeight = 46f;
                }
            }
            GUILayout.EndHorizontal();
            GUILayout.EndArea();

            // 3. Subtle Center Target Reticle (shows exact ground coordinates for [T] Teleport)
            float cx = Screen.width * 0.5f;
            float cy = Screen.height * 0.5f;
            GUI.color = new Color(1f, 1f, 1f, 0.55f);
            GUI.DrawTexture(new Rect(cx - 12f, cy - 1f, 24f, 2f), Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(cx - 1f, cy - 12f, 2f, 24f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            // 4. Bottom-Left Google Maps Layer Switcher Card (Return to Street View / Switch to 3D Drone)
            Rect layerCard = new Rect(15f, Screen.height - 144f, 256f, 94f);
            GUI.color = new Color(0.06f, 0.09f, 0.14f, 0.95f);
            GUI.DrawTexture(layerCard, Texture2D.whiteTexture);
            GUI.color = new Color(0.25f, 0.65f, 1f, 0.95f);
            GUI.DrawTexture(new Rect(layerCard.x, layerCard.y, layerCard.width, 2f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            GUILayout.BeginArea(new Rect(layerCard.x + 10f, layerCard.y + 8f, layerCard.width - 20f, layerCard.height - 14f));
            GUIStyle cardHeader = new GUIStyle(GUI.skin.label)
            {
                fontSize = 11,
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.65f, 0.90f, 1f) }
            };
            GUILayout.Label("🗺️ CAPAS Y MODO DE CÁMARA", cardHeader);

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("🚶 Vista Calle [G/Esc]", GUILayout.Height(26f)))
            {
                SetAerialViewMode(AerialViewMode.GroundView);
            }
            if (GUILayout.Button("🚁 Piloto Dron [V]", GUILayout.Height(26f)))
            {
                SetAerialViewMode(AerialViewMode.DroneFreeFlight);
            }
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            string labelsBtn = satelliteShowHybridLabels ? "🏷️ Etiquetas: ON [H]" : "🏷️ Etiquetas: OFF [H]";
            if (GUILayout.Button(labelsBtn, GUILayout.Height(24f)))
            {
                satelliteShowHybridLabels = !satelliteShowHybridLabels;
            }
            string tiltBtn = satellite3DObliqueTilt ? "📐 [R] Ver 90° Cenital" : "🧊 [R] Vista 3D (58°)";
            if (GUILayout.Button(tiltBtn, GUILayout.Height(24f)))
            {
                satellite3DObliqueTilt = !satellite3DObliqueTilt;
            }
            GUILayout.EndHorizontal();
            GUILayout.EndArea();

            // 5. Bottom-Right Google Maps Zoom [+]/[-], Compass [N], and Teleport Player [T] Controls
            Rect rightDock = new Rect(Screen.width - 246f, Screen.height - 186f, 230f, 138f);
            GUI.color = new Color(0.06f, 0.09f, 0.14f, 0.95f);
            GUI.DrawTexture(rightDock, Texture2D.whiteTexture);
            GUI.color = new Color(0.25f, 0.65f, 1f, 0.95f);
            GUI.DrawTexture(new Rect(rightDock.x, rightDock.y, rightDock.width, 2f), Texture2D.whiteTexture);
            GUI.color = prevColor;

            GUILayout.BeginArea(new Rect(rightDock.x + 10f, rightDock.y + 8f, rightDock.width - 20f, rightDock.height - 14f));
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("➕ Acercar Zoom", GUILayout.Height(26f)))
            {
                satelliteTargetHeight = Mathf.Clamp(satelliteTargetHeight * 0.75f, minSatelliteAltitude, maxSatelliteAltitude);
            }
            if (GUILayout.Button("➖ Alejar Zoom", GUILayout.Height(26f)))
            {
                satelliteTargetHeight = Mathf.Clamp(satelliteTargetHeight * 1.32f, minSatelliteAltitude, maxSatelliteAltitude);
            }
            GUILayout.EndHorizontal();

            GUILayout.Space(4f);
            if (GUILayout.Button($"🧭 Brújula: {satelliteYaw:F0}° (Pulsa [N] Norte)", GUILayout.Height(24f)))
            {
                satelliteTargetYaw = 0f;
            }

            GUILayout.Space(4f);
            GUIStyle teleportBtnStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = 11,
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.55f, 1f, 0.68f) }
            };
            if (GUILayout.Button("⚡ [T] Teletransportar Jugador Aquí", teleportBtnStyle, GUILayout.Height(28f)))
            {
                TeleportPlayerToGroundPosition(satelliteFocusXZ.x, satelliteFocusXZ.y);
            }

            GUIStyle dragHintStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 9,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(0.75f, 0.84f, 0.95f) }
            };
            GUILayout.Label("🖱️ Arrastra: Mover • Rueda: Zoom • Clic en Pin: Ir", dragHintStyle);
            GUILayout.EndArea();
        }

        private void DrawAerialWorldProjectedMarkers(bool isSatelliteMode)
        {
            if (aerialCamera == null) return;
            Color prevColor = GUI.color;

            // 1. Always highlight Player's Ground Position ("TÚ ESTÁS AQUÍ")
            if (player != null)
            {
                if (DrawSingleInteractiveWorldPin(
                    player.transform.position + new Vector3(0f, 2.2f, 0f),
                    "🧍 TÚ (JUGADOR)",
                    new Color(0.12f, 0.58f, 1f, 0.96f),
                    Color.white,
                    126f))
                {
                    FocusAerialOnPoint(player.transform.position, 20f, 44f, isSatelliteMode);
                }
            }

            // 2. Highlight Elena Morales NPC if present
            if (elenaNpc != null)
            {
                if (DrawSingleInteractiveWorldPin(
                    elenaNpc.transform.position + new Vector3(0f, 2.4f, 0f),
                    "👤 Elena Morales (Wing Spot)",
                    new Color(0.12f, 0.16f, 0.22f, 0.88f),
                    new Color(0.98f, 0.88f, 0.52f),
                    174f))
                {
                    FocusAerialOnPoint(elenaNpc.transform.position, 18f, 38f, isSatelliteMode);
                }
            }

            // 3. Scene Landmarks (Gómez Morín + Rincones de Santa Rita)
            if (sceneLandmarks != null)
            {
                for (int i = 0; i < sceneLandmarks.Count; i++)
                {
                    var lm = sceneLandmarks[i];
                    if (DrawSingleInteractiveWorldPin(lm.position, lm.label, lm.bgColor, lm.textColor, lm.width))
                    {
                        FocusAerialOnPoint(lm.position, lm.focusAltitudeDrone, lm.focusAltitudeSat, isSatelliteMode);
                    }
                }
            }

            GUI.color = prevColor;
        }

        private void FocusAerialOnPoint(Vector3 worldPos, float droneAlt, float satAlt, bool isSatelliteMode)
        {
            if (isSatelliteMode)
            {
                satelliteTargetFocusXZ = new Vector2(worldPos.x, worldPos.z);
                satelliteTargetHeight = Mathf.Min(satelliteTargetHeight, satAlt);
            }
            else
            {
                droneAutoTargetPosition = new Vector3(worldPos.x, droneAlt, worldPos.z - 12f);
                dronePitch = 38f;
            }
        }

        private bool DrawSingleInteractiveWorldPin(Vector3 worldPos, string label, Color bgColor, Color textColor, float width)
        {
            if (aerialCamera == null) return false;
            Vector3 sp = aerialCamera.WorldToScreenPoint(worldPos);
            if (sp.z <= 0.5f) return false;

            float guiX = sp.x;
            float guiY = Screen.height - sp.y;

            // Keep clear of top and bottom HUD bars
            if (guiX < -60f || guiX > Screen.width + 60f || guiY < 118f || guiY > Screen.height - 62f) return false;

            Rect pillRect = new Rect(guiX - width * 0.5f, guiY - 11f, width, 21f);
            Color prev = GUI.color;
            GUI.color = bgColor;
            GUI.DrawTexture(pillRect, Texture2D.whiteTexture);
            GUI.color = new Color(1f, 1f, 1f, 0.25f);
            GUI.DrawTexture(new Rect(pillRect.x, pillRect.y, pillRect.width, 1f), Texture2D.whiteTexture);
            GUI.color = prev;

            GUIStyle pinStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 10,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = textColor }
            };

            bool canClick = (currentMode == AerialViewMode.SatelliteTopDown) || !isDroneCursorLocked;
            if (canClick)
            {
                if (GUI.Button(pillRect, label, pinStyle))
                {
                    isSatelliteDragging = false;
                    return true;
                }
            }
            else
            {
                GUI.Label(pillRect, label, pinStyle);
            }

            return false;
        }

        private void CleanupAerialCameraResources()
        {
            if (aerialCamera != null)
            {
                Destroy(aerialCamera.gameObject);
                aerialCamera = null;
            }
            if (miniSatellitePreviewRT != null)
            {
                miniSatellitePreviewRT.Release();
                Destroy(miniSatellitePreviewRT);
                miniSatellitePreviewRT = null;
            }
            if (droneVisualModel != null)
            {
                Destroy(droneVisualModel);
                droneVisualModel = null;
            }
        }
    }
}
