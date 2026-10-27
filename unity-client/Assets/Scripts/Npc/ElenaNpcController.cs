using System;
using UnityEngine;
using UnityEngine.AI;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Character;

namespace MyVirtualCommunity.Npc
{
    /// <summary>
    /// ElenaNpcController manages the 3D presentation, animation states, and NavMesh navigation
    /// for Elena Morales (agent:elena-npc), the persistent attendant of Wing Spot.
    /// 
    /// INVARIANT (Sections 25 & 26):
    /// Elena's visual reactions are strictly driven by authoritative World Core events/states.
    /// Unity animation or presentation navigation never dictates world truth.
    /// </summary>
    public class ElenaNpcController : MonoBehaviour
    {
        [Header("Attendant Stations")]
        [SerializeField] private Vector3 counterStation = new Vector3(-10.90f, 0.44f, 12.85f);
        [SerializeField] private Vector3 customerServiceStation = new Vector3(-10.90f, 0.44f, 12.85f);

        [Header("Presentation Parameters")]
        [SerializeField] private float lookAtSpeed = 4.0f;
        [SerializeField] private float detectionRadius = 6.0f;

        [Header("Visual Feedback References")]
        [SerializeField] private Renderer characterRenderer;
        [SerializeField] private Color onDutyUniformColor = new Color(0.85f, 0.20f, 0.12f); // Wing Spot red apron
        [SerializeField] private Color offDutyColor = new Color(0.25f, 0.45f, 0.75f); // Casual blue

        private NavMeshAgent navAgent;
        private Transform playerTransform;
        private Transform billboardTransform;
        private BobbleheadAnimator bobbleheadAnimator;
        private bool isAttendantOnDuty = true;
        private string currentInteractionState = "none";
        private bool isInteractingWithPlayer = false;

        public event Action<string, string> OnDialogueTriggered; // (Speaker, Text)

        private void Awake()
        {
            // Firmly anchor stations on the step behind the counter (Y = 0.44m, Z = 12.85m)
            counterStation = new Vector3(-10.90f, 0.44f, 12.85f);
            customerServiceStation = new Vector3(-10.90f, 0.44f, 12.85f);
            transform.position = counterStation;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f);

            navAgent = GetComponent<NavMeshAgent>();
            if (navAgent != null && !navAgent.isOnNavMesh)
            {
                Destroy(navAgent);
                navAgent = null;
            }
            BuildAttendantAvatar();
        }

        private void Start()
        {
            counterStation = new Vector3(-10.90f, 0.44f, 12.85f);
            customerServiceStation = new Vector3(-10.90f, 0.44f, 12.85f);
            transform.position = counterStation;
            transform.rotation = Quaternion.Euler(0f, 180f, 0f); // Face front towards entrance

            var player = FindFirstObjectByType<Player.PlayerController>();
            if (player != null)
            {
                playerTransform = player.transform;
            }

            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnAttendantStateChanged += HandleAttendantStateChanged;
                WorldCoreClient.Instance.OnAiCycleExecuted += HandleAiCycleExecuted;
            }

            UpdateVisualAppearance();
        }

        private void OnDestroy()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnAttendantStateChanged -= HandleAttendantStateChanged;
                WorldCoreClient.Instance.OnAiCycleExecuted -= HandleAiCycleExecuted;
            }
        }

        private void Update()
        {
            HandlePresentationBehavior();
        }

        public void UpdateVisibility(Vector3 camPos)
        {
            if (billboardTransform != null)
            {
                // Nameplate is strictly active ONLY when viewer is inside Wing Spot restaurant
                // (Z >= 4.8m and X between -19.0m and -2.5m) and within greeting distance (<= 10m).
                // When viewer is outside on the boulevard or far away, keep it culled.
                bool isViewerInside = (camPos.z >= 4.8f) && (camPos.x >= -19.0f) && (camPos.x <= -2.5f);
                float distToCam = Vector3.Distance(transform.position, camPos);
                billboardTransform.gameObject.SetActive(isViewerInside && (distToCam <= 10.0f));
            }
        }

        private void LateUpdate()
        {
            // Billboard overhead nameplate continuously faces main camera
            if (billboardTransform != null)
            {
                Camera cam = Camera.main;
                if (cam == null) cam = FindFirstObjectByType<Camera>();
                if (cam != null)
                {
                    billboardTransform.rotation = cam.transform.rotation;
                    UpdateVisibility(cam.transform.position);
                }
            }

            // Strictly anchor Elena solidly on the step behind the counter; prevent mounting on the counter
            if (transform.position.y > 0.45f || transform.position.z < 12.60f)
            {
                transform.position = isInteractingWithPlayer ? customerServiceStation : counterStation;
            }
        }

        /// <summary>
        /// Procedurally constructs a stylized Bobblehead character avatar for Elena Morales.
        /// </summary>
        public void BuildAttendantAvatar()
        {
            gameObject.layer = 2; // Layer 2 = Ignore Raycast

            // Remove legacy avatar hierarchy if present
            var oldAvatar = transform.Find("Avatar_Model");
            if (oldAvatar != null)
            {
                if (Application.isPlaying) Destroy(oldAvatar.gameObject);
                else DestroyImmediate(oldAvatar.gameObject);
            }

            // Construct stylized Bobblehead Character avatar with Elena configuration
            var bobblehead = GetComponent<BobbleheadCharacter>();
            if (bobblehead == null) bobblehead = gameObject.AddComponent<BobbleheadCharacter>();
            bobblehead.Initialize(BobbleheadConfig.CreateElenaConfig());

            bobbleheadAnimator = GetComponent<BobbleheadAnimator>();
            if (bobbleheadAnimator == null) bobbleheadAnimator = gameObject.AddComponent<BobbleheadAnimator>();
            bobbleheadAnimator.SetAttendantMode(true);
            bobbleheadAnimator.CacheInitialPoses();

            if (bobblehead.Torso != null)
            {
                characterRenderer = bobblehead.Torso.GetComponent<Renderer>();
            }

            // Floating 3D Overhead Billboard Nameplate
            Transform existingBillboard = transform.Find("Billboard_Nameplate");
            if (existingBillboard == null)
            {
                GameObject billboard = new GameObject("Billboard_Nameplate");
                billboard.transform.SetParent(transform, false);
                billboard.transform.localPosition = new Vector3(0f, 2.30f, 0f);
                billboard.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                billboardTransform = billboard.transform;

                TextMesh tm = billboard.AddComponent<TextMesh>();
                tm.text = "<b>Elena Morales</b>\n<size=18><color=#FFDD44>★ Wing Spot Attendant</color></size>";
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

        private void CreateArm(Transform parent, Vector3 pos, Vector3 rot)
        {
            GameObject arm = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            arm.name = "Arm";
            arm.transform.SetParent(parent);
            arm.transform.localPosition = pos;
            arm.transform.localEulerAngles = rot;
            arm.transform.localScale = new Vector3(0.12f, 0.25f, 0.12f);
            SetColor(arm, onDutyUniformColor, 0.3f);
            RemoveCollider(arm);
        }

        private void RemoveCollider(GameObject go)
        {
            var col = go.GetComponent<Collider>();
            if (col != null) Destroy(col);
        }

        private void SetColor(GameObject go, Color color, float smoothness = 0.3f)
        {
            Renderer rend = go.GetComponent<Renderer>();
            if (rend != null && rend.material != null)
            {
                Material mat = rend.material;
                if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
                if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
                if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
                if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
            }
        }

        private void HandlePresentationBehavior()
        {
            if (playerTransform == null) return;

            float distanceToPlayer = Vector3.Distance(transform.position, playerTransform.position);

            // Smooth head/body look-at when customer is within greeting distance
            if (distanceToPlayer <= detectionRadius && isAttendantOnDuty)
            {
                Vector3 targetDir = playerTransform.position - transform.position;
                targetDir.y = 0f; // Keep level horizontally

                if (targetDir.sqrMagnitude > 0.04f)
                {
                    Vector3 norm = targetDir.normalized;
                    if (norm.sqrMagnitude > 0.5f)
                    {
                        Quaternion targetRot = Quaternion.LookRotation(norm, Vector3.up);
                        transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, Time.deltaTime * lookAtSpeed);
                    }
                }
            }
        }

        /// <summary>
        /// Reacts to authoritative attendant state updates from World Core.
        /// </summary>
        public void HandleAttendantStateChanged(AttendantInfo attendant)
        {
            if (attendant == null) return;

            isAttendantOnDuty = attendant.isPresent;
            currentInteractionState = attendant.interactionState ?? "none";
            UpdateVisualAppearance();

            if (currentInteractionState == "service-accepted")
            {
                OnAuthoritativeServiceAccepted();
            }
            else
            {
                // Return to standard counter station
                if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh)
                {
                    navAgent.SetDestination(counterStation);
                }
                else
                {
                    transform.position = counterStation;
                }
                isInteractingWithPlayer = false;
            }
        }

        /// <summary>
        /// Reacts to authoritative AI cycle execution.
        /// </summary>
        public void HandleAiCycleExecuted(NpcAiCycleData cycleData)
        {
            if (cycleData == null || cycleData.proposal == null) return;

            if (cycleData.proposal.actionType == "offer_service" || cycleData.proposal.actionType == "acknowledge_player")
            {
                OnDialogueTriggered?.Invoke("Elena Morales", "¡Hola! Welcome to Wing Spot Gómez Morín. How can I help you today?");
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

        public void TriggerGreeting()
        {
            isInteractingWithPlayer = true;
            transform.position = customerServiceStation;
            TriggerDialogue("Elena Morales", "¡Hola! Bienvenid@ a Wing Spot Gómez Morín. Soy Elena Morales, ¿en qué te puedo servir hoy? Presiona [M] para ver nuestro menú completo.");
        }

        private void OnAuthoritativeServiceAccepted()
        {
            isInteractingWithPlayer = true;

            // Step smoothly forward toward customer counter station
            if (navAgent != null && navAgent.isActiveAndEnabled && navAgent.isOnNavMesh)
            {
                navAgent.SetDestination(customerServiceStation);
            }
            else
            {
                transform.position = customerServiceStation;
            }

            // Trigger customer service dialogue
            TriggerDialogue("Elena Morales", "¡Hola! Bienvenid@ a Wing Spot Gómez Morín. ¿En qué te puedo servir hoy? Nuestras alitas están listas y recién preparadas.");
            Debug.Log("[ElenaNpcController] Elena Morales transitioned to active service stance at customer counter");
        }

        private void UpdateVisualAppearance()
        {
            if (characterRenderer == null)
            {
                characterRenderer = GetComponentInChildren<Renderer>();
            }
            if (characterRenderer != null && characterRenderer.material != null)
            {
                Color col = isAttendantOnDuty ? onDutyUniformColor : offDutyColor;
                if (characterRenderer.material.HasProperty("_BaseColor")) characterRenderer.material.SetColor("_BaseColor", col);
                if (characterRenderer.material.HasProperty("_Color")) characterRenderer.material.SetColor("_Color", col);
            }
        }

        public bool IsOnDuty => isAttendantOnDuty;
        public string InteractionState => currentInteractionState;
        public bool IsInteractingWithPlayer => isInteractingWithPlayer;
    }
}
