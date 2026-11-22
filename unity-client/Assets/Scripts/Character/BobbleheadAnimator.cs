using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Arm and elbow posture presets applied when carrying or pushing physical world props.
    /// </summary>
    public enum HoldPoseStyle
    {
        None = 0,
        OneHandDrink = 1,
        OneHandCarryDown = 2,
        OneHandFront = 3,
        TwoHandsFront = 4,
        TwoHandsPushWheel = 5
    }

    /// <summary>
    /// Procedural animation controller for stylized Bobblehead characters.
    /// Drives natural walking cycles with alternating opposite arm/leg swings,
    /// knee flexion, pelvic bounce, subtle breathing/counter-attendant stances,
    /// and coherent arm/elbow carrying poses when holding physical props.
    /// Strictly presentation-only: never modifies authoritative world state or positions.
    /// </summary>
    [DefaultExecutionOrder(20)]
    public class BobbleheadAnimator : MonoBehaviour
    {
        [Header("Character Reference")]
        [SerializeField] private BobbleheadCharacter character;

        [Header("Animation Tuning")]
        [SerializeField] private float walkFrequency = 5.2f;
        [SerializeField] private float maxLegSwingAngle = 26f;
        [SerializeField] private float maxArmSwingAngle = 22f;
        [SerializeField] private float maxKneeBendAngle = 28f;
        [SerializeField] private float breathSpeed = 1.8f;

        [Header("Attendant Mode")]
        [SerializeField] private bool isNpcAttendant = false;

        private float _walkPhase;
        private float _breathPhase;
        private float _currentSpeed;
        private bool _isMoving;
        private HoldPoseStyle _holdPoseStyle = HoldPoseStyle.None;
        private float _holdPoseWeight = 0f;
        private HoldPoseStyle _lastActiveHoldPose = HoldPoseStyle.None;
        private bool _isSitting = false;
        private bool _sittingOnBench = false;
        private float _sitWeight = 0f;
        private float _actionDipTimer = 0f;

        public HoldPoseStyle CurrentHoldPose => _holdPoseStyle;
        public bool IsSitting => _isSitting;
        public bool IsSittingOnBench => _sittingOnBench;

        public void SetHoldPose(HoldPoseStyle style)
        {
            _holdPoseStyle = style;
            if (style != HoldPoseStyle.None)
            {
                _lastActiveHoldPose = style;
            }
        }

        public void SetSitting(bool sitting, bool onBench = false)
        {
            _isSitting = sitting;
            if (sitting)
            {
                _sittingOnBench = onBench;
            }
        }

        public void TriggerActionDip()
        {
            _actionDipTimer = 0.55f;
        }

        // Base transform initial rotations
        private Quaternion _initTorsoRot = Quaternion.identity;
        private Quaternion _initHeadRot = Quaternion.identity;
        private Quaternion _initLeftArmRot = Quaternion.identity;
        private Quaternion _initRightArmRot = Quaternion.identity;
        private Quaternion _initLeftForearmRot = Quaternion.identity;
        private Quaternion _initRightForearmRot = Quaternion.identity;
        private Quaternion _initLeftLegRot = Quaternion.identity;
        private Quaternion _initRightLegRot = Quaternion.identity;
        private Quaternion _initLeftKneeRot = Quaternion.identity;
        private Quaternion _initRightKneeRot = Quaternion.identity;
        private Vector3 _initPelvisPos = Vector3.zero;

        private void Start()
        {
            if (character == null)
            {
                character = GetComponent<BobbleheadCharacter>() ?? GetComponentInChildren<BobbleheadCharacter>();
            }

            CacheInitialPoses();
        }

        public void SetAttendantMode(bool enableAttendantStance)
        {
            isNpcAttendant = enableAttendantStance;
        }

        public void CacheInitialPoses()
        {
            if (character == null)
            {
                character = GetComponent<BobbleheadCharacter>() ?? GetComponentInChildren<BobbleheadCharacter>();
            }

            if (character == null) return;

            if (character.Torso != null) _initTorsoRot = character.Torso.localRotation;
            if (character.HeadHinge != null) _initHeadRot = character.HeadHinge.localRotation;
            if (character.LeftArmRoot != null) _initLeftArmRot = character.LeftArmRoot.localRotation;
            if (character.RightArmRoot != null) _initRightArmRot = character.RightArmRoot.localRotation;
            if (character.LeftForearm != null) _initLeftForearmRot = character.LeftForearm.localRotation;
            if (character.RightForearm != null) _initRightForearmRot = character.RightForearm.localRotation;
            if (character.LeftLegRoot != null) _initLeftLegRot = character.LeftLegRoot.localRotation;
            if (character.RightLegRoot != null) _initRightLegRot = character.RightLegRoot.localRotation;
            if (character.LeftLowerLeg != null) _initLeftKneeRot = character.LeftLowerLeg.localRotation;
            if (character.RightLowerLeg != null) _initRightKneeRot = character.RightLowerLeg.localRotation;
            if (character.Pelvis != null) _initPelvisPos = character.Pelvis.localPosition;
        }

        /// <summary>
        /// Feeds current locomotive velocity from PlayerController or NavMeshAgent.
        /// </summary>
        public void UpdateLocomotionState(float speed, bool isGrounded = true)
        {
            _currentSpeed = Mathf.Max(0f, speed);
            _isMoving = _currentSpeed > 0.1f && isGrounded;
        }

        private void LateUpdate()
        {
            if (character == null || character.VisualRoot == null) return;

            float dt = Time.deltaTime;
            _breathPhase += dt * breathSpeed;

            if (_isMoving && !_isSitting)
            {
                AnimateWalkCycle(dt);
            }
            else
            {
                AnimateIdleStance(dt);
            }

            ApplySittingPoseOverride(dt);
            ApplyHoldPoseOverride(dt);
            ApplyActionDipOverride(dt);
        }

        private void ApplySittingPoseOverride(float dt)
        {
            float targetSit = _isSitting ? 1f : 0f;
            _sitWeight = Mathf.MoveTowards(_sitWeight, targetSit, dt * 6.0f);
            if (_sitWeight <= 0.001f) return;

            // Sitting lowers the pelvis and brings thighs forward (-X in Unity left-handed frame)
            // with knees bent back down (+X). On a bench knees bend ~84 deg; on sidewalk/floor
            // legs extend slightly forward and splayed so shoes rest naturally above ground.
            float pelvisDropY = _sittingOnBench ? -0.05f : -0.37f;
            Vector3 sitPelvisPos = _initPelvisPos + new Vector3(0f, pelvisDropY, 0f);
            if (character.Pelvis != null)
            {
                character.Pelvis.localPosition = Vector3.Lerp(character.Pelvis.localPosition, sitPelvisPos, _sitWeight);
            }

            float thighPitch = _sittingOnBench ? -86f : -84f;
            float thighYaw = _sittingOnBench ? 8f : 18f;
            float kneeBend = _sittingOnBench ? 84f : 14f;

            if (character.LeftLegRoot != null)
            {
                Quaternion targetL = _initLeftLegRot * Quaternion.Euler(thighPitch, -thighYaw, 0f);
                character.LeftLegRoot.localRotation = Quaternion.Slerp(character.LeftLegRoot.localRotation, targetL, _sitWeight);
            }
            if (character.RightLegRoot != null)
            {
                Quaternion targetR = _initRightLegRot * Quaternion.Euler(thighPitch, thighYaw, 0f);
                character.RightLegRoot.localRotation = Quaternion.Slerp(character.RightLegRoot.localRotation, targetR, _sitWeight);
            }
            if (character.LeftLowerLeg != null)
            {
                Quaternion targetKneeL = _initLeftKneeRot * Quaternion.Euler(kneeBend, 0f, 0f);
                character.LeftLowerLeg.localRotation = Quaternion.Slerp(character.LeftLowerLeg.localRotation, targetKneeL, _sitWeight);
            }
            if (character.RightLowerLeg != null)
            {
                Quaternion targetKneeR = _initRightKneeRot * Quaternion.Euler(kneeBend, 0f, 0f);
                character.RightLowerLeg.localRotation = Quaternion.Slerp(character.RightLowerLeg.localRotation, targetKneeR, _sitWeight);
            }

            // Relaxed seated hands resting near lap/knees when hands are free
            if (_holdPoseStyle == HoldPoseStyle.None)
            {
                BlendArmPose(true, new Vector3(-24f, 14f, 10f), new Vector3(-32f, 0f, 0f), _sitWeight);
                BlendArmPose(false, new Vector3(-24f, -14f, -10f), new Vector3(-32f, 0f, 0f), _sitWeight);
            }
        }

        private void ApplyActionDipOverride(float dt)
        {
            if (_actionDipTimer <= 0f) return;
            _actionDipTimer = Mathf.Max(0f, _actionDipTimer - dt);
            float t = Mathf.Sin((_actionDipTimer / 0.55f) * Mathf.PI);
            if (character.Torso != null)
            {
                character.Torso.localRotation = character.Torso.localRotation * Quaternion.Euler(18f * t, 0f, 0f);
            }
            if (character.RightArmRoot != null)
            {
                character.RightArmRoot.localRotation = character.RightArmRoot.localRotation * Quaternion.Euler(-22f * t, 0f, 0f);
            }
        }

        private void ApplyHoldPoseOverride(float dt)
        {
            float targetWeight = _holdPoseStyle != HoldPoseStyle.None ? 1f : 0f;
            _holdPoseWeight = Mathf.MoveTowards(_holdPoseWeight, targetWeight, dt * 7.5f);
            if (_holdPoseWeight <= 0.001f) return;

            HoldPoseStyle activeStyle = _holdPoseStyle != HoldPoseStyle.None ? _holdPoseStyle : _lastActiveHoldPose;
            float sway = _isMoving ? Mathf.Sin(_walkPhase) * 2.5f : Mathf.Sin(_breathPhase) * 1.2f;

            // Negative X rotation lifts a hanging (-Y) arm/forearm FORWARD (+Z) in Unity's left-handed frame.
            // On RightArmRoot (+X), negative Y turns forward arm inward (-X) and negative Z opens outward (+X).
            // On LeftArmRoot (-X), positive Y turns forward arm inward (+X) and positive Z opens outward (-X).
            switch (activeStyle)
            {
                case HoldPoseStyle.OneHandDrink:
                    // Right hand holds mug/coffee upright at chest level; left arm swings freely.
                    BlendArmPose(isLeft: false,
                        shoulderEuler: new Vector3(-50f + sway * 0.5f, -14f, -6f),
                        forearmEuler: new Vector3(-58f, 0f, 0f),
                        weight: _holdPoseWeight);
                    break;

                case HoldPoseStyle.OneHandCarryDown:
                    // Right arm hangs slightly out & bent carrying bucket, watering can, tied trash bag, or umbrella.
                    BlendArmPose(isLeft: false,
                        shoulderEuler: new Vector3(-28f + sway * 0.8f, 0f, -20f),
                        forearmEuler: new Vector3(-50f, 0f, 0f),
                        weight: _holdPoseWeight);
                    break;

                case HoldPoseStyle.OneHandFront:
                    // Right arm bends forward carrying book, chalk, tile sample, or broomstick.
                    BlendArmPose(isLeft: false,
                        shoulderEuler: new Vector3(-36f + sway * 0.6f, -12f, -8f),
                        forearmEuler: new Vector3(-54f, 0f, 0f),
                        weight: _holdPoseWeight);
                    break;

                case HoldPoseStyle.TwoHandsFront:
                    // Both arms raised & elbows bent inward cradling larger props (ball, traffic cone, water bowl).
                    BlendArmPose(isLeft: true,
                        shoulderEuler: new Vector3(-40f + sway * 0.45f, 14f, 5f),
                        forearmEuler: new Vector3(-52f, 0f, 0f),
                        weight: _holdPoseWeight);
                    BlendArmPose(isLeft: false,
                        shoulderEuler: new Vector3(-40f + sway * 0.45f, -14f, -5f),
                        forearmEuler: new Vector3(-52f, 0f, 0f),
                        weight: _holdPoseWeight);
                    break;

                case HoldPoseStyle.TwoHandsPushWheel:
                    // Both arms extended forward gripping the tall wheeled trash bin handle bar.
                    BlendArmPose(isLeft: true,
                        shoulderEuler: new Vector3(-82f + sway * 0.35f, 6f, 4f),
                        forearmEuler: new Vector3(-16f, 0f, 0f),
                        weight: _holdPoseWeight);
                    BlendArmPose(isLeft: false,
                        shoulderEuler: new Vector3(-82f + sway * 0.35f, -6f, -4f),
                        forearmEuler: new Vector3(-16f, 0f, 0f),
                        weight: _holdPoseWeight);
                    break;
            }
        }

        private void BlendArmPose(bool isLeft, Vector3 shoulderEuler, Vector3 forearmEuler, float weight)
        {
            Transform armRoot = isLeft ? character.LeftArmRoot : character.RightArmRoot;
            Transform forearm = isLeft ? character.LeftForearm : character.RightForearm;
            Quaternion initArm = isLeft ? _initLeftArmRot : _initRightArmRot;
            Quaternion initForearm = isLeft ? _initLeftForearmRot : _initRightForearmRot;

            if (armRoot != null)
            {
                Quaternion targetArm = initArm * Quaternion.Euler(shoulderEuler);
                armRoot.localRotation = Quaternion.Slerp(armRoot.localRotation, targetArm, weight);
            }
            if (forearm != null)
            {
                Quaternion targetForearm = initForearm * Quaternion.Euler(forearmEuler);
                forearm.localRotation = Quaternion.Slerp(forearm.localRotation, targetForearm, weight);
            }
        }

        private void AnimateWalkCycle(float dt)
        {
            // Advance walk cycle based on forward travel velocity
            _walkPhase += dt * _currentSpeed * walkFrequency;

            float sinCycle = Mathf.Sin(_walkPhase);
            float cosCycle = Mathf.Cos(_walkPhase);

            // 1. Legs: alternating pendulum swing
            float legSwing = sinCycle * maxLegSwingAngle;
            if (character.LeftLegRoot != null)
            {
                character.LeftLegRoot.localRotation = _initLeftLegRot * Quaternion.Euler(legSwing, 0f, 0f);
            }
            if (character.RightLegRoot != null)
            {
                character.RightLegRoot.localRotation = _initRightLegRot * Quaternion.Euler(-legSwing, 0f, 0f);
            }

            // 2. Knees: bend forward during recovery stride to clear ground smoothly
            float leftKneeBend = Mathf.Max(0f, cosCycle) * maxKneeBendAngle;
            float rightKneeBend = Mathf.Max(0f, -cosCycle) * maxKneeBendAngle;

            if (character.LeftLowerLeg != null)
            {
                character.LeftLowerLeg.localRotation = _initLeftKneeRot * Quaternion.Euler(leftKneeBend, 0f, 0f);
            }
            if (character.RightLowerLeg != null)
            {
                character.RightLowerLeg.localRotation = _initRightKneeRot * Quaternion.Euler(rightKneeBend, 0f, 0f);
            }

            // 3. Arms: opposite arm-leg pendulum swing (Left arm swings with Right leg)
            float armSwing = -sinCycle * maxArmSwingAngle;
            if (character.LeftArmRoot != null)
            {
                character.LeftArmRoot.localRotation = _initLeftArmRot * Quaternion.Euler(armSwing, 0f, 8f);
            }
            if (character.RightArmRoot != null)
            {
                character.RightArmRoot.localRotation = _initRightArmRot * Quaternion.Euler(-armSwing, 0f, -8f);
            }

            // Forearms: slight dynamic bend during forward swing
            float leftForearmBend = 12f + Mathf.Max(0f, -sinCycle) * 16f;
            float rightForearmBend = 12f + Mathf.Max(0f, sinCycle) * 16f;

            if (character.LeftForearm != null)
            {
                character.LeftForearm.localRotation = _initLeftForearmRot * Quaternion.Euler(leftForearmBend, 0f, 0f);
            }
            if (character.RightForearm != null)
            {
                character.RightForearm.localRotation = _initRightForearmRot * Quaternion.Euler(rightForearmBend, 0f, 0f);
            }

            // 4. Pelvis: double-frequency rhythmic vertical bounce
            float bounce = Mathf.Abs(sinCycle) * 0.015f;
            if (character.Pelvis != null)
            {
                character.Pelvis.localPosition = _initPelvisPos + new Vector3(0f, bounce, 0f);
            }

            // 5. Torso: subtle counter-rotation (yaw twist)
            float torsoTwist = -sinCycle * 2.2f;
            if (character.Torso != null)
            {
                character.Torso.localRotation = _initTorsoRot * Quaternion.Euler(2f, torsoTwist, 0f);
            }

            // 6. Head: stays forward-facing and stable, absorbing torso twist
            if (character.HeadHinge != null)
            {
                character.HeadHinge.localRotation = _initHeadRot * Quaternion.Euler(1.5f, -torsoTwist * 0.8f, 0f);
            }
        }

        private void AnimateIdleStance(float dt)
        {
            // Smoothly ease walk phase back towards neutral
            _walkPhase = Mathf.Lerp(_walkPhase, 0f, dt * 5f);

            float breathCycle = Mathf.Sin(_breathPhase);
            float chestBreath = breathCycle * 0.005f;
            float headBreath = breathCycle * 0.45f;

            // Rest legs to grounded stance
            if (character.LeftLegRoot != null) character.LeftLegRoot.localRotation = Quaternion.Slerp(character.LeftLegRoot.localRotation, _initLeftLegRot, dt * 8f);
            if (character.RightLegRoot != null) character.RightLegRoot.localRotation = Quaternion.Slerp(character.RightLegRoot.localRotation, _initRightLegRot, dt * 8f);
            if (character.LeftLowerLeg != null) character.LeftLowerLeg.localRotation = Quaternion.Slerp(character.LeftLowerLeg.localRotation, _initLeftKneeRot, dt * 8f);
            if (character.RightLowerLeg != null) character.RightLowerLeg.localRotation = Quaternion.Slerp(character.RightLowerLeg.localRotation, _initRightKneeRot, dt * 8f);
            if (character.Pelvis != null) character.Pelvis.localPosition = Vector3.Lerp(character.Pelvis.localPosition, _initPelvisPos, dt * 8f);

            if (isNpcAttendant)
            {
                // Attendant Counter Posture:
                // Arms resting attentively forward towards counter surface
                Quaternion counterArmL = _initLeftArmRot * Quaternion.Euler(26f, 10f, 6f);
                Quaternion counterArmR = _initRightArmRot * Quaternion.Euler(26f, -10f, -6f);
                Quaternion counterForearm = _initLeftForearmRot * Quaternion.Euler(38f, 0f, 0f);

                if (character.LeftArmRoot != null) character.LeftArmRoot.localRotation = Quaternion.Slerp(character.LeftArmRoot.localRotation, counterArmL, dt * 6f);
                if (character.RightArmRoot != null) character.RightArmRoot.localRotation = Quaternion.Slerp(character.RightArmRoot.localRotation, counterArmR, dt * 6f);
                if (character.LeftForearm != null) character.LeftForearm.localRotation = Quaternion.Slerp(character.LeftForearm.localRotation, counterForearm, dt * 6f);
                if (character.RightForearm != null) character.RightForearm.localRotation = Quaternion.Slerp(character.RightForearm.localRotation, counterForearm, dt * 6f);

                if (character.Torso != null) character.Torso.localRotation = _initTorsoRot * Quaternion.Euler(chestBreath * 10f, 0f, 0f);
                if (character.HeadHinge != null) character.HeadHinge.localRotation = _initHeadRot * Quaternion.Euler(-headBreath, 0f, 0f);
            }
            else
            {
                // Player Relaxed Streetwear Stance:
                Quaternion relaxedArmL = _initLeftArmRot * Quaternion.Euler(0f, 0f, 7f);
                Quaternion relaxedArmR = _initRightArmRot * Quaternion.Euler(0f, 0f, -7f);
                Quaternion relaxedForearm = _initLeftForearmRot * Quaternion.Euler(10f, 0f, 0f);

                if (character.LeftArmRoot != null) character.LeftArmRoot.localRotation = Quaternion.Slerp(character.LeftArmRoot.localRotation, relaxedArmL, dt * 6f);
                if (character.RightArmRoot != null) character.RightArmRoot.localRotation = Quaternion.Slerp(character.RightArmRoot.localRotation, relaxedArmR, dt * 6f);
                if (character.LeftForearm != null) character.LeftForearm.localRotation = Quaternion.Slerp(character.LeftForearm.localRotation, relaxedForearm, dt * 6f);
                if (character.RightForearm != null) character.RightForearm.localRotation = Quaternion.Slerp(character.RightForearm.localRotation, relaxedForearm, dt * 6f);

                if (character.Torso != null) character.Torso.localRotation = _initTorsoRot * Quaternion.Euler(chestBreath * 8f, 0f, 0f);
                if (character.HeadHinge != null) character.HeadHinge.localRotation = _initHeadRot * Quaternion.Euler(headBreath, 0f, 0f);
            }
        }
    }
}
