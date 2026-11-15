using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using MyVirtualCommunity.Environment;
using MyVirtualCommunity.Player;
using MyVirtualCommunity.Npc;
using MyVirtualCommunity.Character;

namespace MyVirtualCommunity.Editor
{
    /// <summary>
    /// AvatarVisualAuditRunner renders and captures high-resolution evidence for:
    /// 1. Default player avatar visual correction (beanie ribbing/cuff/tag, nose skin tint, soft blush, arched brows, smile mouth, collar, sleeve caps, mitten hands, knee bands elimination, stylized sneakers grounded at Y=0).
    /// 2. In-situ gameplay third-person view on Blvd. Manuel Gómez Morín (matching user reference).
    /// 3. Elena Morales NPC 100% isolation at Wing Spot.
    /// 4. All Phase C appearance variants (8 hairstyles, 3 face shapes, 5 facial hair styles, 3 body presentations).
    /// </summary>
    public static class AvatarVisualAuditRunner
    {
        [MenuItem("MyVirtualCommunity/Run Avatar Visual Quality Audit")]
        public static void RunVisualAudit()
        {
            Debug.Log("[AvatarVisualAuditRunner] ========================================================");
            Debug.Log("[AvatarVisualAuditRunner] Starting Avatar Visual Quality Verification Audit...");
            Debug.Log("[AvatarVisualAuditRunner] ========================================================");

            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"[AvatarVisualAuditRunner] Opened scene: {scene.name}");

            // 1. Build Environment
            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[AvatarVisualAuditRunner] Environment built successfully.");
            }

            // 2. Setup Player on Gómez Morín sidewalk
            var player = UnityEngine.Object.FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                var pCc = player.GetComponent<CharacterController>();
                float pSkin = pCc != null ? pCc.skinWidth : 0.015f;
                player.transform.position = new Vector3(6.5f, 0.24f + pSkin, 2.6f);
                player.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                player.BuildPlayerAvatar();
                player.ApplyCustomizationConfig(BobbleheadConfig.CreatePlayerConfig());
                Debug.Log("[AvatarVisualAuditRunner] Player avatar built at standard spawn point with canonical default config.");
            }

            // 3. Setup Elena NPC at Wing Spot counter
            var elena = UnityEngine.Object.FindFirstObjectByType<ElenaNpcController>();
            if (elena == null)
            {
                var elenaObj = new GameObject("NPC_ElenaMorales");
                elenaObj.transform.position = new Vector3(-10.90f, 0.44f, 12.85f);
                elenaObj.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                elena = elenaObj.AddComponent<ElenaNpcController>();
            }
            if (elena != null)
            {
                elena.BuildAttendantAvatar();
                Debug.Log("[AvatarVisualAuditRunner] Elena Morales avatar built at Wing Spot counter.");
            }

            string outputDir = Path.Combine(Application.dataPath, "..", "audit_screenshots", "avatar_visual_quality");
            Directory.CreateDirectory(outputDir);

            string artifactDir = @"C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\audit_screenshots";
            Directory.CreateDirectory(artifactDir);

            // Create dedicated render camera
            GameObject camObj = new GameObject("AuditRenderCamera");
            Camera cam = camObj.AddComponent<Camera>();
            cam.fieldOfView = 50f;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 250f;
            cam.clearFlags = CameraClearFlags.Skybox;

            Vector3 pPos = player != null ? player.transform.position : new Vector3(6.5f, 0.24f, 2.6f);

            // PART 1: Default Player Avatar & In-Game Context (Unobstructed Line of Sight)
            var captures = new (string filename, Vector3 pos, Vector3 rot, string desc)[]
            {
                (
                    "avatar_01_gomez_morin_gameplay_view.png",
                    pPos + new Vector3(-0.65f, 1.55f, 2.75f),
                    new Vector3(12.0f, 168.0f, 0.0f),
                    "Third-person gameplay view matching user reference on Blvd. Manuel Gómez Morín with clean unobstructed sightline"
                ),
                (
                    "avatar_01b_gomez_morin_frontal_gameplay_view.png",
                    pPos + new Vector3(0.0f, 1.40f, -2.85f),
                    new Vector3(8.0f, 0.0f, 0.0f),
                    "Frontal in-situ gameplay view showing default avatar in street context, storefronts, and daylight shading"
                ),
                (
                    "avatar_02_default_front_view.png",
                    pPos + new Vector3(0.0f, 1.05f, -2.10f),
                    new Vector3(3.0f, 0.0f, 0.0f),
                    "Default player avatar full-body front view showing coherent facial shading, beanie cuff, collar, sleeve caps, and sneakers"
                ),
                (
                    "avatar_03_default_three_quarter_view.png",
                    pPos + new Vector3(-1.35f, 1.15f, -1.75f),
                    new Vector3(4.0f, 38.0f, 0.0f),
                    "Default player avatar 3/4 front view showing front beanie label tag, contoured button nose, and sneaker lateral wave stripe"
                ),
                (
                    "avatar_04_default_profile_side_view.png",
                    pPos + new Vector3(-2.10f, 1.05f, 0.0f),
                    new Vector3(2.0f, 90.0f, 0.0f),
                    "Default player avatar profile side view showing beanie slouch, mitten hand with thumb, seamless knee transition, and sole grounding at Y=0.00m"
                ),
                (
                    "avatar_05_default_lower_body_and_grounding.png",
                    pPos + new Vector3(0.0f, 0.45f, -1.35f),
                    new Vector3(-4.0f, 0.0f, 0.0f),
                    "Close-up of lower body showing continuous cloth trousers, elimination of knee bands, and sneaker sole grounding"
                ),
                (
                    "avatar_06_default_facial_features_closeup.png",
                    pPos + new Vector3(0.0f, 1.18f, -1.05f),
                    new Vector3(0.0f, 0.0f, 0.0f),
                    "Close-up of head and face showing skin tone harmony, arched brows, contoured button nose, smile mouth, soft blush, and beanie tag"
                ),
                (
                    "avatar_07_elena_morales_attendant_isolation.png",
                    new Vector3(-9.90f, 1.45f, 11.40f),
                    new Vector3(4.0f, -32.0f, 0.0f),
                    "Elena Morales NPC at Wing Spot counter confirming 100% isolation of attendant bun, red visor, uniform, and name badge"
                ),
                (
                    "avatar_08_default_rear_view.png",
                    pPos + new Vector3(0.0f, 1.05f, 2.10f),
                    new Vector3(3.0f, 180.0f, 0.0f),
                    "Default player avatar full-body rear view showing beanie slouch, jacket back silhouette, and retro sneaker heels"
                ),
                (
                    "avatar_09_default_face_three_quarter_closeup.png",
                    pPos + new Vector3(-0.65f, 1.20f, -0.90f),
                    new Vector3(2.0f, 35.0f, 0.0f),
                    "Close-up 3/4 face view showing facial contour integration, ear attachment, and knit cuff ribs under directional light"
                ),
                (
                    "tialupe_lateral_del_porvenir_facade_and_annex.png",
                    new Vector3(15.20f, 2.30f, 6.50f),
                    new Vector3(4.0f, -48.0f, 0.0f),
                    "Lateral view from Calle Del Porvenir matching reference photo: Pasteleria La Tia Lupe side storefront, red awning, and attached single-story residence with CFE meter, barred window, screen door, gate, and rooftop Coprohusa cooler"
                ),
                (
                    "del_porvenir_attached_residence_facade.png",
                    new Vector3(13.00f, 1.80f, 16.50f),
                    new Vector3(2.0f, -90.0f, 0.0f),
                    "Frontal lateral view from Calle Del Porvenir directly facing the attached residence, showing CFE meter, barred window, screen door, all-white gate frame, black gate, and rooftop equipment"
                ),
                (
                    "del_porvenir_user_view_tialupe_and_house.png",
                    new Vector3(16.50f, 2.10f, 13.50f),
                    new Vector3(2.5f, -90.0f, 0.0f),
                    "Exact in-game perspective matching user screenshot from Calle Del Porvenir: Tia Lupe storefront on left, wider 1-story house with Coprohusa cooler on right, open blue sky and billboard behind"
                ),
                (
                    "wingspot_interior_counter_service_view.png",
                    new Vector3(-8.40f, 1.70f, 8.50f),
                    new Vector3(4.0f, 0.0f, 0.0f),
                    "Customer viewpoint of Wing Spot service counter matching real photograph: projecting rustic wood cashier podium on left with POS terminal and paper notice, Elena Morales at register, kitchen pass-through in olive-green wall with white trim, pickup shelf with white brackets, 'RECOJA SU ORDEN AQUI' sign, promotional posters, dual chalkboard menu boards with daily specials (Lunes to Jueves), right-wall menu, and diagonal stone floor rug"
                ),
                (
                    "wingspot_interior_chalkboard_menus_closeup.png",
                    new Vector3(-8.40f, 2.75f, 9.60f),
                    new Vector3(0.0f, 0.0f, 0.0f),
                    "Close-up perspective of Wing Spot chalkboard daily specials menu boards directly above the kitchen pass-through, showing authentic Lunes, Martes, Miercoles, and Jueves combos and prices matching reference photograph"
                ),
                (
                    "wingspot_interior_user_perspective_pillar_and_restroom.png",
                    new Vector3(-9.30f, 1.85f, 9.20f),
                    new Vector3(12.0f, 48.0f, 0.0f),
                    "Exact 3rd-person elevated perspective matching user in-game screenshot: avatar on floor tapete in front of counter, decorative pillar terminating counter with vertical chalkboard menu, and open restroom door swinging into gap without touching tapete"
                ),
                (
                    "wingspot_interior_avatar_pass_sign_occlusion.png",
                    new Vector3(-8.40f, 1.15f, 9.35f),
                    new Vector3(3.0f, 0.0f, 0.0f),
                    "Avatar standing directly in front of 'RECOJA SU ORDEN AQUI.' sign below pickup shelf, proving complete depth occlusion with zero text rendering through the character body"
                ),
                (
                    "wingspot_interior_restroom_open_door_view.png",
                    new Vector3(-6.125f, 1.45f, 9.95f),
                    new Vector3(2.0f, 180.0f, 0.0f),
                    "Perspective looking through the open unisex restroom doorway from corridor gap: ceiling light fixture illuminating the room, porcelain toilet suite on South wall, sink and mirror on West wall, and ceramic floor tiles"
                ),
                (
                    "wingspot_interior_restroom_fixtures_closeup.png",
                    new Vector3(-5.55f, 1.40f, 8.95f),
                    new Vector3(-4.0f, -140.0f, 0.0f),
                    "Close-up interior perspective inside the restroom showing the ceramic wash basin with chrome faucet mixer, P-trap drainage, framed wall mirror directly above, toilet suite, and illuminated ceiling bulb"
                )
            };

            foreach (var cap in captures)
            {
                if (player != null)
                {
                    if (cap.filename == "wingspot_interior_user_perspective_pillar_and_restroom.png")
                    {
                        player.transform.position = new Vector3(-8.30f, 0.24f, 10.35f);
                        player.transform.rotation = Quaternion.Euler(0f, 25f, 0f);
                    }
                    else if (cap.filename == "wingspot_interior_avatar_pass_sign_occlusion.png")
                    {
                        player.transform.position = new Vector3(-8.40f, 0.24f, 10.75f);
                        player.transform.rotation = Quaternion.Euler(0f, 0f, 0f);
                    }
                    else
                    {
                        player.transform.position = new Vector3(6.5f, 0.24f, 2.6f);
                        player.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                    }
                }

                camObj.transform.position = cap.pos;
                camObj.transform.eulerAngles = cap.rot;

                RenderTexture rt = new RenderTexture(1920, 1080, 24);
                cam.targetTexture = rt;
                Texture2D screenShot = new Texture2D(1920, 1080, TextureFormat.RGB24, false);

                cam.Render();
                RenderTexture.active = rt;
                screenShot.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0);
                screenShot.Apply();

                cam.targetTexture = null;
                RenderTexture.active = null;
                UnityEngine.Object.DestroyImmediate(rt);

                byte[] bytes = screenShot.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(screenShot);

                File.WriteAllBytes(Path.Combine(outputDir, cap.filename), bytes);
                File.WriteAllBytes(Path.Combine(artifactDir, cap.filename), bytes);

                Debug.Log($"[AvatarVisualAuditRunner] Saved evidence: {cap.filename} ({cap.desc})");
            }

            // PART 2: Phase C Appearance Variant Audit
            if (player != null)
            {
                var playerBobblehead = player.GetComponentInChildren<BobbleheadCharacter>();
                if (playerBobblehead != null)
                {
                    // 0. Independent Headwear Comparison (BaseballCap vs WinterBeanie vs None on CasualShort)
                    Vector3 headThreeQPos = pPos + new Vector3(-0.62f, 1.22f, -0.92f);
                    Vector3 headThreeQRot = new Vector3(3.0f, 34.0f, 0.0f);
                    camObj.transform.position = headThreeQPos;
                    camObj.transform.eulerAngles = headThreeQRot;

                    var headwearOptions = new (BobbleheadHeadwearType hw, string fn)[]
                    {
                        (BobbleheadHeadwearType.BaseballCap, "avatar_headwear_01_baseballcap.png"),
                        (BobbleheadHeadwearType.WinterBeanie, "avatar_headwear_02_winterbeanie.png"),
                        (BobbleheadHeadwearType.None, "avatar_headwear_03_none.png")
                    };
                    foreach (var hwOpt in headwearOptions)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.hairStyle = BobbleheadHairType.CasualShort;
                        cfg.headwear = hwOpt.hw;
                        playerBobblehead.RebuildWithConfig(cfg);
                        CaptureSingle(cam, outputDir, artifactDir, hwOpt.fn);
                        Debug.Log($"[AvatarVisualAuditRunner] Captured headwear option: {hwOpt.hw}");
                    }

                    // 1. All 8 Hairstyles (unobstructed with Headwear = None, plus StreetBeanie legacy mapping)
                    Vector3 headCamPos = pPos + new Vector3(0.0f, 1.20f, -1.15f);
                    Vector3 headCamRot = new Vector3(0.0f, 0.0f, 0.0f);
                    camObj.transform.position = headCamPos;
                    camObj.transform.eulerAngles = headCamRot;

                    var hairTypes = (BobbleheadHairType[])Enum.GetValues(typeof(BobbleheadHairType));
                    for (int h = 0; h < hairTypes.Length; h++)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.hairStyle = hairTypes[h];
                        cfg.headwear = hairTypes[h] == BobbleheadHairType.StreetBeanie
                            ? BobbleheadHeadwearType.WinterBeanie
                            : BobbleheadHeadwearType.None;
                        playerBobblehead.RebuildWithConfig(cfg);

                        string fn = $"avatar_hair_{h + 1:D2}_{hairTypes[h].ToString().ToLowerInvariant()}.png";
                        CaptureSingle(cam, outputDir, artifactDir, fn);
                        Debug.Log($"[AvatarVisualAuditRunner] Captured hairstyle (no hat): {hairTypes[h]}");
                    }

                    // 1b. Player Hairstyles layered under Default BaseballCap (3/4 view verifying zero crown clipping)
                    camObj.transform.position = headThreeQPos;
                    camObj.transform.eulerAngles = headThreeQRot;
                    var playerHairStyles = new[]
                    {
                        BobbleheadHairType.CasualShort,
                        BobbleheadHairType.ShortTexturedCrop,
                        BobbleheadHairType.AfroCurly,
                        BobbleheadHairType.SidePartedWavy,
                        BobbleheadHairType.HighPonytail,
                        BobbleheadHairType.Bald
                    };
                    for (int h = 0; h < playerHairStyles.Length; h++)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.hairStyle = playerHairStyles[h];
                        cfg.headwear = BobbleheadHeadwearType.BaseballCap;
                        playerBobblehead.RebuildWithConfig(cfg);

                        string fn = $"avatar_hair_cap_{h + 1:D2}_{playerHairStyles[h].ToString().ToLowerInvariant()}.png";
                        CaptureSingle(cam, outputDir, artifactDir, fn);
                        Debug.Log($"[AvatarVisualAuditRunner] Captured hairstyle under BaseballCap: {playerHairStyles[h]}");
                    }

                    // 2. 3 Face Shapes
                    camObj.transform.position = headCamPos;
                    camObj.transform.eulerAngles = headCamRot;
                    var faceShapes = (BobbleheadFaceShape[])Enum.GetValues(typeof(BobbleheadFaceShape));
                    for (int f = 0; f < faceShapes.Length; f++)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.faceShape = faceShapes[f];
                        cfg.hairStyle = BobbleheadHairType.CasualShort;
                        cfg.headwear = BobbleheadHeadwearType.BaseballCap;
                        playerBobblehead.RebuildWithConfig(cfg);

                        string fn = $"avatar_face_{f + 1:D2}_{faceShapes[f].ToString().ToLowerInvariant()}.png";
                        CaptureSingle(cam, outputDir, artifactDir, fn);
                        Debug.Log($"[AvatarVisualAuditRunner] Captured face shape: {faceShapes[f]}");
                    }

                    // 3. 5 Facial Hair Styles
                    var facialHairs = (BobbleheadFacialHair[])Enum.GetValues(typeof(BobbleheadFacialHair));
                    for (int fh = 0; fh < facialHairs.Length; fh++)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.facialHair = facialHairs[fh];
                        cfg.hairStyle = BobbleheadHairType.CasualShort;
                        cfg.headwear = BobbleheadHeadwearType.BaseballCap;
                        playerBobblehead.RebuildWithConfig(cfg);

                        string fn = $"avatar_facial_hair_{fh + 1:D2}_{facialHairs[fh].ToString().ToLowerInvariant()}.png";
                        CaptureSingle(cam, outputDir, artifactDir, fn);
                        Debug.Log($"[AvatarVisualAuditRunner] Captured facial hair: {facialHairs[fh]}");
                    }

                    // 4. 3 Body Presentations (Full-body front and three-quarter views)
                    var bodyPresets = (BobbleheadBodyPresentation[])Enum.GetValues(typeof(BobbleheadBodyPresentation));
                    for (int b = 0; b < bodyPresets.Length; b++)
                    {
                        var cfg = BobbleheadConfig.CreatePlayerConfig();
                        cfg.bodyPresentation = bodyPresets[b];
                        playerBobblehead.RebuildWithConfig(cfg);

                        // Front view
                        camObj.transform.position = pPos + new Vector3(0.0f, 1.05f, -2.15f);
                        camObj.transform.eulerAngles = new Vector3(3.0f, 0.0f, 0.0f);
                        string fnFront = $"avatar_body_{b + 1:D2}_{bodyPresets[b].ToString().ToLowerInvariant()}.png";
                        CaptureSingle(cam, outputDir, artifactDir, fnFront);

                        // Three-quarter view
                        camObj.transform.position = pPos + new Vector3(-1.35f, 1.15f, -1.75f);
                        camObj.transform.eulerAngles = new Vector3(4.0f, 38.0f, 0.0f);
                        string fnThreeQ = $"avatar_body_{b + 1:D2}_{bodyPresets[b].ToString().ToLowerInvariant()}_three_quarter.png";
                        CaptureSingle(cam, outputDir, artifactDir, fnThreeQ);

                        Debug.Log($"[AvatarVisualAuditRunner] Captured body presentation: {bodyPresets[b]} (front and 3/4)");
                    }

                    // 5. Idle vs Walk Stride Pose Articulation Verification
                    playerBobblehead.RebuildWithConfig(BobbleheadConfig.CreatePlayerConfig());
                    camObj.transform.position = pPos + new Vector3(-1.35f, 1.10f, -1.65f);
                    camObj.transform.eulerAngles = new Vector3(4.0f, 38.0f, 0.0f);
                    CaptureSingle(cam, outputDir, artifactDir, "avatar_anim_01_idle_pose.png");

                    // Apply mid-stride walk pose to verify joint articulation & head bobble hinge
                    if (playerBobblehead.LeftArmRoot != null) playerBobblehead.LeftArmRoot.localRotation = Quaternion.Euler(24f, 0f, 6f);
                    if (playerBobblehead.RightArmRoot != null) playerBobblehead.RightArmRoot.localRotation = Quaternion.Euler(-24f, 0f, -6f);
                    if (playerBobblehead.LeftForearm != null) playerBobblehead.LeftForearm.localRotation = Quaternion.Euler(-18f, 0f, 0f);
                    if (playerBobblehead.RightForearm != null) playerBobblehead.RightForearm.localRotation = Quaternion.Euler(-8f, 0f, 0f);
                    if (playerBobblehead.LeftLegRoot != null) playerBobblehead.LeftLegRoot.localRotation = Quaternion.Euler(-22f, 0f, 0f);
                    if (playerBobblehead.RightLegRoot != null) playerBobblehead.RightLegRoot.localRotation = Quaternion.Euler(22f, 0f, 0f);
                    if (playerBobblehead.LeftLowerLeg != null) playerBobblehead.LeftLowerLeg.localRotation = Quaternion.Euler(14f, 0f, 0f);
                    if (playerBobblehead.RightLowerLeg != null) playerBobblehead.RightLowerLeg.localRotation = Quaternion.Euler(24f, 0f, 0f);
                    if (playerBobblehead.HeadHinge != null) playerBobblehead.HeadHinge.localRotation = Quaternion.Euler(3.5f, -4.0f, 2.0f);
                    CaptureSingle(cam, outputDir, artifactDir, "avatar_anim_02_walk_stride_pose.png");

                    // Restore player to clean default configuration
                    playerBobblehead.RebuildWithConfig(BobbleheadConfig.CreatePlayerConfig());
                }
            }

            UnityEngine.Object.DestroyImmediate(camObj);
            Debug.Log("[AvatarVisualAuditRunner] ========================================================");
            Debug.Log("[AvatarVisualAuditRunner] Visual Quality Verification Audit Completed Successfully!");
            Debug.Log("[AvatarVisualAuditRunner] ========================================================");
        }

        private static void CaptureSingle(Camera cam, string outputDir, string artifactDir, string filename)
        {
            RenderTexture rt = new RenderTexture(1920, 1080, 24);
            cam.targetTexture = rt;
            Texture2D screenShot = new Texture2D(1920, 1080, TextureFormat.RGB24, false);

            cam.Render();
            RenderTexture.active = rt;
            screenShot.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0);
            screenShot.Apply();

            cam.targetTexture = null;
            RenderTexture.active = null;
            UnityEngine.Object.DestroyImmediate(rt);

            byte[] bytes = screenShot.EncodeToPNG();
            UnityEngine.Object.DestroyImmediate(screenShot);

            File.WriteAllBytes(Path.Combine(outputDir, filename), bytes);
            File.WriteAllBytes(Path.Combine(artifactDir, filename), bytes);
        }
    }
}
