using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Procedural animation controller for stylized Bobblehead characters.
    /// Drives natural walking cycles with alternating opposite arm/leg swings,
    /// knee flexion, pelvic bounce, and subtle breathing/counter-attendant stances.
    /// Strictly presentation-only: never modifies authoritative world state or positions.
    /// </summary>
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

            if (_isMoving)
            {
                AnimateWalkCycle(dt);
            }
            else
            {
                AnimateIdleStance(dt);
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
