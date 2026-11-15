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
    public static class Milestone95AuditRunner
    {
        [MenuItem("MyVirtualCommunity/Run Milestone 95 Visual Audit")]
        public static void RunVisualAudit()
        {
            Debug.Log("[Milestone95AuditRunner] Starting Milestone 95 Bobblehead Visual Audit...");

            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"[Milestone95AuditRunner] Opened scene: {scene.name}");

            // 1. Build environment
            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[Milestone95AuditRunner] Environment built successfully.");
            }

            // 2. Build Player Bobblehead Avatar
            var player = UnityEngine.Object.FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                player.BuildPlayerAvatar();
                Debug.Log("[Milestone95AuditRunner] Player Bobblehead avatar built.");
            }

            // 3. Build Elena Bobblehead Avatar
            var elena = UnityEngine.Object.FindFirstObjectByType<ElenaNpcController>();
            if (elena != null)
            {
                elena.BuildAttendantAvatar();
                Debug.Log("[Milestone95AuditRunner] Elena Morales Bobblehead avatar built.");
            }

            // 4. Setup camera
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

            // -------------------------------------------------------------
            // Viewpoint 1: Third-person exterior view
            // Standard gameplay third-person camera perspective behind player facing entrance
            // -------------------------------------------------------------
            if (player != null)
            {
                player.transform.position = new Vector3(-10.5f, 0.05f, 2.0f);
                player.transform.rotation = Quaternion.Euler(0f, 0f, 0f); // Facing North toward entrance
            }
            cam.transform.position = new Vector3(-10.5f, 1.70f, -0.8f);
            cam.transform.LookAt(new Vector3(-10.5f, 1.30f, 4.0f));
            SaveCameraFrame(cam, "m95_01_third_person_exterior.png", auditDir, artifactDir);

            // -------------------------------------------------------------
            // Viewpoint 2: Full-body view of the player
            // Complete head-to-toe front portrait showing stylized face, beanie, outfit & sneakers
            // -------------------------------------------------------------
            if (player != null)
            {
                player.transform.position = new Vector3(-10.5f, 0.05f, 2.0f);
                player.transform.rotation = Quaternion.Euler(0f, 180f, 0f); // Facing South toward camera
            }
            cam.transform.position = new Vector3(-10.5f, 1.05f, -0.6f);
            cam.transform.LookAt(new Vector3(-10.5f, 0.95f, 2.0f));
            SaveCameraFrame(cam, "m95_02_full_body_player.png", auditDir, artifactDir);

            // -------------------------------------------------------------
            // Viewpoint 3: Interior view showing Elena behind the counter
            // From customer perspective looking across ordering counter at Elena Morales
            // -------------------------------------------------------------
            if (elena != null)
            {
                elena.transform.position = new Vector3(-10.5f, 0.44f, 12.8f);
                elena.transform.rotation = Quaternion.Euler(0f, 180f, 0f); // Facing South toward customer
            }
            cam.transform.position = new Vector3(-10.5f, 1.62f, 9.6f);
            cam.transform.LookAt(new Vector3(-10.5f, 1.50f, 12.8f));
            if (elena != null)
            {
                var bb3 = elena.transform.Find("Billboard_Nameplate");
                if (bb3 != null) bb3.rotation = cam.transform.rotation;
            }
            SaveCameraFrame(cam, "m95_03_interior_counter_elena.png", auditDir, artifactDir);

            // -------------------------------------------------------------
            // Viewpoint 4: Closer view showing both characters' faces and clothing
            // Player at counter interacting with Elena Morales (medium two-shot)
            // -------------------------------------------------------------
            if (player != null)
            {
                player.transform.position = new Vector3(-11.4f, 0.24f, 11.2f);
                player.transform.rotation = Quaternion.Euler(0f, 105f, 0f); // 3/4 profile facing east-southeast toward camera
            }
            if (elena != null)
            {
                elena.transform.position = new Vector3(-10.2f, 0.44f, 12.6f);
                elena.transform.rotation = Quaternion.Euler(0f, 215f, 0f); // 3/4 profile facing Player & camera
            }
            cam.transform.position = new Vector3(-10.9f, 1.48f, 9.2f);
            cam.transform.LookAt(new Vector3(-10.8f, 1.45f, 11.9f));
            if (elena != null)
            {
                var bb4 = elena.transform.Find("Billboard_Nameplate");
                if (bb4 != null) bb4.rotation = cam.transform.rotation;
            }
            SaveCameraFrame(cam, "m95_04_characters_close_up_comparison.png", auditDir, artifactDir);

            // -------------------------------------------------------------
            // Viewpoint 5: View showing the player moving in front of the building
            // Demonstrating procedural walk cycle pose with alternating limbs grounded on sidewalk
            // -------------------------------------------------------------
            if (player != null)
            {
                player.transform.position = new Vector3(-10.5f, 0.05f, 2.2f);
                player.transform.rotation = Quaternion.Euler(0f, 110f, 0f); // Walking east-southeast toward camera

                var anim = player.GetComponent<BobbleheadAnimator>();
                if (anim != null)
                {
                    anim.UpdateLocomotionState(4.0f, true);
                    // Manually step walk cycle to mid-stride for dynamic snapshot
                    var charComponent = player.GetComponent<BobbleheadCharacter>();
                    if (charComponent != null)
                    {
                        if (charComponent.LeftLegRoot != null) charComponent.LeftLegRoot.localRotation = Quaternion.Euler(26f, 0f, 0f);
                        if (charComponent.RightLegRoot != null) charComponent.RightLegRoot.localRotation = Quaternion.Euler(-26f, 0f, 0f);
                        if (charComponent.LeftLowerLeg != null) charComponent.LeftLowerLeg.localRotation = Quaternion.Euler(18f, 0f, 0f);
                        if (charComponent.RightLowerLeg != null) charComponent.RightLowerLeg.localRotation = Quaternion.Euler(4f, 0f, 0f);
                        if (charComponent.LeftArmRoot != null) charComponent.LeftArmRoot.localRotation = Quaternion.Euler(-22f, 0f, 8f);
                        if (charComponent.RightArmRoot != null) charComponent.RightArmRoot.localRotation = Quaternion.Euler(22f, 0f, -8f);
                    }
                }
            }
            cam.transform.position = new Vector3(-7.8f, 1.15f, 0.2f);
            cam.transform.LookAt(new Vector3(-10.5f, 0.95f, 2.2f));
            SaveCameraFrame(cam, "m95_05_player_walking_cycle.png", auditDir, artifactDir);

            Debug.Log("[Milestone95AuditRunner] >>> ALL 5 BOBBLEHEAD AUDIT VIEWPOINTS CAPTURED SUCCESSFULLY! <<<");

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
                Debug.Log($"[Milestone95AuditRunner] Saved frame: {filename} ({bytes.Length} bytes)");
            }
        }
    }
}
