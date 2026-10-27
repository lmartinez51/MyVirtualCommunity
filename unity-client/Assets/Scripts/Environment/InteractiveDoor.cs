using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using MyVirtualCommunity.Core;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Explicit lifecycle states for production door components.
    /// </summary>
    public enum DoorState
    {
        Closed,
        Opening,
        Open,
        Closing
    }

    /// <summary>
    /// Reusable, production-oriented interactive door component.
    /// Synchronizes physical collision geometry with visual mesh animation around a configurable hinge pivot.
    /// Implements anti-pinch obstruction detection to safely halt or reverse closing if a player or NPC is present.
    /// </summary>
    public class InteractiveDoor : MonoBehaviour
    {
        [Header("Door Components")]
        [Tooltip("The pivot transform that rotates around the hinge axis.")]
        [SerializeField] private Transform hingePivot;

        [Tooltip("The moving door leaf hierarchy containing renderers and detail meshes.")]
        [SerializeField] private Transform doorLeaf;

        [Tooltip("The solid physical collider representing the door leaf.")]
        [SerializeField] private Collider doorCollider;

        [Tooltip("Optional reference point for player interaction proximity checks. If null, hingePivot is used.")]
        [SerializeField] private Transform interactionAnchor;

        [Header("Rotation Settings")]
        [Tooltip("Base local euler angles corresponding to the fully closed state.")]
        [SerializeField] private Vector3 closedEulerAngles = Vector3.zero;

        [Tooltip("Target rotation angle in degrees around the rotation axis when fully open.")]
        [SerializeField] private float openAngle = 90f;

        [Tooltip("Local axis around which the door rotates.")]
        [SerializeField] private Vector3 rotationAxis = Vector3.up;

        [Tooltip("Duration in seconds for the complete opening or closing sweep.")]
        [SerializeField] private float rotationDuration = 0.85f;

        [Header("Interaction Configuration")]
        [Tooltip("Friendly display name for contextual UI prompts (e.g. 'Puerta de Entrada').")]
        [SerializeField] private string doorName = "Puerta";

        [Tooltip("Maximum distance from player to interactionAnchor to allow interaction.")]
        [SerializeField] private float interactionRange = 2.2f;

        [Tooltip("Initial state of the door when instantiated or awakened.")]
        [SerializeField] private DoorState initialState = DoorState.Closed;

        [Header("Obstruction & Safety")]
        [Tooltip("When enabled, prevents or reverses closing if a character capsule occupies the door volume.")]
        [SerializeField] private bool antiPinchEnabled = true;

        [Tooltip("Collision layer mask checked for character obstructions.")]
        [SerializeField] private LayerMask obstructionMask = ~0;

        [Tooltip("Safety margin added to collider bounds when evaluating obstruction.")]
        [SerializeField] private float obstructionBuffer = 0.05f;

        [Header("Business & Access Policy")]
        [Tooltip("Authoritative World Core business entity ID (e.g. 'restaurant:wing-spot'). If empty, door has no business access rules.")]
        [SerializeField] private string businessId;

        [Header("Automatic Closing")]
        [Tooltip("Whether this door automatically closes after characters pass through.")]
        [SerializeField] private bool autoCloseEnabled = false;

        [Tooltip("Delay in seconds after passage or opening before the door attempts to close automatically.")]
        [SerializeField] private float autoCloseDelay = 2.5f;

        [Tooltip("Radius around the door evaluated for clearance before automatic closing.")]
        [SerializeField] private float clearanceRadius = 1.6f;

        // Static registry for efficient spatial lookups by PlayerController
        public static readonly List<InteractiveDoor> ActiveDoors = new List<InteractiveDoor>();

        // State tracking
        private Quaternion closedRotation;
        private Quaternion openRotation;
        private Coroutine activeAnimationCoroutine;
        private Coroutine activeAutoCloseCoroutine;

        public DoorState CurrentState { get; private set; } = DoorState.Closed;
        public DoorState State => CurrentState;
        public bool IsMoving => CurrentState == DoorState.Opening || CurrentState == DoorState.Closing;
        public bool IsOpen => CurrentState == DoorState.Open;
        public bool IsClosed => CurrentState == DoorState.Closed;

        public string DoorName => doorName;
        public float InteractionRange => interactionRange;
        public Transform HingePivot => hingePivot != null ? hingePivot : transform;
        public Transform DoorLeaf => doorLeaf;
        public Collider DoorCollider => doorCollider;
        public Transform InteractionAnchor => interactionAnchor != null ? interactionAnchor : (hingePivot != null ? hingePivot : transform);

        public Vector3 ClosedEulerAngles => closedEulerAngles;
        public float OpenAngle => openAngle;
        public float RotationDuration => rotationDuration;
        public Quaternion ClosedRotation => closedRotation;
        public Quaternion OpenRotation => openRotation;

        public string BusinessId { get => businessId; set => businessId = value; }
        public bool AutoCloseEnabled { get => autoCloseEnabled; set => autoCloseEnabled = value; }
        public float AutoCloseDelay { get => autoCloseDelay; set => autoCloseDelay = value; }
        public float ClearanceRadius { get => clearanceRadius; set => clearanceRadius = value; }

        public event Action<DoorState> OnDoorStateChanged;
        public event Action<string> OnInteractionDenied;
        public event Action OnDoorOpened;
        public event Action OnDoorClosed;

        private void Awake()
        {
            InitializeComponents();
        }

        private void OnEnable()
        {
            if (!ActiveDoors.Contains(this))
            {
                ActiveDoors.Add(this);
            }
        }

        private void OnDisable()
        {
            ActiveDoors.Remove(this);
            CancelAutoClose();
            if (activeAnimationCoroutine != null)
            {
                StopCoroutine(activeAnimationCoroutine);
                activeAnimationCoroutine = null;
            }
        }

        /// <summary>
        /// Configures initial hinge rotations and resolves component references.
        /// </summary>
        public void InitializeComponents()
        {
            if (hingePivot == null)
            {
                hingePivot = transform;
            }

            if (doorLeaf == null)
            {
                // If a child exists, use the first child as leaf
                if (hingePivot.childCount > 0)
                {
                    doorLeaf = hingePivot.GetChild(0);
                }
            }

            if (doorCollider == null)
            {
                doorCollider = GetComponentInChildren<Collider>();
            }

            closedRotation = Quaternion.Euler(closedEulerAngles);
            openRotation = closedRotation * Quaternion.AngleAxis(openAngle, rotationAxis);

            if (initialState == DoorState.Open)
            {
                hingePivot.localRotation = openRotation;
                CurrentState = DoorState.Open;
            }
            else
            {
                hingePivot.localRotation = closedRotation;
                CurrentState = DoorState.Closed;
            }
        }

        /// <summary>
        /// External configuration helper for procedural scene builders.
        /// </summary>
        public void Configure(
            Transform pivot,
            Transform leaf,
            Collider col,
            Vector3 closedEuler,
            float angle,
            float duration,
            float range,
            string name,
            DoorState startState,
            string busId = null,
            bool autoClose = false,
            float autoDelay = 2.5f,
            float clearanceRad = 1.6f)
        {
            hingePivot = pivot;
            doorLeaf = leaf;
            doorCollider = col;
            closedEulerAngles = closedEuler;
            openAngle = angle;
            rotationDuration = duration;
            interactionRange = range;
            doorName = name;
            initialState = startState;
            businessId = busId;
            autoCloseEnabled = autoClose;
            autoCloseDelay = autoDelay;
            clearanceRadius = clearanceRad;

            InitializeComponents();
        }

        /// <summary>
        /// Contextual prompt for UI representation.
        /// </summary>
        public string GetInteractionPrompt()
        {
            switch (CurrentState)
            {
                case DoorState.Closed:
                case DoorState.Closing:
                    return $"[E] Abrir {doorName}";
                case DoorState.Open:
                case DoorState.Opening:
                    return $"[E] Cerrar {doorName}";
                default:
                    return $"[E] {doorName}";
            }
        }

        /// <summary>
        /// Extensibility point for access policies (business operating hours, cutoffs, permissions).
        /// Rejects opening from outside if the business is closed or past its last-entry cutoff.
        /// Exits and closing an open door are always permitted.
        /// </summary>
        public virtual bool CanInteract(GameObject actor, out string reason)
        {
            reason = null;

            // Closing an already open or opening door is always permitted
            if (IsOpen || CurrentState == DoorState.Opening)
            {
                return true;
            }

            // If this door is linked to an authoritative business schedule:
            if (!string.IsNullOrEmpty(businessId))
            {
                // Check if actor is an exiting customer (already inside the business)
                if (actor != null)
                {
                    var player = actor.GetComponent<Player.PlayerController>();
                    if (player != null && player.IsInsideWingSpot)
                    {
                        // Exiting customer can open the door freely
                        return true;
                    }
                }

                // New entry: verify business admission policy against authoritative simulation time
                if (!BusinessScheduleRegistry.CanAdmitCustomer(businessId, BusinessScheduleRegistry.GetAuthoritativeTimeUtc(), out string rejection))
                {
                    reason = rejection;
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Primary interaction entry point. Toggles open or closed based on current state.
        /// Reverses animation cleanly if interrupted during movement.
        /// </summary>
        public void Interact(GameObject actor = null)
        {
            if (!CanInteract(actor, out string reason))
            {
                Debug.Log($"[InteractiveDoor] Interaction rejected for '{doorName}': {reason}");
                OnInteractionDenied?.Invoke(reason);
                return;
            }

            switch (CurrentState)
            {
                case DoorState.Closed:
                    Open();
                    break;

                case DoorState.Open:
                    Close();
                    break;

                case DoorState.Opening:
                    // Reverse to closing
                    Close();
                    break;

                case DoorState.Closing:
                    // Reverse to opening
                    Open();
                    break;
            }
        }

        /// <summary>
        /// Initiates opening rotation around the hinge pivot.
        /// </summary>
        public void Open()
        {
            if (CurrentState == DoorState.Open) return;

            if (activeAnimationCoroutine != null)
            {
                StopCoroutine(activeAnimationCoroutine);
                activeAnimationCoroutine = null;
            }

            CurrentState = DoorState.Opening;
            OnDoorStateChanged?.Invoke(CurrentState);

            if (Application.isPlaying)
            {
                activeAnimationCoroutine = StartCoroutine(AnimateRotation(openRotation, DoorState.Open, false));
            }
            else
            {
                SetStateImmediate(DoorState.Open);
            }
        }

        /// <summary>
        /// Initiates closing rotation. Tests for doorway obstruction before and during rotation.
        /// </summary>
        public void Close()
        {
            CancelAutoClose();
            if (CurrentState == DoorState.Closed) return;

            // Pre-check: only abort if the closed doorway threshold itself is currently blocked by a character
            if (antiPinchEnabled && CheckClosedThresholdObstruction(out Collider hit))
            {
                Debug.LogWarning($"[InteractiveDoor] Cannot close '{doorName}': doorway threshold occupied by {hit?.name}. Remaining Open.");
                if (CurrentState != DoorState.Open)
                {
                    Open();
                }
                return;
            }

            if (activeAnimationCoroutine != null)
            {
                StopCoroutine(activeAnimationCoroutine);
                activeAnimationCoroutine = null;
            }

            CurrentState = DoorState.Closing;
            OnDoorStateChanged?.Invoke(CurrentState);

            if (Application.isPlaying)
            {
                activeAnimationCoroutine = StartCoroutine(AnimateRotation(closedRotation, DoorState.Closed, true));
            }
            else
            {
                SetStateImmediate(DoorState.Closed);
            }
        }

        /// <summary>
        /// Deterministic rotation coroutine. Smoothly interpolates between current and target rotations.
        /// Continuously verifies collision clearance when closing.
        /// </summary>
        private IEnumerator AnimateRotation(Quaternion targetRotation, DoorState targetState, bool checkObstruction)
        {
            Quaternion startRot = HingePivot.localRotation;
            float totalDelta = Quaternion.Angle(closedRotation, openRotation);
            float currentDelta = Quaternion.Angle(startRot, targetRotation);

            float effectiveDuration = totalDelta > 0.01f ? rotationDuration * (currentDelta / totalDelta) : rotationDuration;
            if (effectiveDuration < 0.05f) effectiveDuration = 0.05f;

            float elapsed = 0f;
            while (elapsed < effectiveDuration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / effectiveDuration);
                float smoothT = Mathf.SmoothStep(0f, 1f, t);

                HingePivot.localRotation = Quaternion.Slerp(startRot, targetRotation, smoothT);

                // Obstruction safeguard during closing (evaluated after initial departure from resting angle)
                if (checkObstruction && antiPinchEnabled && elapsed >= 0.15f)
                {
                    if (CheckObstruction(out Collider hit))
                    {
                        Debug.LogWarning($"[InteractiveDoor] '{doorName}' closing sweep blocked by {hit.name}! Reversing to Open.");
                        CurrentState = DoorState.Opening;
                        OnDoorStateChanged?.Invoke(CurrentState);
                        activeAnimationCoroutine = StartCoroutine(AnimateRotation(openRotation, DoorState.Open, false));
                        yield break;
                    }
                }

                yield return null;
            }

            // Snap strictly to target endpoint (zero float accumulation drift)
            HingePivot.localRotation = targetRotation;
            CurrentState = targetState;
            activeAnimationCoroutine = null;

            OnDoorStateChanged?.Invoke(CurrentState);
            if (targetState == DoorState.Open)
            {
                OnDoorOpened?.Invoke();
                if (autoCloseEnabled)
                {
                    ScheduleAutoClose();
                }
            }
            else if (targetState == DoorState.Closed)
            {
                OnDoorClosed?.Invoke();
                CancelAutoClose();
            }
        }

        /// <summary>
        /// Immediately sets door state without coroutines (ideal for editor tests, quick setup, or instant cutscenes).
        /// </summary>
        public void SetStateImmediate(DoorState state)
        {
            if (activeAnimationCoroutine != null)
            {
                StopCoroutine(activeAnimationCoroutine);
                activeAnimationCoroutine = null;
            }

            CurrentState = state;
            if (state == DoorState.Open)
            {
                HingePivot.localRotation = openRotation;
                OnDoorStateChanged?.Invoke(CurrentState);
                OnDoorOpened?.Invoke();
                if (autoCloseEnabled)
                {
                    ScheduleAutoClose();
                }
            }
            else if (state == DoorState.Closed)
            {
                CancelAutoClose();
                HingePivot.localRotation = closedRotation;
                OnDoorStateChanged?.Invoke(CurrentState);
                OnDoorClosed?.Invoke();
            }
        }

        /// <summary>
        /// Schedules the door to automatically close after a configured delay.
        /// </summary>
        public void ScheduleAutoClose(float delay = -1f)
        {
            if (!autoCloseEnabled) return;
            if (CurrentState == DoorState.Closed) return;

            CancelAutoClose();

            float waitTime = delay >= 0f ? delay : autoCloseDelay;
            if (Application.isPlaying && gameObject.activeInHierarchy)
            {
                activeAutoCloseCoroutine = StartCoroutine(AutoCloseRoutine(waitTime));
            }
        }

        /// <summary>
        /// Cancels any scheduled automatic close operation.
        /// </summary>
        public void CancelAutoClose()
        {
            if (activeAutoCloseCoroutine != null)
            {
                StopCoroutine(activeAutoCloseCoroutine);
                activeAutoCloseCoroutine = null;
            }
        }

        private IEnumerator AutoCloseRoutine(float delay)
        {
            yield return new WaitForSeconds(delay);

            while (CurrentState != DoorState.Closed)
            {
                if (IsClearanceFree())
                {
                    Close();
                    yield break;
                }

                // If path obstructed, retry every 1.0 second
                yield return new WaitForSeconds(1.0f);
            }
            activeAutoCloseCoroutine = null;
        }

        /// <summary>
        /// Checks whether the entire doorway clearance radius and closed threshold are free of characters.
        /// </summary>
        public bool IsClearanceFree()
        {
            if (CheckClosedThresholdObstruction(out _)) return false;
            if (CheckObstruction(out _)) return false;

            Vector3 center = InteractionAnchor != null ? InteractionAnchor.position : transform.position;
            Collider[] hits = Physics.OverlapSphere(center, clearanceRadius, obstructionMask, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < hits.Length; i++)
            {
                var hit = hits[i];
                if (hit == null || hit == doorCollider) continue;
                if (hit.transform.IsChildOf(transform) || (hingePivot != null && hit.transform.IsChildOf(hingePivot))) continue;
                if (doorLeaf != null && hit.transform.IsChildOf(doorLeaf)) continue;

                if (hit.GetComponent<CharacterController>() != null ||
                    hit.CompareTag("Player") ||
                    hit.name.Contains("Player") ||
                    hit.name.Contains("NPC") ||
                    hit.name.Contains("Elena"))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Inspects the current volume of the door collider for player/NPC CharacterControllers.
        /// </summary>
        public bool CheckObstruction(out Collider hitCollider)
        {
            hitCollider = null;
            if (doorCollider == null)
            {
                doorCollider = GetComponentInChildren<Collider>();
                if (doorCollider == null) return false;
            }

            BoxCollider box = doorCollider as BoxCollider;
            if (box != null)
            {
                Vector3 worldCenter = box.transform.TransformPoint(box.center);
                Vector3 worldScale = box.transform.lossyScale;
                Vector3 worldSize = new Vector3(
                    Mathf.Abs(box.size.x * worldScale.x),
                    Mathf.Abs(box.size.y * worldScale.y),
                    Mathf.Abs(box.size.z * worldScale.z)
                );
                Vector3 halfExtents = (worldSize * 0.5f) + (Vector3.one * obstructionBuffer);

                Collider[] hits = Physics.OverlapBox(worldCenter, halfExtents, box.transform.rotation, obstructionMask, QueryTriggerInteraction.Ignore);
                for (int i = 0; i < hits.Length; i++)
                {
                    var hit = hits[i];
                    if (hit == null || hit == doorCollider) continue;

                    // Exclude self hierarchy
                    if (hit.transform.IsChildOf(transform) || (hingePivot != null && hit.transform.IsChildOf(hingePivot))) continue;
                    if (doorLeaf != null && hit.transform.IsChildOf(doorLeaf)) continue;

                    // Obstruction must be a CharacterController or actor
                    if (hit.GetComponent<CharacterController>() != null ||
                        hit.CompareTag("Player") ||
                        hit.name.Contains("Player") ||
                        hit.name.Contains("NPC") ||
                        hit.name.Contains("Elena"))
                    {
                        hitCollider = hit;
                        return true;
                    }
                }
            }
            return false;
        }

        /// <summary>
        /// Inspects the doorway threshold (the volume the door leaf will occupy when fully closed).
        /// Prevents initiating a close if the player is standing directly inside the closed door frame.
        /// </summary>
        public bool CheckClosedThresholdObstruction(out Collider hitCollider)
        {
            hitCollider = null;
            if (doorCollider == null) return false;

            BoxCollider box = doorCollider as BoxCollider;
            if (box != null)
            {
                // Compute where the box would be at closedRotation
                Transform pivot = HingePivot;
                Quaternion currentRot = pivot.localRotation;

                // Pivot world rotation when at closedRotation
                Quaternion closedWorldRot;
                if (pivot.parent != null)
                {
                    closedWorldRot = pivot.parent.rotation * closedRotation;
                }
                else
                {
                    closedWorldRot = closedRotation;
                }

                // Leaf local position relative to pivot
                Vector3 leafLocalPos = doorLeaf != null ? doorLeaf.localPosition : Vector3.zero;
                Vector3 boxLocalPos = leafLocalPos + (doorLeaf != null ? doorLeaf.localRotation * box.center : box.center);
                Vector3 closedWorldCenter = pivot.position + (closedWorldRot * boxLocalPos);

                Vector3 worldScale = box.transform.lossyScale;
                Vector3 worldSize = new Vector3(
                    Mathf.Abs(box.size.x * worldScale.x),
                    Mathf.Abs(box.size.y * worldScale.y),
                    Mathf.Abs(box.size.z * worldScale.z)
                );
                Vector3 halfExtents = (worldSize * 0.5f) + (Vector3.one * obstructionBuffer);

                Collider[] hits = Physics.OverlapBox(closedWorldCenter, halfExtents, closedWorldRot, obstructionMask, QueryTriggerInteraction.Ignore);
                for (int i = 0; i < hits.Length; i++)
                {
                    var hit = hits[i];
                    if (hit == null || hit == doorCollider) continue;

                    if (hit.transform.IsChildOf(transform) || (hingePivot != null && hit.transform.IsChildOf(hingePivot))) continue;
                    if (doorLeaf != null && hit.transform.IsChildOf(doorLeaf)) continue;

                    if (hit.GetComponent<CharacterController>() != null ||
                        hit.CompareTag("Player") ||
                        hit.name.Contains("Player") ||
                        hit.name.Contains("NPC") ||
                        hit.name.Contains("Elena"))
                    {
                        hitCollider = hit;
                        return true;
                    }
                }
            }
            return false;
        }
    }
}
