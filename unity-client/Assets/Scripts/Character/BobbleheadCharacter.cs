using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Constructs and manages the 3D presentation hierarchy for stylized Bobblehead characters.
    /// Handles mesh generation, material assignment, transform hierarchy, and asset cleanup.
    /// </summary>
    public class BobbleheadCharacter : MonoBehaviour
    {
        [Header("Configuration")]
        [SerializeField] private BobbleheadConfig config;

        /// <summary>
        /// Project-owned character archetype identifier.
        /// </summary>
        public const string ArchetypeId = BobbleheadConfig.ArchetypeIdentifier;

        /// <summary>
        /// Reversible fallback switch: if set to true, reverts to the legacy pre-MVC_BobbleheadBase primitive assembly.
        /// </summary>
        public static bool UseLegacyPrimitiveAvatarFallback = false;

        // Named transform references for animation
        public Transform VisualRoot { get; private set; }
        public Transform Pelvis { get; private set; }
        public Transform Torso { get; private set; }
        public Transform HeadHinge { get; private set; }
        public Transform Head { get; private set; }
        public Transform LeftArmRoot { get; private set; }
        public Transform RightArmRoot { get; private set; }
        public Transform LeftForearm { get; private set; }
        public Transform RightForearm { get; private set; }
        public Transform LeftLegRoot { get; private set; }
        public Transform RightLegRoot { get; private set; }
        public Transform LeftLowerLeg { get; private set; }
        public Transform RightLowerLeg { get; private set; }
        public Transform LeftFoot { get; private set; }
        public Transform RightFoot { get; private set; }
        public BobbleheadConfig CurrentConfig => config;

        private readonly List<Mesh> _generatedMeshes = new List<Mesh>();
        private readonly Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        public void Initialize(BobbleheadConfig characterConfig)
        {
            this.config = (characterConfig ?? BobbleheadConfig.CreatePlayerConfig()).Clone();
            BuildCharacter();
        }

        private void Awake()
        {
            if (config != null && VisualRoot == null)
            {
                BuildCharacter();
            }
        }

        private void CleanUpGeneratedMeshes()
        {
            for (int i = 0; i < _generatedMeshes.Count; i++)
            {
                if (_generatedMeshes[i] != null)
                {
                    if (Application.isPlaying) Destroy(_generatedMeshes[i]);
                    else DestroyImmediate(_generatedMeshes[i]);
                }
            }
            _generatedMeshes.Clear();
        }

        private void OnDestroy()
        {
            CleanUpGeneratedMeshes();

            foreach (var kvp in _materialCache)
            {
                if (kvp.Value != null) Destroy(kvp.Value);
            }
            _materialCache.Clear();
        }

        [ContextMenu("Rebuild Character")]
        public void BuildCharacter()
        {
            if (config == null) config = BobbleheadConfig.CreatePlayerConfig();

            // Clean up any procedural meshes from previous builds to prevent resource leaks
            CleanUpGeneratedMeshes();

            // Clear previous visual root if present
            var existing = transform.Find("Avatar_Visual_Root");
            if (existing != null)
            {
                if (Application.isPlaying) Destroy(existing.gameObject);
                else DestroyImmediate(existing.gameObject);
            }

            GameObject root = new GameObject("Avatar_Visual_Root");
            root.transform.SetParent(transform, false);
            // If attached to a CharacterController, offset visual root by -skinWidth so shoe soles rest solidly on the floor
            var cc = GetComponentInParent<CharacterController>();
            float yOffset = cc != null ? -cc.skinWidth : 0f;
            root.transform.localPosition = new Vector3(0f, yOffset, 0f);
            root.transform.localRotation = Quaternion.identity;
            root.layer = 2; // Layer 2 = Ignore Raycast (camera never clips)
            VisualRoot = root.transform;

            bool isMvcPlayer = config.outfitType != BobbleheadOutfitType.WingSpotAttendant && !UseLegacyPrimitiveAvatarFallback;

            // Proportions adapted to body presentation while preserving ground level (0.00m) and target MVC_BobbleheadBase envelope
            float pelvisRadTop = 0.186f;
            float pelvisRadBot = 0.168f;
            float torsoRadTop = isMvcPlayer ? 0.218f : 0.23f;
            float torsoRadBot = isMvcPlayer ? 0.184f : 0.19f;

            if (config.bodyPresentation == BobbleheadBodyPresentation.Masculine)
            {
                pelvisRadTop = 0.185f;
                pelvisRadBot = 0.170f;
                torsoRadTop = isMvcPlayer ? 0.238f : 0.255f;
                torsoRadBot = 0.185f;
            }
            else if (config.bodyPresentation == BobbleheadBodyPresentation.Feminine)
            {
                pelvisRadTop = 0.196f;
                pelvisRadBot = 0.180f;
                torsoRadTop = isMvcPlayer ? 0.204f : 0.215f;
                torsoRadBot = 0.174f;
            }

            // 1. Pelvis / Waist (Y: 0.50m - aligns shoe soles precisely at Y = 0.00m, tucked cleanly inside jacket hem)
            Pelvis = CreatePart(root.transform, "Pelvis", new Vector3(0f, 0.50f, 0f));
            var pelvisMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateAnatomicalPelvisMesh(pelvisRadTop * 0.88f, pelvisRadTop * 0.70f, pelvisRadBot * 0.94f, pelvisRadBot * 0.76f, 0.16f, 8, 24)
                : BobbleheadGeometry.CreateTaperedCylinder(pelvisRadTop, pelvisRadBot, 0.16f, 18, false, true));
            AttachMeshRenderer(Pelvis.gameObject, pelvisMesh, GetMaterial("Pants", config.pantsColor, 0.12f));

            // 2. Torso & Upper Clothing (Y: 0.14m from Pelvis) - contoured streetwear jacket silhouette
            Torso = CreatePart(Pelvis, "Torso", new Vector3(0f, 0.14f, 0f));
            var torsoMesh = TrackMesh(BobbleheadGeometry.CreateTorsoMesh(torsoRadTop * 1.08f, torsoRadTop * 0.76f, torsoRadBot, torsoRadBot * 0.82f, 0.34f, 24));
            AttachMeshRenderer(Torso.gameObject, torsoMesh, GetMaterial("Outerwear", config.outerwearColor, 0.12f));

            // 2a. Innerwear / Collar accent (framing neckline cleanly)
            var collarObj = CreatePart(Torso, "Collar_Accent", new Vector3(0f, 0.17f, 0.01f));
            var collarMesh = TrackMesh(BobbleheadGeometry.CreateCollarMesh(0.21f, 0.18f, 0.046f, 20));
            AttachMeshRenderer(collarObj.gameObject, collarMesh, GetMaterial("Innerwear", config.innerwearColor, 0.12f), false);

            // 2b. Name badge if configured
            if (config.hasNameBadge)
            {
                var badge = CreatePart(Torso, "Name_Badge", new Vector3(0.11f, 0.08f, 0.18f));
                badge.localScale = new Vector3(0.09f, 0.045f, 0.015f);
                var cubeMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.06f, 0.06f, 0.02f, 8));
                AttachMeshRenderer(badge.gameObject, cubeMesh, GetMaterial("GoldBadge", new Color(0.95f, 0.82f, 0.15f), 0.90f), false);

                // Floating text on badge
                var txtObj = new GameObject("Badge_Text");
                txtObj.transform.SetParent(badge, false);
                txtObj.transform.localPosition = new Vector3(0f, 0f, 0.02f);
                var tm = txtObj.AddComponent<TextMesh>();
                tm.text = config.badgeText;
                tm.fontSize = 20;
                tm.characterSize = 0.015f;
                tm.alignment = TextAlignment.Center;
                tm.anchor = TextAnchor.MiddleCenter;
                tm.color = Color.black;
            }

            // 3. Sculpted Anatomical Neck & Articulated Head Hinge
            var neck = CreatePart(Torso, "Neck", new Vector3(0f, 0.18f, 0f));
            var neckMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateAnatomicalNeckMesh(0.112f, 0.092f, 0.138f, 0.122f, 0.18f, 8, 20)
                : BobbleheadGeometry.CreateTaperedCylinder(0.08f, 0.09f, 0.09f, 14, false, false));
            AttachMeshRenderer(neck.gameObject, neckMesh, GetMaterial("Skin", config.skinColor, 0.18f));

            HeadHinge = CreatePart(neck, "Head_Hinge", new Vector3(0f, isMvcPlayer ? 0.055f : 0.06f, 0f));

            // 4. Stylized Bobblehead Head (MVC_BobbleheadBase target: ~44.8% head-to-height ratio, ~1.59m total height, zero neck gap)
            float effectiveHeadScale = isMvcPlayer ? config.headScale * 0.925f : config.headScale;
            float headLocalY = isMvcPlayer ? 0.320f * config.headScale : 0.25f * config.headScale;
            Head = CreatePart(HeadHinge, "Head", new Vector3(0f, headLocalY, 0f));
            Head.localScale = Vector3.one * effectiveHeadScale;
            var headMesh = TrackMesh(BobbleheadGeometry.CreateStylizedHead(config.faceShape));
            AttachMeshRenderer(Head.gameObject, headMesh, GetMaterial("Skin", config.skinColor, 0.18f));

            // 5. Facial Features (adapted to face shape)
            BuildFace(Head);

            // 5b. Facial Hair (stubble, mustache, goatee, full beard)
            BuildFacialHair(Head);

            // 6. Hair & Headwear (independently layered for MVC_BobbleheadBase)
            BuildHairAndHeadwear(Head);

            // 7. Left & Right Arms
            BuildArm(Torso, true);
            BuildArm(Torso, false);

            // 8. Left & Right Legs
            BuildLeg(Pelvis, true);
            BuildLeg(Pelvis, false);
        }

        private void BuildFace(Transform headParent)
        {
            Material scleraMat = GetMaterial("EyeWhite", new Color(0.98f, 0.98f, 0.98f), 0.75f);
            Material irisMat = GetMaterial("Iris", config.eyeColor, 0.80f);
            Material pupilMat = GetMaterial("Pupil", config.pupilColor, 0.85f);
            Material specMat = GetMaterial("Specular", Color.white, 0.98f);
            Material browMat = GetMaterial("Brow", config.eyebrowColor, 0.10f);
            Color noseColor = Color.Lerp(config.skinColor, new Color(0.88f, 0.65f, 0.58f), 0.12f);
            Material noseMat = GetMaterial("Nose", noseColor, 0.18f);
            Material lipMat = GetMaterial("Lip", config.lipColor, 0.25f);
            Color blendedBlush = Color.Lerp(config.skinColor, new Color(config.blushColor.r, config.blushColor.g, config.blushColor.b, 1f), config.blushColor.a * 0.40f);
            Material blushMat = GetMaterial("Blush", blendedBlush, 0.10f);

            var eyeDiscMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.065f, 0.075f, 0.012f, 16));
            var irisDiscMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.045f, 0.052f, 0.008f, 16));
            var pupilDiscMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.026f, 0.030f, 0.006f, 14));
            var specDiscMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.012f, 0.014f, 0.004f, 10));

            // Face-shape adapted feature positioning coordinates
            float eyeY = 0.02f;
            float eyeZ = 0.285f;
            float eyeX = 0.125f;
            float browY = 0.13f;
            float browZ = 0.295f;
            float mouthY = -0.125f;
            float mouthZ = 0.316f;
            float noseY = -0.020f;
            float noseZ = 0.312f;
            float blushY = -0.068f;
            float blushZ = 0.292f;
            float earX = 0.335f;
            float earY = 0.02f;

            if (config.faceShape == BobbleheadFaceShape.Oval)
            {
                eyeY = 0.030f;
                eyeX = 0.118f;
                browY = 0.145f;
                browZ = 0.292f;
                mouthY = -0.135f;
                mouthZ = 0.308f;
                noseZ = 0.308f;
                blushY = -0.072f;
                blushZ = 0.286f;
                earX = 0.310f;
                earY = 0.030f;
            }
            else if (config.faceShape == BobbleheadFaceShape.Angular)
            {
                eyeY = 0.020f;
                eyeX = 0.128f;
                browY = 0.130f;
                browZ = 0.298f;
                mouthY = -0.120f;
                mouthZ = 0.320f;
                noseZ = 0.316f;
                blushY = -0.065f;
                blushZ = 0.296f;
                earX = 0.340f;
            }

            // Left & Right Eye Pairs
            float[] eyeXs = { -eyeX, eyeX };
            for (int i = 0; i < 2; i++)
            {
                float x = eyeXs[i];
                float sign = i == 0 ? -1f : 1f;

                // Eye Socket / Sclera (no self-shadow)
                var eye = CreatePart(headParent, i == 0 ? "Eye_L" : "Eye_R", new Vector3(x, eyeY, eyeZ), new Vector3(0f, sign * 6f, 0f));
                AttachMeshRenderer(eye.gameObject, eyeDiscMesh, scleraMat, false);

                // Iris
                var iris = CreatePart(eye, "Iris", new Vector3(0f, -0.005f, 0.008f));
                AttachMeshRenderer(iris.gameObject, irisDiscMesh, irisMat, false);

                // Pupil
                var pupil = CreatePart(iris, "Pupil", new Vector3(0f, 0f, 0.006f));
                AttachMeshRenderer(pupil.gameObject, pupilDiscMesh, pupilMat, false);

                // Specular Highlight (catchlight at top-right of pupil)
                var spec = CreatePart(pupil, "Catchlight", new Vector3(0.012f, 0.014f, 0.005f));
                AttachMeshRenderer(spec.gameObject, specDiscMesh, specMat, false);

                // Arched 3D Eyebrow with tapered tail
                var brow = CreatePart(headParent, i == 0 ? "Brow_L" : "Brow_R", new Vector3(x, browY, browZ), new Vector3(0f, sign * 6f, 0f));
                var browMesh = TrackMesh(BobbleheadGeometry.CreateStylizedEyebrow(i == 0));
                AttachMeshRenderer(brow.gameObject, browMesh, browMat, false);

                // Cheerful blush accent resting conformally on cheek surface
                var blush = CreatePart(headParent, i == 0 ? "Blush_L" : "Blush_R", new Vector3(x * 1.24f, blushY, blushZ), new Vector3(6f, sign * 24f, 0f));
                var blushMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.044f, 0.026f, 0.008f, 14));
                AttachMeshRenderer(blush.gameObject, blushMesh, blushMat, false);
            }

            // Nose (sculpted nasal bridge + rounded tip + alar wings blending with face)
            var nose = CreatePart(headParent, "Nose", new Vector3(0f, noseY, noseZ));
            var noseMesh = TrackMesh(BobbleheadGeometry.CreateStylizedButtonNose());
            AttachMeshRenderer(nose.gameObject, noseMesh, noseMat, true);

            // Mouth (friendly upward-curving smile arc)
            var mouth = CreatePart(headParent, "Mouth", new Vector3(0f, mouthY, mouthZ));
            var mouthMesh = TrackMesh(BobbleheadGeometry.CreateStylizedMouth());
            AttachMeshRenderer(mouth.gameObject, mouthMesh, lipMat, false);

            // Left & Right Sculpted C-Cup Ears
            for (int i = 0; i < 2; i++)
            {
                bool isLeftEar = i == 0;
                float sign = isLeftEar ? -1f : 1f;
                var ear = CreatePart(headParent, isLeftEar ? "Ear_L" : "Ear_R", new Vector3(sign * (earX - 0.008f), earY, -0.01f), new Vector3(0f, sign * 14f, 0f));
                var earMesh = TrackMesh(BobbleheadGeometry.CreateStylizedEarMesh(isLeftEar));
                AttachMeshRenderer(ear.gameObject, earMesh, GetMaterial("Skin", config.skinColor, 0.18f), true);
            }
        }

        private void BuildFacialHair(Transform headParent)
        {
            if (config.facialHair == BobbleheadFacialHair.None) return;

            Material facialHairMat = GetMaterial("Hair", config.hairColor, 0.12f);
            float zOffset = config.faceShape == BobbleheadFaceShape.Angular ? 0.005f : 0f;
            float mouthY = config.faceShape == BobbleheadFaceShape.Oval ? -0.135f : (config.faceShape == BobbleheadFaceShape.Angular ? -0.120f : -0.125f);
            float mouthZ = config.faceShape == BobbleheadFaceShape.Angular ? 0.320f : (config.faceShape == BobbleheadFaceShape.Oval ? 0.308f : 0.316f);

            if (config.facialHair == BobbleheadFacialHair.SubtleStubble)
            {
                var stubble = CreatePart(headParent, "Stubble", Vector3.zero);
                var stubbleMesh = TrackMesh(BobbleheadGeometry.CreateStubbleMesh(0.334f, 0.314f, 0.13f));
                AttachMeshRenderer(stubble.gameObject, stubbleMesh, GetMaterial("Stubble", Color.Lerp(config.skinColor, config.hairColor, 0.55f), 0.08f), false);
            }
            else if (config.facialHair == BobbleheadFacialHair.Mustache)
            {
                var mustache = CreatePart(headParent, "Mustache", new Vector3(0f, mouthY + 0.045f, mouthZ + 0.018f + zOffset));
                var mustacheMesh = TrackMesh(BobbleheadGeometry.CreateMustacheMesh(0.13f, 0.032f, 0.025f));
                AttachMeshRenderer(mustache.gameObject, mustacheMesh, facialHairMat, false);
            }
            else if (config.facialHair == BobbleheadFacialHair.Goatee)
            {
                var goatee = CreatePart(headParent, "Goatee", new Vector3(0f, mouthY - 0.040f, mouthZ + 0.005f + zOffset));
                var goateeMesh = TrackMesh(BobbleheadGeometry.CreateGoateeMesh(0.065f, 0.065f, 0.028f));
                AttachMeshRenderer(goatee.gameObject, goateeMesh, facialHairMat, false);
            }
            else if (config.facialHair == BobbleheadFacialHair.FullBeard)
            {
                var beard = CreatePart(headParent, "Beard", Vector3.zero);
                var beardMesh = TrackMesh(BobbleheadGeometry.CreateBeardMesh(0.338f, 0.318f, 0.16f));
                AttachMeshRenderer(beard.gameObject, beardMesh, facialHairMat, false);

                var mustache = CreatePart(headParent, "Mustache", new Vector3(0f, mouthY + 0.045f, mouthZ + 0.018f + zOffset));
                var mustacheMesh = TrackMesh(BobbleheadGeometry.CreateMustacheMesh(0.13f, 0.032f, 0.025f));
                AttachMeshRenderer(mustache.gameObject, mustacheMesh, facialHairMat, false);
            }
        }

        private void BuildHairAndHeadwear(Transform headParent)
        {
            Material hairMat = GetMaterial("Hair", config.hairColor, 0.12f);
            Material headwearMat = GetMaterial("Headwear", config.headwearColor, 0.10f);
            Material accentMat = GetMaterial("HeadwearAccent", config.headwearAccentColor, 0.20f);

            float earX = config.faceShape == BobbleheadFaceShape.Oval ? 0.310f : (config.faceShape == BobbleheadFaceShape.Angular ? 0.340f : 0.335f);
            float browY = config.faceShape == BobbleheadFaceShape.Oval ? 0.145f : 0.130f;

            // NPC / Elena Morales Exclusive Style (100% isolated from player headwear changes)
            if (config.hairStyle == BobbleheadHairType.AttendantBun)
            {
                // 1. Sleek Parted Hair Base
                var hairCap = CreatePart(headParent, "Hair_Base", new Vector3(0f, 0.07f, -0.03f));
                hairCap.localScale = new Vector3(1.02f, 1.02f, 1.04f);
                var hairCapMesh = TrackMesh(BobbleheadGeometry.CreateBeanieCap(0.335f, 0.31f, 0.06f, underHeadwear: true));
                AttachMeshRenderer(hairCap.gameObject, hairCapMesh, hairMat);

                // 2. High Attendant Bun at Crown / Rear
                var bun = CreatePart(headParent, "Attendant_Bun", new Vector3(0f, 0.26f, -0.22f));
                bun.localScale = new Vector3(1.0f, 1.0f, 1.0f);
                var bunMesh = TrackMesh(BobbleheadGeometry.CreateSleeveCap(0.11f, 0.09f, 16));
                AttachMeshRenderer(bun.gameObject, bunMesh, hairMat);

                // 3. Wing Spot Signature Red Visor / Headband
                var visorBand = CreatePart(headParent, "Visor_Band", new Vector3(0f, 0.155f, 0.00f), new Vector3(-6f, 0f, 0f));
                visorBand.localScale = new Vector3(1.02f, 1.0f, 0.98f);
                var bandMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.342f, 0.342f, 0.048f, 20));
                AttachMeshRenderer(visorBand.gameObject, bandMesh, headwearMat);

                // 4. Visor Bill
                var visorBill = CreatePart(headParent, "Visor_Bill", new Vector3(0f, 0.150f, 0.25f), new Vector3(10f, 0f, 0f));
                visorBill.localScale = new Vector3(1.45f, 1.0f, 1.10f);
                var billMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.14f, 0.16f, 0.022f, 16));
                AttachMeshRenderer(visorBill.gameObject, billMesh, headwearMat);
                return;
            }

            // Resolve effective hairstyle & headwear (supporting legacy StreetBeanie enum if passed programmatically)
            BobbleheadHairType effectiveHair = config.hairStyle == BobbleheadHairType.StreetBeanie
                ? BobbleheadHairType.CasualShort
                : config.hairStyle;
            BobbleheadHeadwearType effectiveHeadwear = config.hairStyle == BobbleheadHairType.StreetBeanie
                ? BobbleheadHeadwearType.WinterBeanie
                : config.headwear;

            bool hasHat = effectiveHeadwear != BobbleheadHeadwearType.None;

            // =========================================================================
            // STEP 1: Build Selected Hairstyle (tucking upper crown when under headwear)
            // =========================================================================
            if (effectiveHair == BobbleheadHairType.CasualShort)
            {
                var hairCap = CreatePart(headParent, "Hair_Base", new Vector3(0f, 0.08f, -0.03f));
                hairCap.localScale = new Vector3(1.02f, 1.02f, 1.04f);
                var capMesh = TrackMesh(BobbleheadGeometry.CreateBeanieCap(earX * 1.01f, 0.31f, 0.05f, underHeadwear: hasHat));
                AttachMeshRenderer(hairCap.gameObject, capMesh, hairMat);

                // Neat side-swept front fringe peeking below cap/beanie band
                float fringeY = hasHat ? browY + 0.010f : browY + 0.015f;
                var fringe = CreatePart(headParent, "Hair_Fringe", new Vector3(-0.04f, fringeY, 0.278f), new Vector3(12f, 10f, -8f));
                fringe.localScale = new Vector3(0.22f, 0.046f, 0.04f);
                var fringeMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.11f, 0.07f, 0.055f, 12));
                AttachMeshRenderer(fringe.gameObject, fringeMesh, hairMat);

                for (int i = 0; i < 2; i++)
                {
                    float sign = i == 0 ? -1f : 1f;
                    var sideburn = CreatePart(headParent, i == 0 ? "Sideburn_L" : "Sideburn_R", new Vector3(sign * (earX - 0.035f), 0.04f, 0.12f));
                    sideburn.localScale = new Vector3(0.035f, 0.09f, 0.04f);
                    var sbMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.04f, 0.02f, 0.09f, 8));
                    AttachMeshRenderer(sideburn.gameObject, sbMesh, hairMat);
                }
            }
            else if (effectiveHair == BobbleheadHairType.ShortTexturedCrop)
            {
                var cropCap = CreatePart(headParent, "Hair_Crop", new Vector3(0f, 0.09f, -0.02f));
                cropCap.localScale = new Vector3(1.03f, 1.03f, 1.04f);
                var capMesh = TrackMesh(BobbleheadGeometry.CreateBeanieCap(earX * 1.02f, 0.32f, 0.04f, underHeadwear: hasHat));
                AttachMeshRenderer(cropCap.gameObject, capMesh, hairMat);

                float tuftY = hasHat ? browY + 0.012f : browY + 0.02f;
                var centerTuft = CreatePart(headParent, "Hair_Tuft_Center", new Vector3(0f, tuftY, 0.278f), new Vector3(18f, 0f, 0f));
                centerTuft.localScale = new Vector3(0.10f, 0.04f, 0.04f);
                var tuftMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.05f, 0.03f, 0.05f, 8));
                AttachMeshRenderer(centerTuft.gameObject, tuftMesh, hairMat);

                var leftTuft = CreatePart(headParent, "Hair_Tuft_L", new Vector3(-0.09f, tuftY - 0.005f, 0.268f), new Vector3(15f, -12f, 8f));
                leftTuft.localScale = new Vector3(0.08f, 0.04f, 0.04f);
                AttachMeshRenderer(leftTuft.gameObject, tuftMesh, hairMat);

                var rightTuft = CreatePart(headParent, "Hair_Tuft_R", new Vector3(0.09f, tuftY - 0.005f, 0.268f), new Vector3(15f, 12f, -8f));
                rightTuft.localScale = new Vector3(0.08f, 0.04f, 0.04f);
                AttachMeshRenderer(rightTuft.gameObject, tuftMesh, hairMat);

                for (int i = 0; i < 2; i++)
                {
                    float sign = i == 0 ? -1f : 1f;
                    var sideburn = CreatePart(headParent, i == 0 ? "Sideburn_L" : "Sideburn_R", new Vector3(sign * (earX - 0.035f), 0.04f, 0.12f));
                    sideburn.localScale = new Vector3(0.035f, 0.08f, 0.04f);
                    var sbMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.04f, 0.02f, 0.08f, 8));
                    AttachMeshRenderer(sideburn.gameObject, sbMesh, hairMat);
                }
            }
            else if (effectiveHair == BobbleheadHairType.AfroCurly)
            {
                var afro = CreatePart(headParent, "Hair_Afro", new Vector3(0f, 0.08f, -0.02f));
                var afroMesh = TrackMesh(BobbleheadGeometry.CreateAfroMesh(earX * 1.14f, 0.39f, 0.37f, 16, 24, underHeadwear: hasHat));
                AttachMeshRenderer(afro.gameObject, afroMesh, hairMat);
            }
            else if (effectiveHair == BobbleheadHairType.SidePartedWavy)
            {
                var hairCap = CreatePart(headParent, "Hair_Base", new Vector3(0f, 0.08f, -0.03f));
                hairCap.localScale = new Vector3(1.03f, 1.03f, 1.05f);
                var capMesh = TrackMesh(BobbleheadGeometry.CreateBeanieCap(earX * 1.02f, 0.32f, 0.05f, underHeadwear: hasHat));
                AttachMeshRenderer(hairCap.gameObject, capMesh, hairMat);

                float waveY = hasHat ? browY + 0.008f : browY + 0.03f;
                var wave = CreatePart(headParent, "Hair_Wavy", new Vector3(-0.11f, waveY, 0.21f), new Vector3(10f, 25f, -15f));
                wave.localScale = new Vector3(0.17f, hasHat ? 0.085f : 0.12f, 0.06f);
                var waveMesh = TrackMesh(BobbleheadGeometry.CreateCurvedDisc(0.18f, 0.12f, 0.04f, 14));
                AttachMeshRenderer(wave.gameObject, waveMesh, hairMat);

                for (int i = 0; i < 2; i++)
                {
                    float sign = i == 0 ? -1f : 1f;
                    var sideburn = CreatePart(headParent, i == 0 ? "Sideburn_L" : "Sideburn_R", new Vector3(sign * (earX - 0.035f), 0.03f, 0.10f));
                    sideburn.localScale = new Vector3(0.04f, 0.11f, 0.05f);
                    var sbMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.045f, 0.025f, 0.11f, 8));
                    AttachMeshRenderer(sideburn.gameObject, sbMesh, hairMat);
                }
            }
            else if (effectiveHair == BobbleheadHairType.HighPonytail)
            {
                var hairCap = CreatePart(headParent, "Hair_Base", new Vector3(0f, 0.08f, -0.03f));
                hairCap.localScale = new Vector3(1.02f, 1.02f, 1.04f);
                var capMesh = TrackMesh(BobbleheadGeometry.CreateBeanieCap(earX * 1.01f, 0.31f, 0.05f, underHeadwear: hasHat));
                AttachMeshRenderer(hairCap.gameObject, capMesh, hairMat);

                // When wearing a cap or beanie, the ponytail emerges cleanly through the rear hat opening
                float tieY = hasHat ? 0.16f : 0.26f;
                float tieZ = hasHat ? -0.31f : -0.21f;
                var hairTie = CreatePart(headParent, "Hair_Tie", new Vector3(0f, tieY, tieZ), new Vector3(-25f, 0f, 0f));
                hairTie.localScale = new Vector3(0.09f, 0.09f, 0.04f);
                var tieMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.045f, 0.045f, 0.04f, 12));
                AttachMeshRenderer(hairTie.gameObject, tieMesh, accentMat);

                var plume = CreatePart(headParent, "Hair_Ponytail", new Vector3(0f, tieY, tieZ - 0.01f), new Vector3(-15f, 0f, 0f));
                var plumeMesh = TrackMesh(BobbleheadGeometry.CreatePonytailPlume(0.28f, 0.075f, 0.09f, 0.035f));
                AttachMeshRenderer(plume.gameObject, plumeMesh, hairMat);

                for (int i = 0; i < 2; i++)
                {
                    float sign = i == 0 ? -1f : 1f;
                    var sideburn = CreatePart(headParent, i == 0 ? "Sideburn_L" : "Sideburn_R", new Vector3(sign * (earX - 0.035f), 0.03f, 0.10f));
                    sideburn.localScale = new Vector3(0.03f, 0.09f, 0.035f);
                    var sbMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(0.035f, 0.02f, 0.09f, 8));
                    AttachMeshRenderer(sideburn.gameObject, sbMesh, hairMat);
                }
            }
            // BobbleheadHairType.Bald generates 0 hair pieces, leaving the clean skull

            // =========================================================================
            // STEP 2: Build Selected Independent Headwear (BaseballCap, WinterBeanie, None)
            // =========================================================================
            if (effectiveHeadwear == BobbleheadHeadwearType.BaseballCap)
            {
                float capRx = earX * 1.055f;
                float capRz = 0.340f;
                float capCrownH = 0.245f;

                var capCrown = CreatePart(headParent, "BaseballCap_Crown", new Vector3(0f, browY + 0.022f, -0.008f), new Vector3(-3f, 0f, 0f));
                var capMesh = TrackMesh(BobbleheadGeometry.CreateBaseballCapCrownAndVisorMesh(capRx, capRz, capCrownH));
                AttachMeshRenderer(capCrown.gameObject, capMesh, headwearMat);

                var capEmblem = CreatePart(capCrown, "BaseballCap_Emblem", Vector3.zero);
                var emblemMesh = TrackMesh(BobbleheadGeometry.CreateBaseballCapEmblemMesh(capRz, capCrownH));
                AttachMeshRenderer(capEmblem.gameObject, emblemMesh, accentMat, false);
            }
            else if (effectiveHeadwear == BobbleheadHeadwearType.WinterBeanie)
            {
                var beanie = CreatePart(headParent, "Beanie_Cap", new Vector3(0f, browY + 0.02f, -0.02f));
                beanie.localScale = Vector3.one * 1.04f;
                var beanieMesh = TrackMesh(BobbleheadGeometry.CreateStreetBeanieMesh(0.345f, 0.31f, 0.082f));
                AttachMeshRenderer(beanie.gameObject, beanieMesh, headwearMat);

                var tag = CreatePart(beanie, "Beanie_Label_Tag", new Vector3(-0.138f, 0.040f, 0.360f), new Vector3(0f, -22f, 0f));
                var tagMesh = TrackMesh(BobbleheadGeometry.CreateStylizedLabelTag(0.052f, 0.038f, 0.010f));
                AttachMeshRenderer(tag.gameObject, tagMesh, accentMat, false);
            }
            // BobbleheadHeadwearType.None generates 0 headwear objects
        }

        private void BuildArm(Transform torsoParent, bool isLeft)
        {
            float sign = isLeft ? -1f : 1f;
            string prefix = isLeft ? "Left" : "Right";
            string sfx = isLeft ? "_L" : "_R";

            Material sleeveMat = GetMaterial("Outerwear", config.outerwearColor, 0.12f);
            Material skinMat = GetMaterial("Skin", config.skinColor, 0.18f);

            bool isMvcPlayer = config.outfitType != BobbleheadOutfitType.WingSpotAttendant && !UseLegacyPrimitiveAvatarFallback;

            float armSpreadX = isMvcPlayer ? 0.228f : 0.26f;
            float upperArmRadTop = 0.078f;
            float upperArmRadBot = 0.066f;
            float forearmRadTop = 0.066f;
            float forearmRadBot = 0.056f;

            if (config.bodyPresentation == BobbleheadBodyPresentation.Masculine)
            {
                armSpreadX = isMvcPlayer ? 0.248f : 0.285f;
                upperArmRadTop = 0.084f;
                upperArmRadBot = 0.071f;
                forearmRadTop = 0.071f;
                forearmRadBot = 0.060f;
            }
            else if (config.bodyPresentation == BobbleheadBodyPresentation.Feminine)
            {
                armSpreadX = isMvcPlayer ? 0.212f : 0.235f;
                upperArmRadTop = 0.070f;
                upperArmRadBot = 0.060f;
                forearmRadTop = 0.060f;
                forearmRadBot = 0.051f;
            }

            // Shoulder / Arm Root
            var armRoot = CreatePart(torsoParent, $"{prefix}_Arm_Root", new Vector3(sign * armSpreadX, 0.12f, 0f));
            if (isLeft) LeftArmRoot = armRoot; else RightArmRoot = armRoot;

            // Upper Arm (contoured limb with rounded joint domes)
            var upperArm = CreatePart(armRoot, $"UpperArm{sfx}", new Vector3(0f, -0.11f, 0f));
            var upperArmMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateContouredLimbMesh(upperArmRadTop, upperArmRadBot, 0.22f, 0.006f, 12, 16)
                : BobbleheadGeometry.CreateTaperedCylinder(upperArmRadTop, upperArmRadBot, 0.22f, 14, false, false));
            AttachMeshRenderer(upperArm.gameObject, upperArmMesh, sleeveMat);

            // Shoulder sleeve cap bridging upper arm into torso
            var sleeveCap = CreatePart(upperArm, $"Sleeve_Cap{sfx}", new Vector3(0f, 0.105f, 0f));
            var sleeveCapMesh = TrackMesh(BobbleheadGeometry.CreateSleeveCap(upperArmRadTop * 1.08f, 0.052f));
            AttachMeshRenderer(sleeveCap.gameObject, sleeveCapMesh, sleeveMat);

            // Forearm & Elbow Hinge (contoured limb)
            var forearm = CreatePart(upperArm, $"Forearm{sfx}", new Vector3(0f, -0.18f, 0f));
            if (isLeft) LeftForearm = forearm; else RightForearm = forearm;
            var forearmMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateContouredLimbMesh(forearmRadTop, forearmRadBot, 0.18f, 0.005f, 12, 16)
                : BobbleheadGeometry.CreateTaperedCylinder(forearmRadTop, forearmRadBot, 0.18f, 14, false, false));
            AttachMeshRenderer(forearm.gameObject, forearmMesh, sleeveMat);

            // Wrist sleeve cuff framing the hand
            var wristCuff = CreatePart(forearm, $"Wrist_Cuff{sfx}", new Vector3(0f, -0.09f, 0f));
            wristCuff.localScale = new Vector3(forearmRadBot * 1.06f, 0.022f, forearmRadBot * 1.06f);
            var cuffMesh = TrackMesh(BobbleheadGeometry.CreateTaperedCylinder(1f, 0.94f, 1f, 14, true, true));
            AttachMeshRenderer(wristCuff.gameObject, cuffMesh, sleeveMat);

            // Articulated 4-Finger Sculpted Hand with contoured palm
            var hand = CreatePart(forearm, $"Hand{sfx}", new Vector3(0f, -0.105f, 0f));
            var handMesh = TrackMesh(BobbleheadGeometry.CreateStylizedHand(isLeft));
            AttachMeshRenderer(hand.gameObject, handMesh, skinMat);

            // 3D Sculpted Opposable Thumb angled naturally on the radial side of the palm
            float thumbSign = isLeft ? 1f : -1f;
            var thumb = CreatePart(hand, $"Thumb{sfx}", new Vector3(thumbSign * 0.032f, -0.026f, 0.014f), new Vector3(22f, thumbSign * 18f, -thumbSign * 26f));
            var thumbMesh = TrackMesh(BobbleheadGeometry.CreateSculptedThumbMesh(isLeft));
            AttachMeshRenderer(thumb.gameObject, thumbMesh, skinMat, false);
        }

        private void BuildLeg(Transform pelvisParent, bool isLeft)
        {
            float sign = isLeft ? -1f : 1f;
            string prefix = isLeft ? "Left" : "Right";
            string sfx = isLeft ? "_L" : "_R";

            Material pantsMat = GetMaterial("Pants", config.pantsColor, 0.12f);
            Material shoeBaseMat = GetMaterial("ShoeBase", config.shoeBaseColor, 0.25f);
            Material shoeAccentMat = GetMaterial("ShoeAccent", config.shoeAccentColor, 0.30f);

            bool isMvcPlayer = config.outfitType != BobbleheadOutfitType.WingSpotAttendant && !UseLegacyPrimitiveAvatarFallback;

            float legSpreadX = 0.11f;
            float thighRadTop = 0.085f;
            float thighRadBot = 0.075f;
            float calfRadTop = 0.075f;
            float calfRadBot = 0.065f;

            if (config.bodyPresentation == BobbleheadBodyPresentation.Masculine)
            {
                legSpreadX = 0.115f;
                thighRadTop = 0.088f;
                thighRadBot = 0.078f;
                calfRadTop = 0.078f;
                calfRadBot = 0.068f;
            }
            else if (config.bodyPresentation == BobbleheadBodyPresentation.Feminine)
            {
                legSpreadX = 0.110f;
                thighRadTop = 0.082f;
                thighRadBot = 0.072f;
                calfRadTop = 0.072f;
                calfRadBot = 0.062f;
            }

            // Leg Root (hip joint penetrates inside pelvis at Y = 0.50m - 0.01m = 0.49m)
            var legRoot = CreatePart(pelvisParent, $"{prefix}_Leg_Root", new Vector3(sign * legSpreadX, -0.01f, 0f));
            if (isLeft) LeftLegRoot = legRoot; else RightLegRoot = legRoot;

            // Thigh (contoured trouser leg with rounded hip/knee domes)
            var thigh = CreatePart(legRoot, $"Thigh{sfx}", new Vector3(0f, -0.11f, 0f));
            var thighMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateContouredLimbMesh(thighRadTop, thighRadBot, 0.24f, 0.006f, 10, 16)
                : BobbleheadGeometry.CreateTaperedCylinder(thighRadTop, thighRadBot, 0.24f, 14, false, false));
            AttachMeshRenderer(thigh.gameObject, thighMesh, pantsMat);

            // Lower Leg / Calf
            var calf = CreatePart(thigh, $"Calf{sfx}", new Vector3(0f, -0.18f, 0f));
            if (isLeft) LeftLowerLeg = calf; else RightLowerLeg = calf;
            var calfMesh = TrackMesh(isMvcPlayer
                ? BobbleheadGeometry.CreateContouredLimbMesh(calfRadTop, calfRadBot, 0.22f, 0.005f, 10, 16)
                : BobbleheadGeometry.CreateTaperedCylinder(calfRadTop, calfRadBot, 0.22f, 14, false, false));
            AttachMeshRenderer(calf.gameObject, calfMesh, pantsMat);

            // Stylized Sneaker / Shoe (grounded precisely at Y = 0.00m: 0.50 - 0.01 - 0.11 - 0.18 - 0.20 = 0.00m)
            var shoe = CreatePart(calf, $"Shoe{sfx}", new Vector3(0f, -0.20f, 0.02f));
            if (isLeft) LeftFoot = shoe; else RightFoot = shoe;
            var shoeMesh = TrackMesh(BobbleheadGeometry.CreateStylizedShoe(0.155f, 0.105f, 0.265f));
            AttachMeshRenderer(shoe.gameObject, shoeMesh, shoeBaseMat);

            // Contrast shoe accent stripe
            var stripe = CreatePart(shoe, "Shoe_Stripe", Vector3.zero);
            var stripeMesh = TrackMesh(BobbleheadGeometry.CreateSneakerStripe(0.155f, 0.105f, 0.265f));
            AttachMeshRenderer(stripe.gameObject, stripeMesh, shoeAccentMat, false);
        }

        private Transform CreatePart(Transform parent, string name, Vector3 localPos, Vector3 localRot = default)
        {
            GameObject obj = new GameObject(name);
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = localPos;
            obj.transform.localEulerAngles = localRot;
            obj.layer = 2; // Layer 2 = Ignore Raycast
            return obj.transform;
        }

        private void AttachMeshRenderer(GameObject obj, Mesh mesh, Material mat, bool castShadow = true)
        {
            var filter = obj.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;

            var renderer = obj.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = mat;
            renderer.shadowCastingMode = castShadow ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = true;
        }

        private Mesh TrackMesh(Mesh mesh)
        {
            if (mesh != null) _generatedMeshes.Add(mesh);
            return mesh;
        }

        private static Material _defaultMaterialTemplate;

        private Material GetMaterial(string key, Color color, float smoothness = 0.2f)
        {
            string cacheKey = $"{key}_{color.r:F2}_{color.g:F2}_{color.b:F2}_{smoothness:F2}";
            if (_materialCache.TryGetValue(cacheKey, out Material mat) && mat != null)
            {
                return mat;
            }

            if (_defaultMaterialTemplate == null)
            {
                GameObject temp = GameObject.CreatePrimitive(PrimitiveType.Cube);
                var r = temp.GetComponent<Renderer>();
                if (r != null && r.sharedMaterial != null)
                {
                    _defaultMaterialTemplate = r.sharedMaterial;
                }
                if (Application.isPlaying) Destroy(temp);
                else DestroyImmediate(temp);
            }

            if (_defaultMaterialTemplate != null)
            {
                mat = new Material(_defaultMaterialTemplate);
            }
            else
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit")
                             ?? Shader.Find("Universal Render Pipeline/Unlit")
                             ?? Shader.Find("Standard")
                             ?? Shader.Find("Diffuse");
                mat = shader != null ? new Material(shader) : new Material(Shader.Find("Sprites/Default"));
            }

            mat.name = $"Mat_Bobblehead_{cacheKey}";

            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);

            // Explicitly set metallic to 0.0f for cloth, skin, hair, and headwear to prevent metallic sheen.
            // Metallic is 0.85f only for gold badge.
            float metallic = (key == "GoldBadge") ? 0.85f : 0.0f;
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", metallic);

            _materialCache[cacheKey] = mat;
            return mat;
        }

        /// <summary>
        /// Phase C: Rebuilds character presentation with an updated configuration (hair, face shape, facial hair, body presentation).
        /// Recreates procedural visual components cleanly and cleans up old mesh assets.
        /// </summary>
        public void RebuildWithConfig(BobbleheadConfig newConfig)
        {
            if (newConfig == null) return;
            this.config = newConfig.Clone();
            BuildCharacter();
        }

        /// <summary>
        /// Phase B: Updates avatar colors in-place without destroying the GameObject hierarchy,
        /// without re-allocating procedural meshes, and without breaking bone/animator references.
        /// </summary>
        public void ApplyColors(BobbleheadConfig newConfig)
        {
            if (newConfig == null) return;

            if (this.config == null)
            {
                this.config = newConfig.Clone();
            }
            else
            {
                this.config.CopyColorsFrom(newConfig);
            }

            if (VisualRoot == null)
            {
                BuildCharacter();
                return;
            }

            var renderers = VisualRoot.GetComponentsInChildren<MeshRenderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                var r = renderers[i];
                if (r == null) continue;
                string partName = r.gameObject.name;

                switch (partName)
                {
                    case "Pelvis":
                    case "Thigh_L":
                    case "Thigh_R":
                    case "Calf_L":
                    case "Calf_R":
                        r.sharedMaterial = GetMaterial("Pants", config.pantsColor, 0.12f);
                        break;

                    case "Torso":
                    case "UpperArm_L":
                    case "UpperArm_R":
                    case "Sleeve_Cap_L":
                    case "Sleeve_Cap_R":
                    case "Wrist_Cuff_L":
                    case "Wrist_Cuff_R":
                    case "Forearm_L":
                    case "Forearm_R":
                        r.sharedMaterial = GetMaterial("Outerwear", config.outerwearColor, 0.12f);
                        break;

                    case "Collar_Accent":
                        r.sharedMaterial = GetMaterial("Innerwear", config.innerwearColor, 0.12f);
                        break;

                    case "Head":
                    case "Neck":
                    case "Hand_L":
                    case "Hand_R":
                    case "Thumb_L":
                    case "Thumb_R":
                    case "Ear_L":
                    case "Ear_R":
                        r.sharedMaterial = GetMaterial("Skin", config.skinColor, 0.18f);
                        break;

                    case "Nose":
                        Color noseCol = Color.Lerp(config.skinColor, new Color(0.88f, 0.65f, 0.58f), 0.12f);
                        r.sharedMaterial = GetMaterial("Nose", noseCol, 0.18f);
                        break;

                    case "Mouth":
                        r.sharedMaterial = GetMaterial("Lip", config.lipColor, 0.25f);
                        break;

                    case "Brow_L":
                    case "Brow_R":
                        r.sharedMaterial = GetMaterial("Brow", config.eyebrowColor, 0.10f);
                        break;

                    case "Blush_L":
                    case "Blush_R":
                        Color blCol = Color.Lerp(config.skinColor, new Color(config.blushColor.r, config.blushColor.g, config.blushColor.b, 1f), config.blushColor.a * 0.40f);
                        r.sharedMaterial = GetMaterial("Blush", blCol, 0.10f);
                        break;

                    case "Eye_L":
                    case "Eye_R":
                        r.sharedMaterial = GetMaterial("EyeWhite", new Color(0.98f, 0.98f, 0.98f), 0.75f);
                        break;

                    case "Iris":
                        r.sharedMaterial = GetMaterial("Iris", config.eyeColor, 0.80f);
                        break;

                    case "Pupil":
                        r.sharedMaterial = GetMaterial("Pupil", config.pupilColor, 0.85f);
                        break;

                    case "Catchlight":
                        r.sharedMaterial = GetMaterial("Specular", Color.white, 0.98f);
                        break;

                    case "Hair_Fringe":
                    case "Sideburn_L":
                    case "Sideburn_R":
                    case "Hair_Base":
                    case "Attendant_Bun":
                    case "Hair_Crop":
                    case "Hair_Afro":
                    case "Hair_Wavy":
                    case "Hair_Ponytail":
                    case "Hair_Tuft_Center":
                    case "Hair_Tuft_L":
                    case "Hair_Tuft_R":
                    case "Mustache":
                    case "Goatee":
                    case "Beard":
                        r.sharedMaterial = GetMaterial("Hair", config.hairColor, 0.12f);
                        break;

                    case "Stubble":
                        r.sharedMaterial = GetMaterial("Stubble", Color.Lerp(config.skinColor, config.hairColor, 0.55f), 0.08f);
                        break;

                    case "Hair_Tie":
                    case "Beanie_Label_Tag":
                    case "BaseballCap_Emblem":
                        r.sharedMaterial = GetMaterial("HeadwearAccent", config.headwearAccentColor, 0.20f);
                        break;

                    case "Beanie_Cap":
                    case "BaseballCap_Crown":
                    case "Visor_Band":
                    case "Visor_Bill":
                        r.sharedMaterial = GetMaterial("Headwear", config.headwearColor, 0.10f);
                        break;

                    case "Shoe_L":
                    case "Shoe_R":
                        r.sharedMaterial = GetMaterial("ShoeBase", config.shoeBaseColor, 0.25f);
                        break;

                    case "Shoe_Stripe":
                        r.sharedMaterial = GetMaterial("ShoeAccent", config.shoeAccentColor, 0.30f);
                        break;

                    case "Name_Badge":
                        r.sharedMaterial = GetMaterial("GoldBadge", new Color(0.95f, 0.82f, 0.15f), 0.90f);
                        break;
                }
            }
        }

        /// <summary>
        /// Reads the effective color applied to a specific part's renderer.
        /// Useful for testing, visual audits, and diagnostics.
        /// </summary>
        public Color GetRendererColor(string partName)
        {
            if (VisualRoot == null) return Color.clear;
            var renderers = VisualRoot.GetComponentsInChildren<MeshRenderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i].gameObject.name == partName)
                {
                    var mat = renderers[i].sharedMaterial;
                    if (mat != null)
                    {
                        if (mat.HasProperty("_BaseColor")) return mat.GetColor("_BaseColor");
                        if (mat.HasProperty("_Color")) return mat.GetColor("_Color");
                    }
                }
            }
            return Color.clear;
        }
    }
}
