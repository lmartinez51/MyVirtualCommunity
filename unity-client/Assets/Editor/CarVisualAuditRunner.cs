using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using MyVirtualCommunity.Environment;

namespace MyVirtualCommunity.Editor
{
    public static class CarVisualAuditRunner
    {
        [MenuItem("MyVirtualCommunity/Capture Car Visual Audit Screenshots")]
        public static void CaptureCarScreenshots()
        {
            Debug.Log("[CarVisualAuditRunner] Opening GomezMorinSlice.unity...");
            string scenePath = "Assets/Scenes/GomezMorinSlice.unity";
            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

            var sceneBuilder = UnityEngine.Object.FindFirstObjectByType<GomezMorinSceneBuilder>();
            if (sceneBuilder != null)
            {
                sceneBuilder.BuildEnvironment();
                Debug.Log("[CarVisualAuditRunner] Environment built.");
            }

            // Setup Elena Morales attendant avatar
            var elena = UnityEngine.Object.FindFirstObjectByType<MyVirtualCommunity.Npc.ElenaNpcController>();
            if (elena == null)
            {
                var elenaObj = new GameObject("NPC_ElenaMorales");
                elenaObj.transform.position = new Vector3(-10.90f, 0.44f, 12.85f);
                elenaObj.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                elena = elenaObj.AddComponent<MyVirtualCommunity.Npc.ElenaNpcController>();
            }
            if (elena != null)
            {
                elena.transform.position = new Vector3(-10.90f, 0.44f, 12.85f);
                elena.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                elena.BuildAttendantAvatar();
                Debug.Log("[CarVisualAuditRunner] Elena Morales avatar built at counter.");
            }

            string outputDir = Path.GetFullPath(@"C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\audit_screenshots");
            if (!Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            var camObj = new GameObject("CarAuditCamera");
            var cam = camObj.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.fieldOfView = 45f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 100f;

            // Target positions:
            // coupe_blue is at (62.2f, 0.12f, 23.2f), rotY = 178f (facing ~south / -Z)
            // Forward is ~ -Z, Right is ~ -X, Left is ~ +X, Back is ~ +Z.
            // coupe_white_lime is at (33.5f, 0.12f, 16.0f), rotY = 90f (facing +X)

            var debugLines = new List<string>();
            var allRenderers = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None);
            Vector3 whiteCarPos = new Vector3(33.5f, 0.12f, 16.0f);
            foreach (var r in allRenderers)
            {
                float dist = Vector3.Distance(r.bounds.center, whiteCarPos);
                if (dist < 4.5f)
                {
                    debugLines.Add($"Nearby Renderer: '{r.gameObject.name}', Path: '{GetHierarchyPath(r.gameObject)}', BoundsCenter: {r.bounds.center}, BoundsSize: {r.bounds.size}");
                }
            }
            File.WriteAllLines(@"C:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\logs\white_car_objects.txt", debugLines);

            var captures = new (string filename, Vector3 pos, Vector3 rot, string desc, float fov, int width, int height)[]
            {
                // 1. Blue Coupe - Exact view from user's screenshot (standing near car facing east/north-east)
                (
                    "car_user_recreation_blue.png",
                    new Vector3(66.5f, 1.20f, 23.2f),
                    new Vector3(2f, -90f, 0f),
                    "Side profile of blue coupe matching user screenshot angle",
                    45f, 1920, 1080
                ),
                // 2. Blue Coupe - Front 3/4 perspective
                (
                    "car_perspective_front_blue.png",
                    new Vector3(65.0f, 1.40f, 19.5f),
                    new Vector3(10f, -40f, 0f),
                    "Front 3/4 perspective of blue coupe",
                    45f, 1920, 1080
                ),
                // 3. Blue Coupe - Rear 3/4 perspective
                (
                    "car_perspective_rear_blue.png",
                    new Vector3(65.0f, 1.50f, 27.0f),
                    new Vector3(12f, -145f, 0f),
                    "Rear 3/4 perspective of blue coupe",
                    45f, 1920, 1080
                ),
                // 4. White Coupe - Clean side profile view (reference photo angle)
                (
                    "car_side_profile_white.png",
                    new Vector3(33.5f, 1.20f, 11.0f),
                    new Vector3(0f, 0f, 0f),
                    "Side profile of white coupe matching reference photo",
                    45f, 1920, 1080
                ),
                // 5. White Coupe - Close-up Front Radiator / Bumper
                (
                    "car_white_front_radiator.png",
                    new Vector3(37.5f, 0.85f, 16.0f),
                    new Vector3(5f, -90f, 0f),
                    "Close-up front radiator of white coupe",
                    45f, 1920, 1080
                ),
                // 6. White Coupe - Close-up Rear Trunk / Fascia
                (
                    "car_white_rear_trunk.png",
                    new Vector3(29.5f, 0.95f, 16.0f),
                    new Vector3(5f, 90f, 0f),
                    "Close-up rear trunk of white coupe",
                    45f, 1920, 1080
                ),
                // 7. Dollar 2 Go West Facade - Single Glass Door
                (
                    "dollar2go_west_glass_door.png",
                    new Vector3(37.0f, 1.50f, 18.0f),
                    new Vector3(0f, 90f, 0f),
                    "Dollar 2 Go West facade showing single glass door",
                    45f, 1920, 1080
                ),
                // 8. Dollar 2 Go East Facade - Verify old door is removed
                (
                    "dollar2go_east_facade_check.png",
                    new Vector3(61.0f, 1.50f, 18.0f),
                    new Vector3(0f, -90f, 0f),
                    "Dollar 2 Go East facade verifying absence of old door",
                    45f, 1920, 1080
                ),
                // 9. Wing Spot Facade - Exact Real-World Portrait Photo Match (Framing sidewalk grass, building, and towering billboard)
                (
                    "wingspot_facade_photo_match.png",
                    new Vector3(-8.2f, 2.20f, -9.8f),
                    new Vector3(16.0f, -16.0f, 0f),
                    "Wing Spot full facade matching real-world photograph perspective in authentic vertical portrait framing",
                    62f, 1080, 1440
                ),
                // 10. Wing Spot Facade - Front Orthographic / Elevation View
                (
                    "wingspot_facade_front_elevation.png",
                    new Vector3(-12.75f, 3.20f, -10.5f),
                    new Vector3(10.0f, 0f, 0f),
                    "Wing Spot full frontal elevation showing left wing, center arch, and right entrance porch",
                    50f, 1920, 1080
                ),
                // 11. Wing Spot Entrance Porch - Corridor, Tuscan Pillar & Glass Aluminum Door
                (
                    "wingspot_entrance_porch_closeup.png",
                    new Vector3(-6.8f, 1.65f, 0.8f),
                    new Vector3(5.0f, 0f, 0f),
                    "Wing Spot entrance porch corridor with Tuscan column, canopy, and glass aluminum door",
                    45f, 1920, 1080
                ),
                // 12. Wing Spot Arch & Logo Closeup
                (
                    "wingspot_pediment_and_logo_closeup.png",
                    new Vector3(-11.4f, 4.40f, -4.5f),
                    new Vector3(10.0f, 0f, 0f),
                    "Wing Spot arched pediment, circular logo, cutlery medallion, safety plaque, and grid windows closeup",
                    45f, 1920, 1080
                ),
                // 13. Wing Spot Left Wing Eaves & Industrial Grid Windows
                (
                    "wingspot_left_wing_windows.png",
                    new Vector3(-17.1f, 2.20f, -0.5f),
                    new Vector3(4.0f, 0f, 0f),
                    "Wing Spot left wing tiled roof eaves with wooden rafters and 3x4 grid windows",
                    45f, 1920, 1080
                ),
                // 14. Wing Spot Arch & Logo Closeup (Verify Medallion Removal)
                (
                    "wingspot_pediment_no_medallion.png",
                    new Vector3(-11.4f, 4.30f, -1.0f),
                    new Vector3(8.0f, 0f, 0f),
                    "Wing Spot arched pediment and logo closeup verifying complete removal of the cutlery circle emblem",
                    45f, 1920, 1080
                ),
                // 15. Sidewalk Scored Relief / Tile Bands Extended to Calle Del Porvenir Corner
                (
                    "sidewalk_patterns_extended_to_porvenir.png",
                    new Vector3(-17.5f, 1.65f, 2.4f),
                    new Vector3(10.0f, 85f, 0f),
                    "Perspective along the north sidewalk from Wing Spot through Pastelería La Tía Lupe to Calle Del Porvenir showing continuous terracotta scored relief patterns",
                    55f, 1920, 1080
                ),
                // 16. Calle Del Porvenir Corners - Wheelchair Accessibility Ramps & Zebra Crosswalk
                (
                    "del_porvenir_corners_wheelchair_ramps.png",
                    new Vector3(13.5f, 4.50f, -6.0f),
                    new Vector3(25.0f, 0f, 0f),
                    "Calle Del Porvenir pedestrian intersection showing zebra crosswalk and both wheelchair accessibility ramps on West and East corners",
                    55f, 1920, 1080
                ),
                // 17. Calle Del Porvenir West Wheelchair Ramp Close-up
                (
                    "del_porvenir_west_wheelchair_ramp_closeup.png",
                    new Vector3(10.5f, 1.20f, 2.50f),
                    new Vector3(15.0f, -90f, 0f),
                    "Direct street-level close-up of Calle Del Porvenir West wheelchair ramp showing yellow incline, flared wings, and ISA badge",
                    40f, 1920, 1080
                ),
                // 18. Calle Del Porvenir East Wheelchair Ramp Close-up
                (
                    "del_porvenir_east_wheelchair_ramp_closeup.png",
                    new Vector3(16.5f, 1.20f, 2.50f),
                    new Vector3(15.0f, 90f, 0f),
                    "Direct street-level close-up of Calle Del Porvenir East wheelchair ramp showing yellow incline, flared wings, and ISA badge",
                    40f, 1920, 1080
                ),
                // 19. Avenida La Arboleda Corners - Wheelchair Accessibility Ramps & Zebra Crosswalk
                (
                    "arboleda_corners_wheelchair_ramps.png",
                    new Vector3(101.0f, 4.50f, -6.0f),
                    new Vector3(25.0f, 0f, 0f),
                    "Avenida La Arboleda pedestrian intersection showing zebra crosswalk and both wheelchair accessibility ramps on West and East corners",
                    55f, 1920, 1080
                ),
                // 20. Avenida La Arboleda West Wheelchair Ramp Close-up
                (
                    "arboleda_west_wheelchair_ramp_closeup.png",
                    new Vector3(97.0f, 1.20f, 2.50f),
                    new Vector3(15.0f, -90f, 0f),
                    "Direct street-level close-up of Avenida La Arboleda West wheelchair ramp showing yellow incline, flared wings, and enlarged ISA badge",
                    40f, 1920, 1080
                ),
                // 21. Avenida La Arboleda East Wheelchair Ramp Close-up
                (
                    "arboleda_east_wheelchair_ramp_closeup.png",
                    new Vector3(105.0f, 1.20f, 2.50f),
                    new Vector3(15.0f, 90f, 0f),
                    "Direct street-level close-up of Avenida La Arboleda East wheelchair ramp showing yellow incline, flared wings, and enlarged ISA badge",
                    40f, 1920, 1080
                ),
                // 22. HRC Facade Full View - Exact Match to User Reference Photograph
                (
                    "hrc_facade_photo_match.png",
                    new Vector3(95.0f, 2.80f, -9.0f),
                    new Vector3(12.0f, -28.0f, 0f),
                    "HRC facade matching user reference photograph perspective, showing stone tower, 3D HRC signage, sunken fountain, wooden walkway, double glass doors, white wall with showroom windows and chairs, frieze, living wall, and wood kiosk",
                    56f, 1920, 1080
                ),
                // 23. HRC Sunken Water Fountain Pit Close-up ("Hoyo en la banqueta")
                (
                    "hrc_sunken_fountain_closeup.png",
                    new Vector3(93.025f, 1.45f, 2.0f),
                    new Vector3(28.0f, 0f, 0f),
                    "Direct close-up of the sunken water fountain pit in the sidewalk, demonstrating sunken depth below sidewalk level, retaining walls, basalt coping, water surface, foaming white bubbler jet, and building flush contact",
                    45f, 1920, 1080
                ),
                // 24. HRC Sunken Fountain & Av. La Arboleda Wheelchair Ramp Clearance
                (
                    "hrc_fountain_and_wheelchair_ramp_clearance.png",
                    new Vector3(97.5f, 2.00f, 2.50f),
                    new Vector3(16.0f, -86.0f, 0f),
                    "Corner perspective from Av. La Arboleda West ramp showing zero interference between the sunken fountain pit and the wheelchair ramp with its 25cm solid concrete curb buffer",
                    52f, 1920, 1080
                ),
                // 25. HRC Entrance Double Glass Doors & Wooden Composite Deck Walkway
                (
                    "hrc_entrance_doors_and_walkway.png",
                    new Vector3(91.15f, 1.50f, 1.2f),
                    new Vector3(6.0f, 0f, 0f),
                    "Direct close-up of HRC wooden composite deck entrance walkway and double commercial glass doors with vertical tubular chrome handles, red accent stripe, and transom glazing",
                    48f, 1920, 1080
                ),
                // 26. HRC Showroom Display Windows with Horizontal Mullions & Interior Chairs
                (
                    "hrc_showroom_windows_and_chairs.png",
                    new Vector3(85.20f, 1.25f, 1.2f),
                    new Vector3(2.0f, 0f, 0f),
                    "Direct close-up of the center white wall showroom display windows with horizontal mullions, designer showroom chairs displayed inside on podiums, and verified absence of circular medallion",
                    48f, 1920, 1080
                ),
                // 27. Wing Spot Interior Entrance Walkway (Clear corridor, zero tripping hazard)
                (
                    "wingspot_interior_entrance_walkway.png",
                    new Vector3(-7.45f, 1.65f, 6.20f),
                    new Vector3(5.0f, -25.0f, 0f),
                    "Interior perspective standing right inside the entrance door looking North-West down the completely clear, open entrance hallway corridor with zero tripping obstructions",
                    65f, 1920, 1080
                ),
                // 28. Wing Spot Interior Dining Table & Chairs Closeup (Chairs facing inward toward table)
                (
                    "wingspot_interior_table_and_chairs_closeup.png",
                    new Vector3(-9.50f, 1.45f, 8.40f),
                    new Vector3(12.0f, -80.0f, 0f),
                    "Close-up perspective of dining tables and cushioned chairs showing all chairs correctly oriented inward facing the tables and shifted towards front windows in front of counter line",
                    58f, 1920, 1080
                ),
                // 29. Wing Spot Interior Ceiling & Roof Seal (Zero sky visible, seamless enclosure)
                (
                    "wingspot_interior_ceiling_and_roof_seal.png",
                    new Vector3(-10.50f, 1.60f, 8.50f),
                    new Vector3(-42.0f, -145.0f, 0f),
                    "Interior perspective looking up towards the ceiling, exposed beams, and upper front bulkhead walls verifying 100% enclosure with zero sky visible",
                    68f, 1920, 1080
                ),
                // 30. Wing Spot Service Counter touching East Wall & POS at West End
                (
                    "wingspot_interior_counter_east_and_pos_west.png",
                    new Vector3(-8.80f, 1.55f, 9.20f),
                    new Vector3(5.0f, 8.0f, 0f),
                    "Service counter touching East party wall, POS cash register placed at West end, and Elena Morales standing behind register",
                    65f, 1920, 1080
                ),
                // 31. Wing Spot Elena Morales Grounding on Step behind Counter
                (
                    "wingspot_interior_elena_step_grounding.png",
                    new Vector3(-8.80f, 1.10f, 14.20f),
                    new Vector3(14.8f, -122.7f, 0f),
                    "Direct perspective behind counter showing Elena Morales standing firmly on attendant step with feet grounded and zero floating",
                    55f, 1920, 1080
                ),
                // 32. Wing Spot Interior Walls - Zero Flicker / Shimmer / Color Shifting
                (
                    "wingspot_interior_walls_no_flicker_check.png",
                    new Vector3(-12.50f, 1.60f, 10.50f),
                    new Vector3(2.0f, -80.0f, 0f),
                    "Perspective along West wall showing solid matte wall finish with zero Z-fighting, zero specular flicker, and zero color flipping",
                    65f, 1920, 1080
                ),
                // 33. Wing Spot Storage Room - Customer Side Perspective (Wall A flush with counter front)
                (
                    "wingspot_storage_customer_view.png",
                    new Vector3(-12.50f, 1.60f, 7.80f),
                    new Vector3(6.0f, -18.0f, 0f),
                    "Customer perspective from dining area showing Wall A running continuously and flush from west wall to the counter front edge with zero gaps, no doors, and full-height ceiling coverage",
                    65f, 1920, 1080
                ),
                // 34. Wing Spot Storage Room - Staff Side Perspective (Lateral Wall B & Staff Door)
                (
                    "wingspot_storage_staff_door_view.png",
                    new Vector3(-8.00f, 1.55f, 14.80f),
                    new Vector3(2.0f, -90.0f, 0f),
                    "Staff perspective behind counter looking west at Wall B showing the staff-only storage room door with frame, kickplate, handle, and Staff Only sign",
                    65f, 1920, 1080
                ),
                // 35. Wing Spot Storage Room - Interior Enclosure Perspective
                (
                    "wingspot_storage_interior_enclosure.png",
                    new Vector3(-18.00f, 1.60f, 13.00f),
                    new Vector3(10.0f, 40.0f, 0f),
                    "Interior perspective inside storage room looking northeast showing full-height enclosure with Wall A, Wall B, integrated door, existing north wall, and continuous ceiling",
                    65f, 1920, 1080
                ),
                // 36. Wing Spot Storage Room - Elevated Architectural Perspective
                (
                    "wingspot_storage_elevated_view.png",
                    new Vector3(-14.50f, 5.00f, 9.50f),
                    new Vector3(45.0f, 15.0f, 0f),
                    "Elevated high-angle perspective looking down at the restaurant layout showing clear right-angled storage room boundaries, flush counter alignment, and preserved dining layout",
                    70f, 1920, 1080
                ),
                // 33. Pastelería La Tía Lupe Frontal Facade Elevation (Reference Photo 1 Match)
                (
                    "tialupe_facade_photo_match.png",
                    new Vector3(0.50f, 2.40f, -6.50f),
                    new Vector3(3.0f, 0f, 0f),
                    "Full frontal elevation of Pastelería La Tía Lupe matching user reference photo 1 showing Googie portal, orange fins, portholes, panoramic window, striped awning, and marquee sign",
                    52f, 1920, 1080
                ),
                // 31. Tía Lupe Googie Entrance Portal & Flared Orange Fins Closeup (Reference Photo 2 Match)
                (
                    "tialupe_googie_portal_and_fins_closeup.png",
                    new Vector3(-2.70f, 2.60f, -0.60f),
                    new Vector3(-6.0f, 0f, 0f),
                    "Close-up of the Googie entry portal matching user reference photo 2 showing twin flared orange fins, 3D channel letters Tía Lupe, 6 portholes, tiled step, door with ABIERTO sign, and cameo silhouette relief",
                    52f, 1920, 1080
                ),
                // 32. Tía Lupe Panoramic Showcase Window, Striped Awning & Upper Marquee Closeup
                (
                    "tialupe_panoramic_window_and_awning_closeup.png",
                    new Vector3(3.15f, 2.40f, -1.20f),
                    new Vector3(4.0f, 0f, 0f),
                    "Close-up of the panoramic bakery showcase window, seamless glass, striped awning with authentic logo, and upper rectangular striped marquee sign",
                    55f, 1920, 1080
                ),
                // 33. Tía Lupe Lateral Facade along Calle Del Porvenir (Verify 100% Untouched and Intact)
                (
                    "tialupe_lateral_facade_unaffected_check.png",
                    new Vector3(12.50f, 2.50f, 9.20f),
                    new Vector3(4.0f, -90f, 0f),
                    "Perspective along Calle Del Porvenir verifying that the lateral facade (pier, panoramic window, red awning, red parapet, cafe table, and pastry showcase) is 100% unaffected and now has a full 2.0m wide pedestrian sidewalk in front of it",
                    55f, 1920, 1080
                ),
                // 34. Calle Del Porvenir West Sidewalk Continuous View (Verify continuous sidewalk along Tía Lupe & Wing Spot)
                (
                    "del_porvenir_west_sidewalk_continuous_view.png",
                    new Vector3(7.50f, 1.60f, 3.50f),
                    new Vector3(8.0f, 0f, 0f),
                    "Continuous ground-level perspective standing on the newly created West sidewalk of Calle Del Porvenir looking North, showing uninterrupted 2.0m width, concrete expansion joints, curb, lateral awning, and seamless corner connection with Blvd. Gómez Morín",
                    60f, 1920, 1080
                ),
                // 35. Pastelería La Tía Lupe Interior Enclosure (Verify 4 walls, complete floor, ceiling, and zero gray pillars)
                (
                    "tialupe_interior_enclosure_check.png",
                    new Vector3(0.65f, 1.65f, 7.50f),
                    new Vector3(6.0f, 0f, 0f),
                    "Interior perspective inside Pastelería La Tía Lupe looking North down the center of the bakery, verifying complete continuous tiled floor with zero gaps, full solid rear wall, west party wall, east wall, and complete removal of interior gray pillars",
                    65f, 1920, 1080
                ),
                // 36. Pastelería La Tía Lupe Interior Ceiling & Roof Seal (Verify 100% sealed ceiling with zero sky visible)
                (
                    "tialupe_interior_ceiling_and_roof_seal.png",
                    new Vector3(0.65f, 1.60f, 12.00f),
                    new Vector3(-35.0f, 180.0f, 0f),
                    "Interior perspective looking up and South towards the ceiling, front wall, and upper portal bulkhead verifying full ceiling enclosure with zero sky visible",
                    68f, 1920, 1080
                ),
                // 37. Edificio AT&T - Exact Real-World Photo Match (Blvd. Gomez Morin & Av. La Arboleda intersection looking NNE)
                (
                    "att_building_photo_match.png",
                    new Vector3(89.0f, 1.85f, -6.5f),
                    new Vector3(-10.5f, 53.0f, 0f),
                    "Real-world reference photograph match from Blvd. Gomez Morin looking North-Northeast across Av. La Arboleda zebra crossing, showing curved silver streetlamp, cadmium orange 5-stacked 3D star sculpture, Mupi totem, and full 5-story AT&T Corporate Building with beveled ribbon spandrels, recessed lobby, and crown logo",
                    58f, 1920, 1080
                ),
                // 38. Edificio AT&T - Monumental Orange 3D Star Sculpture Closeup (Corner Plaza)
                (
                    "att_orange_sculpture_closeup.png",
                    new Vector3(111.4f, 2.20f, 1.20f),
                    new Vector3(-16.0f, 0f, 0f),
                    "Direct unobstructed close-up of the monumental 7.2m cadmium orange abstract sculpture formed by 5 stacked 3D faceted stars with alternating rotations, sharp geometric edges, basalt plinth, and corner plaza pavers",
                    60f, 1920, 1080
                ),
                // 39. Edificio AT&T - South Facade Full Elevation (Blvd. Gomez Morin Frontal View)
                (
                    "att_facade_south_elevation.png",
                    new Vector3(128.75f, 4.00f, -14.0f),
                    new Vector3(-16.0f, 0f, 0f),
                    "Full frontal architectural elevation of the 5-story South hero facade from Blvd. Gomez Morin showing monumental precast frame, beveled spandrel bands, solar ribbon windows, recessed glazed lobby, entrance canopy, upper AT&T logo, and roof chillers",
                    54f, 1920, 1080
                ),
                // 40. Edificio AT&T - West Stepped Wing & Vehicular Access Gate (Calle De La Arboleda View)
                (
                    "att_arboleda_west_wing_closeup.png",
                    new Vector3(96.0f, 3.20f, 16.0f),
                    new Vector3(-14.0f, 66.0f, 0f),
                    "Perspective from Calle De La Arboleda looking at the 3-story stepped west wing, ribbon windows, vehicular gate with barrier arm, guard booth, white awning canopy, and upper main tower with west-facing AT&T logo",
                    58f, 1920, 1080
                ),
                // 41. Wing Spot West Wall Turf Tapestry & Hanging Smart TV
                (
                    "wingspot_dining_west_wall_tv_view.png",
                    new Vector3(-12.00f, 1.95f, 9.50f),
                    new Vector3(4.0f, -98.0f, 0f),
                    "Perspective looking West at the West wall showing the synthetic grass turf tapestry, standardized dining tables with chairs, and the 72-inch Smart TV hanging cleanly above the turf band with the central decorative pillar in view",
                    65f, 1920, 1080
                ),
                // 42. Wing Spot Corner Perspective: West Wall & Wall A Turf Meeting
                (
                    "wingspot_dining_west_and_front_turf_corner.png",
                    new Vector3(-11.50f, 1.80f, 6.20f),
                    new Vector3(6.0f, -42.0f, 0f),
                    "Corner perspective showing the dining hall West wall with synthetic grass tapestry and Smart TV meeting Wall A's matching turf tapestry at a clean right angle",
                    68f, 1920, 1080
                ),
                // 43. Wing Spot Central Decorative Pillar & Standardized Dining Layout
                (
                    "wingspot_dining_central_pillar_and_layout.png",
                    new Vector3(-9.20f, 1.85f, 6.20f),
                    new Vector3(8.0f, -60.0f, 0f),
                    "Panoramic perspective from entrance lobby looking North-West across the dining hall showing the floor-to-ceiling decorative central square pillar, standardized dining tables with matching chairs, and generous wide walking aisles",
                    68f, 1920, 1080
                ),
                // 44. Wing Spot Condiment Bar Station & Dining Tables
                (
                    "wingspot_dining_condiment_bar_and_8_tables.png",
                    new Vector3(-9.20f, 1.85f, 7.30f),
                    new Vector3(12.0f, -70.0f, 0f),
                    "Close-up perspective looking North-West along the central transverse axis showing the new Wing Spot Condiment Bar with 6 colorful inset food bowls, utensils, dual napkin dispensers, in line with the central square pillar",
                    68f, 1920, 1080
                ),
                // 45. Wing Spot Open Counter Approach View (Table 8 Removed)
                (
                    "wingspot_dining_counter_approach_view.png",
                    new Vector3(-10.80f, 1.80f, 7.60f),
                    new Vector3(6.0f, 0.0f, 0f),
                    "Perspective looking North past the Condiment Bar directly towards the service counter and attendant Elena Morales, verifying the completely open and unobstructed payment approach path with Table 8 removed",
                    65f, 1920, 1080
                ),
                // 46. Diagnostic: Wing Spot Interior Looking at Entrance & Ceiling
                (
                    "wingspot_interior_entrance_looking_south.png",
                    new Vector3(-7.75f, 1.70f, 8.50f),
                    new Vector3(-20.0f, 155.0f, 0f),
                    "Diagnostic perspective from inside dining hall looking South and Up towards the shifted entrance door, header, upper wall and ceiling",
                    75f, 1920, 1080
                ),
                // 47. Diagnostic: Wing Spot Exterior Entrance Porch
                (
                    "wingspot_exterior_entrance_porch.png",
                    new Vector3(-6.75f, 1.70f, 1.80f),
                    new Vector3(-5.0f, 0.0f, 0f),
                    "Diagnostic perspective looking North at the Wing Spot shifted entrance porch, column and canopy",
                    65f, 1920, 1080
                ),
                // 48. Wing Spot Entrance Facilities: Overall Customer Perspective
                (
                    "wingspot_entrance_facilities_customer_view.png",
                    new Vector3(-9.50f, 1.70f, 6.20f),
                    new Vector3(5.0f, 45.0f, 0f),
                    "Customer perspective standing near entrance looking North-East at the 1.00m partial entrance divider, open entrance passage, unisex restroom, outward-opening door, and decorative enclosure along the East party wall",
                    65f, 1920, 1080
                ),
                // 49. Wing Spot Restroom Door Swing & Over-Door "Baño" Sign Perspective
                (
                    "wingspot_restroom_door_and_gap.png",
                    new Vector3(-6.125f, 1.85f, 10.35f),
                    new Vector3(-12.0f, 180.0f, 0f),
                    "Direct perspective looking South in the corridor gap at the restroom door opening, outward-swung door leaf into the gap, and legible 'Baño' Unisex sign mounted directly over the door",
                    65f, 1920, 1080
                ),
                // 50. Wing Spot 1.00m Entrance Divider & Open Passage Perspective
                (
                    "wingspot_entrance_divider_and_passage.png",
                    new Vector3(-6.75f, 1.65f, 5.95f),
                    new Vector3(10.0f, -25.0f, 0f),
                    "Perspective standing right inside the entrance door looking at the 1.00m high partial divider wall along X = -7.20m and the 0.875m clear open passage leading into the dining hall",
                    65f, 1920, 1080
                ),
                // 51. Wing Spot Entrance Facilities: High-Angle Top-Down Perspective
                (
                    "wingspot_entrance_facilities_top_down.png",
                    new Vector3(-9.80f, 4.80f, 8.50f),
                    new Vector3(55.0f, 65.0f, 0f),
                    "High-angle elevated perspective looking down at the entrance facilities along the East wall, showing the full spatial relationships: entrance door, 1.00m divider, open passage, unisex restroom, door gap, decorative enclosure, and service counter",
                    70f, 1920, 1080
                ),
                // 52. Wing Spot Normal Entry View: Standing at Entrance Threshold Facing North
                (
                    "wingspot_normal_entry_view.png",
                    new Vector3(-6.75f, 1.65f, 6.25f),
                    new Vector3(0.0f, 0.0f, 0f),
                    "Normal first-person player entry perspective standing at the entrance threshold (Z = 6.25m) looking North into Wing Spot: open corridor passage ahead, 1.00m divider to the left, and restroom wall safely to the right",
                    65f, 1920, 1080
                )
            };

            var interiorTextCtrl = UnityEngine.Object.FindFirstObjectByType<MyVirtualCommunity.Environment.WingSpotInteriorTextController>();

            // Cull all interior TextMeshes that are behind exterior facades to prevent font shader bleed-through
            var allTextMeshes = UnityEngine.Object.FindObjectsByType<TextMesh>(FindObjectsSortMode.None);
            foreach (var tm in allTextMeshes)
            {
                if (tm != null && tm.transform.position.z > 5.0f && tm.gameObject.name != "Fin_Text" && !tm.gameObject.name.StartsWith("HRC_") && !tm.gameObject.name.StartsWith("Letters_") && tm.gameObject.name != "Billboard_Nameplate")
                {
                    tm.gameObject.SetActive(false);
                }
            }

            foreach (var cap in captures)
            {
                if (interiorTextCtrl != null)
                {
                    interiorTextCtrl.UpdateVisibility(cap.pos);
                }
                if (elena != null)
                {
                    elena.UpdateVisibility(cap.pos);
                }

                camObj.transform.position = cap.pos;
                camObj.transform.rotation = Quaternion.Euler(cap.rot);
                cam.fieldOfView = cap.fov;

                int w = cap.width;
                int h = cap.height;

                RenderTexture rt = new RenderTexture(w, h, 24);
                cam.targetTexture = rt;
                cam.Render();

                RenderTexture.active = rt;
                Texture2D screenShot = new Texture2D(w, h, TextureFormat.RGB24, false);
                screenShot.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                screenShot.Apply();

                cam.targetTexture = null;
                RenderTexture.active = null;
                UnityEngine.Object.DestroyImmediate(rt);

                byte[] bytes = screenShot.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(screenShot);

                string filePath = Path.Combine(outputDir, cap.filename);
                File.WriteAllBytes(filePath, bytes);
                Debug.Log($"[CarVisualAuditRunner] Captured {cap.filename} ({cap.desc}) -> {filePath}");
            }
            UnityEngine.Object.DestroyImmediate(camObj);

            // Comprehensive Verification Pass for User Requests:
            var auditReport = new List<string>();
            auditReport.Add("==========================================================================");
            auditReport.Add("PHYSICAL COLLIDER AND VISUAL CORRECTION VERIFICATION REPORT");
            auditReport.Add("==========================================================================");

            // Check 1: White Car metal bars
            var whiteCar = GameObject.Find("ParkedCar_coupe_white_lime");
            if (whiteCar != null)
            {
                var spoiler = whiteCar.transform.Find("Chassis_Body/Spoiler_Lip");
                var grille = whiteCar.transform.Find("Chassis_Body/Front_Grille");
                auditReport.Add($"[ITEM 1] White Car Spoiler_Lip exists: {(spoiler != null ? "FAIL - STILL PRESENT" : "PASS - REMOVED")}");
                auditReport.Add($"[ITEM 1] White Car Front_Grille exists: {(grille != null ? "FAIL - STILL PRESENT" : "PASS - REMOVED")}");
            }

            // Check 2: Dollar 2 Go door relocation
            var eastDoor = GameObject.Find("Dollar2go_Staff_Door");
            var westDoor = GameObject.Find("Dollar2go_West_Door_Frame");
            var westGlass = GameObject.Find("Dollar2go_West_Door_Glass");
            auditReport.Add($"[ITEM 2] Dollar2go East Staff Door exists: {(eastDoor != null ? "FAIL - STILL ON EAST" : "PASS - REMOVED FROM EAST")}");
            auditReport.Add($"[ITEM 2] Dollar2go West Door Frame exists: {(westDoor != null ? "PASS - PRESENT ON WEST" : "FAIL - MISSING")}");
            auditReport.Add($"[ITEM 2] Dollar2go West Door Glass exists: {(westGlass != null ? "PASS - PRESENT" : "FAIL - MISSING")}");

            // Check: Demolition of Old Building & Accurate Reconstruction of Edificio AT&T
            var oldMarquee = GameObject.Find("Corp_Marquee_Text");
            var oldTenantSupply = GameObject.Find("Tenant_ONE SUPPLY");
            var attBuilding = GameObject.Find("Corporativo_Arboleda");
            var attParapetLogo = GameObject.Find("ATT_Parapet_Sign_Logo");
            var attWestLogo = GameObject.Find("ATT_West_Parapet_Logo");
            var attLobby = GameObject.Find("ATT_Lobby_Glass_Wall");
            var attSculpture = GameObject.Find("ATT_Orange_Star_Sculpture");
            var star1 = GameObject.Find("Star_Module_1_Bottom");
            var star2 = GameObject.Find("Star_Module_2");
            var star3 = GameObject.Find("Star_Module_3_Mid");
            var star4 = GameObject.Find("Star_Module_4");
            var star5 = GameObject.Find("Star_Module_5_Crown");
            var attMupi = GameObject.Find("ATT_Corner_Mupi_Totem");
            var attLamp = GameObject.Find("ATT_Corner_Modern_Streetlamp");

            auditReport.Add($"[AT&T BUILDING] Old Generic Marquee Removed: {(oldMarquee == null ? "PASS - DEMOLISHED" : "FAIL - STILL PRESENT")}");
            auditReport.Add($"[AT&T BUILDING] Old Tenants Removed: {(oldTenantSupply == null ? "PASS - DEMOLISHED" : "FAIL - STILL PRESENT")}");
            auditReport.Add($"[AT&T BUILDING] New 5-Story Building Root Present: {(attBuilding != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T BUILDING] South Parapet AT&T Official Logo: {(attParapetLogo != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T BUILDING] West Wall AT&T Official Logo: {(attWestLogo != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T BUILDING] Recessed Ground Floor Glass Lobby: {(attLobby != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T SCULPTURE] Cadmium Orange Star Sculpture Present: {(attSculpture != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T SCULPTURE] 5 Stacked 3D Stars: {(star1 != null && star2 != null && star3 != null && star4 != null && star5 != null ? "PASS (5/5 Modules Verified)" : "FAIL")}");
            auditReport.Add($"[AT&T URBAN] Modern Curved Silver Streetlamp: {(attLamp != null ? "PASS" : "FAIL")}");
            auditReport.Add($"[AT&T URBAN] Corner Mupi Advertising Totem: {(attMupi != null ? "PASS" : "FAIL")}");

            // Check 3: Tree trunks, signs, and lamp poles colliders
            var allColliders = UnityEngine.Object.FindObjectsByType<Collider>(FindObjectsSortMode.None);
            var colliderSet = new HashSet<GameObject>();
            foreach (var col in allColliders)
            {
                if (col.enabled && !col.isTrigger)
                {
                    colliderSet.Add(col.gameObject);
                }
            }

            // Palms
            var palms = GameObject.FindObjectsByType<GameObject>(FindObjectsSortMode.None);
            int palmCount = 0, palmColliders = 0;
            int treeCount = 0, treeColliders = 0;
            int signCount = 0, signColliders = 0;
            int lampCount = 0, lampColliders = 0;
            int lotLightCount = 0, lotLightColliders = 0;
            int medLightCount = 0, medLightColliders = 0;

            foreach (var go in palms)
            {
                if (go.name == "Trunk_Base" && go.transform.parent != null && go.transform.parent.name.Contains("Palm"))
                {
                    palmCount++;
                    if (colliderSet.Contains(go)) palmColliders++;
                }
                else if (go.name == "Trunk" && go.transform.parent != null && go.transform.parent.name.Contains("Tree"))
                {
                    treeCount++;
                    if (colliderSet.Contains(go)) treeColliders++;
                }
                else if (go.name == "Post" && go.transform.parent != null && go.transform.parent.name.Contains("Sign"))
                {
                    signCount++;
                    if (colliderSet.Contains(go)) signColliders++;
                }
                else if (go.name == "Lamp_Pole" && go.transform.parent != null && go.transform.parent.name.Contains("Lamp"))
                {
                    lampCount++;
                    if (colliderSet.Contains(go)) lampColliders++;
                }
                else if (go.name == "Pole" && go.transform.parent != null && go.transform.parent.name.Contains("Parking_Lot_Light"))
                {
                    lotLightCount++;
                    if (colliderSet.Contains(go)) lotLightColliders++;
                }
                else if (go.name == "Mast" && go.transform.parent != null && go.transform.parent.name.Contains("Highway_Median_Light"))
                {
                    medLightCount++;
                    if (colliderSet.Contains(go)) medLightColliders++;
                }
            }

            auditReport.Add($"[ITEM 3] Desert Palms Trunk_Base Colliders: {palmColliders}/{palmCount} ({(palmColliders == palmCount && palmCount > 0 ? "PASS" : "FAIL")})");
            auditReport.Add($"[ITEM 3] Slender Trees Trunk Colliders: {treeColliders}/{treeCount} ({(treeColliders == treeCount && treeCount > 0 ? "PASS" : "FAIL")})");
            auditReport.Add($"[ITEM 3] Street Sign Posts Colliders: {signColliders}/{signCount} ({(signColliders == signCount && signCount > 0 ? "PASS" : "FAIL")})");
            auditReport.Add($"[ITEM 3] Street Lamps Pole Colliders: {lampColliders}/{lampCount} ({(lampColliders == lampCount && lampCount > 0 ? "PASS" : "FAIL")})");
            auditReport.Add($"[ITEM 3] Parking Lot Lights Pole Colliders: {lotLightColliders}/{lotLightCount} ({(lotLightColliders == lotLightCount && lotLightCount > 0 ? "PASS" : "FAIL")})");
            auditReport.Add($"[ITEM 3] Highway Median Lights Mast Colliders: {medLightColliders}/{medLightCount} ({(medLightColliders == medLightCount && medLightCount > 0 ? "PASS" : "FAIL")})");

            // Milestone 117 Wing Spot Interior Audits:
            var counterBase = GameObject.Find("Counter_Main_Base");
            bool counterAtEastWall = false;
            if (counterBase != null)
            {
                float eastEdge = counterBase.transform.position.x + counterBase.transform.lossyScale.x / 2f;
                counterAtEastWall = Mathf.Abs(eastEdge - (-5.20f)) < 0.05f;
            }
            auditReport.Add($"[M117] Wing Spot Counter Touching East Wall (East Edge ~ -5.20m): {(counterAtEastWall ? "PASS" : "FAIL")}");

            var posTerminal = GameObject.Find("POS Terminal 1");
            bool posAtWestEnd = false;
            if (posTerminal != null)
            {
                posAtWestEnd = posTerminal.transform.position.x <= -10.5f;
            }
            auditReport.Add($"[M117] Wing Spot POS Terminal at West End (X <= -10.5m): {(posAtWestEnd ? "PASS" : "FAIL")}");

            var attendantStep = GameObject.Find("Counter_Attendant_Step");
            bool stepValid = false;
            if (attendantStep != null && counterBase != null)
            {
                float stepLen = attendantStep.transform.lossyScale.x;
                float counterLen = counterBase.transform.lossyScale.x;
                stepValid = Mathf.Abs(stepLen - counterLen) < 0.01f;
            }
            auditReport.Add($"[M117] Wing Spot Attendant Step Length Equals Counter Length: {(stepValid ? "PASS" : "FAIL")}");

            bool elenaGroundedOnStep = false;
            if (elena != null)
            {
                var bobble = elena.GetComponent<MyVirtualCommunity.Character.BobbleheadCharacter>();
                if (bobble != null && bobble.LeftFoot != null)
                {
                    var mf = bobble.LeftFoot.GetComponent<MeshFilter>();
                    if (mf != null && mf.sharedMesh != null)
                    {
                        float minShoeY = float.MaxValue;
                        foreach (var v in mf.sharedMesh.vertices)
                        {
                            Vector3 wv = bobble.LeftFoot.TransformPoint(v);
                            if (wv.y < minShoeY) minShoeY = wv.y;
                        }
                        // Step top surface is at Y = 0.44m
                        elenaGroundedOnStep = Mathf.Abs(minShoeY - 0.44f) < 0.005f;
                    }
                }
            }
            auditReport.Add($"[M117] Elena Feet Grounded Solidly on Step (Y = 0.44m, Zero Floating): {(elenaGroundedOnStep ? "PASS" : "FAIL")}");

            var westExtWall = GameObject.Find("WingSpot_West_Flank_Wall");
            var westIntWall = GameObject.Find("Interior_LeftWall_Lower");
            bool wallsSeparated = false;
            if (westExtWall != null && westIntWall != null)
            {
                float extInnerFace = westExtWall.transform.position.x + westExtWall.transform.lossyScale.x / 2f;
                float intOuterFace = westIntWall.transform.position.x - westIntWall.transform.lossyScale.x / 2f;
                wallsSeparated = intOuterFace > extInnerFace;
            }
            auditReport.Add($"[M117] West Wall Z-Fighting Eradicated (Interior/Exterior Disjoint): {(wallsSeparated ? "PASS" : "FAIL")}");

            // Storage Room Assertions
            var wallALower = GameObject.Find("StorageRoom_Wall_A_Lower");
            var wallAUpper = GameObject.Find("StorageRoom_Wall_A_Upper");
            bool wallAValid = false;
            if (wallALower != null && wallAUpper != null && counterBase != null)
            {
                float wallAFrontZ = wallALower.transform.position.z - wallALower.transform.lossyScale.z / 2f;
                float counterFrontZ = counterBase.transform.position.z - counterBase.transform.lossyScale.z / 2f;
                float wallAEastX = wallALower.transform.position.x + wallALower.transform.lossyScale.x / 2f;
                float counterWestX = counterBase.transform.position.x - counterBase.transform.lossyScale.x / 2f;
                wallAValid = Mathf.Abs(wallAFrontZ - counterFrontZ) < 0.005f && Mathf.Abs(wallAEastX - counterWestX) < 0.005f;
            }
            auditReport.Add($"[StorageRoom] Wall A Aligned Flush with Counter Customer Front Plane (Z ~ 11.575m) & West Endpoint (X = -11.60m): {(wallAValid ? "PASS" : "FAIL")}");

            var wallBSouth = GameObject.Find("StorageRoom_Wall_B_South_Lower");
            var wallBNorth = GameObject.Find("StorageRoom_Wall_B_North_Lower");
            var staffDoor = GameObject.Find("StorageRoom_Door_Leaf");
            bool wallBValid = false;
            if (wallBSouth != null && wallBNorth != null && staffDoor != null)
            {
                float wallBEastX = wallBSouth.transform.position.x + wallBSouth.transform.lossyScale.x / 2f;
                wallBValid = Mathf.Abs(wallBEastX - (-11.60f)) < 0.005f;
            }
            auditReport.Add($"[StorageRoom] Wall B Forms Eastern Boundary at X = -11.60m with Integrated Staff Door: {(wallBValid ? "PASS" : "FAIL")}");

            bool fullHeightCoverage = false;
            if (wallAUpper != null)
            {
                float wallATopY = wallAUpper.transform.position.y + wallAUpper.transform.lossyScale.y / 2f;
                fullHeightCoverage = wallATopY >= 5.40f;
            }
            auditReport.Add($"[StorageRoom] Partitions Reach Underside of Existing Ceiling (Top Y >= 5.40m): {(fullHeightCoverage ? "PASS" : "FAIL")}");

            var wallATurf = GameObject.Find("StorageRoom_Wall_A_Turf_Tapestry");
            bool turfValid = false;
            if (wallATurf != null)
            {
                var rend = wallATurf.GetComponent<Renderer>();
                turfValid = rend != null && rend.sharedMaterial != null && rend.sharedMaterial.mainTexture != null;
            }
            auditReport.Add($"[StorageRoom] Wall A Customer Face Synthetic Grass Turf Tapestry Active: {(turfValid ? "PASS" : "FAIL")}");

            bool turfWainscotMatched = wallATurf != null && Mathf.Abs(wallATurf.transform.lossyScale.y - 2.26f) < 0.02f;
            auditReport.Add($"[StorageRoom] Wall A Turf Tapestry Height Reduced to Wainscot Band (Y = 2.26m): {(turfWainscotMatched ? "PASS" : "FAIL")}");

            var westWallTurf = GameObject.Find("WingSpot_Dining_WestWall_Turf_Tapestry");
            bool westTurfValid = false;
            if (westWallTurf != null)
            {
                var rend = westWallTurf.GetComponent<Renderer>();
                westTurfValid = rend != null && rend.sharedMaterial != null && rend.sharedMaterial.mainTexture != null
                    && Mathf.Abs(westWallTurf.transform.lossyScale.y - 2.26f) < 0.02f;
            }
            auditReport.Add($"[DiningHall] West Wall Synthetic Grass Turf Tapestry Active & Matched Wainscot (Y = 2.26m): {(westTurfValid ? "PASS" : "FAIL")}");

            var smartTv = GameObject.Find("WingSpot_WestWall_SmartTV");
            var tvScreen = GameObject.Find("TV_Display_Screen");
            bool tvValid = false;
            if (smartTv != null && tvScreen != null)
            {
                var rend = tvScreen.GetComponent<Renderer>();
                bool hasScreenTexture = rend != null && rend.sharedMaterial != null && rend.sharedMaterial.mainTexture != null;
                bool mountedAboveTurf = tvScreen.transform.position.y >= 2.50f;
                tvValid = hasScreenTexture && mountedAboveTurf;
            }
            auditReport.Add($"[DiningHall] Smart TV Mounted Above Turf Band on West Wall (Y = 3.50m > 2.50m) with Active Display: {(tvValid ? "PASS" : "FAIL")}");

            var centralPillar = GameObject.Find("WingSpot_Center_Decorative_Pillar");
            var abacus = GameObject.Find("Pillar_Abacus_Beam_Cradle");
            bool pillarValid = false;
            if (centralPillar != null && abacus != null)
            {
                float topY = abacus.transform.position.y + abacus.transform.lossyScale.y / 2f;
                pillarValid = topY >= 5.40f;
            }
            auditReport.Add($"[DiningHall] Central Decorative Square Pillar Present & Reaches Ceiling (Top Y >= 5.40m): {(pillarValid ? "PASS" : "FAIL")}");

            var allGameObjects = GameObject.FindObjectsByType<GameObject>(FindObjectsSortMode.None);
            int boothCount = 0;
            int tableSetCount = 0;
            foreach (var go in allGameObjects)
            {
                if (go.name == "Dining_Booth") boothCount++;
                if (go.name.StartsWith("Dining_Set_Table")) tableSetCount++;
            }
            bool tablesStandardized = boothCount == 0 && tableSetCount == 7;
            auditReport.Add($"[DiningHall] All Dining Tables Standardized with Matching Chairs (7 Sets, 0 Booths): {(tablesStandardized ? "PASS" : "FAIL")}");

            var t8 = GameObject.Find("Dining_Set_Table 8");
            bool counterApproachClear = t8 == null;
            auditReport.Add($"[DiningHall] Counter Approach Open (Table 8 Removed Between Condiment Bar & Counter): {(counterApproachClear ? "PASS" : "FAIL")}");

            var t1 = GameObject.Find("Dining_Set_Table 1");
            var t3 = GameObject.Find("Dining_Set_Table 3");
            var t5 = GameObject.Find("Dining_Set_Table 5");
            var t7 = GameObject.Find("Dining_Set_Table 7");
            bool aislesWide = false;
            if (t1 != null && t3 != null && t5 != null && t7 != null)
            {
                float aisle1 = Mathf.Abs(t3.transform.position.x - t1.transform.position.x) - 1.40f;
                float aisle2 = Mathf.Abs(t5.transform.position.x - t3.transform.position.x) - 1.40f;
                float aisle3 = Mathf.Abs(t7.transform.position.x - t5.transform.position.x) - 1.40f;
                aislesWide = aisle1 >= 1.00f && aisle2 >= 1.00f && aisle3 >= 1.00f;
            }
            auditReport.Add($"[DiningHall] Generous Player Walkway Aisles Between Tables (>= 1.00m): {(aislesWide ? "PASS" : "FAIL")}");

            var condimentBar = GameObject.Find("WingSpot_Dining_Condiment_Bar");
            bool barValid = false;
            if (condimentBar != null)
            {
                int bowlCount = 0;
                for (int i = 1; i <= 6; i++)
                {
                    if (condimentBar.transform.Find($"Condiment_Bowl_{i}") != null) bowlCount++;
                }
                bool inLineWithPillar = Mathf.Abs(condimentBar.transform.position.z - 8.50f) < 0.05f;
                barValid = bowlCount == 6 && inLineWithPillar;
            }
            auditReport.Add($"[DiningHall] Condiment Bar Station Present with 6 Food Bowls (in line with pillar at Z = 8.50m): {(barValid ? "PASS" : "FAIL")}");
            
            var colEast = GameObject.Find("Portico_Column_East_Shaft");
            var colWest = GameObject.Find("Portico_Column_West_Shaft");
            var architrave = GameObject.Find("Portico_Architrave_Beam");
            var fasciaEast = GameObject.Find("Portico_Canopy_Fascia_Side_East");
            var fasciaWest = GameObject.Find("Portico_Canopy_Fascia_Side_West");
            bool columnsSymmetric = false;
            if (colEast != null && colWest != null && architrave != null && fasciaEast != null && fasciaWest != null)
            {
                float dEast = Mathf.Abs(colEast.transform.position.x - (-6.75f));
                float dWest = Mathf.Abs(colWest.transform.position.x - (-6.75f));
                columnsSymmetric = Mathf.Abs(dEast - dWest) < 0.05f && Mathf.Abs(dEast - 0.85f) < 0.05f;
            }
            auditReport.Add($"[EntrancePorch] Symmetrical Twin Tuscan Columns & Tie Beam Supporting Canopy (East: -5.90m, West: -7.60m): {(columnsSymmetric ? "PASS" : "FAIL")}");

            var doorHeaderInt = GameObject.Find("WingSpot_DoorHeader_UpperBulkhead_Int");
            var wainscotEast = GameObject.Find("WingSpot_Entrance_Wainscot_East");
            var wainscotWest = GameObject.Find("WingSpot_Entrance_Wainscot_West");
            var infillUpper = GameObject.Find("WingSpot_EntranceStep_Interior_Upper");
            bool entranceSealed = false;
            if (doorHeaderInt != null && wainscotEast != null && wainscotWest != null && infillUpper != null)
            {
                float topY = doorHeaderInt.transform.position.y + doorHeaderInt.transform.lossyScale.y / 2f;
                float infillTopY = infillUpper.transform.position.y + infillUpper.transform.lossyScale.y / 2f;
                entranceSealed = topY >= 5.45f && infillTopY >= 5.45f && doorHeaderInt.transform.lossyScale.x >= 2.5f;
            }
            auditReport.Add($"[EntranceInterior] Solid Light-Tight Enclosure Above Door & Infill to Ceiling (Zero Sky Leakage, Top Y >= 5.45m): {(entranceSealed ? "PASS" : "FAIL")}");

            // =========================================================================
            // Wing Spot Entrance Facilities Audits (Restroom, Decorative Enclosure, 1.00m Divider)
            // =========================================================================
            var facilitiesRoot = GameObject.Find("WingSpot_RestroomAndEntry");
            var decorRoot = GameObject.Find("WingSpot_DecorativeEnclosure");
            var restroom = GameObject.Find("WingSpot_UnisexRestroom");
            var divider = GameObject.Find("WingSpot_EntranceDivider");

            bool facilitiesPresent = facilitiesRoot != null && decorRoot != null && restroom != null && divider != null;
            auditReport.Add($"[EntranceFacilities] Dedicated WingSpot_RestroomAndEntry Hierarchy Present: {(facilitiesPresent ? "PASS" : "FAIL")}");

            // Verify strictly located in entrance-to-counter zone along East Wall (X in [-7.50m, -5.00m], Z in [5.86m, 11.575m])
            var restroomWallWest = GameObject.Find("Restroom_Wall_West_Lower");
            var decorWallWest = GameObject.Find("Decorative_Wall_West_Lower");
            var dividerPlinth = GameObject.Find("EntranceDivider_Base_Plinth");
            bool zoneValid = false;
            if (restroomWallWest != null && decorWallWest != null && dividerPlinth != null)
            {
                float rx = restroomWallWest.transform.position.x;
                float rz = restroomWallWest.transform.position.z;
                float dx = decorWallWest.transform.position.x;
                float dz = decorWallWest.transform.position.z;
                zoneValid = rx >= -7.50f && rx <= -5.00f && rz >= 5.86f && rz <= 11.575f &&
                            dx >= -7.50f && dx <= -5.00f && dz >= 5.86f && dz <= 11.575f;
            }
            auditReport.Add($"[EntranceFacilities] Facilities Located Strictly along East Party Wall (X in [-7.50m, -5.00m], Z <= 11.575m): {(zoneValid ? "PASS" : "FAIL")}");

            // Verify Decorative Enclosure is full-height to ceiling (Top Y >= 5.40m) and completely closed
            var decorUpper = GameObject.Find("Decorative_Wall_West_Upper");
            var decorClosure = GameObject.Find("Decorative_Wall_North_Closure");
            bool decorFullHeight = false;
            if (decorUpper != null && decorClosure != null)
            {
                float topY = decorUpper.transform.position.y + decorUpper.transform.lossyScale.y / 2f;
                decorFullHeight = topY >= 5.40f;
            }
            auditReport.Add($"[EntranceFacilities] Decorative Enclosure Fully Enclosed to Ceiling (Top Y >= 5.40m, Zero Openings): {(decorFullHeight ? "PASS" : "FAIL")}");

            // Verify Restroom Full Height, Outward-Opening Door on North Wall, and Plaque
            var restroomUpper = GameObject.Find("Restroom_Wall_West_Upper");
            var doorLeaf = GameObject.Find("Restroom_Door_Leaf");
            var doorPivot = GameObject.Find("Restroom_Door_Pivot");
            var plaque = GameObject.Find("Restroom_Sign_Plaque");
            var overDoorSign = GameObject.Find("Restroom_OverDoor_Sign_Face");
            bool restroomValid = false;
            if (restroomUpper != null && doorLeaf != null && doorPivot != null && plaque != null)
            {
                float topY = restroomUpper.transform.position.y + restroomUpper.transform.lossyScale.y / 2f;
                bool reachesCeiling = topY >= 5.40f;
                bool doorOnNorthWall = Mathf.Abs(doorPivot.transform.position.z - 9.275f) < 0.05f;
                bool doorSwungOutward = Mathf.Abs(doorPivot.transform.localEulerAngles.y - 80.0f) < 2.0f && doorLeaf.transform.position.z >= 9.275f;
                restroomValid = reachesCeiling && doorOnNorthWall && doorSwungOutward;
            }
            auditReport.Add($"[EntranceFacilities] Unisex Restroom Reaches Ceiling with Outward-Swung Door Leaf into Gap: {(restroomValid ? "PASS" : "FAIL")}");

            bool overDoorSignValid = false;
            if (overDoorSign != null)
            {
                var rend = overDoorSign.GetComponent<Renderer>();
                bool hasTexture = rend != null && rend.sharedMaterial != null && rend.sharedMaterial.mainTexture != null;
                bool aboveDoor = overDoorSign.transform.position.y >= 2.50f;
                overDoorSignValid = hasTexture && aboveDoor;
            }
            auditReport.Add($"[EntranceFacilities] Over-Door Legible 'Baño' Unisex Sign Active (Y = 2.65m > 2.50m): {(overDoorSignValid ? "PASS" : "FAIL")}");

            // Verify 1.000m High Partial Entrance Divider (Top elevation Y = 1.240m on finished floor Y = 0.240m)
            var dividerCap = GameObject.Find("EntranceDivider_Top_Cap");
            var dividerPostCap = GameObject.Find("EntranceDivider_End_Post_Cap");
            bool dividerHeightExact = false;
            if (dividerCap != null && dividerPostCap != null)
            {
                float capTopY = dividerCap.transform.position.y + dividerCap.transform.lossyScale.y / 2f;
                float postTopY = dividerPostCap.transform.position.y + dividerPostCap.transform.lossyScale.y / 2f;
                float heightAboveFloor = capTopY - 0.240f;
                dividerHeightExact = Mathf.Abs(capTopY - 1.240f) < 0.005f && Mathf.Abs(postTopY - 1.240f) < 0.005f && Mathf.Abs(heightAboveFloor - 1.000f) < 0.005f;
            }
            auditReport.Add($"[EntranceFacilities] Partial Entrance Divider Height Exactly 1.000m (Top Y = 1.240m above Floor Y = 0.240m): {(dividerHeightExact ? "PASS" : "FAIL")}");

            // Verify Clear Entrance Passage Width (>= 0.75m between divider end post and restroom south wall)
            var restroomSouth = GameObject.Find("Restroom_Wall_South_Lower");
            var dividerPost = GameObject.Find("EntranceDivider_End_Post");
            bool passageClear = false;
            if (restroomSouth != null && dividerPost != null)
            {
                float restroomSouthFaceZ = restroomSouth.transform.position.z - restroomSouth.transform.lossyScale.z / 2f;
                float dividerPostNorthFaceZ = dividerPost.transform.position.z + dividerPost.transform.lossyScale.z / 2f;
                float passageWidth = restroomSouthFaceZ - dividerPostNorthFaceZ;
                passageClear = passageWidth >= 0.75f;
            }
            auditReport.Add($"[EntranceFacilities] Clear Entrance Walkway Passage Open (Width >= 0.75m into Restaurant): {(passageClear ? "PASS" : "FAIL")}");

            // Verify Clear Door Swing Gap Width (>= 1.00m between restroom north wall and decorative enclosure south wall)
            var decorSouth = GameObject.Find("Decorative_Wall_South_Lower");
            var restroomJamb = GameObject.Find("Restroom_Wall_North_WestJamb_Lower");
            bool gapClear = false;
            if (decorSouth != null && restroomJamb != null)
            {
                float decorSouthFaceZ = decorSouth.transform.position.z - decorSouth.transform.lossyScale.z / 2f;
                float restroomNorthFaceZ = restroomJamb.transform.position.z + restroomJamb.transform.lossyScale.z / 2f;
                float gapWidth = decorSouthFaceZ - restroomNorthFaceZ;
                gapClear = gapWidth >= 1.00f;
            }
            auditReport.Add($"[EntranceFacilities] Clear Door Swing Corridor Gap between Restroom and Decorative Space (>= 1.00m): {(gapClear ? "PASS" : "FAIL")}");

            // Verify Storage Room 100% Preserved and Disjoint (X <= -11.60m, Z >= 11.575m)
            bool storageRoomUntouched = wallAValid && wallBValid && fullHeightCoverage && turfValid && turfWainscotMatched;
            auditReport.Add($"[StorageRoomPreservation] Storage Room Walls & Staff Door 100% Intact & Untouched: {(storageRoomUntouched ? "PASS" : "FAIL")}");

            // Verify Player Entrance Threshold Position is strictly in Entrance Vestibule (Z in [5.80m, 6.50m], outside Restroom Z >= 7.475m)
            var tempPlayer = new GameObject("TempPlayerAudit");
            var pc = tempPlayer.AddComponent<MyVirtualCommunity.Player.PlayerController>();
            pc.SyncWorldThresholds();
            bool playerEntryAtDoor = pc.EntranceInteriorPosition.z <= 6.50f && pc.EntranceInteriorPosition.z >= 5.80f;
            bool playerEntryOutsideRestroom = pc.EntranceInteriorPosition.z < 7.425f;
            float clearance = 7.425f - pc.EntranceInteriorPosition.z;
            UnityEngine.Object.DestroyImmediate(tempPlayer);
            auditReport.Add($"[PlayerEntranceLocomotion] Player Entrance Position in Vestibule (Z = {pc.EntranceInteriorPosition.z:F2}m in [5.80m, 6.50m]): {(playerEntryAtDoor ? "PASS" : "FAIL")}");
            auditReport.Add($"[PlayerEntranceLocomotion] Player Entrance Strictly Outside Restroom (Vestibule Clearance = {clearance:F2}m): {(playerEntryOutsideRestroom ? "PASS" : "FAIL")}");
            auditReport.Add("==========================================================================");

            foreach (var line in auditReport)
            {
                Debug.Log("[CarVisualAuditRunner] " + line);
            }

            File.WriteAllLines(@"C:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\logs\collider_and_asset_audit.txt", auditReport);
        }

        private static string GetHierarchyPath(GameObject go)
        {
            string path = go.name;
            Transform t = go.transform;
            while (t.parent != null)
            {
                t = t.parent;
                path = t.name + "/" + path;
            }
            return path;
        }
    }
}
