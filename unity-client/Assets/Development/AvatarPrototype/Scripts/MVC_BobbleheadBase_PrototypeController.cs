using UnityEngine;

namespace MyVirtualCommunity.Development.AvatarPrototype
{
    /// <summary>
    /// Isolated prototype controller for the MVC_BobbleheadBase prototype variants.
    /// Does not interact with or modify the production PlayerController or BobbleheadAnimator.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class MVC_BobbleheadBase_PrototypeController : MonoBehaviour
    {
        [Header("Prototype Variant Metadata")]
        [SerializeField] private string variantId = "VariantB_145";
        [SerializeField] private string displayLabel = "Variant B (1.45x Head)";
        [SerializeField] private float relativeHeadScale = 1.45f;
        [SerializeField] private float prototypeRootScale = 1.086f;
        [SerializeField] private float measuredHeightMeters = 1.75f;

        [Header("Animation & Grounding")]
        [SerializeField] private Animator characterAnimator;
        [SerializeField] private SkinnedMeshRenderer bodyRenderer;
        [SerializeField] private string defaultClipState = "Idle";
        [SerializeField] private bool lockRootHorizontalDrift = true;

        private Vector3 _initialLocalPosition;
        private Quaternion _initialLocalRotation;

        public string VariantId => variantId;
        public string DisplayLabel => displayLabel;
        public float RelativeHeadScale => relativeHeadScale;
        public float PrototypeRootScale => prototypeRootScale;
        public float MeasuredHeightMeters => measuredHeightMeters;
        public Animator CharacterAnimator => characterAnimator;
        public SkinnedMeshRenderer BodyRenderer => bodyRenderer;

        public void ConfigureMetadata(
            string id,
            string label,
            float headScale,
            float rootScale,
            float heightMeters,
            Animator animator,
            SkinnedMeshRenderer renderer,
            string initialState = "Idle")
        {
            variantId = id;
            displayLabel = label;
            relativeHeadScale = headScale;
            prototypeRootScale = rootScale;
            measuredHeightMeters = heightMeters;
            characterAnimator = animator;
            bodyRenderer = renderer;
            defaultClipState = initialState;
        }

        private void Awake()
        {
            _initialLocalPosition = transform.localPosition;
            _initialLocalRotation = transform.localRotation;

            if (characterAnimator == null)
            {
                characterAnimator = GetComponentInChildren<Animator>();
            }

            if (bodyRenderer == null)
            {
                bodyRenderer = GetComponentInChildren<SkinnedMeshRenderer>();
            }

            if (characterAnimator != null)
            {
                characterAnimator.applyRootMotion = false;
            }
        }

        private void Start()
        {
            if (characterAnimator != null && !string.IsNullOrEmpty(defaultClipState))
            {
                PlayState(defaultClipState);
            }
        }

        private void LateUpdate()
        {
            if (lockRootHorizontalDrift)
            {
                transform.localPosition = _initialLocalPosition;
                transform.localRotation = _initialLocalRotation;
            }
        }

        public void PlayState(string stateName, float normalizedTime = 0f)
        {
            defaultClipState = stateName;
            if (characterAnimator != null && characterAnimator.runtimeAnimatorController != null)
            {
                characterAnimator.Play(stateName, 0, normalizedTime);
                characterAnimator.Update(0f);
            }
        }
    }
}
