using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using MyVirtualCommunity.Environment;

namespace MyVirtualCommunity.Editor
{
    public static class TwoStoryResidenceVisualAuditRunner
    {
        private static readonly string AuditOutputDir =
            @"C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\audit_screenshots";

        [MenuItem("MyVirtualCommunity/Run Two-Story Residence Visual Audit")]
        public static void RunVisualAudit()
        {
            Debug.Log("[TwoStoryResidenceAudit] ========================================================");
            Debug.Log("[TwoStoryResidenceAudit] Starting Two-Story Residence Architectural Verification Audit...");
            Debug.Log("[TwoStoryResidenceAudit] ========================================================");

            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"[TwoStoryResidenceAudit] Opened scene: {scene.name}");

            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[TwoStoryResidenceAudit] Environment built successfully.");
            }

            if (!Directory.Exists(AuditOutputDir))
            {
                Directory.CreateDirectory(AuditOutputDir);
            }

            // 1. Assert Key Architectural Elements Exist
            AssertElement("DelPorvenir_TwoStory_Residence");
            AssertElement("Carport_Roof_Slab");
            AssertElement("Recessed_Floor_Slab");
            AssertElement("Recessed_Floor_Fascia");
            AssertElement("Carport_Front_Lintel");
            AssertElement("Carport_Number_Text");
            AssertElement("Carport_Pillar_North");
            AssertElement("Carport_Column_Center");
            AssertElement("Carport_Pillar_South");
            AssertElement("Carport_Back_Wall");
            AssertElement("Main_Door_Leaf");
            AssertElement("Main_Door_Arch_Glass");
            AssertElement("Balcony_Solid_Parapet_Front");
            AssertElement("Upper_Main_Window_Frame");
            AssertElement("Upper_Square_Window_Frame");
            AssertElement("Residence_Rear_Wall_Ground");
            AssertElement("Residence_Rear_Wall_Upper");
            AssertElement("Residence_North_Wall_Ground");
            AssertElement("Residence_South_Wall_Ground");
            AssertElement("Rear_Yard_Wall_Back");
            AssertElement("Rear_Service_Door_Leaf");
            AssertElement("Brick_Coping_Main_Front");
            AssertElement("Tinaco_Tank_Body");
            AssertElement("Front_Pier_North");
            AssertElement("Front_Pier_South");
            AssertElement("Porvenir_West_Driveway_Apron_TwoStory");
            AssertElement("Porvenir_West_Curb_Depressed_TwoStory");

            // Front Gate & Wrought-Iron Enclosure Assertions (Step 2)
            AssertElement("DelPorvenir_Front_Gate");
            AssertElement("Gate_Top_Header_Beam");
            AssertElement("Gate_Post_South");
            AssertElement("Gate_Post_Center");
            AssertElement("Gate_Post_North");
            AssertElement("Gate_Upper_Frame_Carport1");
            AssertElement("Front_Pedestrian_Gate_Pivot");
            AssertElement("Carport_Gate_South");
            AssertElement("Carport_Gate_North");
            AssertElement("Front_Yard_Wall_South");

            // 2. Setup Camera
            GameObject camObj = new GameObject("AuditCamera");
            Camera cam = camObj.AddComponent<Camera>();
            cam.fieldOfView = 58f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 200f;
            cam.clearFlags = CameraClearFlags.Skybox;

            // Shot 1: Frontal Full Facade View (Looking West from Calle Del Porvenir roadway at the new house)
            // Position: in the roadway at X = 13.5m, Z = 26.5m, Y = 3.5m, looking towards the house
            cam.transform.position = new Vector3(14.50f, 3.20f, 26.50f);
            cam.transform.LookAt(new Vector3(3.80f, 3.40f, 26.50f));
            CaptureScreenshot(cam, "twostory_residence_frontal.png");

            // Shot 2: Angled Oblique View matching Reference Photo 2
            // Position: North-East looking South-West across the lateral wall and stepped volumes
            cam.transform.position = new Vector3(12.50f, 4.00f, 38.00f);
            cam.transform.LookAt(new Vector3(2.50f, 3.20f, 24.50f));
            CaptureScreenshot(cam, "twostory_residence_oblique_north.png");

            // Shot 3: Street Approach Walking North from Pastelería La Tía Lupe & 1-Story House
            // Shows the continuum: Tía Lupe -> 1-story house with cooler on roof -> new 2-story house
            cam.transform.position = new Vector3(8.20f, 1.70f, 10.00f);
            cam.transform.LookAt(new Vector3(6.50f, 3.00f, 26.50f));
            CaptureScreenshot(cam, "twostory_residence_approach_from_tialupe.png");

            // Shot 4: Full-Width Driveway Ramp / Bajada across the Sidewalk
            // Low angle showing the smooth continuous downward slope from property to road
            cam.transform.position = new Vector3(11.50f, 1.20f, 26.50f);
            cam.transform.LookAt(new Vector3(7.50f, 0.15f, 26.50f));
            CaptureScreenshot(cam, "twostory_driveway_ramp_bajada_detail.png");

            // Shot 5: Carport Interior & Recessed Entrance Porch
            // Eye-level view under the carport showing open parking bays, trabe with "119", and arched door
            cam.transform.position = new Vector3(9.00f, 1.70f, 26.50f);
            cam.transform.LookAt(new Vector3(3.80f, 1.80f, 26.00f));
            CaptureScreenshot(cam, "twostory_residence_carport_interior.png");

            // Shot 6: Rooftop Parapets, Exposed Brick Coping, and Rotoplas Tinaco
            cam.transform.position = new Vector3(8.00f, 7.20f, 26.50f);
            cam.transform.LookAt(new Vector3(3.10f, 6.20f, 25.50f));
            CaptureScreenshot(cam, "twostory_residence_rooftop_tinaco.png");

            // Shot 7: Gap-Fix Verification Detail (Left Facade Junction Y = 2.60m - 2.80m)
            // Focused specifically on the user's reported area between 1st floor recessed entrance and 2nd floor
            cam.transform.position = new Vector3(8.50f, 2.70f, 22.50f);
            cam.transform.LookAt(new Vector3(3.80f, 2.70f, 23.20f));
            CaptureScreenshot(cam, "twostory_residence_gap_fix_detail.png");

            // Shot 8: Rear Facade Enclosure (Full 2-story solid rear wall, service door, upper windows)
            cam.transform.position = new Vector3(-12.50f, 3.80f, 26.50f);
            cam.transform.LookAt(new Vector3(-4.50f, 3.00f, 26.50f));
            CaptureScreenshot(cam, "twostory_residence_rear_enclosure.png");

            // Shot 9: Rear Yard Perimeter & Oblique Enclosure View
            cam.transform.position = new Vector3(-13.00f, 5.00f, 36.00f);
            cam.transform.LookAt(new Vector3(-5.50f, 2.80f, 27.00f));
            CaptureScreenshot(cam, "twostory_residence_rear_yard_oblique.png");

            // Shot 10: Front Gate Photo Match View (Matching User Reference Photo from Across the Road)
            cam.transform.position = new Vector3(14.00f, 2.00f, 26.50f);
            cam.transform.LookAt(new Vector3(6.60f, 2.20f, 26.50f));
            CaptureScreenshot(cam, "twostory_front_gate_photo_match.png");

            // Shot 11: Pedestrian Gate & Ornamental Diamond Belt Close-up
            cam.transform.position = new Vector3(9.20f, 1.40f, 23.40f);
            cam.transform.LookAt(new Vector3(6.60f, 1.20f, 23.40f));
            CaptureScreenshot(cam, "twostory_pedestrian_gate_detail.png");

            // Shot 12: Carport Rolling Gates & Overhead Framework Detail
            cam.transform.position = new Vector3(10.50f, 1.80f, 28.50f);
            cam.transform.LookAt(new Vector3(6.60f, 1.80f, 28.50f));
            CaptureScreenshot(cam, "twostory_carport_gates_closeup.png");

            UnityEngine.Object.DestroyImmediate(camObj);
            Debug.Log("[TwoStoryResidenceAudit] ALL 12 AUDIT SCREENSHOTS CAPTURED SUCCESSFULLY!");
            Debug.Log("[TwoStoryResidenceAudit] ========================================================");
        }

        private static void AssertElement(string name)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                Debug.LogError($"[TwoStoryResidenceAudit] ASSERTION FAILED: GameObject '{name}' NOT found in scene!");
                throw new Exception($"GameObject '{name}' missing!");
            }
            Debug.Log($"[TwoStoryResidenceAudit] PASS: Found '{name}' at pos {go.transform.position}");
        }

        private static void CaptureScreenshot(Camera cam, string filename)
        {
            int width = 1920;
            int height = 1080;
            RenderTexture rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            rt.antiAliasing = 8;
            cam.targetTexture = rt;
            Texture2D screenShot = new Texture2D(width, height, TextureFormat.RGB24, false);

            cam.Render();
            RenderTexture.active = rt;
            screenShot.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            screenShot.Apply();

            cam.targetTexture = null;
            RenderTexture.active = null;
            UnityEngine.Object.DestroyImmediate(rt);

            byte[] bytes = screenShot.EncodeToPNG();
            UnityEngine.Object.DestroyImmediate(screenShot);

            string fullPath = Path.Combine(AuditOutputDir, filename);
            File.WriteAllBytes(fullPath, bytes);
            Debug.Log($"[TwoStoryResidenceAudit] Captured screenshot: {fullPath} ({bytes.Length} bytes)");
        }
    }
}
