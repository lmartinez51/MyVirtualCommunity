using System.Collections.Generic;
using UnityEngine;
using MyVirtualCommunity.Character;

namespace MyVirtualCommunity.Environment
{
    public enum PropContentType
    {
        None = 0,
        Water = 1,
        Sand = 2
    }

    /// <summary>
    /// Reusable tangible, movable physical prop component for Player and NPC interaction.
    /// Provides solid collision + Rigidbody physics so characters cannot walk through props,
    /// supports picking up / carrying / placing ([E]), throwing / kicking ([F]),
    /// hand-anchored arm/elbow carrying poses, and upright wheeled transport.
    /// </summary>
    [DefaultExecutionOrder(40)]
    [RequireComponent(typeof(Rigidbody))]
    public class InteractiveWorldProp : MonoBehaviour
    {
        public static readonly List<InteractiveWorldProp> ActiveProps = new List<InteractiveWorldProp>();

        [Header("Prop Identity")]
        [SerializeField] private string propName = "Objeto";
        [SerializeField] private string probeObjectId = "";
        [SerializeField] private float interactionRange = 2.2f;

        [Header("Capabilities")]
        [SerializeField] private bool canCarry = true;
        [SerializeField] private bool canWheelMove = false;
        [SerializeField] private bool canKick = false;
        [SerializeField] private bool canThrow = true;

        [Header("Handling & Physics")]
        [SerializeField] private Vector3 holdLocalOffset = new Vector3(0.32f, 0.92f, 0.62f);
        [SerializeField] private HoldPoseStyle holdPoseStyle = HoldPoseStyle.OneHandFront;
        [SerializeField] private Vector3 handGripLocalOffset = Vector3.zero;
        [SerializeField] private Vector3 handGripLocalEuler = Vector3.zero;
        [SerializeField] private float kickForce = 9.5f;
        [SerializeField] private float kickUpwardForce = 3.2f;
        [SerializeField] private float throwForce = 7.0f;
        [SerializeField] private float pushStrength = 2.2f;
        [SerializeField] private float groundClearanceOffset = 0.0f;

        private Rigidbody rb;
        private Collider[] propColliders;
        private Transform holderTransform;
        private BobbleheadCharacter holderCharacter;
        private BobbleheadAnimator holderAnimator;
        private bool isHeld = false;
        private float holdBlendTimer = 0f;
        private float pendingPlayerSyncTimer = -1f;
        private float antiFloatCheckTimer = 0f;
        private Vector3 lastSyncedPosition;
        private PropContentType currentContent = PropContentType.None;
        private GameObject waterVisualObj;
        private GameObject sandVisualObj;

        public string PropName => propName;
        public string ProbeObjectId => probeObjectId;
        public float InteractionRange => interactionRange;
        public bool CanCarry => canCarry;
        public bool CanWheelMove => canWheelMove;
        public bool CanKick => canKick;
        public bool CanThrow => canThrow;
        public bool IsHeld => isHeld;
        public float PushStrength => pushStrength;
        public Rigidbody Body => rb;
        public PropContentType CurrentContent => currentContent;

        public void SetContents(PropContentType content)
        {
            currentContent = content;
            EnsureContentVisuals();
            if (waterVisualObj != null) waterVisualObj.SetActive(content == PropContentType.Water);
            if (sandVisualObj != null) sandVisualObj.SetActive(content == PropContentType.Sand);
        }

        private void EnsureContentVisuals()
        {
            if (probeObjectId == "probe:cat-bowl")
            {
                if (waterVisualObj == null)
                {
                    var existing = transform.Find("Bowl_Water");
                    if (existing != null) waterVisualObj = existing.gameObject;
                }
                return;
            }

            if (probeObjectId == "probe:bucket")
            {
                if (waterVisualObj == null)
                {
                    waterVisualObj = CreateFillPrimitive("Bucket_Water_Fill", PrimitiveType.Cylinder,
                        new Vector3(0f, 0.28f, 0f), new Vector3(0.28f, 0.015f, 0.28f), new Color(0.22f, 0.56f, 0.84f), 0.92f);
                }
                if (sandVisualObj == null)
                {
                    sandVisualObj = CreateFillPrimitive("Bucket_Sand_Fill", PrimitiveType.Sphere,
                        new Vector3(0f, 0.28f, 0f), new Vector3(0.27f, 0.14f, 0.27f), new Color(0.76f, 0.63f, 0.43f), 0.12f);
                }
                return;
            }

            if (probeObjectId == "probe:watering-can")
            {
                if (waterVisualObj == null)
                {
                    waterVisualObj = CreateFillPrimitive("Can_Water_Fill", PrimitiveType.Cylinder,
                        new Vector3(0f, 0.295f, 0f), new Vector3(0.11f, 0.008f, 0.11f), new Color(0.22f, 0.58f, 0.86f), 0.92f);
                }
                return;
            }

            if (probeObjectId == "probe:cup")
            {
                if (waterVisualObj == null)
                {
                    waterVisualObj = CreateFillPrimitive("Cup_Water_Fill", PrimitiveType.Cylinder,
                        new Vector3(0f, 0.055f, 0f), new Vector3(0.075f, 0.006f, 0.075f), new Color(0.26f, 0.62f, 0.88f), 0.92f);
                }
                return;
            }

            if (probeObjectId == "probe:shovel")
            {
                if (sandVisualObj == null)
                {
                    sandVisualObj = CreateFillPrimitive("Shovel_Sand_Scoop", PrimitiveType.Sphere,
                        new Vector3(0f, 0.13f, 0.04f), new Vector3(0.22f, 0.10f, 0.16f), new Color(0.76f, 0.63f, 0.43f), 0.12f);
                }
            }
        }

        private GameObject CreateFillPrimitive(string goName, PrimitiveType primitive, Vector3 localPos, Vector3 localScale, Color color, float smoothness)
        {
            GameObject obj = GameObject.CreatePrimitive(primitive);
            obj.name = goName;
            obj.transform.SetParent(transform, false);
            obj.transform.localPosition = localPos;
            obj.transform.localScale = localScale;
            var col = obj.GetComponent<Collider>();
            if (col != null) Destroy(col);
            var rend = obj.GetComponent<Renderer>();
            if (rend != null)
            {
                Material mat = new Material(rend.sharedMaterial);
                if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
                if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
                if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
                if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
                rend.sharedMaterial = mat;
            }
            obj.SetActive(false);
            return obj;
        }

        public void SetProbeObjectId(string id)
        {
            probeObjectId = id ?? "";
            lastSyncedPosition = transform.position;
        }

        public void NotifyMovedByPlayer()
        {
            if (string.IsNullOrEmpty(probeObjectId)) return;
            pendingPlayerSyncTimer = 1.25f;
        }

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            RefreshActiveColliders();
        }

        private void Start()
        {
            RefreshActiveColliders();
            if (!isHeld && rb != null && !rb.isKinematic)
            {
                EnsureGroundedIfFloating(snapDirectly: true);
            }
        }

        private void RefreshActiveColliders()
        {
            var all = GetComponentsInChildren<Collider>(true);
            var active = new List<Collider>(all.Length);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != null && all[i].enabled)
                {
                    active.Add(all[i]);
                }
            }
            propColliders = active.ToArray();
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
            if (isHeld && holderAnimator != null)
            {
                holderAnimator.SetHoldPose(HoldPoseStyle.None);
            }
            ActiveProps.Remove(this);
        }

        public void ConfigureHoldPose(HoldPoseStyle style, Vector3 gripOffset, Vector3 gripEuler = default)
        {
            holdPoseStyle = style;
            handGripLocalOffset = gripOffset;
            handGripLocalEuler = gripEuler;
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
            rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            rb.sleepThreshold = 0.02f;
            rb.constraints = freezeTilt
                ? (RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ)
                : RigidbodyConstraints.None;

            RefreshActiveColliders();
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
            holderCharacter = holder.GetComponentInChildren<BobbleheadCharacter>();
            holderAnimator = holder.GetComponentInChildren<BobbleheadAnimator>();
            holdBlendTimer = 0f;

            if (holderAnimator != null)
            {
                holderAnimator.SetHoldPose(canWheelMove ? HoldPoseStyle.TwoHandsPushWheel : holdPoseStyle);
            }

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

                // Anti-stacking: if another prop already sits within 0.48m of candidatePos,
                // pick a clean radial offset so objects never pile directly on top of each other.
                candidatePos = FindUnoccupiedDropSpot(candidatePos, refTransform);

                // Ground the dropped prop cleanly on floor/sidewalk/bench (ignoring other movable props and net stoppers!)
                RaycastHit[] groundHits = Physics.RaycastAll(new Vector3(candidatePos.x, refTransform.position.y + 0.90f, candidatePos.z), Vector3.down, 3.5f, ~(1 << 2), QueryTriggerInteraction.Ignore);
                float bestGroundY = float.MinValue;
                bool foundGround = false;
                for (int gi = 0; gi < groundHits.Length; gi++)
                {
                    var gh = groundHits[gi];
                    if (gh.collider == null) continue;
                    if (gh.collider.GetComponentInParent<InteractiveWorldProp>() != null) continue;
                    if (gh.collider.name == "Probe_SmallGoal_NetBackCollider") continue;
                    if (gh.point.y > bestGroundY)
                    {
                        bestGroundY = gh.point.y;
                        foundGround = true;
                    }
                }
                if (foundGround)
                {
                    dropPos = new Vector3(candidatePos.x, bestGroundY + groundClearanceOffset + 0.015f, candidatePos.z);
                }
                else
                {
                    dropPos = new Vector3(candidatePos.x, refTransform.position.y + groundClearanceOffset + 0.05f, candidatePos.z);
                }

                dropRot = Quaternion.Euler(0f, refTransform.eulerAngles.y, 0f);
            }

            if (holderAnimator != null)
            {
                holderAnimator.SetHoldPose(HoldPoseStyle.None);
            }

            isHeld = false;
            holderTransform = null;
            holderCharacter = null;
            holderAnimator = null;

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

            if (holderAnimator != null)
            {
                holderAnimator.SetHoldPose(HoldPoseStyle.None);
            }

            isHeld = false;
            holderTransform = null;
            holderCharacter = null;
            holderAnimator = null;

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

        public void KickTowards(Vector3 worldTarget)
        {
            if (isHeld || !canKick || rb == null) return;

            Vector3 toTarget = new Vector3(worldTarget.x - transform.position.x, 0f, worldTarget.z - transform.position.z);
            float dist = toTarget.magnitude;
            Vector3 kickDir = dist > 0.05f ? (toTarget / dist) : Vector3.forward;

            // Controlled ground pass calibrated to target distance so shots enter the small goal cleanly
            float speed = Mathf.Clamp(dist * 0.82f, 2.4f, 6.8f);
            rb.isKinematic = false;
            rb.WakeUp();
            rb.linearVelocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
            rb.AddForce(kickDir * speed + Vector3.up * 0.12f, ForceMode.VelocityChange);
            rb.AddTorque(Vector3.Cross(Vector3.up, kickDir) * 5.5f, ForceMode.VelocityChange);
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
            if (isHeld && holderTransform != null)
            {
                UpdateHeldPoseImmediate();
                return;
            }

            // Anti-float guard: never let a sleeping non-held prop remain suspended in mid-air
            if (rb != null && !rb.isKinematic)
            {
                antiFloatCheckTimer += Time.deltaTime;
                if (antiFloatCheckTimer >= 0.45f)
                {
                    antiFloatCheckTimer = 0f;
                    if (rb.IsSleeping())
                    {
                        EnsureGroundedIfFloating(snapDirectly: false);
                    }
                }
            }

            if (pendingPlayerSyncTimer > 0f)
            {
                pendingPlayerSyncTimer -= Time.deltaTime;
                if (pendingPlayerSyncTimer <= 0f)
                {
                    pendingPlayerSyncTimer = -1f;
                    if (!string.IsNullOrEmpty(probeObjectId) &&
                        Vector3.Distance(transform.position, lastSyncedPosition) >= 0.35f &&
                        Core.WorldCoreClient.Instance != null &&
                        Core.WorldCoreClient.Instance.IsConnected)
                    {
                        lastSyncedPosition = transform.position;
                        Core.WorldCoreClient.Instance.StartCoroutine(
                            Core.WorldCoreClient.Instance.SyncWorldPropPosition(probeObjectId, transform.position));
                    }
                }
            }
        }

        private void UpdateHeldPoseImmediate()
        {
            if (holderTransform == null) return;

            if (holderCharacter == null || holderCharacter.RightHand == null)
            {
                holderCharacter = holderTransform.GetComponentInChildren<BobbleheadCharacter>();
            }
            if (holderAnimator == null)
            {
                holderAnimator = holderTransform.GetComponentInChildren<BobbleheadAnimator>();
                if (holderAnimator != null)
                {
                    holderAnimator.SetHoldPose(canWheelMove ? HoldPoseStyle.TwoHandsPushWheel : holdPoseStyle);
                }
            }

            holdBlendTimer += Time.deltaTime;
            bool blendComplete = holdBlendTimer >= 0.16f;
            float posLerp = blendComplete ? 1f : Mathf.Clamp01(Time.deltaTime * 22f);
            float rotLerp = blendComplete ? 1f : Mathf.Clamp01(Time.deltaTime * 20f);

            Quaternion holderYawRot = Quaternion.Euler(0f, holderTransform.eulerAngles.y, 0f);

            if (canWheelMove)
            {
                // Roll wheeled bin upright on the ground directly in front of the character's extended hands
                Vector3 desiredPos = holderTransform.TransformPoint(holdLocalOffset);
                float groundY = holderTransform.position.y;
                if (Physics.Raycast(new Vector3(desiredPos.x, holderTransform.position.y + 1.5f, desiredPos.z), Vector3.down, out RaycastHit hit, 4.0f, ~(1 << 2), QueryTriggerInteraction.Ignore))
                {
                    groundY = hit.point.y;
                }
                Vector3 wheelPos = new Vector3(desiredPos.x, groundY + groundClearanceOffset, desiredPos.z);
                transform.position = Vector3.Lerp(transform.position, wheelPos, Time.deltaTime * 18f);
                transform.rotation = Quaternion.Slerp(transform.rotation, holderYawRot, Time.deltaTime * 16f);
                return;
            }

            Vector3 targetPos;
            Quaternion targetRot = holderYawRot * Quaternion.Euler(handGripLocalEuler);

            if (holdPoseStyle == HoldPoseStyle.TwoHandsFront &&
                holderCharacter != null &&
                holderCharacter.LeftHand != null &&
                holderCharacter.RightHand != null)
            {
                Vector3 handsMid = (holderCharacter.LeftHand.position + holderCharacter.RightHand.position) * 0.5f;
                targetPos = handsMid + holderYawRot * handGripLocalOffset;
            }
            else if (holderCharacter != null && holderCharacter.RightHand != null)
            {
                targetPos = holderCharacter.RightHand.position + holderYawRot * handGripLocalOffset;
            }
            else
            {
                targetPos = holderTransform.TransformPoint(holdLocalOffset);
            }

            // Never allow carried props (buckets, bags, brooms) to clip below the ground plane
            float minSafeY = holderTransform.position.y + groundClearanceOffset + 0.03f;
            if (targetPos.y < minSafeY)
            {
                targetPos.y = minSafeY;
            }

            transform.position = blendComplete ? targetPos : Vector3.Lerp(transform.position, targetPos, posLerp);
            transform.rotation = blendComplete ? targetRot : Quaternion.Slerp(transform.rotation, targetRot, rotLerp);
        }

        private Vector3 FindUnoccupiedDropSpot(Vector3 candidate, Transform refTransform)
        {
            if (!IsSpotOccupiedByProp(candidate)) return candidate;

            float radius = 0.56f;
            for (int step = 0; step < 8; step++)
            {
                float angleRad = step * 45f * Mathf.Deg2Rad;
                Vector3 test = new Vector3(
                    candidate.x + Mathf.Cos(angleRad) * radius,
                    candidate.y,
                    candidate.z + Mathf.Sin(angleRad) * radius
                );
                if (!IsSpotOccupiedByProp(test))
                {
                    return test;
                }
            }
            return candidate + refTransform.right * 0.55f;
        }

        private bool IsSpotOccupiedByProp(Vector3 pos)
        {
            for (int i = 0; i < ActiveProps.Count; i++)
            {
                var other = ActiveProps[i];
                if (other == null || other == this || other.IsHeld) continue;
                float distXZ = Vector2.Distance(
                    new Vector2(other.transform.position.x, other.transform.position.z),
                    new Vector2(pos.x, pos.z)
                );
                if (distXZ < 0.48f) return true;
            }
            return false;
        }

        private void EnsureGroundedIfFloating(bool snapDirectly)
        {
            if (isHeld || rb == null || rb.isKinematic) return;

            Vector3 origin = transform.position + Vector3.up * 0.05f;
            RaycastHit[] hits = Physics.RaycastAll(origin, Vector3.down, 6.0f, ~(1 << 2), QueryTriggerInteraction.Ignore);
            float bestGroundY = float.MinValue;
            bool foundGround = false;

            for (int i = 0; i < hits.Length; i++)
            {
                var h = hits[i];
                if (h.collider == null) continue;
                if (h.collider.transform.IsChildOf(transform) || h.collider.transform == transform) continue;
                if (h.collider.name == "Probe_SmallGoal_NetBackCollider") continue;
                if (h.point.y > bestGroundY)
                {
                    bestGroundY = h.point.y;
                    foundGround = true;
                }
            }

            if (!foundGround) return;

            float expectedY = bestGroundY + groundClearanceOffset;
            float floatGap = transform.position.y - expectedY;
            if (floatGap > 0.05f)
            {
                if (snapDirectly)
                {
                    transform.position = new Vector3(transform.position.x, expectedY + 0.005f, transform.position.z);
                    rb.linearVelocity = Vector3.zero;
                    rb.angularVelocity = Vector3.zero;
                }
                rb.WakeUp();
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
