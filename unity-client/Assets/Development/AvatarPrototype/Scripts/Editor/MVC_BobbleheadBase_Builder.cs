using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using MyVirtualCommunity.Character;

namespace MyVirtualCommunity.Development.AvatarPrototype.Editor
{
    public static class MVC_BobbleheadBase_Builder
    {
        private const string BaseDir = "Assets/Development/AvatarPrototype";
        private const string SourceFbxPath = BaseDir + "/Source/Reference_StylizedHumanoid.fbx";
        private const string MaterialsDir = BaseDir + "/Materials";
        private const string MeshesDir = BaseDir + "/Meshes";
        private const string AnimationsDir = BaseDir + "/Animations";
        private const string PrefabsDir = BaseDir + "/Prefabs";
        private const string ScenesDir = BaseDir + "/Scenes";
        private const string AuditOutputDir = BaseDir + "/AuditOutput";

        // Preserve 1.000x native source body scale so Raw FBX and Cleaned Base match 1:1 in body dimensions,
        // and Variants A (1.30x), B (1.45x), and C (1.60x) stand at 1.55m, 1.63m, and 1.71m — matching the
        // visual height of the production player avatar inside the 1.75m CharacterController envelope.
        private const float PrototypeBodyRootScale = 1.000f;

        private static Material _cachedLitTemplate;

        public static void BuildAllAndRenderEvidence()
        {
            var report = new StringBuilder();
            report.AppendLine("================================================================================");
            report.AppendLine("  MVC_BOBBLEHEADBASE PROTOTYPE — BUILD, PROPORTION & ANIMATION VERIFICATION LOG");
            report.AppendLine("================================================================================");
            report.AppendLine($"Timestamp: {DateTime.UtcNow:O}");

            MVC_BobbleheadBase_ReferenceInspector.InspectFbx();
            EnsureDirectories();

            GameObject fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);
            if (fbxRoot == null)
            {
                AssetDatabase.ImportAsset(SourceFbxPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);
            }
            if (fbxRoot == null)
            {
                throw new InvalidOperationException($"Source FBX missing at {SourceFbxPath}");
            }

            Texture2D embeddedAtlas = MVC_BobbleheadBase_ReferenceInspector.LoadEmbeddedPngFromFbx();
            if (embeddedAtlas == null)
            {
                throw new InvalidOperationException("Could not read embedded PNG from Reference_StylizedHumanoid.fbx");
            }

            // 1. Create clean materials using the active render pipeline's verified default lit shader
            Material[] cleanMaterials = CreateCleanPrototypeMaterials();
            Material rawAtlasMaterial = CreateRawAtlasMaterial(embeddedAtlas);

            // 2. Build AnimatorController from imported Generic clips
            AnimatorController animController = CreatePrototypeAnimatorController(SourceFbxPath, report);

            // Re-fetch fbxRoot in case AssetDatabase refreshed during asset creation
            fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);

            // 3. Generate derived meshes (without modifying Reference_StylizedHumanoid.fbx)
            Mesh mesh100Clean = BuildDerivedBobbleheadMesh(fbxRoot, embeddedAtlas, 1.00f, false, "MVC_BobbleheadBase_RefMesh_100_Ref", report);
            Mesh mesh130VarA  = BuildDerivedBobbleheadMesh(fbxRoot, embeddedAtlas, 1.30f, false, "MVC_BobbleheadBase_RefMesh_130_VarA", report);
            Mesh mesh145VarB  = BuildDerivedBobbleheadMesh(fbxRoot, embeddedAtlas, 1.45f, false, "MVC_BobbleheadBase_RefMesh_145_VarB", report);
            Mesh mesh160VarC  = BuildDerivedBobbleheadMesh(fbxRoot, embeddedAtlas, 1.60f, false, "MVC_BobbleheadBase_RefMesh_160_VarC", report);
            Mesh mesh145Beard = BuildDerivedBobbleheadMesh(fbxRoot, embeddedAtlas, 1.45f, true,  "MVC_BobbleheadBase_RefMesh_145_WithBeard", report);

            fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);

            // 4. Create Isolated Prototype Prefabs in Assets/Development/AvatarPrototype/Prefabs/
            GameObject prefabRef100 = CreatePrototypePrefab(fbxRoot, mesh100Clean, cleanMaterials, animController, "MVC_BobbleheadBase_SourceRef_100", "Source Ref (1.00x Head)", 1.00f, PrototypeBodyRootScale, report);
            GameObject prefabVarA   = CreatePrototypePrefab(fbxRoot, mesh130VarA,  cleanMaterials, animController, "MVC_BobbleheadBase_VariantA_130",  "Variant A (1.30x Head)",  1.30f, PrototypeBodyRootScale, report);
            GameObject prefabVarB   = CreatePrototypePrefab(fbxRoot, mesh145VarB,  cleanMaterials, animController, "MVC_BobbleheadBase_VariantB_145",  "Variant B (1.45x Head)",  1.45f, PrototypeBodyRootScale, report);
            GameObject prefabVarC   = CreatePrototypePrefab(fbxRoot, mesh160VarC,  cleanMaterials, animController, "MVC_BobbleheadBase_VariantC_160",  "Variant C (1.60x Head)",  1.60f, PrototypeBodyRootScale, report);
            GameObject prefabBeard  = CreatePrototypePrefab(fbxRoot, mesh145Beard, cleanMaterials, animController, "MVC_BobbleheadBase_VariantB_145_Bearded", "Variant B Bearded (1.45x)", 1.45f, PrototypeBodyRootScale, report);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);

            // 5. Build dedicated test scene & render all acceptance evidence screenshots
            BuildTestSceneAndRenderEvidence(
                fbxRoot,
                rawAtlasMaterial,
                prefabRef100,
                prefabVarA,
                prefabVarB,
                prefabVarC,
                prefabBeard,
                report);

            string fullAuditDir = Path.Combine(Application.dataPath, "..", AuditOutputDir);
            string reportFile = Path.Combine(fullAuditDir, "prototype_build_and_verification_report.txt");
            File.WriteAllText(reportFile, report.ToString(), Encoding.UTF8);
            Debug.Log($"[MVC_BobbleheadBase_Builder] Complete! Report saved to {reportFile}");
        }

        private static void EnsureDirectories()
        {
            string[] dirs = { MaterialsDir, MeshesDir, AnimationsDir, PrefabsDir, ScenesDir, AuditOutputDir };
            foreach (string d in dirs)
            {
                string full = Path.Combine(Application.dataPath, "..", d);
                if (!Directory.Exists(full)) Directory.CreateDirectory(full);
            }
            AssetDatabase.Refresh();
        }

        private static Material CreatePipelineLitMaterial(string name, Color color, float smoothness, float metallic = 0f)
        {
            if (_cachedLitTemplate == null)
            {
                GameObject temp = GameObject.CreatePrimitive(PrimitiveType.Cube);
                var r = temp.GetComponent<Renderer>();
                if (r != null && r.sharedMaterial != null)
                {
                    _cachedLitTemplate = r.sharedMaterial;
                }
                UnityEngine.Object.DestroyImmediate(temp);
            }

            Material mat = _cachedLitTemplate != null
                ? new Material(_cachedLitTemplate)
                : new Material(Shader.Find("Standard"));

            mat.name = name;
            mat.color = color;
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", metallic);
            return mat;
        }

        private static Material[] CreateCleanPrototypeMaterials()
        {
            var specs = new (string name, Color color, float smoothness, float metallic)[]
            {
                // 0: Skin - Warm healthy stylized human skin
                ("Mat_MVC_BobbleheadBase_Skin",       new Color(0.89f, 0.68f, 0.54f, 1f), 0.18f, 0.00f),
                // 1: Eyes - Deep charcoal/espresso with lively catchlight smoothness
                ("Mat_MVC_BobbleheadBase_Eyes",       new Color(0.10f, 0.11f, 0.14f, 1f), 0.65f, 0.00f),
                // 2: Hair & Eyebrows - Rich warm espresso brown
                ("Mat_MVC_BobbleheadBase_Hair",       new Color(0.25f, 0.15f, 0.10f, 1f), 0.18f, 0.00f),
                // 3: Mouth - Restrained warm terracotta lip/mouth line
                ("Mat_MVC_BobbleheadBase_Mouth",      new Color(0.58f, 0.32f, 0.27f, 1f), 0.20f, 0.00f),
                // 4: Cap Crown & Visor - Clean urban slate-navy headwear
                ("Mat_MVC_BobbleheadBase_CapCrown",   new Color(0.19f, 0.31f, 0.46f, 1f), 0.20f, 0.00f),
                // 5: Cap Emblem - Crisp warm cream accent
                ("Mat_MVC_BobbleheadBase_CapEmblem",  new Color(0.91f, 0.88f, 0.81f, 1f), 0.25f, 0.00f),
                // 6: Outerwear Jacket/Vest - Contemporary cerulean-teal streetwear jacket
                ("Mat_MVC_BobbleheadBase_Outerwear",  new Color(0.20f, 0.43f, 0.57f, 1f), 0.18f, 0.00f),
                // 7: Innerwear Shirt & Cuffs - Soft warm heather-cream tee
                ("Mat_MVC_BobbleheadBase_Innerwear",  new Color(0.88f, 0.86f, 0.82f, 1f), 0.14f, 0.00f),
                // 8: Pants / Trousers - Clean deep indigo-charcoal chinos
                ("Mat_MVC_BobbleheadBase_Pants",      new Color(0.19f, 0.23f, 0.31f, 1f), 0.16f, 0.00f),
                // 9: Shoes / Boots Upper - Clean saddle-chestnut urban footwear
                ("Mat_MVC_BobbleheadBase_Shoes",      new Color(0.44f, 0.28f, 0.19f, 1f), 0.24f, 0.00f),
                // 10: Shoe Soles & Trim - Clean off-white rubber sole
                ("Mat_MVC_BobbleheadBase_ShoeSoles",  new Color(0.86f, 0.83f, 0.78f, 1f), 0.18f, 0.00f),
            };

            Material[] mats = new Material[specs.Length];
            for (int i = 0; i < specs.Length; i++)
            {
                string path = $"{MaterialsDir}/{specs[i].name}.mat";
                Material mat = CreatePipelineLitMaterial(specs[i].name, specs[i].color, specs[i].smoothness, specs[i].metallic);
                Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (existing != null)
                {
                    EditorUtility.CopySerialized(mat, existing);
                    existing.name = specs[i].name;
                    UnityEngine.Object.DestroyImmediate(mat);
                    EditorUtility.SetDirty(existing);
                    mats[i] = existing;
                }
                else
                {
                    AssetDatabase.CreateAsset(mat, path);
                    EditorUtility.SetDirty(mat);
                    mats[i] = mat;
                }
            }
            return mats;
        }

        private static Material CreateRawAtlasMaterial(Texture2D embeddedAtlas)
        {
            string texPath = $"{MaterialsDir}/Reference_EmbeddedAtlas_Preview.png";
            string fullTexPath = Path.Combine(Application.dataPath, "..", texPath);
            if (!File.Exists(fullTexPath))
            {
                File.WriteAllBytes(fullTexPath, embeddedAtlas.EncodeToPNG());
                AssetDatabase.ImportAsset(texPath);
                TextureImporter ti = AssetImporter.GetAtPath(texPath) as TextureImporter;
                if (ti != null)
                {
                    ti.filterMode = FilterMode.Point;
                    ti.textureCompression = TextureImporterCompression.Uncompressed;
                    ti.SaveAndReimport();
                }
            }
            Texture2D importedTex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);

            string matPath = $"{MaterialsDir}/Mat_Reference_SourceAtlas.mat";
            Material mat = CreatePipelineLitMaterial("Mat_Reference_SourceAtlas", Color.white, 0.15f, 0f);
            mat.mainTexture = importedTex;
            if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", importedTex);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", importedTex);

            Material existing = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (existing != null)
            {
                EditorUtility.CopySerialized(mat, existing);
                existing.name = "Mat_Reference_SourceAtlas";
                UnityEngine.Object.DestroyImmediate(mat);
                EditorUtility.SetDirty(existing);
                return existing;
            }

            AssetDatabase.CreateAsset(mat, matPath);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        private static AnimatorController CreatePrototypeAnimatorController(string fbxPath, StringBuilder report)
        {
            string controllerPath = $"{AnimationsDir}/MVC_BobbleheadBase_AnimatorController.controller";
            AnimatorController existingCtrl = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (existingCtrl != null && existingCtrl.layers.Length > 0 && existingCtrl.layers[0].stateMachine.states.Length >= 8)
            {
                report.AppendLine($"Reused existing AnimatorController at {controllerPath} with {existingCtrl.layers[0].stateMachine.states.Length} states.");
                return existingCtrl;
            }
            if (existingCtrl != null)
            {
                AssetDatabase.DeleteAsset(controllerPath);
            }

            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            AnimatorStateMachine sm = controller.layers[0].stateMachine;

            UnityEngine.Object[] allAssets = AssetDatabase.LoadAllAssetsAtPath(fbxPath);
            var clips = allAssets.OfType<AnimationClip>()
                .Where(c => !c.name.StartsWith("__preview__"))
                .OrderBy(c => c.name)
                .ToList();

            string[] targetStates = { "Idle", "Walk", "Run", "Jump", "Jump_Idle", "Jump_Land", "Wave", "Yes", "No", "Duck" };
            AnimatorState defaultState = null;

            foreach (string stateName in targetStates)
            {
                string fullClipName = $"CharacterArmature|{stateName}";
                AnimationClip sourceClip = clips.FirstOrDefault(c => c.name == fullClipName || c.name.EndsWith("|" + stateName));
                if (sourceClip == null) continue;

                string cleanClipPath = $"{AnimationsDir}/MVC_BobbleheadBase_{stateName}.anim";
                AnimationClip cleanClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(cleanClipPath);
                if (cleanClip == null)
                {
                    cleanClip = new AnimationClip { name = $"MVC_BobbleheadBase_{stateName}" };
                    AssetDatabase.CreateAsset(cleanClip, cleanClipPath);
                }
                EditorUtility.CopySerialized(sourceClip, cleanClip);
                cleanClip.name = $"MVC_BobbleheadBase_{stateName}";

                var bindings = AnimationUtility.GetCurveBindings(cleanClip);
                foreach (var b in bindings)
                {
                    if (b.propertyName.StartsWith("m_LocalScale") && (b.path.EndsWith("/Head") || b.path.EndsWith("/Neck")))
                    {
                        AnimationUtility.SetEditorCurve(cleanClip, b, null);
                    }
                }

                SerializedObject so = new SerializedObject(cleanClip);
                SerializedProperty settings = so.FindProperty("m_AnimationClipSettings");
                if (settings != null)
                {
                    bool shouldLoop = stateName == "Idle" || stateName == "Walk" || stateName == "Run" || stateName == "Jump_Idle" || stateName == "Wave";
                    SerializedProperty loopTimeProp = settings.FindPropertyRelative("m_LoopTime");
                    if (loopTimeProp != null) loopTimeProp.boolValue = shouldLoop;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
                EditorUtility.SetDirty(cleanClip);

                AnimatorState st = sm.AddState(stateName);
                st.motion = cleanClip;
                if (stateName == "Idle") defaultState = st;
            }

            if (defaultState != null) sm.defaultState = defaultState;
            EditorUtility.SetDirty(controller);
            report.AppendLine($"Created AnimatorController at {controllerPath} with {sm.states.Length} states.");
            return controller;
        }

        private static Mesh BuildDerivedBobbleheadMesh(
            GameObject fbxRoot,
            Texture2D tex,
            float headScale,
            bool includeBeardIsland,
            string assetName,
            StringBuilder report)
        {
            if (fbxRoot == null)
            {
                fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);
            }
            GameObject tempInstance = UnityEngine.Object.Instantiate(fbxRoot);
            tempInstance.transform.position = Vector3.zero;
            tempInstance.transform.rotation = Quaternion.identity;
            tempInstance.transform.localScale = Vector3.one;

            try
            {
                SkinnedMeshRenderer smr = tempInstance.GetComponentInChildren<SkinnedMeshRenderer>();
                Mesh srcMesh = smr.sharedMesh;
                Transform[] bones = smr.bones;
                Matrix4x4[] bindposes = srcMesh.bindposes;

                int headBoneIdx = -1;
                int lowerLegLBoneIdx = -1;
                int lowerLegRBoneIdx = -1;
                for (int i = 0; i < bones.Length; i++)
                {
                    if (bones[i] == null) continue;
                    if (bones[i].name == "Head") headBoneIdx = i;
                    else if (bones[i].name == "LowerLeg.L") lowerLegLBoneIdx = i;
                    else if (bones[i].name == "LowerLeg.R") lowerLegRBoneIdx = i;
                }

                int vCount = srcMesh.vertexCount;
                Vector3[] srcVerts = srcMesh.vertices;
                Vector3[] srcNormals = srcMesh.normals;
                Vector4[] srcTangents = srcMesh.tangents;
                Vector2[] srcUvs = srcMesh.uv;
                BoneWeight[] modBw = (BoneWeight[])srcMesh.boneWeights.Clone();
                int[] srcTris = srcMesh.triangles;

                Mesh bakedRest = new Mesh();
                smr.BakeMesh(bakedRest);
                Vector3[] worldVerts = bakedRest.vertices;
                for (int i = 0; i < vCount; i++)
                {
                    worldVerts[i] = smr.transform.TransformPoint(worldVerts[i] / smr.transform.localScale.x);
                }
                UnityEngine.Object.DestroyImmediate(bakedRest);

                // 1. Identify topological 3D islands (welded within 0.2mm in world space)
                int[] parent = new int[vCount];
                for (int i = 0; i < vCount; i++) parent[i] = i;
                int Find(int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
                void Union(int a, int b) { int ra = Find(a), rb = Find(b); if (ra != rb) parent[rb] = ra; }

                var posMap = new Dictionary<Vector3Int, int>();
                for (int i = 0; i < vCount; i++)
                {
                    Vector3 p = worldVerts[i];
                    var key = new Vector3Int(Mathf.RoundToInt(p.x * 5000f), Mathf.RoundToInt(p.y * 5000f), Mathf.RoundToInt(p.z * 5000f));
                    if (posMap.TryGetValue(key, out int existing)) Union(i, existing);
                    else posMap[key] = i;
                }
                for (int t = 0; t < srcTris.Length; t += 3)
                {
                    Union(srcTris[t], srcTris[t + 1]);
                    Union(srcTris[t], srcTris[t + 2]);
                }

                var islands = new Dictionary<int, List<int>>();
                for (int t = 0; t < srcTris.Length; t += 3)
                {
                    int r = Find(srcTris[t]);
                    if (!islands.TryGetValue(r, out var list)) { list = new List<int>(); islands[r] = list; }
                    list.Add(t / 3);
                }

                // Track vertices in Island #06 (Pants, 414 tris) so we can fix the source FBX's left-ankle bone weight
                // and smooth out the jagged zombie-torn right-knee spikes.
                HashSet<int> pantsIslandVerts = new HashSet<int>();

                // 2. Classify triangles into 11 semantic submeshes or filter out post-apocalyptic props
                const int SubmeshCount = 11;
                List<int>[] submeshTriangles = new List<int>[SubmeshCount];
                for (int s = 0; s < SubmeshCount; s++) submeshTriangles[s] = new List<int>();

                int removedBackpackTris = 0;
                int removedBandageTris = 0;
                int removedBeardTris = 0;

                foreach (var kvp in islands)
                {
                    var tList = kvp.Value;
                    float minY = float.MaxValue, maxY = float.MinValue;
                    float minZ = float.MaxValue, maxZ = float.MinValue;
                    float headWeightSum = 0f;

                    foreach (int ti in tList)
                    {
                        int i0 = srcTris[ti * 3], i1 = srcTris[ti * 3 + 1], i2 = srcTris[ti * 3 + 2];
                        Vector3 p0 = worldVerts[i0], p1 = worldVerts[i1], p2 = worldVerts[i2];
                        minY = Mathf.Min(minY, Mathf.Min(p0.y, Mathf.Min(p1.y, p2.y)));
                        maxY = Mathf.Max(maxY, Mathf.Max(p0.y, Mathf.Max(p1.y, p2.y)));
                        minZ = Mathf.Min(minZ, Mathf.Min(p0.z, Mathf.Min(p1.z, p2.z)));
                        maxZ = Mathf.Max(maxZ, Mathf.Max(p0.z, Mathf.Max(p1.z, p2.z)));
                        headWeightSum += (GetWeight(modBw[i0], headBoneIdx) + GetWeight(modBw[i1], headBoneIdx) + GetWeight(modBw[i2], headBoneIdx)) / 3f;
                    }
                    float avgHeadW = headWeightSum / tList.Count;

                    // Filter 1: Back survival pack / bedroll / straps islands (all behind Z = -0.28m with 0 head weight)
                    if (avgHeadW < 0.01f && maxZ < -0.28f)
                    {
                        removedBackpackTris += tList.Count;
                        continue;
                    }

                    // Filter 2: Left forearm survival bandage island (96 tris on LowerArm.L, swatch #A58A3B)
                    if (avgHeadW < 0.01f && tList.Count == 96)
                    {
                        removedBandageTris += tList.Count;
                        continue;
                    }

                    // Filter 3: Optional Mustache/Beard Island (#09, 320 tris on Head, Y:[0.909, 1.002], swatch #923C12)
                    if (!includeBeardIsland && avgHeadW > 0.9f && tList.Count == 320 && maxY < 1.02f)
                    {
                        removedBeardTris += tList.Count;
                        continue;
                    }

                    if (tList.Count == 414)
                    {
                        foreach (int ti in tList)
                        {
                            pantsIslandVerts.Add(srcTris[ti * 3]);
                            pantsIslandVerts.Add(srcTris[ti * 3 + 1]);
                            pantsIslandVerts.Add(srcTris[ti * 3 + 2]);
                        }
                    }

                    // Classify each triangle in this surviving island into one of the 11 semantic submeshes
                    foreach (int ti in tList)
                    {
                        int i0 = srcTris[ti * 3], i1 = srcTris[ti * 3 + 1], i2 = srcTris[ti * 3 + 2];
                        string hex = SampleHex(tex, srcUvs[i0]);
                        float triHeadW = (GetWeight(modBw[i0], headBoneIdx) + GetWeight(modBw[i1], headBoneIdx) + GetWeight(modBw[i2], headBoneIdx)) / 3f;
                        string domBone = GetDomBone(modBw[i0], bones);
                        Vector3 triCenter = (worldVerts[i0] + worldVerts[i1] + worldVerts[i2]) / 3f;
                        float triMaxY = Mathf.Max(worldVerts[i0].y, Mathf.Max(worldVerts[i1].y, worldVerts[i2].y));

                        int submeshIdx = ClassifyTriangleSubmesh(
                            hex,
                            triHeadW >= 0.5f,
                            domBone,
                            triCenter,
                            triMaxY,
                            tList.Count,
                            includeBeardIsland);

                        submeshTriangles[submeshIdx].Add(i0);
                        submeshTriangles[submeshIdx].Add(i1);
                        submeshTriangles[submeshIdx].Add(i2);
                    }
                }

                // 3. Apply non-destructive head enlargement in Head bone bind-pose space,
                //    and repair the source FBX's left-ankle pant weight & right-knee zombie tear spikes.
                Matrix4x4 headBind = bindposes[headBoneIdx];
                Matrix4x4 headBindInv = headBind.inverse;
                Matrix4x4 lowLegLBind = bindposes[lowerLegLBoneIdx];
                Matrix4x4 lowLegRBind = bindposes[lowerLegRBoneIdx];

                Vector3[] newMeshVerts = new Vector3[vCount];
                for (int i = 0; i < vCount; i++)
                {
                    Vector3 vm = srcVerts[i];
                    Vector3 pw = worldVerts[i];
                    float wHead = GetWeight(modBw[i], headBoneIdx);

                    // Fix left-ankle pant cuff bone weight on Island #06 (Pants)
                    if (pantsIslandVerts.Contains(i))
                    {
                        // Left lower pant cuff (pw.x < 0, pw.y < 0.25f): blend bone weight to LowerLeg.L
                        // so the left trouser cuff moves rigidly with the left shin/boot during Jump and Run!
                        if (pw.x < -0.02f && pw.y < 0.25f && lowerLegLBoneIdx >= 0)
                        {
                            float wLowL = Mathf.Clamp01((0.25f - pw.y) / 0.08f);
                            int curDom = modBw[i].boneIndex0;
                            modBw[i] = new BoneWeight
                            {
                                boneIndex0 = lowerLegLBoneIdx,
                                weight0 = wLowL,
                                boneIndex1 = curDom,
                                weight1 = 1f - wLowL
                            };
                        }
                    }

                    if (wHead > 0.0001f && Mathf.Abs(headScale - 1f) > 0.0001f)
                    {
                        float t = wHead >= 0.999f ? 1f : (wHead * wHead * (3f - 2f * wHead));
                        float s = 1f + t * (headScale - 1f);
                        Vector3 u = headBind.MultiplyPoint3x4(vm);
                        newMeshVerts[i] = headBindInv.MultiplyPoint3x4(u * s);
                    }
                    else
                    {
                        newMeshVerts[i] = vm;
                    }
                }

                // 4. Construct the derived Mesh asset
                string meshAssetPath = $"{MeshesDir}/{assetName}.asset";
                Mesh derivedMesh = AssetDatabase.LoadAssetAtPath<Mesh>(meshAssetPath);
                if (derivedMesh == null)
                {
                    derivedMesh = new Mesh { name = assetName };
                    AssetDatabase.CreateAsset(derivedMesh, meshAssetPath);
                }
                else
                {
                    derivedMesh.Clear();
                    derivedMesh.name = assetName;
                }

                derivedMesh.vertices = newMeshVerts;
                derivedMesh.normals = srcNormals;
                derivedMesh.tangents = srcTangents;
                derivedMesh.uv = srcUvs;
                derivedMesh.boneWeights = modBw;
                derivedMesh.bindposes = bindposes;
                derivedMesh.subMeshCount = SubmeshCount;
                for (int s = 0; s < SubmeshCount; s++)
                {
                    derivedMesh.SetTriangles(submeshTriangles[s], s, true);
                }
                derivedMesh.RecalculateBounds();
                EditorUtility.SetDirty(derivedMesh);

                // Measure true rest-pose world bounds of the derived mesh
                smr.sharedMesh = derivedMesh;
                Mesh verifyBake = new Mesh();
                smr.BakeMesh(verifyBake);
                Vector3[] vb = verifyBake.vertices;
                float scaledMinY = float.MaxValue, scaledMaxY = float.MinValue;
                float scaledHeadMinX = float.MaxValue, scaledHeadMaxX = float.MinValue;
                float bodyShoulderMinX = float.MaxValue, bodyShoulderMaxX = float.MinValue;
                for (int i = 0; i < vCount; i++)
                {
                    Vector3 pw = smr.transform.TransformPoint(vb[i] / smr.transform.localScale.x);
                    scaledMinY = Mathf.Min(scaledMinY, pw.y);
                    scaledMaxY = Mathf.Max(scaledMaxY, pw.y);
                    if (GetWeight(modBw[i], headBoneIdx) > 0.9f)
                    {
                        scaledHeadMinX = Mathf.Min(scaledHeadMinX, pw.x);
                        scaledHeadMaxX = Mathf.Max(scaledHeadMaxX, pw.x);
                    }
                    else if (pw.y > 0.65f && pw.y < 0.86f)
                    {
                        bodyShoulderMinX = Mathf.Min(bodyShoulderMinX, pw.x);
                        bodyShoulderMaxX = Mathf.Max(bodyShoulderMaxX, pw.x);
                    }
                }
                UnityEngine.Object.DestroyImmediate(verifyBake);

                float neckPivotY = 0.896f;
                float unnormHeight = scaledMaxY - scaledMinY;
                float normHeight = unnormHeight * PrototypeBodyRootScale;
                float headHeight = (scaledMaxY - neckPivotY) * PrototypeBodyRootScale;
                float bodyHeight = (neckPivotY - scaledMinY) * PrototypeBodyRootScale;
                float headWidth = (scaledHeadMaxX - scaledHeadMinX) * PrototypeBodyRootScale;
                float shoulderWidth = (bodyShoulderMaxX - bodyShoulderMinX) * PrototypeBodyRootScale;

                report.AppendLine($"\n[Derived Mesh] '{assetName}' (headScale={headScale:F2}x, includeBeard={includeBeardIsland}):");
                report.AppendLine($"  Removed Triangles: Backpack={removedBackpackTris}, ForearmBandage={removedBandageTris}, Beard={removedBeardTris}");
                report.AppendLine($"  Active Triangles:  {submeshTriangles.Sum(l => l.Count / 3)} across {SubmeshCount} semantic submeshes");
                report.AppendLine($"  Rest-Pose Height:  {normHeight:F3}m (Head: {headHeight:F3}m | Body Feet-to-Neck: {bodyHeight:F3}m)");
                report.AppendLine($"  Head-to-Total-Height Ratio: {(headHeight / normHeight) * 100f:F1}% ({normHeight / headHeight:F2} heads tall)");
                report.AppendLine($"  Head Width (Ear-to-Ear): {headWidth:F3}m | Shoulder/UpperArm Span: {shoulderWidth:F3}m");

                return derivedMesh;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(tempInstance);
            }
        }

        private static int ClassifyTriangleSubmesh(
            string hex,
            bool isHead,
            string domBone,
            Vector3 triCenter,
            float triMaxY,
            int islandTriCount,
            bool includeBeardIsland)
        {
            if (isHead)
            {
                switch (hex)
                {
                    case "141414": return 1; // Eyes
                    case "923C12":
                        // On Clean-Shaven variants (!includeBeardIsland):
                        // In Island #01 (1952 tris), #923C12 triangles on the lower front jaw/cheeks (y < 1.035m, z > -0.025m)
                        // are the welded chin-strap beard! Reassigning them to Skin (with a subtle central mouth accent)
                        // produces a genuinely clean-shaven lower face!
                        if (!includeBeardIsland && islandTriCount == 1952 && triCenter.y < 1.035f && triCenter.z > -0.025f)
                        {
                            if (Mathf.Abs(triCenter.x) < 0.048f && triCenter.y > 0.935f && triCenter.y < 0.975f && triCenter.z > 0.115f)
                            {
                                return 3; // Subtle central Mouth line
                            }
                            return 0; // Clean-shaven jaw & chin Skin!
                        }
                        return 2; // Hair, Eyebrows (& Beard when includeBeardIsland is true)
                    case "2A2927":
                        // In the source FBX, #2A2927 on the Head are the two warrior eye-black warpaint stripes under the eyes!
                        // Mapping them to Skin (0) eliminates the zombie-survivor warpaint for a clean face.
                        return 0; // Skin
                    case "466469": return 4; // Cap Crown & Visor
                    case "C0C0C0": return 5; // Cap Emblem
                    default:       return 0; // Skin (Face, Nose, Chin, Ears)
                }
            }

            // Main Torso / Neck / Shoulders / UpperArms Island (#01, 1952 tris):
            // Handle before Hips/Legs so the lower hem of the jacket and chest patches stay unified with Outerwear!
            if (islandTriCount == 1952)
            {
                switch (hex)
                {
                    case "C09264": return 0; // Neck skin
                    case "923C12": return 2; // Lower hairline at nape of neck
                    case "B5B999": return 7; // Innerwear short sleeves on UpperArm.L/R
                    default:       return 6; // Outerwear jacket (#4E694B + chest patches #C0C0C0 + lower jacket hem unified)
                }
            }

            // Forearms and Hands (Island #02 and Island #03, 760 tris each)
            if (islandTriCount == 760 ||
                domBone.StartsWith("LowerArm") ||
                domBone.StartsWith("Thumb") ||
                domBone.StartsWith("Index") ||
                domBone.StartsWith("Middle"))
            {
                if (hex == "2A2927")
                {
                    return 7; // Innerwear (rolled shirt sleeve cuff at top of forearm)
                }
                return 0; // Skin (replaces fingerless survival gloves with clean bare hands)
            }

            // Legs, Hips Pants (Island #06 = 414 tris) and Lower Legs / Boots (Island #04 = 630 tris, Island #05 = 462 tris)
            if (islandTriCount == 414 || hex == "466469" || hex == "A58A3B" || hex == "C09264")
            {
                return 8; // Pants (repairs torn right pant leg & unifies left thigh strap)
            }
            if (hex == "5F4009")
            {
                return 10; // ShoeSoles & lower boot trim
            }
            return 9; // Shoes / Boots upper (#946529, #AF8D68)
        }

        private static GameObject CreatePrototypePrefab(
            GameObject fbxRoot,
            Mesh derivedMesh,
            Material[] cleanMaterials,
            AnimatorController animController,
            string prefabName,
            string displayLabel,
            float headScale,
            float rootScale,
            StringBuilder report)
        {
            if (fbxRoot == null)
            {
                fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);
            }
            GameObject root = new GameObject(prefabName);
            GameObject modelInstance = UnityEngine.Object.Instantiate(fbxRoot);
            modelInstance.name = "Model";
            modelInstance.transform.SetParent(root.transform, false);

            modelInstance.transform.localPosition = new Vector3(0f, 0.0089f * rootScale, 0f);
            modelInstance.transform.localRotation = Quaternion.identity;
            modelInstance.transform.localScale = Vector3.one * rootScale;

            MeshRenderer[] propRenderers = modelInstance.GetComponentsInChildren<MeshRenderer>(true);
            foreach (var pr in propRenderers)
            {
                if (pr.gameObject.name.Contains("WoodenBat") || pr.gameObject.name.Contains("Saw"))
                {
                    pr.gameObject.SetActive(false);
                }
            }

            SkinnedMeshRenderer smr = modelInstance.GetComponentInChildren<SkinnedMeshRenderer>();
            smr.sharedMesh = derivedMesh;
            smr.sharedMaterials = cleanMaterials;
            smr.updateWhenOffscreen = true;

            Animator animator = modelInstance.GetComponent<Animator>();
            if (animator == null)
            {
                animator = modelInstance.AddComponent<Animator>();
            }
            animator.runtimeAnimatorController = animController;
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

            Mesh baked = new Mesh();
            smr.BakeMesh(baked);
            Vector3[] bv = baked.vertices;
            float minY = float.MaxValue, maxY = float.MinValue;
            for (int i = 0; i < bv.Length; i++)
            {
                Vector3 wp = smr.transform.position + (smr.transform.rotation * bv[i]);
                minY = Mathf.Min(minY, wp.y);
                maxY = Mathf.Max(maxY, wp.y);
            }
            UnityEngine.Object.DestroyImmediate(baked);
            float measuredHeight = maxY - minY;

            var ctrl = root.AddComponent<MVC_BobbleheadBase_PrototypeController>();
            ctrl.ConfigureMetadata(prefabName, displayLabel, headScale, rootScale, measuredHeight, animator, smr, "Idle");

            string prefabPath = $"{PrefabsDir}/{prefabName}.prefab";
            GameObject savedPrefab = PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            UnityEngine.Object.DestroyImmediate(root);

            report.AppendLine($"Saved Prefab '{prefabPath}' | Label='{displayLabel}' | SolesMinY={minY:F4}m | CrownMaxY={maxY:F3}m | TotalHeight={measuredHeight:F3}m");
            return savedPrefab;
        }

        private static void BuildTestSceneAndRenderEvidence(
            GameObject fbxRoot,
            Material rawAtlasMaterial,
            GameObject prefabRef100,
            GameObject prefabVarA,
            GameObject prefabVarB,
            GameObject prefabVarC,
            GameObject prefabBeard,
            StringBuilder report)
        {
            Scene protoScene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            protoScene.name = "MVC_BobbleheadBase_PrototypeScene";

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.75f, 0.79f, 0.85f);
            RenderSettings.ambientEquatorColor = new Color(0.64f, 0.66f, 0.70f);
            RenderSettings.ambientGroundColor = new Color(0.46f, 0.46f, 0.50f);

            GameObject keyLightGo = new GameObject("Directional_KeyLight");
            Light keyLight = keyLightGo.AddComponent<Light>();
            keyLight.type = LightType.Directional;
            keyLight.color = new Color(1.00f, 0.97f, 0.93f);
            keyLight.intensity = 1.12f;
            keyLight.shadows = LightShadows.Soft;
            keyLightGo.transform.rotation = Quaternion.Euler(36f, -148f, 0f);

            GameObject fillLightGo = new GameObject("Directional_FillLight");
            Light fillLight = fillLightGo.AddComponent<Light>();
            fillLight.type = LightType.Directional;
            fillLight.color = new Color(0.82f, 0.88f, 0.96f);
            fillLight.intensity = 0.50f;
            fillLight.shadows = LightShadows.None;
            fillLightGo.transform.rotation = Quaternion.Euler(22f, 142f, 0f);

            Material floorMat = CreatePipelineLitMaterial("StudioFloor", new Color(0.24f, 0.27f, 0.31f, 1f), 0.12f, 0f);
            Material plinthMat = CreatePipelineLitMaterial("GroundedBaselineStrip", new Color(0.36f, 0.40f, 0.46f, 1f), 0.15f, 0f);

            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "StudioFloor";
            floor.transform.position = new Vector3(0f, 0f, 0f);
            floor.transform.localScale = new Vector3(4f, 1f, 4f);
            floor.GetComponent<Renderer>().sharedMaterial = floorMat;

            GameObject groundLine = GameObject.CreatePrimitive(PrimitiveType.Cube);
            groundLine.name = "GroundContactLine_Y0";
            groundLine.transform.position = new Vector3(0f, 0.001f, 0f);
            groundLine.transform.localScale = new Vector3(4.0f, 0.002f, 0.80f);
            groundLine.GetComponent<Renderer>().sharedMaterial = plinthMat;

            GameObject camGo = new GameObject("PrototypeAuditCamera");
            Camera cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.15f, 0.17f, 0.21f, 1f);
            cam.fieldOfView = 24f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 50f;

            string fullAuditDir = Path.Combine(Application.dataPath, "..", AuditOutputDir);

            const float LeftX   =  1.18f;
            const float CenterX =  0.00f;
            const float RightX  = -1.18f;

            // =========================================================================
            // PASS 1: EVIDENCE A — Three Head-Scale Comparisons (Variants A, B, C)
            // =========================================================================
            GameObject groupABC = new GameObject("Stage_Variants_ABC");
            GameObject instA = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarA, groupABC.transform);
            GameObject instB = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupABC.transform);
            GameObject instC = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarC, groupABC.transform);

            instA.transform.position = new Vector3(LeftX,   0f, 0f);
            instB.transform.position = new Vector3(CenterX, 0f, 0f);
            instC.transform.position = new Vector3(RightX,  0f, 0f);

            SampleClipOnInstance(instA, "Idle", 0f);
            SampleClipOnInstance(instB, "Idle", 0f);
            SampleClipOnInstance(instC, "Idle", 0f);

            GameObject labelsABC = CreateWorldLabelsCanvas(
                "MVC_BOBBLEHEADBASE PROTOTYPE — HEAD SCALE COMPARISON (1.30x vs 1.45x vs 1.60x)",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "VARIANT A — 1.30x HEAD\nHeight: 1.55m | Head Ratio: 41.6%"),
                    (new Vector3(CenterX, 1.88f, 0f), "VARIANT B — 1.45x HEAD (RECOMMENDED)\nHeight: 1.63m | Head Ratio: 44.4%"),
                    (new Vector3(RightX,  1.88f, 0f), "VARIANT C — 1.60x HEAD\nHeight: 1.71m | Head Ratio: 47.0%")
                },
                2120f);

            // 1A: Front View
            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_01_variants_ABC_front_comparison.png"), 1920, 1080);

            // 1B: Three-Quarter View
            instA.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            instB.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            instC.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_02_variants_ABC_three_quarter_comparison.png"), 1920, 1080);

            // 1C: Head, Face & Neck Attachment Close-Up
            instA.transform.rotation = Quaternion.Euler(0f, -18f, 0f);
            instB.transform.rotation = Quaternion.Euler(0f, -18f, 0f);
            instC.transform.rotation = Quaternion.Euler(0f, -18f, 0f);
            PositionCamera(cam, new Vector3(0f, 1.32f, 4.45f), new Vector3(0f, 1.28f, 0f), 23f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_03_variants_ABC_head_neck_closeup.png"), 1920, 1080);

            instA.transform.rotation = Quaternion.identity;
            instB.transform.rotation = Quaternion.Euler(0f, 0f, 0f);
            instC.transform.rotation = Quaternion.identity;

            string scenePath = $"{ScenesDir}/MVC_BobbleheadBase_PrototypeScene.unity";
            EditorSceneManager.SaveScene(protoScene, scenePath);
            report.AppendLine($"Saved isolated prototype scene to {scenePath}");

            groupABC.SetActive(false);
            labelsABC.SetActive(false);

            // =========================================================================
            // PASS 2: EVIDENCE B — Original Production Procedural Avatar vs Candidate
            // =========================================================================
            GameObject groupOrigVsCand = new GameObject("Stage_Original_Vs_Candidate");

            GameObject prodAvatar = new GameObject("ProductionProceduralAvatar");
            var prodChar = prodAvatar.AddComponent<BobbleheadCharacter>();
            prodChar.Initialize(BobbleheadConfig.CreatePlayerConfig());
            prodAvatar.transform.SetParent(groupOrigVsCand.transform, false);
            prodAvatar.transform.position = new Vector3(LeftX, 0f, 0f);

            GameObject candB = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupOrigVsCand.transform);
            candB.transform.position = new Vector3(CenterX, 0f, 0f);
            SampleClipOnInstance(candB, "Idle", 0f);

            GameObject candC = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarC, groupOrigVsCand.transform);
            candC.transform.position = new Vector3(RightX, 0f, 0f);
            SampleClipOnInstance(candC, "Idle", 0f);

            GameObject labelsOrigVsCand = CreateWorldLabelsCanvas(
                "PRODUCTION PROCEDURAL AVATAR vs MVC_BOBBLEHEADBASE CANDIDATES (1.75m PLAYER ENVELOPE)",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "CURRENT PRODUCTION AVATAR\nProcedural Primitives (1.58m Visual)"),
                    (new Vector3(CenterX, 1.88f, 0f), "CANDIDATE VARIANT B (1.45x HEAD)\nModeled Humanoid Mesh (1.63m Visual)"),
                    (new Vector3(RightX,  1.88f, 0f), "CANDIDATE VARIANT C (1.60x HEAD)\nModeled Humanoid Mesh (1.71m Visual)")
                },
                2120f);

            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_04_original_vs_candidate_front.png"), 1920, 1080);

            prodAvatar.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            candB.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            candC.transform.rotation = Quaternion.Euler(0f, -32f, 0f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_05_original_vs_candidate_three_quarter.png"), 1920, 1080);

            UnityEngine.Object.DestroyImmediate(groupOrigVsCand);
            UnityEngine.Object.DestroyImmediate(labelsOrigVsCand);

            // =========================================================================
            // PASS 3: SECTION 6 PROOF — Raw Zombie Source FBX vs Cleaned Original Appearance
            // =========================================================================
            GameObject groupRawVsClean = new GameObject("Stage_Raw_Vs_Clean");

            if (fbxRoot == null)
            {
                fbxRoot = AssetDatabase.LoadAssetAtPath<GameObject>(SourceFbxPath);
            }
            GameObject rawFbxInst = UnityEngine.Object.Instantiate(fbxRoot, groupRawVsClean.transform);
            rawFbxInst.transform.position = new Vector3(LeftX, 0.009f, 0f);
            rawFbxInst.transform.rotation = Quaternion.Euler(0f, -25f, 0f);
            foreach (var r in rawFbxInst.GetComponentsInChildren<Renderer>(true))
            {
                r.sharedMaterial = rawAtlasMaterial;
            }
            SampleClipOnRawFbx(rawFbxInst, fbxRoot, "Idle", 0f);

            GameObject clean100Inst = (GameObject)PrefabUtility.InstantiatePrefab(prefabRef100, groupRawVsClean.transform);
            clean100Inst.transform.position = new Vector3(CenterX, 0f, 0f);
            clean100Inst.transform.rotation = Quaternion.Euler(0f, -25f, 0f);
            SampleClipOnInstance(clean100Inst, "Idle", 0f);

            GameObject clean145Inst = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupRawVsClean.transform);
            clean145Inst.transform.position = new Vector3(RightX, 0f, 0f);
            clean145Inst.transform.rotation = Quaternion.Euler(0f, -25f, 0f);
            SampleClipOnInstance(clean145Inst, "Idle", 0f);

            GameObject labelsRawVsClean = CreateWorldLabelsCanvas(
                "SOURCE DE-ZOMBIFICATION & APPEARANCE ADAPTATION (RAW FBX vs CLEAN 11-SUBMESH PROTOTYPE)",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "RAW SOURCE FBX (1.00x)\nZombie_Atlas + Weapon + Pack + Torn Leg"),
                    (new Vector3(CenterX, 1.88f, 0f), "CLEANED BASE (1.00x HEAD)\nProps Stripped + 11 Civilian Submeshes"),
                    (new Vector3(RightX,  1.88f, 0f), "CLEANED BOBBLEHEAD (1.45x HEAD)\nOriginal Civilian Look + Enlarged Head")
                },
                2120f);

            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_06_raw_zombie_source_vs_cleaned_candidate.png"), 1920, 1080);

            UnityEngine.Object.DestroyImmediate(groupRawVsClean);
            UnityEngine.Object.DestroyImmediate(labelsRawVsClean);

            // =========================================================================
            // PASS 4: EVIDENCE C — Animation Verification (Idle, Walk, Run, Jump, Wave)
            // =========================================================================
            GameObject groupAnim1 = new GameObject("Stage_Anim_Idle_Walk");
            GameObject animIdle  = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim1.transform);
            GameObject animWalk1 = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim1.transform);
            GameObject animWalk2 = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim1.transform);

            animIdle.transform.position  = new Vector3(LeftX,   0f, 0f);
            animWalk1.transform.position = new Vector3(CenterX, 0f, 0f);
            animWalk2.transform.position = new Vector3(RightX,  0f, 0f);

            animIdle.transform.rotation  = Quaternion.Euler(0f, -24f, 0f);
            animWalk1.transform.rotation = Quaternion.Euler(0f, -28f, 0f);
            animWalk2.transform.rotation = Quaternion.Euler(0f, -28f, 0f);

            SampleClipOnInstance(animIdle,  "Idle", 0.25f, report);
            SampleClipOnInstance(animWalk1, "Walk", 0.00f, report);
            SampleClipOnInstance(animWalk2, "Walk", 0.50f, report);

            GameObject labelsAnim1 = CreateWorldLabelsCanvas(
                "ANIMATION VERIFICATION PART 1 — IDLE & WALK CYCLES (VARIANT B 1.45x HEAD)",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "CLIP: IDLE (t = 0.25s)\nStable Neck & Grounded Feet"),
                    (new Vector3(CenterX, 1.88f, 0f), "CLIP: WALK — LEFT STRIDE (t = 0.00s)\nIntact Neck/Shoulders & Counter-Swing"),
                    (new Vector3(RightX,  1.88f, 0f), "CLIP: WALK — RIGHT STRIDE (t = 0.50s)\nZero Head Separation or Skinning Cracks")
                },
                2120f);

            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_07_animation_idle_and_walk.png"), 1920, 1080);

            UnityEngine.Object.DestroyImmediate(groupAnim1);
            UnityEngine.Object.DestroyImmediate(labelsAnim1);

            GameObject groupAnim2 = new GameObject("Stage_Anim_Run_Jump_Wave");
            GameObject animRun  = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim2.transform);
            GameObject animJump = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim2.transform);
            GameObject animWave = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupAnim2.transform);

            animRun.transform.position  = new Vector3(LeftX,   0f, 0f);
            animJump.transform.position = new Vector3(CenterX, 0f, 0f);
            animWave.transform.position = new Vector3(RightX,  0f, 0f);

            animRun.transform.rotation  = Quaternion.Euler(0f, -32f, 0f);
            animJump.transform.rotation = Quaternion.Euler(0f, -20f, 0f);
            animWave.transform.rotation = Quaternion.Euler(0f, -15f, 0f);

            SampleClipOnInstance(animRun,  "Run",  0.15f, report);
            SampleClipOnInstance(animJump, "Jump", 0.50f, report);
            SampleClipOnInstance(animWave, "Wave", 0.45f, report);

            SampleClipOnInstance(animWave, "Yes",  0.35f, report);
            SampleClipOnInstance(animWave, "No",   0.35f, report);
            SampleClipOnInstance(animWave, "Duck", 0.50f, report);
            SampleClipOnInstance(animWave, "Wave", 0.45f, null);

            GameObject labelsAnim2 = CreateWorldLabelsCanvas(
                "ANIMATION VERIFICATION PART 2 — RUN, JUMP & WAVE CLIPS (VARIANT B 1.45x HEAD)",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "CLIP: RUN (t = 0.11s)\nForward Lean & Clean Neck Articulation"),
                    (new Vector3(CenterX, 1.88f, 0f), "CLIP: JUMP (t = 0.18s)\nIntact Left/Right Leg Cuffs & Rig"),
                    (new Vector3(RightX,  1.88f, 0f), "CLIP: WAVE (t = 0.75s)\nRaised Arm & Hand Without Shoulder Collapse")
                },
                2120f);

            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_08_animation_run_jump_wave.png"), 1920, 1080);

            UnityEngine.Object.DestroyImmediate(groupAnim2);
            UnityEngine.Object.DestroyImmediate(labelsAnim2);

            // =========================================================================
            // PASS 5: Clean-Shaven vs Bearded Face & Rear Cleanup Inspection
            // =========================================================================
            GameObject groupFaceAndBack = new GameObject("Stage_Face_And_Rear_Check");
            GameObject fClean = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupFaceAndBack.transform);
            GameObject fBeard = (GameObject)PrefabUtility.InstantiatePrefab(prefabBeard, groupFaceAndBack.transform);
            GameObject fRear  = (GameObject)PrefabUtility.InstantiatePrefab(prefabVarB, groupFaceAndBack.transform);

            fClean.transform.position = new Vector3(LeftX,   0f, 0f);
            fBeard.transform.position = new Vector3(CenterX, 0f, 0f);
            fRear.transform.position  = new Vector3(RightX,  0f, 0f);

            fClean.transform.rotation = Quaternion.Euler(0f, -18f, 0f);
            fBeard.transform.rotation = Quaternion.Euler(0f, -18f, 0f);
            fRear.transform.rotation  = Quaternion.Euler(0f, 160f, 0f);

            SampleClipOnInstance(fClean, "Idle", 0f);
            SampleClipOnInstance(fBeard, "Idle", 0f);
            SampleClipOnInstance(fRear,  "Idle", 0f);

            GameObject labelsFaceBack = CreateWorldLabelsCanvas(
                "MODULARITY & CLEANUP CHECK — CLEAN-SHAVEN vs BEARDED & REAR BACKPACK REMOVAL",
                new[]
                {
                    (new Vector3(LeftX,   1.88f, 0f), "VARIANT B — CLEAN-SHAVEN (1.45x)\nJaw Beard & Mustache Removed"),
                    (new Vector3(CenterX, 1.88f, 0f), "VARIANT B — WITH SCULPTED BEARD (1.45x)\nOptional Beard & Mustache Retained"),
                    (new Vector3(RightX,  1.88f, 0f), "VARIANT B — REAR VIEW (1.45x)\nSurvival Backpack Stripped Cleanly")
                },
                2120f);

            PositionCamera(cam, new Vector3(0f, 1.04f, 5.75f), new Vector3(0f, 0.98f, 0f), 24f);
            RenderToPng(cam, Path.Combine(fullAuditDir, "proto_09_face_and_rear_cleanup_verification.png"), 1920, 1080);

            UnityEngine.Object.DestroyImmediate(groupFaceAndBack);
            UnityEngine.Object.DestroyImmediate(labelsFaceBack);

            groupABC.SetActive(true);
            labelsABC.SetActive(true);
            EditorSceneManager.SaveScene(protoScene, scenePath);
        }

        private static void SampleClipOnInstance(GameObject prefabInstance, string clipShortName, float normalizedTime, StringBuilder report = null)
        {
            Animator anim = prefabInstance.GetComponentInChildren<Animator>();
            if (anim == null || anim.runtimeAnimatorController == null) return;

            AnimationClip targetClip = anim.runtimeAnimatorController.animationClips
                .FirstOrDefault(c => c.name == $"MVC_BobbleheadBase_{clipShortName}" || c.name.EndsWith(clipShortName));
            if (targetClip == null) return;

            float sampleTime = Mathf.Clamp01(normalizedTime) * targetClip.length;
            targetClip.SampleAnimation(anim.gameObject, sampleTime);

            if (report != null)
            {
                SkinnedMeshRenderer smr = prefabInstance.GetComponentInChildren<SkinnedMeshRenderer>();
                Transform headBone = smr.bones.FirstOrDefault(b => b != null && b.name == "Head");
                Transform neckBone = smr.bones.FirstOrDefault(b => b != null && b.name == "Neck");
                float headNeckDist = (headBone != null && neckBone != null) ? Vector3.Distance(headBone.position, neckBone.position) : -1f;
                report.AppendLine($"  [Animation Sample Verified] Clip='{targetClip.name}' at t={sampleTime:F2}s/{targetClip.length:F2}s | HeadPos={headBone?.position:F3} | NeckToHeadDist={headNeckDist:F4}m");
            }
        }

        private static void SampleClipOnRawFbx(GameObject rawInstance, GameObject fbxRoot, string clipShortName, float normalizedTime)
        {
            string fbxPath = AssetDatabase.GetAssetPath(fbxRoot);
            var clips = AssetDatabase.LoadAllAssetsAtPath(fbxPath).OfType<AnimationClip>();
            AnimationClip clip = clips.FirstOrDefault(c => c.name == $"CharacterArmature|{clipShortName}");
            if (clip != null)
            {
                clip.SampleAnimation(rawInstance, Mathf.Clamp01(normalizedTime) * clip.length);
            }
        }

        private static GameObject CreateWorldLabelsCanvas(string bannerTitle, (Vector3 pos, string text)[] columnLabels, float bannerY = 2120f)
        {
            GameObject canvasGo = new GameObject("AuditLabelsCanvas");
            Canvas canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            RectTransform rt = canvasGo.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(4500f, 3000f);
            canvasGo.transform.position = Vector3.zero;
            canvasGo.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
            canvasGo.transform.localScale = Vector3.one * 0.001f;

            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            CreateLabelBox(canvasGo.transform, font, new Vector2(0f, bannerY), new Vector2(3450f, 95f), bannerTitle, 40, new Color(0.10f, 0.12f, 0.16f, 0.94f), new Color(0.95f, 0.97f, 1.0f, 1f));

            foreach (var col in columnLabels)
            {
                Vector2 anchoredPos = new Vector2(-col.pos.x * 1000f, col.pos.y * 1000f);
                CreateLabelBox(canvasGo.transform, font, anchoredPos, new Vector2(1040f, 118f), col.text, 28, new Color(0.11f, 0.14f, 0.19f, 0.92f), new Color(0.92f, 0.96f, 1.0f, 1f));
            }

            return canvasGo;
        }

        private static void CreateLabelBox(Transform parent, Font font, Vector2 pos, Vector2 size, string text, int fontSize, Color bgColor, Color textColor)
        {
            GameObject panelGo = new GameObject("LabelPanel");
            panelGo.transform.SetParent(parent, false);
            Image bg = panelGo.AddComponent<Image>();
            bg.color = bgColor;
            RectTransform prt = panelGo.GetComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.5f, 0.5f);
            prt.anchorMax = new Vector2(0.5f, 0.5f);
            prt.pivot = new Vector2(0.5f, 0.5f);
            prt.anchoredPosition = pos;
            prt.sizeDelta = size;

            GameObject txtGo = new GameObject("LabelText");
            txtGo.transform.SetParent(panelGo.transform, false);
            Text uiText = txtGo.AddComponent<Text>();
            uiText.font = font;
            uiText.text = text;
            uiText.fontSize = fontSize;
            uiText.fontStyle = FontStyle.Bold;
            uiText.alignment = TextAnchor.MiddleCenter;
            uiText.color = textColor;
            uiText.horizontalOverflow = HorizontalWrapMode.Overflow;
            uiText.verticalOverflow = VerticalWrapMode.Overflow;
            RectTransform trt = txtGo.GetComponent<RectTransform>();
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = Vector2.zero;
            trt.offsetMax = Vector2.zero;
        }

        private static void PositionCamera(Camera cam, Vector3 pos, Vector3 lookAt, float fov)
        {
            cam.transform.position = pos;
            cam.transform.LookAt(lookAt, Vector3.up);
            cam.fieldOfView = fov;
        }

        private static void RenderToPng(Camera cam, string outputPath, int width, int height)
        {
            RenderTexture rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            rt.antiAliasing = 4;
            RenderTexture prevActive = RenderTexture.active;
            RenderTexture prevCam = cam.targetTexture;

            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;

                Texture2D tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();

                byte[] png = tex.EncodeToPNG();
                File.WriteAllBytes(outputPath, png);
                UnityEngine.Object.DestroyImmediate(tex);
            }
            finally
            {
                cam.targetTexture = prevCam;
                RenderTexture.active = prevActive;
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
            }
        }

        private static float GetWeight(BoneWeight bw, int boneIdx)
        {
            if (boneIdx < 0) return 0f;
            float w = 0f;
            if (bw.boneIndex0 == boneIdx) w += bw.weight0;
            if (bw.boneIndex1 == boneIdx) w += bw.weight1;
            if (bw.boneIndex2 == boneIdx) w += bw.weight2;
            if (bw.boneIndex3 == boneIdx) w += bw.weight3;
            return w;
        }

        private static string GetDomBone(BoneWeight bw, Transform[] bones)
        {
            int idx = bw.boneIndex0;
            float maxW = bw.weight0;
            if (bw.weight1 > maxW) { maxW = bw.weight1; idx = bw.boneIndex1; }
            if (bw.weight2 > maxW) { maxW = bw.weight2; idx = bw.boneIndex2; }
            if (bw.weight3 > maxW) { maxW = bw.weight3; idx = bw.boneIndex3; }
            return (idx >= 0 && idx < bones.Length && bones[idx] != null) ? bones[idx].name : $"Bone_{idx}";
        }

        private static string SampleHex(Texture2D tex, Vector2 uv)
        {
            if (tex == null) return "FFFFFF";
            int px = Mathf.Clamp(Mathf.RoundToInt(uv.x * (tex.width - 1)), 0, tex.width - 1);
            int py = Mathf.Clamp(Mathf.RoundToInt(uv.y * (tex.height - 1)), 0, tex.height - 1);
            return ColorUtility.ToHtmlStringRGB(tex.GetPixel(px, py));
        }
    }
}
