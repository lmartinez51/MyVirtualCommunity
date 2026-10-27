using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using MyVirtualCommunity.Environment;
using MyVirtualCommunity.UI;
using MyVirtualCommunity.Player;
using MyVirtualCommunity.Npc;

namespace MyVirtualCommunity.Editor
{
    public static class Milestone94AuditRunner
    {
        [MenuItem("MyVirtualCommunity/Run Milestone 94 Visual Audit")]
        public static void RunVisualAudit()
        {
            Debug.Log("[Milestone94AuditRunner] Starting Milestone 94 Visual Audit Capture...");

            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"[Milestone94AuditRunner] Opened scene: {scene.name}");

            // Ensure environment is built
            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[Milestone94AuditRunner] Environment built successfully.");
            }

            // Ensure Elena NPC attendant avatar
            var elena = UnityEngine.Object.FindFirstObjectByType<ElenaNpcController>();
            if (elena != null)
            {
                elena.BuildAttendantAvatar();
            }

            // Setup camera
            Camera cam = Camera.main;
            if (cam == null)
            {
                var camObj = new GameObject("AuditCamera");
                cam = camObj.AddComponent<Camera>();
                cam.tag = "MainCamera";
            }

            var tpCam = cam.GetComponent<ThirdPersonCamera>();
            if (tpCam != null) tpCam.enabled = false;

            string auditDir = Path.Combine(Application.dataPath, "Audit");
            string artifactDir = @"C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\audit_screenshots";
            if (!Directory.Exists(auditDir)) Directory.CreateDirectory(auditDir);
            if (!Directory.Exists(artifactDir)) Directory.CreateDirectory(artifactDir);

            // Viewpoint 1: High-angle aerial overview of complete reconstructed area
            cam.transform.position = new Vector3(45f, 32f, -38f);
            cam.transform.eulerAngles = new Vector3(32f, 0f, 0f);
            SaveCameraFrame(cam, "01_high_angle_overview.png", auditDir, artifactDir);

            // Viewpoint 2: Street-level view approaching Wing Spot
            cam.transform.position = new Vector3(-22.0f, 1.8f, -2.0f);
            cam.transform.eulerAngles = new Vector3(5f, 45f, 0f);
            SaveCameraFrame(cam, "02_street_level_approach.png", auditDir, artifactDir);

            // Viewpoint 3: Front view of Wing Spot façade and entrance (Transformed Real Facade)
            cam.transform.position = new Vector3(-10.5f, 2.0f, 1.8f);
            cam.transform.eulerAngles = new Vector3(4f, 0f, 0f);
            SaveCameraFrame(cam, "03_wingspot_facade_entrance.png", auditDir, artifactDir);
            SaveCameraFrame(cam, "m94_01_wingspot_real_facade_transformed.png", auditDir, artifactDir);

            // Viewpoint 4: Relationship between Pastelerías La Tía Lupe at the corner, Wing Spot & Del Porvenir intersection
            cam.transform.position = new Vector3(16.0f, 4.5f, -12.0f);
            cam.transform.eulerAngles = new Vector3(10f, -42f, 0f);
            SaveCameraFrame(cam, "04_boulevard_del_porvenir_intersection.png", auditDir, artifactDir);
            SaveCameraFrame(cam, "m94_02_tialupe_googie_corner_transformed.png", auditDir, artifactDir);

            // Viewpoint 5: Inside restaurant showing counter and Elena Morales
            cam.transform.position = new Vector3(-10.5f, 1.7f, 8.5f);
            cam.transform.eulerAngles = new Vector3(4f, 0f, 0f);
            SaveCameraFrame(cam, "05_restaurant_interior_counter_elena.png", auditDir, artifactDir);

            // Viewpoint 6: Wide Boulevard streetscape showing Highway Billboard & Corner Utility Pole
            cam.transform.position = new Vector3(-2.0f, 3.2f, -18.0f);
            cam.transform.eulerAngles = new Vector3(12f, -18f, 0f);
            SaveCameraFrame(cam, "m94_03_boulevard_streetscape_billboard.png", auditDir, artifactDir);

            Debug.Log("[Milestone94AuditRunner] >>> ALL AUDIT VIEWPOINTS CAPTURED SUCCESSFULLY! <<<");

            if (Application.isBatchMode)
            {
                EditorApplication.Exit(0);
            }
        }

        private static void SaveCameraFrame(Camera cam, string filename, string auditDir, string artifactDir)
        {
            int width = 1920;
            int height = 1080;
            RenderTexture rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32);
            var oldRt = RenderTexture.active;
            var oldClearFlags = cam.clearFlags;
            var oldBg = cam.backgroundColor;

            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.19f, 0.30f, 0.47f, 1f); // Sky navy
            cam.targetTexture = rt;
            RenderTexture.active = rt;
            GL.Clear(true, true, cam.backgroundColor);

            cam.Render();

            Texture2D tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();

            cam.targetTexture = null;
            cam.clearFlags = oldClearFlags;
            cam.backgroundColor = oldBg;
            RenderTexture.active = oldRt;
            RenderTexture.ReleaseTemporary(rt);

            byte[] bytes = ImageConversion.EncodeToPNG(tex);
            UnityEngine.Object.DestroyImmediate(tex);

            if (bytes != null && bytes.Length > 0)
            {
                string path1 = Path.Combine(auditDir, filename);
                string path2 = Path.Combine(artifactDir, filename);
                File.WriteAllBytes(path1, bytes);
                File.WriteAllBytes(path2, bytes);
                Debug.Log($"[Milestone94AuditRunner] Saved frame: {filename} ({bytes.Length} bytes)");
            }
        }
    }
}
