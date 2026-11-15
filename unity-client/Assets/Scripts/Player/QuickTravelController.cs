using System;
using System.Collections;
using UnityEngine;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.UI;

namespace MyVirtualCommunity.Player
{
    /// <summary>
    /// QuickTravelController manages configurable teleportation between world locations:
    /// - Authoritative World Core schedule and access validation.
    /// - Clean input locking during travel.
    /// - Grounded and oriented placement at arrival.
    /// - Multi-stage phase-shift presentation effect (energy ripple + alpha shimmer).
    /// </summary>
    public class QuickTravelController : MonoBehaviour
    {
        public static QuickTravelController Instance { get; private set; }

        [Header("Configuration")]
        [SerializeField] private QuickTravelConfig config;

        [Header("Presentation State")]
        [SerializeField] private bool isTeleporting = false;
        [SerializeField] private float teleportAlpha = 0f;
        [SerializeField] private string currentTargetName = "";

        public QuickTravelConfig Config => config;
        public bool IsTeleporting => isTeleporting;
        public float TeleportAlpha => teleportAlpha;
        public string CurrentTargetName => currentTargetName;

        public event Action<QuickTravelDestination> OnTravelStarted;
        public event Action<QuickTravelDestination, bool> OnTravelCompleted;

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

            if (config == null)
            {
                config = QuickTravelConfig.CreateDefault();
            }
        }

        /// <summary>
        /// Initiates quick travel to the specified destination slot.
        /// </summary>
        public void RequestQuickTravel(QuickTravelDestination dest)
        {
            if (isTeleporting) return;

            if (dest == null || !dest.isEnabled)
            {
                ProductHudController.Instance?.ShowToast($"El destino '{dest?.displayName ?? "Desconocido"}' aún no está habilitado.");
                return;
            }

            var player = FindFirstObjectByType<PlayerController>();
            if (player == null) return;

            // Check if player is already inside Wing Spot
            if (dest.targetPlaceId == "restaurant:wing-spot" && player.IsInsideWingSpot)
            {
                ProductHudController.Instance?.ShowToast($"Ya te encuentras dentro de {dest.displayName}.");
                return;
            }

            StartCoroutine(ExecuteQuickTravelRoutine(dest, player));
        }

        private IEnumerator ExecuteQuickTravelRoutine(QuickTravelDestination dest, PlayerController player)
        {
            isTeleporting = true;
            currentTargetName = dest.displayName;
            player.IsInputLocked = true;
            OnTravelStarted?.Invoke(dest);

            // Close any open HUD modals
            ProductHudController.Instance?.CloseMenuModal();

            // 1. Authoritative World Core Validation
            bool canProceed = true;
            string rejectionMessage = "";

            if (WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                if (dest.targetPlaceId == "restaurant:wing-spot")
                {
                    bool commandFinished = false;
                    CommandResponse serverRes = null;

                    string payload = "{\"restaurantId\":\"restaurant:wing-spot\"}";
                    StartCoroutine(WorldCoreClient.Instance.SendCommand("enterRestaurant", payload, (res) =>
                    {
                        serverRes = res;
                        commandFinished = true;
                    }));

                    // Wait for server validation
                    float timeout = 4.0f;
                    while (!commandFinished && timeout > 0f)
                    {
                        timeout -= Time.deltaTime;
                        yield return null;
                    }

                    if (serverRes != null && serverRes.success)
                    {
                        canProceed = true;
                    }
                    else if (serverRes != null && serverRes.code == "admission-cutoff-reached")
                    {
                        canProceed = false;
                        rejectionMessage = $"⚠️ {dest.displayName} está por cerrar y ya no acepta nuevos ingresos (Cierre: 18:00).";
                    }
                    else if (serverRes != null && serverRes.code == "restaurant-closed")
                    {
                        canProceed = false;
                        rejectionMessage = $"⚠️ {dest.displayName} está cerrado en este horario (Horario: 09:00 - 18:00).";
                    }
                    else if (serverRes != null && serverRes.code == "already-inside")
                    {
                        canProceed = false;
                        rejectionMessage = $"Ya te encuentras dentro de {dest.displayName}.";
                    }
                    else if (serverRes != null && (serverRes.code == "network-error" || serverRes.code == "domain-error"))
                    {
                        // In local fallback or presentation mode, evaluate business schedule locally
                        if (!BusinessScheduleRegistry.CanAdmitCustomer(dest.targetPlaceId, DateTime.UtcNow, out string localReason))
                        {
                            canProceed = false;
                            rejectionMessage = $"⚠️ {localReason}";
                        }
                        else
                        {
                            canProceed = true;
                        }
                    }
                    else
                    {
                        canProceed = false;
                        rejectionMessage = $"⚠️ Teletransporte no disponible: {serverRes?.message ?? "Servicio no disponible"}";
                    }
                }
            }
            else
            {
                // Standalone presentation mode: evaluate business schedule locally
                if (!BusinessScheduleRegistry.CanAdmitCustomer(dest.targetPlaceId, DateTime.UtcNow, out string localReason))
                {
                    canProceed = false;
                    rejectionMessage = $"⚠️ {localReason}";
                }
                else
                {
                    canProceed = true;
                }
            }

            // If authoritative validation rejected the transition, abort immediately
            if (!canProceed)
            {
                player.IsInputLocked = false;
                isTeleporting = false;
                teleportAlpha = 0f;
                ProductHudController.Instance?.ShowToast(rejectionMessage);
                OnTravelCompleted?.Invoke(dest, false);
                yield break;
            }

            // 2. Phase-Shift Out Sequence (0.35s)
            Vector3 departurePos = player.transform.position;
            SpawnEnergyRipple(departurePos, new Color(0.2f, 0.85f, 1.0f));

            float phaseOutDuration = 0.35f;
            float elapsed = 0f;
            while (elapsed < phaseOutDuration)
            {
                elapsed += Time.deltaTime;
                teleportAlpha = Mathf.Clamp01(elapsed / phaseOutDuration);
                yield return null;
            }
            teleportAlpha = 1.0f;

            // 3. Physical Placement & Safe Grounding
            Vector3 targetPos = dest.arrivalPosition;
            if (Physics.Raycast(dest.arrivalPosition + Vector3.up * 2.0f, Vector3.down, out RaycastHit groundHit, 5.0f, ~(1 << 2)))
            {
                targetPos = new Vector3(dest.arrivalPosition.x, groundHit.point.y, dest.arrivalPosition.z);
            }

            Quaternion targetRot = Quaternion.Euler(dest.arrivalRotation);
            player.TeleportTo(targetPos, targetRot);

            if (dest.targetPlaceId == "restaurant:wing-spot")
            {
                player.IsInsideWingSpot = true;
            }

            // Brief pause at midpoint to allow camera and geometry to stabilize
            yield return new WaitForSeconds(0.08f);

            // 4. Phase-Shift In Sequence (0.42s)
            SpawnEnergyRipple(targetPos, new Color(0.35f, 1.0f, 0.65f));

            float phaseInDuration = 0.42f;
            elapsed = 0f;
            while (elapsed < phaseInDuration)
            {
                elapsed += Time.deltaTime;
                teleportAlpha = Mathf.Clamp01(1.0f - (elapsed / phaseInDuration));
                yield return null;
            }
            teleportAlpha = 0f;

            // 5. Completion & Cleanup
            player.IsInputLocked = false;
            isTeleporting = false;

            // Trigger NPC cognition cycle for Elena when entering Wing Spot
            if (dest.targetPlaceId == "restaurant:wing-spot" && WorldCoreClient.Instance != null && WorldCoreClient.Instance.IsConnected)
            {
                StartCoroutine(WorldCoreClient.Instance.TriggerNpcAiCycle("agent:elena-npc", null));
            }

            ProductHudController.Instance?.ShowToast($"✨ Has llegado a {dest.displayName}.");
            OnTravelCompleted?.Invoke(dest, true);
        }

        /// <summary>
        /// Spawns a procedural expanding energy ripple disc at the player's feet.
        /// </summary>
        private void SpawnEnergyRipple(Vector3 position, Color tint)
        {
            GameObject ripple = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            ripple.name = "QuickTravel_EnergyRipple";
            ripple.transform.position = new Vector3(position.x, position.y + 0.02f, position.z);
            ripple.transform.localScale = new Vector3(0.4f, 0.01f, 0.4f);

            // Remove collider so it never obstructs player movement
            var col = ripple.GetComponent<Collider>();
            if (col != null) Destroy(col);

            var mr = ripple.GetComponent<MeshRenderer>();
            if (mr != null)
            {
                var mat = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
                mat.color = new Color(tint.r, tint.g, tint.b, 0.75f);
                mr.material = mat;
            }

            StartCoroutine(AnimateRippleRoutine(ripple, tint));
        }

        private IEnumerator AnimateRippleRoutine(GameObject ripple, Color baseColor)
        {
            if (ripple == null) yield break;

            float duration = 0.45f;
            float elapsed = 0f;
            Vector3 initialScale = new Vector3(0.4f, 0.01f, 0.4f);
            Vector3 targetScale = new Vector3(2.6f, 0.01f, 2.6f);
            var mr = ripple.GetComponent<MeshRenderer>();

            while (elapsed < duration && ripple != null)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                ripple.transform.localScale = Vector3.Lerp(initialScale, targetScale, t);

                if (mr != null && mr.material != null)
                {
                    Color c = baseColor;
                    c.a = Mathf.Lerp(0.75f, 0f, t);
                    mr.material.color = c;
                }
                yield return null;
            }

            if (ripple != null)
            {
                Destroy(ripple);
            }
        }
    }
}
