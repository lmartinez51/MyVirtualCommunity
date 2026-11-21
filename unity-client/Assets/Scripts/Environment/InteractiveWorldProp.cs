using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Reusable tangible, movable physical prop component for Player interaction.
    /// Provides solid collision + Rigidbody physics so the player cannot walk through props,
    /// supports picking up / carrying / placing ([E]), throwing / kicking ([F]),
    /// and upright wheeled transport (e.g. rolling a US-style trash bin to a sidewalk corner).
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class InteractiveWorldProp : MonoBehaviour
    {
        public static readonly List<InteractiveWorldProp> ActiveProps = new List<InteractiveWorldProp>();

        [Header("Prop Identity")]
        [SerializeField] private string propName = "Objeto";
        [SerializeField] private float interactionRange = 2.2f;

        [Header("Capabilities")]
        [SerializeField] private bool canCarry = true;
        [SerializeField] private bool canWheelMove = false;
        [SerializeField] private bool canKick = false;
        [SerializeField] private bool canThrow = true;

        [Header("Handling & Physics")]
        [SerializeField] private Vector3 holdLocalOffset = new Vector3(0.32f, 0.92f, 0.62f);
        [SerializeField] private float kickForce = 9.5f;
        [SerializeField] private float kickUpwardForce = 3.2f;
        [SerializeField] private float throwForce = 7.0f;
        [SerializeField] private float pushStrength = 2.2f;
        [SerializeField] private float groundClearanceOffset = 0.0f;

        private Rigidbody rb;
        private Collider[] propColliders;
        private Transform holderTransform;
        private bool isHeld = false;

        public string PropName => propName;
        public float InteractionRange => interactionRange;
        public bool CanCarry => canCarry;
        public bool CanWheelMove => canWheelMove;
        public bool CanKick => canKick;
        public bool CanThrow => canThrow;
        public bool IsHeld => isHeld;
        public float PushStrength => pushStrength;
        public Rigidbody Body => rb;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            propColliders = GetComponentsInChildren<Collider>(true);
        }

        private void OnEnable()
        {
            if (!ActiveProps.Contains(this))
            {
                ActiveProps.Add(this);
            }
        }

        private void OnDisable()
        {
            ActiveProps.Remove(this);
        }

        public void Configure(
            string displayName,
            bool carry,
            bool wheelMove,
            bool kick,
            bool throwable,
            float mass,
            float drag,
            float angularDrag,
            Vector3 holdOffset,
            float groundOffset = 0f,
            float bounciness = 0.05f,
            float range = 2.2f,
            float pushPower = 2.2f,
            bool freezeTilt = false)
        {
            propName = displayName;
            canCarry = carry;
            canWheelMove = wheelMove;
            canKick = kick;
            canThrow = throwable;
            holdLocalOffset = holdOffset;
            groundClearanceOffset = groundOffset;
            interactionRange = range;
            pushStrength = pushPower;

            rb = GetComponent<Rigidbody>();
            if (rb == null) rb = gameObject.AddComponent<Rigidbody>();

            rb.mass = Mathf.Max(0.2f, mass);
            rb.linearDamping = drag;
            rb.angularDamping = angularDrag;
            rb.useGravity = true;
            rb.isKinematic = false;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            rb.constraints = freezeTilt
                ? (RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ)
                : RigidbodyConstraints.None;

            propColliders = GetComponentsInChildren<Collider>(true);
            if (bounciness > 0.05f && propColliders != null)
            {
                var mat = new PhysicsMaterial($"{displayName}_PhysMat")
                {
                    bounciness = bounciness,
                    dynamicFriction = 0.35f,
                    staticFriction = 0.4f,
                    bounceCombine = PhysicsMaterialCombine.Maximum
                };
                for (int i = 0; i < propColliders.Length; i++)
                {
                    if (propColliders[i] != null)
                    {
                        propColliders[i].sharedMaterial = mat;
                    }
                }
            }
        }

        public string GetInteractionPrompt()
        {
            if (isHeld)
            {
                if (canWheelMove)
                {
                    return $"[E] Estacionar / Soltar {propName}";
                }
                return canThrow
                    ? $"[E] Soltar {propName}  |  [F] Lanzar {propName}"
                    : $"[E] Soltar {propName}";
            }

            if (canWheelMove)
            {
                return $"[E] Mover {propName}";
            }

            if (canCarry && canKick)
            {
                return $"[E] Tomar {propName}  |  [F] Patear {propName}";
            }

            if (canCarry)
            {
                return $"[E] Tomar {propName}";
            }

            if (canKick)
            {
                return $"[F] Patear {propName}";
            }

            return propName;
        }

        public bool PickUp(Transform holder)
        {
            if (holder == null || (!canCarry && !canWheelMove)) return false;

            isHeld = true;
            holderTransform = holder;

            if (rb != null)
            {
                rb.linearVelocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.isKinematic = true;
            }

            SetCollidersEnabled(false);
            UpdateHeldPoseImmediate();
            return true;
        }

        public void Drop(Transform holder)
        {
            if (!isHeld) return;

            Transform refTransform = holder != null ? holder : holderTransform;
            Vector3 dropPos = transform.position;
            Quaternion dropRot = transform.rotation;

            if (refTransform != null)
            {
                float forwardDist = canWheelMove ? 1.05f : 0.85f;
                Vector3 candidatePos = refTransform.position + refTransform.forward * forwardDist;

                // Prevent dropping inside a wall right in front of the player
                if (Physics.Raycast(refTransform.position + Vector3.up * 0.9f, refTransform.forward, out RaycastHit wallHit, forwardDist + 0.25f, ~(1 << 2), QueryTriggerInteraction.Ignore))
                {
                    candidatePos = refTransform.position + refTransform.forward * Mathf.Max(0.45f, wallHit.distance - 0.35f);
                }

                // Ground the dropped prop cleanly on the floor/sidewalk/bench below candidatePos
                if (Physics.Raycast(new Vector3(candidatePos.x, refTransform.position.y + 1.4f, candidatePos.z), Vector3.down, out RaycastHit groundHit, 4.0f, ~(1 << 2), QueryTriggerInteraction.Ignore))
                {
                    dropPos = new Vector3(candidatePos.x, groundHit.point.y + groundClearanceOffset + 0.02f, candidatePos.z);
                }
                else
                {
                    dropPos = new Vector3(candidatePos.x, refTransform.position.y + groundClearanceOffset + 0.05f, candidatePos.z);
                }

                dropRot = Quaternion.Euler(0f, refTransform.eulerAngles.y, 0f);
            }

            isHeld = false;
            holderTransform = null;

            transform.position = dropPos;
            transform.rotation = dropRot;

            SetCollidersEnabled(true);
            if (rb != null)
            {
                rb.isKinematic = false;
                rb.linearVelocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.WakeUp();
            }
        }

        public void Throw(Transform holder)
        {
            if (!isHeld) return;

            Transform refTransform = holder != null ? holder : holderTransform;
            Vector3 releasePos = transform.position;
            Vector3 throwDir = Vector3.forward;

            if (refTransform != null)
            {
                throwDir = refTransform.forward.normalized;
                releasePos = refTransform.position + Vector3.up * 1.15f + throwDir * 0.72f;
            }

            isHeld = false;
            holderTransform = null;

            transform.position = releasePos;
            SetCollidersEnabled(true);

            if (rb != null)
            {
                rb.isKinematic = false;
                rb.linearVelocity = throwDir * throwForce + Vector3.up * 2.4f;
                rb.angularVelocity = new Vector3(Random.Range(-4f, 4f), Random.Range(-3f, 3f), Random.Range(-4f, 4f));
                rb.WakeUp();
            }
        }

        public void Kick(Transform kicker)
        {
            if (isHeld || !canKick || rb == null || kicker == null) return;

            Vector3 dir = transform.position - kicker.position;
            dir.y = 0f;
            if (dir.sqrMagnitude < 0.01f)
            {
                dir = kicker.forward;
                dir.y = 0f;
            }
            dir.Normalize();

            // Blend player facing direction with ball vector for intuitive aiming
            Vector3 playerFwd = new Vector3(kicker.forward.x, 0f, kicker.forward.z).normalized;
            Vector3 kickDir = (dir * 0.45f + playerFwd * 0.55f).normalized;

            rb.isKinematic = false;
            rb.WakeUp();
            rb.AddForce(kickDir * kickForce + Vector3.up * kickUpwardForce, ForceMode.VelocityChange);
            rb.AddTorque(Vector3.Cross(Vector3.up, kickDir) * 8f, ForceMode.VelocityChange);
        }

        public void ApplyBodyPush(Vector3 moveDir, float playerSpeed)
        {
            if (isHeld || rb == null || rb.isKinematic) return;

            Vector3 horizDir = new Vector3(moveDir.x, 0f, moveDir.z);
            if (horizDir.sqrMagnitude < 0.001f) return;
            horizDir.Normalize();

            float speedFactor = Mathf.Clamp(playerSpeed / 3.5f, 0.5f, 1.8f);
            Vector3 targetVel = horizDir * (pushStrength * speedFactor);
            rb.linearVelocity = new Vector3(targetVel.x, rb.linearVelocity.y, targetVel.z);
            rb.WakeUp();
        }

        private void LateUpdate()
        {
            if (!isHeld || holderTransform == null) return;
            UpdateHeldPoseImmediate();
        }

        private void UpdateHeldPoseImmediate()
        {
            if (holderTransform == null) return;

            if (canWheelMove)
            {
                // Roll wheeled bin upright on the ground directly in front of the player
                Vector3 desiredPos = holderTransform.TransformPoint(holdLocalOffset);
                float groundY = holderTransform.position.y;
                if (Physics.Raycast(new Vector3(desiredPos.x, holderTransform.position.y + 1.5f, desiredPos.z), Vector3.down, out RaycastHit hit, 4.0f, ~(1 << 2), QueryTriggerInteraction.Ignore))
                {
                    groundY = hit.point.y;
                }
                transform.position = Vector3.Lerp(transform.position, new Vector3(desiredPos.x, groundY + groundClearanceOffset, desiredPos.z), Time.deltaTime * 16f);
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0f, holderTransform.eulerAngles.y, 0f), Time.deltaTime * 14f);
            }
            else
            {
                Vector3 targetPos = holderTransform.TransformPoint(holdLocalOffset);
                transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * 20f);
                transform.rotation = Quaternion.Slerp(transform.rotation, holderTransform.rotation, Time.deltaTime * 16f);
            }
        }

        private void SetCollidersEnabled(bool enabledState)
        {
            if (propColliders == null || propColliders.Length == 0)
            {
                propColliders = GetComponentsInChildren<Collider>(true);
            }
            for (int i = 0; i < propColliders.Length; i++)
            {
                if (propColliders[i] != null)
                {
                    propColliders[i].enabled = enabledState;
                }
            }
        }
    }
}
