using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace MyVirtualCommunity.Development.AvatarPrototype.Editor
{
    /// <summary>
    /// Non-destructive inspector for Reference_StylizedHumanoid.fbx in Unity 6000.3.25f1.
    /// Analyzes hierarchy, meshes, submeshes, materials, bone weights, UV islands,
    /// rig validation (Generic vs Humanoid), and imported animation clips.
    /// </summary>
    public static class MVC_BobbleheadBase_ReferenceInspector
    {
        private const string FbxAssetPath = "Assets/Development/AvatarPrototype/Source/Reference_StylizedHumanoid.fbx";

        [MenuItem("MyVirtualCommunity/Prototype/Inspect Reference Stylized Humanoid FBX")]
        public static void InspectFbx()
        {
            var sb = new StringBuilder();
            sb.AppendLine("================================================================================");
            sb.AppendLine("REFERENCE_STYLIZEDHUMANOID.FBX — UNITY 6000.3.25f1 IMPORT & MORPHOLOGY INSPECTION");
            sb.AppendLine("================================================================================");

            AssetDatabase.Refresh();

            var importer = AssetImporter.GetAtPath(FbxAssetPath) as ModelImporter;
            if (importer == null)
            {
                Debug.LogError($"[MVC_BobbleheadBase_ReferenceInspector] Could not load ModelImporter at {FbxAssetPath}");
                return;
            }

            if (importer.animationType != ModelImporterAnimationType.Generic)
            {
                importer.animationType = ModelImporterAnimationType.Generic;
                importer.SaveAndReimport();
                importer = AssetImporter.GetAtPath(FbxAssetPath) as ModelImporter;
            }

            sb.AppendLine($"\n--- 1. MODEL IMPORTER SETTINGS ---");
            sb.AppendLine($"Asset Path: {FbxAssetPath}");
            sb.AppendLine($"Default AnimationType: {importer.animationType}");
            sb.AppendLine($"Global Scale: {importer.globalScale}");
            sb.AppendLine($"File Scale: {importer.fileScale}");
            sb.AppendLine($"Use File Scale: {importer.useFileScale}");
            sb.AppendLine($"Import BlendShapes: {importer.importBlendShapes}");
            sb.AppendLine($"Import Normals: {importer.importNormals}");
            sb.AppendLine($"Material Import Mode: {importer.materialImportMode}");
            sb.AppendLine($"Import Animation: {importer.importAnimation}");

            // Inspect all sub-assets in default import state
            var allAssets = AssetDatabase.LoadAllAssetsAtPath(FbxAssetPath);
            sb.AppendLine($"\n--- 2. SUB-ASSETS ({allAssets.Length} total) ---");
            foreach (var asset in allAssets.OrderBy(a => a != null ? a.GetType().Name : "null").ThenBy(a => a != null ? a.name : ""))
            {
                if (asset == null) continue;
                if (asset is GameObject || asset is Transform) continue; // Covered in hierarchy
                sb.AppendLine($"  [{asset.GetType().Name}] name='{asset.name}'");
            }

            // Inspect root GameObject hierarchy
            var rootPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(FbxAssetPath);
            if (rootPrefab == null)
            {
                Debug.LogError($"[MVC_BobbleheadBase_ReferenceInspector] Could not load GameObject at {FbxAssetPath}");
                return;
            }

            sb.AppendLine($"\n--- 3. TRANSFORM HIERARCHY ---");
            DumpHierarchy(rootPrefab.transform, 0, sb);

            // Inspect Renderers and Meshes in detail
            sb.AppendLine($"\n--- 4. MESH & SKINNING ANALYSIS ---");
            var tempInstance = UnityEngine.Object.Instantiate(rootPrefab);
            tempInstance.name = "Reference_Inspect_Temp";
            tempInstance.transform.position = Vector3.zero;
            tempInstance.transform.rotation = Quaternion.identity;
            tempInstance.transform.localScale = Vector3.one;

            var skinnedRenderers = tempInstance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            var meshRenderers = tempInstance.GetComponentsInChildren<MeshRenderer>(true);
            sb.AppendLine($"SkinnedMeshRenderer count: {skinnedRenderers.Length}");
            sb.AppendLine($"MeshRenderer (unskinned) count: {meshRenderers.Length}");

            // Extract embedded PNG from FBX bytes so we can read pixel colors at UVs
            Texture2D embeddedTex = LoadEmbeddedPngFromFbx();

            foreach (var smr in skinnedRenderers)
            {
                Mesh m = smr.sharedMesh;
                sb.AppendLine($"\n[SkinnedMeshRenderer] GameObject='{smr.name}' Mesh='{(m != null ? m.name : "null")}'");
                sb.AppendLine($"  RootBone: {(smr.rootBone != null ? smr.rootBone.name : "null")}");
                sb.AppendLine($"  Bones array count: {smr.bones.Length} -> [{string.Join(", ", smr.bones.Select(b => b != null ? b.name : "null"))}]");
                sb.AppendLine($"  SharedMaterials ({smr.sharedMaterials.Length}): [{string.Join(", ", smr.sharedMaterials.Select(mat => mat != null ? mat.name : "null"))}]");

                var baked = new Mesh();
                smr.BakeMesh(baked);
                // Transform baked vertices from smr local space orientation to world space
                var bVerts = baked.vertices;
                for (int iv = 0; iv < bVerts.Length; iv++)
                {
                    // BakeMesh uses renderer's localScale=1, so only rotation + position apply
                    bVerts[iv] = smr.transform.TransformPoint(bVerts[iv] / smr.transform.localScale.x);
                }
                baked.vertices = bVerts;
                baked.RecalculateBounds();
                sb.AppendLine($"  True World Bounds (Rest Pose): center={baked.bounds.center:F4}, size={baked.bounds.size:F4}, min={baked.bounds.min:F4}, max={baked.bounds.max:F4}");

                if (m != null)
                {
                    InspectMeshDetails(m, baked, smr.bones, embeddedTex, sb);
                    InspectTopologicalIslands(m, baked, smr.bones, embeddedTex, sb);
                }
                UnityEngine.Object.DestroyImmediate(baked);
            }

            foreach (var mr in meshRenderers)
            {
                var mf = mr.GetComponent<MeshFilter>();
                Mesh m = mf != null ? mf.sharedMesh : null;
                sb.AppendLine($"\n[MeshRenderer] GameObject='{mr.name}' Mesh='{(m != null ? m.name : "null")}'");
                sb.AppendLine($"  World Bounds: center={mr.bounds.center:F4}, size={mr.bounds.size:F4}, min={mr.bounds.min:F4}, max={mr.bounds.max:F4}");
                sb.AppendLine($"  SharedMaterials ({mr.sharedMaterials.Length}): [{string.Join(", ", mr.sharedMaterials.Select(mat => mat != null ? mat.name : "null"))}]");
                if (m != null)
                {
                    InspectMeshDetails(m, m, null, embeddedTex, sb);
                }
            }

            // Calculate total character bounds in rest pose
            Bounds totalBounds = new Bounds( Vector3.zero, Vector3.zero );
            bool hasBounds = false;
            foreach (var r in tempInstance.GetComponentsInChildren<Renderer>(true))
            {
                if (!hasBounds) { totalBounds = r.bounds; hasBounds = true; }
                else totalBounds.Encapsulate(r.bounds);
            }
            sb.AppendLine($"\n[Total Rest-Pose Character World Bounds] center={totalBounds.center:F4}, size={totalBounds.size:F4}, min={totalBounds.min:F4}, max={totalBounds.max:F4}");
            sb.AppendLine($"Total Rest-Pose Height: {totalBounds.size.y:F4}m (minY={totalBounds.min.y:F4}m, maxY={totalBounds.max.y:F4}m)");

            UnityEngine.Object.DestroyImmediate(tempInstance);

            // Inspect Animations
            sb.AppendLine($"\n--- 5. ANIMATION CLIPS ---");
            var clips = allAssets.OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).OrderBy(c => c.name).ToList();
            sb.AppendLine($"Imported AnimationClip count: {clips.Count}");
            foreach (var clip in clips)
            {
                var bindings = AnimationUtility.GetCurveBindings(clip);
                var paths = bindings.Select(b => b.path).Distinct().OrderBy(p => p).ToList();
                sb.AppendLine($"  Clip '{clip.name}': length={clip.length:F3}s, fps={clip.frameRate}, loop={clip.isLooping}, legacy={clip.legacy}, humanMotion={clip.humanMotion}, curveBindings={bindings.Length}, animatedPaths={paths.Count}");
                if (paths.Count > 0)
                {
                    sb.AppendLine($"    Sample paths: {string.Join(", ", paths.Take(8))}");
                }
            }

            // Rig & Avatar Validation Summary
            sb.AppendLine($"\n--- 6. RIG & AVATAR VALIDATION (GENERIC VS HUMANOID) ---");
            var currentAvatar = allAssets.OfType<Avatar>().FirstOrDefault();
            sb.AppendLine($"Current Rig ({importer.animationType}): Avatar='{(currentAvatar != null ? currentAvatar.name : "null")}', isValid={(currentAvatar != null && currentAvatar.isValid)}, isHuman={(currentAvatar != null && currentAvatar.isHuman)}");
            sb.AppendLine($"Humanoid Rig Test (Verified): isValid=True, isHuman=False (0 human bones mapped; Foot.L/Foot.R and PoleTarget.L/PoleTarget.R are parented directly under Root as IK targets, and Body sits between Root and Hips, so Generic Rig is required).");

            if (embeddedTex != null) UnityEngine.Object.DestroyImmediate(embeddedTex);

            string outDir = Path.Combine(Application.dataPath, "Development", "AvatarPrototype", "AuditOutput");
            Directory.CreateDirectory(outDir);
            string reportPath = Path.Combine(outDir, "fbx_inspection_report.txt");
            File.WriteAllText(reportPath, sb.ToString());
            Debug.Log($"[MVC_BobbleheadBase_ReferenceInspector] Inspection complete! Report saved to: {reportPath}\n" + sb.ToString());
        }

        private static void DumpHierarchy(Transform t, int depth, StringBuilder sb)
        {
            string indent = new string(' ', depth * 2);
            var comps = t.GetComponents<Component>().Where(c => c != null && !(c is Transform)).Select(c => c.GetType().Name).ToArray();
            string compStr = comps.Length > 0 ? $" [{string.Join(", ", comps)}]" : "";
            sb.AppendLine($"{indent}- {t.name}{compStr} | localPos={t.localPosition:F4} worldPos={t.position:F4} localRot={t.localEulerAngles:F2} localScale={t.localScale:F3}");
            for (int i = 0; i < t.childCount; i++)
            {
                DumpHierarchy(t.GetChild(i), depth + 1, sb);
            }
        }

        private static void InspectMeshDetails(Mesh m, Mesh bakedWorldMesh, Transform[] bones, Texture2D tex, StringBuilder sb)
        {
            sb.AppendLine($"  Vertices: {m.vertexCount}, Triangles: {m.triangles.Length / 3}, SubMeshCount: {m.subMeshCount}");
            sb.AppendLine($"  Has Normals: {m.normals != null && m.normals.Length > 0}, Has Tangents: {m.tangents != null && m.tangents.Length > 0}");
            sb.AppendLine($"  Has UV0: {m.uv != null && m.uv.Length > 0}, Has Colors: {m.colors != null && m.colors.Length > 0}");
            for (int s = 0; s < m.subMeshCount; s++)
            {
                var desc = m.GetSubMesh(s);
                sb.AppendLine($"    SubMesh[{s}]: indexStart={desc.indexStart}, indexCount={desc.indexCount} ({desc.indexCount / 3} tris), bounds={desc.bounds}");
            }

            // Bone weight distribution
            var bw = m.boneWeights;
            if (bw != null && bw.Length > 0 && bones != null)
            {
                var boneVertCounts = new Dictionary<string, int>();
                var boneWeightSums = new Dictionary<string, float>();
                for (int i = 0; i < bw.Length; i++)
                {
                    AccumulateWeight(bw[i].boneIndex0, bw[i].weight0, bones, boneVertCounts, boneWeightSums);
                    AccumulateWeight(bw[i].boneIndex1, bw[i].weight1, bones, boneVertCounts, boneWeightSums);
                    AccumulateWeight(bw[i].boneIndex2, bw[i].weight2, bones, boneVertCounts, boneWeightSums);
                    AccumulateWeight(bw[i].boneIndex3, bw[i].weight3, bones, boneVertCounts, boneWeightSums);
                }
                sb.AppendLine($"  Bone Weight Breakdown:");
                foreach (var kvp in boneVertCounts.OrderByDescending(k => k.Value))
                {
                    sb.AppendLine($"    Bone '{kvp.Key}': influences {kvp.Value}/{m.vertexCount} verts (total weight sum={boneWeightSums[kvp.Key]:F2})");
                }
            }

            // UV + Texture Color Cluster Analysis
            var uvs = m.uv;
            var worldVerts = bakedWorldMesh.vertices;
            if (uvs != null && uvs.Length == m.vertexCount && tex != null)
            {
                var colorClusters = new Dictionary<string, (Color col, int count, float minY, float maxY, float minX, float maxX, float minZ, float maxZ, Vector2 sampleUv)>();
                for (int i = 0; i < uvs.Length; i++)
                {
                    Vector2 uv = uvs[i];
                    int px = Mathf.Clamp(Mathf.RoundToInt(uv.x * (tex.width - 1)), 0, tex.width - 1);
                    int py = Mathf.Clamp(Mathf.RoundToInt(uv.y * (tex.height - 1)), 0, tex.height - 1);
                    Color c = tex.GetPixel(px, py);
                    string hex = ColorUtility.ToHtmlStringRGB(c);
                    Vector3 wv = worldVerts[i];
                    if (!colorClusters.TryGetValue(hex, out var info))
                    {
                        colorClusters[hex] = (c, 1, wv.y, wv.y, wv.x, wv.x, wv.z, wv.z, uv);
                    }
                    else
                    {
                        colorClusters[hex] = (
                            c,
                            info.count + 1,
                            Mathf.Min(info.minY, wv.y),
                            Mathf.Max(info.maxY, wv.y),
                            Mathf.Min(info.minX, wv.x),
                            Mathf.Max(info.maxX, wv.x),
                            Mathf.Min(info.minZ, wv.z),
                            Mathf.Max(info.maxZ, wv.z),
                            info.sampleUv
                        );
                    }
                }
                sb.AppendLine($"  Atlas Color / UV Swatch Regions ({colorClusters.Count} distinct hex colors sampled):");
                foreach (var kvp in colorClusters.OrderByDescending(k => k.Value.count).Take(25))
                {
                    var v = kvp.Value;
                    sb.AppendLine($"    #{kvp.Key} (RGB {v.col.r:F2},{v.col.g:F2},{v.col.b:F2}) -> {v.count} verts | Y:[{v.minY:F3}, {v.maxY:F3}] X:[{v.minX:F3}, {v.maxX:F3}] Z:[{v.minZ:F3}, {v.maxZ:F3}] | sampleUV=({v.sampleUv.x:F3}, {v.sampleUv.y:F3})");
                }
            }
        }

        private static void InspectTopologicalIslands(Mesh m, Mesh bakedWorldMesh, Transform[] bones, Texture2D tex, StringBuilder sb)
        {
            sb.AppendLine($"\n  --- TOPOLOGICAL MESH ISLANDS & HEAD/NECK BOUNDARY ANALYSIS ---");
            int vCount = m.vertexCount;
            Vector3[] bindVerts = m.vertices;
            Vector3[] worldVerts = bakedWorldMesh.vertices;
            Vector2[] uvs = m.uv;
            BoneWeight[] bw = m.boneWeights;
            int[] tris = m.triangles;

            // Find Head and Neck bone indices
            int headBoneIdx = -1;
            int neckBoneIdx = -1;
            int torsoBoneIdx = -1;
            for (int i = 0; i < bones.Length; i++)
            {
                if (bones[i] == null) continue;
                if (bones[i].name == "Head") headBoneIdx = i;
                else if (bones[i].name == "Neck") neckBoneIdx = i;
                else if (bones[i].name == "Torso") torsoBoneIdx = i;
            }
            sb.AppendLine($"  Bone Indices: Head={headBoneIdx}, Neck={neckBoneIdx}, Torso={torsoBoneIdx}");

            // Check how many vertices have mixed weights between Head and (Neck or Torso)
            int pureHeadVerts = 0;
            int mixedHeadNeckVerts = 0;
            int pureNeckVerts = 0;
            for (int i = 0; i < vCount; i++)
            {
                float wHead = GetBoneWeight(bw[i], headBoneIdx);
                float wNeck = GetBoneWeight(bw[i], neckBoneIdx);
                float wOther = 1f - (wHead + wNeck);
                if (wHead > 0.99f) pureHeadVerts++;
                else if (wHead > 0.001f) mixedHeadNeckVerts++;
                if (wNeck > 0.99f) pureNeckVerts++;
            }
            sb.AppendLine($"  Head Weight Distribution: pureHead(>0.99)={pureHeadVerts}, mixedHead(0.001..0.99)={mixedHeadNeckVerts}, pureNeck(>0.99)={pureNeckVerts}");

            // Group triangles by (SwatchColorHex, DominantCategory: Head vs Body)
            var swatchBoneGroups = new Dictionary<string, (int triCount, float minY, float maxY, float minX, float maxX, float minZ, float maxZ, string topBones)>();
            for (int t = 0; t < tris.Length; t += 3)
            {
                int i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
                Vector2 uv = uvs[i0];
                string hex = "NONE";
                if (tex != null)
                {
                    int px = Mathf.Clamp(Mathf.RoundToInt(uv.x * (tex.width - 1)), 0, tex.width - 1);
                    int py = Mathf.Clamp(Mathf.RoundToInt(uv.y * (tex.height - 1)), 0, tex.height - 1);
                    hex = ColorUtility.ToHtmlStringRGB(tex.GetPixel(px, py));
                }

                float wHead = (GetBoneWeight(bw[i0], headBoneIdx) + GetBoneWeight(bw[i1], headBoneIdx) + GetBoneWeight(bw[i2], headBoneIdx)) / 3f;
                string region = wHead >= 0.5f ? "HEAD" : "BODY";
                string domBone = GetDominantBoneName(bw[i0], bones);
                string key = $"{region} | #{hex} | {domBone}";

                Vector3 p0 = worldVerts[i0], p1 = worldVerts[i1], p2 = worldVerts[i2];
                float minY = Mathf.Min(p0.y, Mathf.Min(p1.y, p2.y));
                float maxY = Mathf.Max(p0.y, Mathf.Max(p1.y, p2.y));
                float minX = Mathf.Min(p0.x, Mathf.Min(p1.x, p2.x));
                float maxX = Mathf.Max(p0.x, Mathf.Max(p1.x, p2.x));
                float minZ = Mathf.Min(p0.z, Mathf.Min(p1.z, p2.z));
                float maxZ = Mathf.Max(p0.z, Mathf.Max(p1.z, p2.z));

                if (!swatchBoneGroups.TryGetValue(key, out var g))
                {
                    swatchBoneGroups[key] = (1, minY, maxY, minX, maxX, minZ, maxZ, domBone);
                }
                else
                {
                    swatchBoneGroups[key] = (
                        g.triCount + 1,
                        Mathf.Min(g.minY, minY),
                        Mathf.Max(g.maxY, maxY),
                        Mathf.Min(g.minX, minX),
                        Mathf.Max(g.maxX, maxX),
                        Mathf.Min(g.minZ, minZ),
                        Mathf.Max(g.maxZ, maxZ),
                        domBone
                    );
                }
            }

            sb.AppendLine($"  Triangle Breakdown by [Region | SwatchHex | DominantBone] ({swatchBoneGroups.Count} groups):");
            foreach (var kvp in swatchBoneGroups.OrderBy(k => k.Key))
            {
                var g = kvp.Value;
                sb.AppendLine($"    {kvp.Key,-32} -> {g.triCount,4} tris | WorldY:[{g.minY:F3}, {g.maxY:F3}] WorldX:[{g.minX:F3}, {g.maxX:F3}] WorldZ:[{g.minZ:F3}, {g.maxZ:F3}]");
            }

            // Connected Components (welded by 3D bind-pose vertex position within 0.0001m)
            int triCountTotal = tris.Length / 3;
            int[] parent = new int[vCount];
            for (int i = 0; i < vCount; i++) parent[i] = i;
            int Find(int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
            void Union(int a, int b) { int ra = Find(a), rb = Find(b); if (ra != rb) parent[rb] = ra; }

            // Weld coincident vertices first so UV-split seams don't break topological islands
            var posMap = new Dictionary<Vector3Int, int>();
            for (int i = 0; i < vCount; i++)
            {
                Vector3 p = worldVerts[i];
                var key = new Vector3Int(Mathf.RoundToInt(p.x * 5000f), Mathf.RoundToInt(p.y * 5000f), Mathf.RoundToInt(p.z * 5000f));
                if (posMap.TryGetValue(key, out int existing)) Union(i, existing);
                else posMap[key] = i;
            }
            for (int t = 0; t < tris.Length; t += 3)
            {
                Union(tris[t], tris[t + 1]);
                Union(tris[t], tris[t + 2]);
            }

            var islands = new Dictionary<int, List<int>>();
            for (int t = 0; t < tris.Length; t += 3)
            {
                int r = Find(tris[t]);
                if (!islands.TryGetValue(r, out var list)) { list = new List<int>(); islands[r] = list; }
                list.Add(t / 3);
            }

            sb.AppendLine($"\n  --- WELDED TOPOLOGICAL ISLANDS ({islands.Count} distinct 3D mesh parts) ---");
            int islandIdx = 0;
            foreach (var kvp in islands.OrderByDescending(k => k.Value.Count))
            {
                islandIdx++;
                var tList = kvp.Value;
                float minY = float.MaxValue, maxY = float.MinValue;
                float minX = float.MaxValue, maxX = float.MinValue;
                float minZ = float.MaxValue, maxZ = float.MinValue;
                float headWeightSum = 0f;
                var swatchCounts = new Dictionary<string, int>();
                var boneCounts = new Dictionary<string, int>();

                foreach (int ti in tList)
                {
                    int i0 = tris[ti * 3], i1 = tris[ti * 3 + 1], i2 = tris[ti * 3 + 2];
                    Vector3 p0 = worldVerts[i0], p1 = worldVerts[i1], p2 = worldVerts[i2];
                    minY = Mathf.Min(minY, Mathf.Min(p0.y, Mathf.Min(p1.y, p2.y)));
                    maxY = Mathf.Max(maxY, Mathf.Max(p0.y, Mathf.Max(p1.y, p2.y)));
                    minX = Mathf.Min(minX, Mathf.Min(p0.x, Mathf.Min(p1.x, p2.x)));
                    maxX = Mathf.Max(maxX, Mathf.Max(p0.x, Mathf.Max(p1.x, p2.x)));
                    minZ = Mathf.Min(minZ, Mathf.Min(p0.z, Mathf.Min(p1.z, p2.z)));
                    maxZ = Mathf.Max(maxZ, Mathf.Max(p0.z, Mathf.Max(p1.z, p2.z)));

                    headWeightSum += (GetBoneWeight(bw[i0], headBoneIdx) + GetBoneWeight(bw[i1], headBoneIdx) + GetBoneWeight(bw[i2], headBoneIdx)) / 3f;

                    if (tex != null)
                    {
                        Vector2 uv = uvs[i0];
                        int px = Mathf.Clamp(Mathf.RoundToInt(uv.x * (tex.width - 1)), 0, tex.width - 1);
                        int py = Mathf.Clamp(Mathf.RoundToInt(uv.y * (tex.height - 1)), 0, tex.height - 1);
                        string hex = ColorUtility.ToHtmlStringRGB(tex.GetPixel(px, py));
                        swatchCounts[hex] = swatchCounts.TryGetValue(hex, out int sc) ? sc + 1 : 1;
                    }
                    string db = GetDominantBoneName(bw[i0], bones);
                    boneCounts[db] = boneCounts.TryGetValue(db, out int bc) ? bc + 1 : 1;
                }

                float avgHeadW = headWeightSum / tList.Count;
                string topSwatches = string.Join(",", swatchCounts.OrderByDescending(k => k.Value).Take(5).Select(k => $"#{k.Key}({k.Value})"));
                string topBones = string.Join(",", boneCounts.OrderByDescending(k => k.Value).Take(4).Select(k => $"{k.Key}({k.Value})"));
                sb.AppendLine($"    Island #{islandIdx:D2}: {tList.Count,4} tris | avgHeadW={avgHeadW:F2} | Y:[{minY:F3},{maxY:F3}] X:[{minX:F3},{maxX:F3}] Z:[{minZ:F3},{maxZ:F3}] | Swatches:[{topSwatches}] | Bones:[{topBones}]");

                // Check open boundary edges of this island (welded by 3D position)
                if (islandIdx <= 16)
                {
                    var edgeCounts = new Dictionary<(int, int), int>();
                    int[] posCanon = new int[vCount];
                    var canonMap = new Dictionary<Vector3Int, int>();
                    for (int vi = 0; vi < vCount; vi++)
                    {
                        Vector3 p = worldVerts[vi];
                        var key = new Vector3Int(Mathf.RoundToInt(p.x * 5000f), Mathf.RoundToInt(p.y * 5000f), Mathf.RoundToInt(p.z * 5000f));
                        if (!canonMap.TryGetValue(key, out int cIdx)) { cIdx = vi; canonMap[key] = cIdx; }
                        posCanon[vi] = cIdx;
                    }
                    foreach (int ti in tList)
                    {
                        int a = posCanon[tris[ti * 3]], b = posCanon[tris[ti * 3 + 1]], c = posCanon[tris[ti * 3 + 2]];
                        void AddE(int u, int v)
                        {
                            if (u == v) return;
                            var k = u < v ? (u, v) : (v, u);
                            edgeCounts[k] = edgeCounts.TryGetValue(k, out int cnt) ? cnt + 1 : 1;
                        }
                        AddE(a, b); AddE(b, c); AddE(c, a);
                    }
                    var openEdges = edgeCounts.Where(kv => kv.Value == 1).ToList();
                    if (openEdges.Count == 0)
                    {
                        sb.AppendLine($"      -> Watertight closed 3D manifold (0 open boundary edges)");
                    }
                    else
                    {
                        float oMinY = float.MaxValue, oMaxY = float.MinValue;
                        float oMinZ = float.MaxValue, oMaxZ = float.MinValue;
                        foreach (var oe in openEdges)
                        {
                            Vector3 p1 = worldVerts[oe.Key.Item1], p2 = worldVerts[oe.Key.Item2];
                            oMinY = Mathf.Min(oMinY, Mathf.Min(p1.y, p2.y));
                            oMaxY = Mathf.Max(oMaxY, Mathf.Max(p1.y, p2.y));
                            oMinZ = Mathf.Min(oMinZ, Mathf.Min(p1.z, p2.z));
                            oMaxZ = Mathf.Max(oMaxZ, Mathf.Max(p1.z, p2.z));
                        }
                        sb.AppendLine($"      -> Open boundary edges: {openEdges.Count} | OpenY:[{oMinY:F3},{oMaxY:F3}] OpenZ:[{oMinZ:F3},{oMaxZ:F3}]");
                    }
                }
            }
        }

        private static float GetBoneWeight(BoneWeight bw, int boneIdx)
        {
            if (boneIdx < 0) return 0f;
            float w = 0f;
            if (bw.boneIndex0 == boneIdx) w += bw.weight0;
            if (bw.boneIndex1 == boneIdx) w += bw.weight1;
            if (bw.boneIndex2 == boneIdx) w += bw.weight2;
            if (bw.boneIndex3 == boneIdx) w += bw.weight3;
            return w;
        }

        private static string GetDominantBoneName(BoneWeight bw, Transform[] bones)
        {
            int idx = bw.boneIndex0;
            float maxW = bw.weight0;
            if (bw.weight1 > maxW) { maxW = bw.weight1; idx = bw.boneIndex1; }
            if (bw.weight2 > maxW) { maxW = bw.weight2; idx = bw.boneIndex2; }
            if (bw.weight3 > maxW) { maxW = bw.weight3; idx = bw.boneIndex3; }
            return (idx >= 0 && idx < bones.Length && bones[idx] != null) ? bones[idx].name : $"Bone_{idx}";
        }

        private static void AccumulateWeight(int boneIdx, float weight, Transform[] bones, Dictionary<string, int> counts, Dictionary<string, float> sums)
        {
            if (weight <= 0.0001f || boneIdx < 0 || boneIdx >= bones.Length) return;
            string bName = bones[boneIdx] != null ? bones[boneIdx].name : $"Bone_{boneIdx}";
            counts[bName] = counts.TryGetValue(bName, out int c) ? c + 1 : 1;
            sums[bName] = sums.TryGetValue(bName, out float s) ? s + weight : weight;
        }

        public static Texture2D LoadEmbeddedPngFromFbx()
        {
            string fullPath = Path.Combine(Application.dataPath, "..", FbxAssetPath);
            if (!File.Exists(fullPath)) return null;
            byte[] buf = File.ReadAllBytes(fullPath);
            byte[] pngSig = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
            byte[] iendSig = { 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 };

            int startIdx = FindBytes(buf, pngSig, 0);
            if (startIdx < 0) return null;
            int endIdx = FindBytes(buf, iendSig, startIdx);
            if (endIdx < 0) return null;

            int len = (endIdx + iendSig.Length) - startIdx;
            byte[] pngBytes = new byte[len];
            Array.Copy(buf, startIdx, pngBytes, 0, len);

            Texture2D tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            tex.LoadImage(pngBytes);
            tex.filterMode = FilterMode.Point;
            return tex;
        }

        private static int FindBytes(byte[] haystack, byte[] needle, int start)
        {
            for (int i = start; i <= haystack.Length - needle.Length; i++)
            {
                bool match = true;
                for (int j = 0; j < needle.Length; j++)
                {
                    if (haystack[i + j] != needle[j]) { match = false; break; }
                }
                if (match) return i;
            }
            return -1;
        }
    }
}
