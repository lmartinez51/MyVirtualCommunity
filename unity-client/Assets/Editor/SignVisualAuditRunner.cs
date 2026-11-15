using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Environment;
using MyVirtualCommunity.Player;

namespace MyVirtualCommunity.Editor
{
    /// <summary>
    /// Deterministically renders and captures evidence screenshots for:
    /// - View A: Exterior approach from the public sidewalk showing door-mounted sign attached to glass.
    /// - View B: Open and closed door states showing the sign physically moving with the door leaf.
    /// - View C: Foreground player occlusion demonstrating proper 3D depth testing (no text floating over player).
    /// - View D: Camera-angle sweep (frontal, oblique, elevated, lowered) verifying world-space depth behavior.
    /// - View E: All business statuses (Open, Closing Soon, Closed) for both Wing Spot and Tía Lupe.
    /// </summary>
    public static class SignVisualAuditRunner
    {
        [MenuItem("MyVirtualCommunity/Run Sign Visual Audit")]
        public static void RunVisualAudit()
        {
            Debug.Log("[SignVisualAuditRunner] ========================================================");
            Debug.Log("[SignVisualAuditRunner] Starting Door-Mounted Business Sign Visual Verification Audit...");
            Debug.Log("[SignVisualAuditRunner] ========================================================");

            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"[SignVisualAuditRunner] Opened scene: {scene.name}");

            // 1. Build Environment
            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[SignVisualAuditRunner] Environment built successfully.");
            }

            // 2. Setup Player Avatar
            var player = UnityEngine.Object.FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                player.BuildPlayerAvatar();
                Debug.Log("[SignVisualAuditRunner] Player avatar initialized.");
            }

            // Directories
            string localAuditDir = Path.Combine(Application.dataPath, "AuditScreenshots");
            string artifactDir = @"C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\audit_screenshots";

            if (!Directory.Exists(localAuditDir)) Directory.CreateDirectory(localAuditDir);
            if (!Directory.Exists(artifactDir)) Directory.CreateDirectory(artifactDir);

            // Audit Camera Setup
            Camera cam = Camera.main;
            if (cam == null)
            {
                var camObj = new GameObject("AuditCamera");
                cam = camObj.AddComponent<Camera>();
            }
            cam.fieldOfView = 50f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 100f;

            // Target Signs & Doors
            var wingSignObj = GameObject.Find("WingSpot_BusinessStatusSign");
            if (wingSignObj == null)
            {
                Debug.LogError("[SignVisualAuditRunner] FAILED: WingSpot_BusinessStatusSign not found in scene!");
                return;
            }
            var wingSign = wingSignObj.GetComponent<BusinessStatusSign>();
            var wingDoor = GameObject.Find("WingSpot_Entrance_Door_Pivot")?.GetComponent<InteractiveDoor>();

            var tiaSignObj = GameObject.Find("TiaLupe_BusinessStatusSign");
            if (tiaSignObj == null)
            {
                Debug.LogError("[SignVisualAuditRunner] FAILED: TiaLupe_BusinessStatusSign not found in scene!");
                return;
            }
            var tiaSign = tiaSignObj.GetComponent<BusinessStatusSign>();
            var tiaDoor = GameObject.Find("TiaLupe_Door_Pivot")?.GetComponent<InteractiveDoor>();

            // Time states:
            // Saturday 10:00 local (16:00 UTC) -> OPEN
            DateTime openTime = new DateTime(2026, 10, 24, 16, 0, 0, DateTimeKind.Utc);
            // Saturday 17:45 local (23:45 UTC) -> CLOSING SOON
            DateTime closingSoonTime = new DateTime(2026, 10, 24, 23, 45, 0, DateTimeKind.Utc);
            // Saturday 18:00 local (2026-10-25 00:00 UTC) -> CLOSED
            DateTime closedTime = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);

            // =================================================================
            // SECTION 1: WING SPOT (restaurant:wing-spot)
            // =================================================================
            Debug.Log("[SignVisualAuditRunner] Capturing Wing Spot Views A-E...");

            // View A: Exterior approach from sidewalk (Open status)
            wingSign.SetSimulatedTime(openTime);
            if (wingDoor != null) wingDoor.SetStateImmediate(DoorState.Closed);
            if (player != null)
            {
                player.transform.position = new Vector3(-7.80f, 0.24f, 3.40f);
                player.transform.rotation = Quaternion.Euler(0f, 25f, 0f);
            }
            cam.transform.position = new Vector3(-6.75f, 1.65f, 3.20f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_a_exterior_approach.png", localAuditDir, artifactDir);

            // View B: Door Closed vs Open
            // B1: Closed
            cam.transform.position = new Vector3(-6.75f, 1.64f, 4.00f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_b_door_closed.png", localAuditDir, artifactDir);

            // B2: Open (Leaf swings inward 90 degrees around Y)
            if (wingDoor != null) wingDoor.SetStateImmediate(DoorState.Open);
            cam.transform.position = new Vector3(-6.20f, 1.64f, 4.30f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_b_door_open.png", localAuditDir, artifactDir);
            if (wingDoor != null) wingDoor.SetStateImmediate(DoorState.Closed);

            // View C: Foreground Player Occlusion (Camera -> Player -> Door Sign)
            // Position player directly in line of sight between camera and door sign to verify depth testing
            wingSign.SetSimulatedTime(closedTime);
            if (player != null)
            {
                player.transform.position = new Vector3(-6.75f, 0.24f, 4.60f);
                player.transform.rotation = Quaternion.Euler(0f, 0f, 0f); // Back to camera, facing door
            }
            cam.transform.position = new Vector3(-6.75f, 1.64f, 3.30f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_c_player_occlusion.png", localAuditDir, artifactDir);

            // Move player aside for camera sweep
            if (player != null)
            {
                player.transform.position = new Vector3(-7.90f, 0.24f, 3.60f);
                player.transform.rotation = Quaternion.Euler(0f, 30f, 0f);
            }

            // View D: Camera-Angle Sweep
            // D1: Frontal
            cam.transform.position = new Vector3(-6.75f, 1.64f, 4.00f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_d_frontal.png", localAuditDir, artifactDir);

            // D2: Oblique (35-degree East perspective)
            cam.transform.position = new Vector3(-5.30f, 1.64f, 4.20f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_d_oblique.png", localAuditDir, artifactDir);

            // D3: Elevated (Pitched down ~25 degrees)
            cam.transform.position = new Vector3(-6.75f, 2.50f, 3.60f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_d_elevated.png", localAuditDir, artifactDir);

            // D4: Lowered (Pitched up ~15 degrees)
            cam.transform.position = new Vector3(-6.75f, 0.85f, 3.90f);
            cam.transform.LookAt(wingSign.transform.position);
            SaveCameraFrame(cam, "wingspot_view_d_lowered.png", localAuditDir, artifactDir);

            // View E: All Business Statuses (Framed sidewalk approach)
            cam.transform.position = new Vector3(-6.75f, 1.64f, 3.80f);
            cam.transform.LookAt(wingSign.transform.position);

            // E1: Open
            wingSign.SetSimulatedTime(openTime);
            SaveCameraFrame(cam, "sign_wingspot_open.png", localAuditDir, artifactDir);

            // E2: Closing Soon
            wingSign.SetSimulatedTime(closingSoonTime);
            SaveCameraFrame(cam, "sign_wingspot_closing_soon.png", localAuditDir, artifactDir);

            // E3: Closed
            wingSign.SetSimulatedTime(closedTime);
            SaveCameraFrame(cam, "sign_wingspot_closed.png", localAuditDir, artifactDir);

            // Wing Spot Windows: Facade Overview & Window Transparency Detail
            cam.transform.position = new Vector3(-13.50f, 2.20f, 0.80f);
            cam.transform.LookAt(new Vector3(-13.50f, 2.15f, 5.00f));
            SaveCameraFrame(cam, "wingspot_windows_facade_transparent.png", localAuditDir, artifactDir);

            cam.transform.position = new Vector3(-11.40f, 2.15f, 2.80f);
            cam.transform.LookAt(new Vector3(-11.40f, 2.15f, 4.85f));
            SaveCameraFrame(cam, "wingspot_window_close_detail.png", localAuditDir, artifactDir);

            // =================================================================
            // SECTION 2: PASTELERÍA LA TÍA LUPE (restaurant:pasteleria-tia-lupe)
            // =================================================================
            Debug.Log("[SignVisualAuditRunner] Capturing Tía Lupe Views A-E...");

            // View A: Exterior approach from sidewalk
            tiaSign.SetSimulatedTime(openTime);
            if (tiaDoor != null) tiaDoor.SetStateImmediate(DoorState.Closed);
            if (player != null)
            {
                player.transform.position = new Vector3(-3.80f, 0.24f, 3.20f);
                player.transform.rotation = Quaternion.Euler(0f, 30f, 0f);
            }
            cam.transform.position = new Vector3(-2.70f, 1.65f, 2.80f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_a_exterior_approach.png", localAuditDir, artifactDir);

            // View B: Door Closed vs Open
            // B1: Closed
            cam.transform.position = new Vector3(-2.70f, 1.64f, 3.50f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_b_door_closed.png", localAuditDir, artifactDir);

            // B2: Open (Leaf swings inward 85 degrees around Y)
            if (tiaDoor != null) tiaDoor.SetStateImmediate(DoorState.Open);
            cam.transform.position = new Vector3(-2.30f, 1.64f, 3.80f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_b_door_open.png", localAuditDir, artifactDir);
            if (tiaDoor != null) tiaDoor.SetStateImmediate(DoorState.Closed);

            // View C: Foreground Player Occlusion
            tiaSign.SetSimulatedTime(closedTime);
            if (player != null)
            {
                player.transform.position = new Vector3(-2.70f, 0.24f, 4.10f);
                player.transform.rotation = Quaternion.Euler(0f, 0f, 0f);
            }
            cam.transform.position = new Vector3(-2.70f, 1.64f, 2.80f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_c_player_occlusion.png", localAuditDir, artifactDir);

            // Move player aside for camera sweep
            if (player != null)
            {
                player.transform.position = new Vector3(-3.90f, 0.24f, 3.40f);
                player.transform.rotation = Quaternion.Euler(0f, 30f, 0f);
            }

            // View D: Camera-Angle Sweep
            // D1: Frontal
            cam.transform.position = new Vector3(-2.70f, 1.64f, 3.50f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_d_frontal.png", localAuditDir, artifactDir);

            // D2: Oblique (35-degree East perspective)
            cam.transform.position = new Vector3(-1.30f, 1.64f, 3.70f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_d_oblique.png", localAuditDir, artifactDir);

            // D3: Elevated (Pitched down ~25 degrees)
            cam.transform.position = new Vector3(-2.70f, 2.50f, 3.10f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_d_elevated.png", localAuditDir, artifactDir);

            // D4: Lowered (Pitched up ~15 degrees)
            cam.transform.position = new Vector3(-2.70f, 0.85f, 3.40f);
            cam.transform.LookAt(tiaSign.transform.position);
            SaveCameraFrame(cam, "tialupe_view_d_lowered.png", localAuditDir, artifactDir);

            // View E: All Business Statuses (Framed sidewalk approach)
            cam.transform.position = new Vector3(-2.70f, 1.64f, 3.30f);
            cam.transform.LookAt(tiaSign.transform.position);

            // E1: Open
            tiaSign.SetSimulatedTime(openTime);
            SaveCameraFrame(cam, "sign_tialupe_open.png", localAuditDir, artifactDir);

            // E2: Closing Soon
            tiaSign.SetSimulatedTime(closingSoonTime);
            SaveCameraFrame(cam, "sign_tialupe_closing_soon.png", localAuditDir, artifactDir);

            // E3: Closed
            tiaSign.SetSimulatedTime(closedTime);
            SaveCameraFrame(cam, "sign_tialupe_closed.png", localAuditDir, artifactDir);

            // Reset simulated times
            wingSign.ClearSimulatedTime();
            tiaSign.ClearSimulatedTime();

            Debug.Log("[SignVisualAuditRunner] ========================================================");
            Debug.Log("[SignVisualAuditRunner] Visual Audit Complete: All 22 Evidence Views Captured Successfully!");
            Debug.Log("[SignVisualAuditRunner] ========================================================");
        }

        private static void SaveCameraFrame(Camera cam, string filename, string localDir, string artifactDir)
        {
            int width = 1280;
            int height = 720;
            RenderTexture rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            RenderTexture prev = cam.targetTexture;
            RenderTexture active = RenderTexture.active;

            cam.targetTexture = rt;
            RenderTexture.active = rt;
            cam.Render();

            Texture2D tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();

            byte[] bytes = tex.EncodeToPNG();
            UnityEngine.Object.DestroyImmediate(tex);

            cam.targetTexture = prev;
            RenderTexture.active = active;
            UnityEngine.Object.DestroyImmediate(rt);

            string localPath = Path.Combine(localDir, filename);
            File.WriteAllBytes(localPath, bytes);

            string artifactPath = Path.Combine(artifactDir, filename);
            File.WriteAllBytes(artifactPath, bytes);

            Debug.Log($"[SignVisualAuditRunner] Captured and saved: {filename}");
        }
    }
}
