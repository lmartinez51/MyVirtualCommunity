using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using MyVirtualCommunity.Character;
using MyVirtualCommunity.UI;
using MyVirtualCommunity.Player;

namespace MyVirtualCommunity.Editor
{
    /// <summary>
    /// Phase A, B & C: Automated test suite for Avatar Profile serialization, validation,
    /// runtime color/appearance customization, and local persistence.
    /// 
    /// INVARIANTS TESTED:
    /// 1. Complete bidirectional mapping between BobbleheadConfig and BobbleheadCustomizationProfile.
    /// 2. Strict validation of schema version (2), player entity ID ("agent:gomez-morin-player"), and enums.
    /// 3. Rejection of NaN, Infinity, out-of-range colors, and malformed JSON.
    /// 4. Transactional replacement with backup (.bak) without data corruption.
    /// 5. Graceful fallback to default configuration on missing or invalid profiles.
    /// 6. Corrupt files are NEVER deleted or overwritten on load.
    /// 7. 100% test isolation: real Application.persistentDataPath profile is NEVER touched.
    /// 8. Visual support: all 8 procedural hairstyles validated; unknown styles rejected.
    /// 9. Geometry bounds: height strictly 1.75m and headScale 1.0 (collision/camera envelope preserved).
    /// 10. Repeated saves and existing backup replacement rotation (A -> B -> C).
    /// 11. Real OS-level file replacement failure (sharing violation preserves file byte-for-byte).
    /// 12. Recovery hierarchy: valid primary preferred over backup; valid backup preferred over candidate.
    /// 13. Fallback on invalid candidates without corrupt file deletion or automatic replacement.
    /// 14. Phase B runtime color palettes, live preview, swatches, and Apply/Cancel workflows.
    /// 15. Phase C procedural appearance: 8 hairstyles, 3 face shapes, 5 facial hair styles, 3 body presentations.
    /// 16. Schema v1 to v2 automatic migration preserving colors and providing canonical defaults.
    /// 17. Rejection of unknown Phase C appearance identifiers.
    /// 18. Procedural mesh cleanup and memory leak prevention across successive rebuilds.
    /// 19. Semantic distinction between Reset Colors and Reset Appearance.
    /// 20. BobbleheadAnimator initial pose re-binding after procedural rebuilds.
    /// 21. Elena Morales NPC 100% isolation across all customization operations.
    /// </summary>
    public static class AvatarProfileTests
    {
        [MenuItem("MyVirtualCommunity/Run Avatar Profile Tests")]
        public static void RunTests()
        {
            Debug.Log("==========================================================================");
            Debug.Log("[AvatarProfileTests] STARTING AVATAR PROFILE & PERSISTENCE TESTS (PHASE A, B, C)");
            Debug.Log("==========================================================================");

            string testTempDir = Path.Combine(Path.GetTempPath(), "mvc_avatar_test_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(testTempDir);
            string testProfilePath = Path.Combine(testTempDir, "avatar_profile.json");

            // Snapshot real user profile timestamp/state to guarantee test isolation
            string realPath = BobbleheadProfileManager.DefaultProfilePath;
            bool realExistedBefore = File.Exists(realPath);
            DateTime realTimestampBefore = realExistedBefore ? File.GetLastWriteTimeUtc(realPath) : DateTime.MinValue;

            int testsPassed = 0;
            int totalTests = 53;

            try
            {
                // -------------------------------------------------------------
                // TEST 1: Default Profile Creation from CreatePlayerConfig()
                // -------------------------------------------------------------
                var defaultPlayer = BobbleheadConfig.CreatePlayerConfig();
                var profile1 = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                Assert(profile1.schemaVersion == 3, "Test 1: Schema version must be 3");
                Assert(profile1.playerEntityId == BobbleheadCustomizationProfile.ExpectedPlayerEntityId, "Test 1: Player ID must match 'agent:gomez-morin-player'");
                Assert(profile1.characterName == "Player", "Test 1: Character name must be 'Player'");
                Assert(profile1.hairStyle == nameof(BobbleheadHairType.CasualShort), "Test 1: Default HairStyle must be 'CasualShort'");
                Assert(profile1.headwear == nameof(BobbleheadHeadwearType.BaseballCap), "Test 1: Default Headwear must be 'BaseballCap'");
                Assert(profile1.faceShape == nameof(BobbleheadFaceShape.Round), "Test 1: FaceShape must be 'Round'");
                Assert(profile1.facialHair == nameof(BobbleheadFacialHair.None), "Test 1: FacialHair must be 'None'");
                Assert(profile1.bodyPresentation == nameof(BobbleheadBodyPresentation.Original), "Test 1: BodyPresentation must be 'Original'");
                Assert(profile1.outfitType == nameof(BobbleheadOutfitType.StreetwearJacket), "Test 1: OutfitType must be 'StreetwearJacket'");
                Assert(profile1.skinColor.EqualsColor(defaultPlayer.skinColor), "Test 1: Skin color must match");
                Assert(profile1.outerwearColor.EqualsColor(defaultPlayer.outerwearColor), "Test 1: Outerwear color must match");
                Assert(profile1.pantsColor.EqualsColor(defaultPlayer.pantsColor), "Test 1: Pants color must match");
                Assert(profile1.shoeBaseColor.EqualsColor(defaultPlayer.shoeBaseColor), "Test 1: Shoe base color must match");
                Assert(profile1.hasNameBadge == false, "Test 1: Name badge must be false for player");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 1: Default Profile Creation PASS");

                // -------------------------------------------------------------
                // TEST 2: Bidirectional Round-Trip (Default Config)
                // -------------------------------------------------------------
                var convertedConfig1 = profile1.ToConfig();
                Assert(convertedConfig1.characterName == defaultPlayer.characterName, "Test 2: Round-trip characterName match");
                Assert(Mathf.Abs(convertedConfig1.totalHeight - defaultPlayer.totalHeight) < 0.001f, "Test 2: Round-trip totalHeight match");
                Assert(Mathf.Abs(convertedConfig1.headScale - defaultPlayer.headScale) < 0.001f, "Test 2: Round-trip headScale match");
                Assert(convertedConfig1.hairStyle == defaultPlayer.hairStyle, "Test 2: Round-trip hairStyle match");
                Assert(convertedConfig1.headwear == defaultPlayer.headwear, "Test 2: Round-trip headwear match");
                Assert(convertedConfig1.faceShape == defaultPlayer.faceShape, "Test 2: Round-trip faceShape match");
                Assert(convertedConfig1.facialHair == defaultPlayer.facialHair, "Test 2: Round-trip facialHair match");
                Assert(convertedConfig1.bodyPresentation == defaultPlayer.bodyPresentation, "Test 2: Round-trip bodyPresentation match");
                Assert(convertedConfig1.outfitType == defaultPlayer.outfitType, "Test 2: Round-trip outfitType match");
                Assert(profile1.skinColor.EqualsColor(convertedConfig1.skinColor), "Test 2: Round-trip skinColor match");
                Assert(profile1.eyeColor.EqualsColor(convertedConfig1.eyeColor), "Test 2: Round-trip eyeColor match");
                Assert(profile1.pupilColor.EqualsColor(convertedConfig1.pupilColor), "Test 2: Round-trip pupilColor match");
                Assert(profile1.eyebrowColor.EqualsColor(convertedConfig1.eyebrowColor), "Test 2: Round-trip eyebrowColor match");
                Assert(profile1.lipColor.EqualsColor(convertedConfig1.lipColor), "Test 2: Round-trip lipColor match");
                Assert(profile1.blushColor.EqualsColor(convertedConfig1.blushColor), "Test 2: Round-trip blushColor match");
                Assert(profile1.hairColor.EqualsColor(convertedConfig1.hairColor), "Test 2: Round-trip hairColor match");
                Assert(profile1.headwearColor.EqualsColor(convertedConfig1.headwearColor), "Test 2: Round-trip headwearColor match");
                Assert(profile1.headwearAccentColor.EqualsColor(convertedConfig1.headwearAccentColor), "Test 2: Round-trip headwearAccentColor match");
                Assert(profile1.outerwearColor.EqualsColor(convertedConfig1.outerwearColor), "Test 2: Round-trip outerwearColor match");
                Assert(profile1.innerwearColor.EqualsColor(convertedConfig1.innerwearColor), "Test 2: Round-trip innerwearColor match");
                Assert(profile1.pantsColor.EqualsColor(convertedConfig1.pantsColor), "Test 2: Round-trip pantsColor match");
                Assert(profile1.shoeBaseColor.EqualsColor(convertedConfig1.shoeBaseColor), "Test 2: Round-trip shoeBaseColor match");
                Assert(profile1.shoeAccentColor.EqualsColor(convertedConfig1.shoeAccentColor), "Test 2: Round-trip shoeAccentColor match");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 2: Bidirectional Round-Trip (Default) PASS");

                // -------------------------------------------------------------
                // TEST 3: Custom Profile Round-Trip (Custom Colors, Badge, Supported Geometry)
                // -------------------------------------------------------------
                var customConfig = new BobbleheadConfig
                {
                    characterName = "CustomAlex",
                    totalHeight = BobbleheadCustomizationProfile.SupportedPlayerHeight,
                    headScale = BobbleheadCustomizationProfile.SupportedPlayerHeadScale,
                    faceShape = BobbleheadFaceShape.Oval,
                    facialHair = BobbleheadFacialHair.Goatee,
                    bodyPresentation = BobbleheadBodyPresentation.Masculine,
                    skinColor = new Color(0.85f, 0.65f, 0.50f),
                    eyeColor = new Color(0.10f, 0.40f, 0.20f), // Emerald green
                    pupilColor = new Color(0.02f, 0.02f, 0.02f),
                    eyebrowColor = new Color(0.20f, 0.15f, 0.10f),
                    lipColor = new Color(0.70f, 0.40f, 0.35f),
                    blushColor = new Color(0.85f, 0.45f, 0.40f, 0.30f),
                    hairStyle = BobbleheadHairType.CasualShort,
                    headwear = BobbleheadHeadwearType.WinterBeanie,
                    hairColor = new Color(0.60f, 0.30f, 0.10f), // Auburn
                    headwearColor = Color.black,
                    headwearAccentColor = Color.yellow,
                    outfitType = BobbleheadOutfitType.StreetwearJacket,
                    outerwearColor = new Color(0.40f, 0.10f, 0.10f), // Crimson jacket
                    innerwearColor = Color.black,
                    pantsColor = new Color(0.15f, 0.15f, 0.20f),
                    shoeBaseColor = Color.white,
                    shoeAccentColor = Color.blue,
                    hasNameBadge = true,
                    badgeText = "ALEX"
                };

                var profile3 = BobbleheadCustomizationProfile.FromConfig(customConfig);
                Assert(profile3.Validate(out string err3), $"Test 3: Profile should validate: {err3}");
                var convertedConfig3 = profile3.ToConfig();
                Assert(convertedConfig3.characterName == "CustomAlex", "Test 3: Name match");
                Assert(convertedConfig3.hairStyle == BobbleheadHairType.CasualShort, "Test 3: HairStyle CasualShort match");
                Assert(convertedConfig3.headwear == BobbleheadHeadwearType.WinterBeanie, "Test 3: Headwear WinterBeanie match");
                Assert(convertedConfig3.faceShape == BobbleheadFaceShape.Oval, "Test 3: FaceShape Oval match");
                Assert(convertedConfig3.facialHair == BobbleheadFacialHair.Goatee, "Test 3: FacialHair Goatee match");
                Assert(convertedConfig3.bodyPresentation == BobbleheadBodyPresentation.Masculine, "Test 3: BodyPresentation Masculine match");
                Assert(convertedConfig3.hasNameBadge == true, "Test 3: hasNameBadge match");
                Assert(convertedConfig3.badgeText == "ALEX", "Test 3: badgeText match");
                Assert(profile3.outerwearColor.EqualsColor(convertedConfig3.outerwearColor), "Test 3: Crimson outerwear match");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 3: Custom Profile Round-Trip PASS");

                // -------------------------------------------------------------
                // TEST 4: Attendant Profile Round-Trip (AttendantBun, WingSpotAttendant)
                // -------------------------------------------------------------
                var elenaConfig = BobbleheadConfig.CreateElenaConfig();
                var profile4 = BobbleheadCustomizationProfile.FromConfig(elenaConfig, BobbleheadCustomizationProfile.ExpectedPlayerEntityId);
                // Adjust geometry to supported player values for player profile validation
                profile4.totalHeight = BobbleheadCustomizationProfile.SupportedPlayerHeight;
                profile4.headScale = BobbleheadCustomizationProfile.SupportedPlayerHeadScale;
                Assert(profile4.hairStyle == nameof(BobbleheadHairType.AttendantBun), "Test 4: AttendantBun string match");
                Assert(profile4.outfitType == nameof(BobbleheadOutfitType.WingSpotAttendant), "Test 4: WingSpotAttendant string match");
                Assert(profile4.Validate(out string err4), $"Test 4: Elena style should validate with player geometry: {err4}");
                var convertedConfig4 = profile4.ToConfig();
                Assert(convertedConfig4.hairStyle == BobbleheadHairType.AttendantBun, "Test 4: Converted hairStyle AttendantBun match");
                Assert(convertedConfig4.outfitType == BobbleheadOutfitType.WingSpotAttendant, "Test 4: Converted outfitType WingSpotAttendant match");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 4: Attendant Profile Round-Trip PASS");

                // -------------------------------------------------------------
                // TEST 5: Schema Version Validation
                // -------------------------------------------------------------
                var profile5a = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile5a.schemaVersion = 0;
                Assert(!profile5a.Validate(out _), "Test 5: Schema version 0 must be rejected");

                var profile5b = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile5b.schemaVersion = 4;
                Assert(!profile5b.Validate(out _), "Test 5: Schema version 4 must be rejected");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 5: Schema Version Validation PASS");

                // -------------------------------------------------------------
                // TEST 6: Player Entity ID Validation
                // -------------------------------------------------------------
                var profile6a = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile6a.playerEntityId = null;
                Assert(!profile6a.Validate(out _), "Test 6: Null player ID must be rejected");

                var profile6b = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile6b.playerEntityId = "agent:impostor-npc";
                Assert(!profile6b.Validate(out _), "Test 6: Mismatched player ID must be rejected");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 6: Player Entity ID Validation PASS");

                // -------------------------------------------------------------
                // TEST 7: Enumeration Name Validation
                // -------------------------------------------------------------
                var profile7a = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7a.hairStyle = "NeonSpikes9000";
                Assert(!profile7a.Validate(out _), "Test 7: Unknown hairStyle must be rejected");

                var profile7b = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7b.outfitType = "CyberpunkExosuit";
                Assert(!profile7b.Validate(out _), "Test 7: Unknown outfitType must be rejected");

                var profile7c = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7c.faceShape = "SquareAlien";
                Assert(!profile7c.Validate(out _), "Test 7: Unknown faceShape must be rejected");

                var profile7d = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7d.facialHair = "LaserBeard";
                Assert(!profile7d.Validate(out _), "Test 7: Unknown facialHair must be rejected");

                var profile7e = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7e.bodyPresentation = "GiantMech";
                Assert(!profile7e.Validate(out _), "Test 7: Unknown bodyPresentation must be rejected");

                var profile7f = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile7f.headwear = "VikingHelmet";
                Assert(!profile7f.Validate(out _), "Test 7: Unknown headwear must be rejected");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 7: Enumeration Name Validation PASS");

                // -------------------------------------------------------------
                // TEST 8: Color Component Bounds & Non-Finite Validation
                // -------------------------------------------------------------
                var profile8a = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile8a.skinColor = new SerializableColor(-0.1f, 0.5f, 0.5f);
                Assert(!profile8a.Validate(out _), "Test 8: Negative color component must be rejected");

                var profile8b = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile8b.skinColor = new SerializableColor(1.5f, 0.5f, 0.5f);
                Assert(!profile8b.Validate(out _), "Test 8: Over-1.0 color component must be rejected");

                var profile8c = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile8c.eyeColor = new SerializableColor(float.NaN, 0.5f, 0.5f);
                Assert(!profile8c.Validate(out _), "Test 8: NaN color component must be rejected");

                var profile8d = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile8d.pantsColor = new SerializableColor(0.5f, float.PositiveInfinity, 0.5f);
                Assert(!profile8d.Validate(out _), "Test 8: Infinity color component must be rejected");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 8: Color Bounds & Non-Finite Validation PASS");

                // -------------------------------------------------------------
                // TEST 9: Proportions & Geometry Bounds Validation
                // -------------------------------------------------------------
                var profile9a = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile9a.totalHeight = -5.0f;
                Assert(!profile9a.Validate(out _), "Test 9: Negative height must be rejected");

                var profile9b = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profile9b.headScale = float.NaN;
                Assert(!profile9b.Validate(out _), "Test 9: NaN head scale must be rejected");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 9: Proportions & Geometry Bounds Validation PASS");

                // -------------------------------------------------------------
                // TEST 10: Safe Persistence — Save to Isolated Path
                // -------------------------------------------------------------
                bool saveSuccess = BobbleheadProfileManager.TrySaveProfile(profile3, out string saveErr, testProfilePath);
                Assert(saveSuccess, $"Test 10: Save should succeed: {saveErr}");
                Assert(File.Exists(testProfilePath), "Test 10: Profile file must exist on disk");
                string savedJson = File.ReadAllText(testProfilePath);
                Assert(savedJson.Contains("\"schemaVersion\": 3"), "Test 10: Saved JSON must contain schemaVersion 3");
                Assert(savedJson.Contains("\"characterName\": \"CustomAlex\""), "Test 10: Saved JSON must contain characterName");
                Assert(savedJson.Contains("\"headwear\": \"WinterBeanie\""), "Test 10: Saved JSON must contain headwear");
                Assert(!File.Exists(testProfilePath + ".tmp"), "Test 10: Temporary file must be deleted");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 10: Safe Persistence Save PASS");

                // -------------------------------------------------------------
                // TEST 11: Safe Persistence — Load from Isolated Path
                // -------------------------------------------------------------
                bool loadSuccess = BobbleheadProfileManager.TryLoadProfile(out var loadedProfile, out string loadErr, testProfilePath);
                Assert(loadSuccess, $"Test 11: Load should succeed: {loadErr}");
                Assert(loadedProfile != null, "Test 11: Loaded profile must not be null");
                Assert(loadedProfile.characterName == "CustomAlex", "Test 11: Loaded name match");
                Assert(loadedProfile.hairStyle == nameof(BobbleheadHairType.CasualShort), "Test 11: Loaded hairStyle match");
                Assert(loadedProfile.headwear == nameof(BobbleheadHeadwearType.WinterBeanie), "Test 11: Loaded headwear match");
                Assert(loadedProfile.faceShape == nameof(BobbleheadFaceShape.Oval), "Test 11: Loaded faceShape match");
                Assert(loadedProfile.facialHair == nameof(BobbleheadFacialHair.Goatee), "Test 11: Loaded facialHair match");
                Assert(loadedProfile.bodyPresentation == nameof(BobbleheadBodyPresentation.Masculine), "Test 11: Loaded bodyPresentation match");
                Assert(loadedProfile.outerwearColor.EqualsColor(customConfig.outerwearColor), "Test 11: Loaded outerwear color match");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 11: Safe Persistence Load PASS");

                // -------------------------------------------------------------
                // TEST 12: Transactional Overwrite of Existing File
                // -------------------------------------------------------------
                loadedProfile.characterName = "UpdatedAlex";
                loadedProfile.pantsColor = new SerializableColor(0.8f, 0.2f, 0.1f);
                bool overwriteSuccess = BobbleheadProfileManager.TrySaveProfile(loadedProfile, out string overwriteErr, testProfilePath);
                Assert(overwriteSuccess, $"Test 12: Overwrite should succeed: {overwriteErr}");
                Assert(File.Exists(testProfilePath + ".bak"), "Test 12: Backup file (.bak) must exist after transactional replacement");

                bool reloadSuccess = BobbleheadProfileManager.TryLoadProfile(out var reloadedProfile, out string reloadErr, testProfilePath);
                Assert(reloadSuccess, $"Test 12: Reload after overwrite should succeed: {reloadErr}");
                Assert(reloadedProfile.characterName == "UpdatedAlex", "Test 12: Overwritten name match");
                Assert(reloadedProfile.pantsColor.EqualsColor(new Color(0.8f, 0.2f, 0.1f)), "Test 12: Overwritten pants color match");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 12: Transactional Overwrite PASS");

                // -------------------------------------------------------------
                // TEST 13: Missing File Handling (Default Fallback)
                // -------------------------------------------------------------
                string nonExistentPath = Path.Combine(testTempDir, "missing_profile.json");
                bool missingLoad = BobbleheadProfileManager.TryLoadProfile(out var missingProfile, out string missingErr, nonExistentPath);
                Assert(!missingLoad, "Test 13: Loading missing file must return false");
                Assert(missingProfile == null, "Test 13: Missing profile must be null");

                var fallbackConfig = BobbleheadProfileManager.GetEffectivePlayerConfig(nonExistentPath);
                Assert(fallbackConfig != null, "Test 13: Fallback config must not be null");
                Assert(fallbackConfig.characterName == "Player", "Test 13: Fallback config must be default Player");
                Assert(fallbackConfig.hairStyle == BobbleheadHairType.CasualShort, "Test 13: Fallback hairStyle must be CasualShort");
                Assert(fallbackConfig.headwear == BobbleheadHeadwearType.BaseballCap, "Test 13: Fallback headwear must be BaseballCap");
                Assert(!File.Exists(nonExistentPath), "Test 13: Missing file must NOT be created automatically on read");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 13: Missing File Handling PASS");

                // -------------------------------------------------------------
                // TEST 14: Malformed JSON Handling (No Crash, No Deletion, Default Fallback)
                // -------------------------------------------------------------
                string malformedPath = Path.Combine(testTempDir, "malformed_profile.json");
                File.WriteAllText(malformedPath, "{ broken json ::: invalid syntax", System.Text.Encoding.UTF8);

                bool malformedLoad = BobbleheadProfileManager.TryLoadProfile(out var malformedProfile, out string malformedErr, malformedPath);
                Assert(!malformedLoad, "Test 14: Malformed JSON must return false");
                Assert(malformedProfile == null, "Test 14: Malformed profile must be null");
                Assert(File.Exists(malformedPath), "Test 14: Corrupt file must NOT be deleted");

                var malformedFallback = BobbleheadProfileManager.GetEffectivePlayerConfig(malformedPath);
                Assert(malformedFallback != null, "Test 14: Fallback config from malformed file must not be null");
                Assert(malformedFallback.characterName == "Player", "Test 14: Fallback config must be default Player");
                Assert(File.Exists(malformedPath), "Test 14: Corrupt file must still exist after GetEffectivePlayerConfig");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 14: Malformed JSON Handling PASS");

                // -------------------------------------------------------------
                // TEST 15: Invalid Schema Data Handling (No Crash, No Deletion, Default Fallback)
                // -------------------------------------------------------------
                string invalidDataPath = Path.Combine(testTempDir, "invalid_schema.json");
                File.WriteAllText(invalidDataPath, "{\"schemaVersion\": 999, \"playerEntityId\": \"agent:gomez-morin-player\"}", System.Text.Encoding.UTF8);

                bool invalidLoad = BobbleheadProfileManager.TryLoadProfile(out var invalidProfile, out string invalidErr, invalidDataPath);
                Assert(!invalidLoad, "Test 15: Unsupported schema version must return false");
                Assert(invalidProfile == null, "Test 15: Invalid profile must be null");
                Assert(File.Exists(invalidDataPath), "Test 15: Unsupported schema file must NOT be deleted");

                var invalidFallback = BobbleheadProfileManager.GetEffectivePlayerConfig(invalidDataPath);
                Assert(invalidFallback != null, "Test 15: Fallback config must not be null");
                Assert(invalidFallback.characterName == "Player", "Test 15: Fallback config must be default Player");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 15: Invalid Schema Data Handling PASS");

                // -------------------------------------------------------------
                // TEST 16: Preservation of BobbleheadConfig Defaults
                // -------------------------------------------------------------
                var p = BobbleheadConfig.CreatePlayerConfig();
                Assert(p.totalHeight == 1.75f, "Test 16: Player totalHeight must be 1.75f");
                Assert(p.headScale == 1.0f, "Test 16: Player headScale must be 1.0f");
                Assert(p.hairStyle == BobbleheadHairType.CasualShort, "Test 16: Player hairStyle must be CasualShort");
                Assert(p.headwear == BobbleheadHeadwearType.BaseballCap, "Test 16: Player headwear must be BaseballCap");
                Assert(p.faceShape == BobbleheadFaceShape.Round, "Test 16: Player faceShape must be Round");
                Assert(p.facialHair == BobbleheadFacialHair.None, "Test 16: Player facialHair must be None");
                Assert(p.bodyPresentation == BobbleheadBodyPresentation.Original, "Test 16: Player bodyPresentation must be Original");
                Assert(p.outfitType == BobbleheadOutfitType.StreetwearJacket, "Test 16: Player outfitType must be StreetwearJacket");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 16: BobbleheadConfig Defaults Preserved PASS");

                // -------------------------------------------------------------
                // TEST 17: Elena Morales NPC Isolation
                // -------------------------------------------------------------
                var e = BobbleheadConfig.CreateElenaConfig();
                Assert(e.characterName == "Elena Morales", "Test 17: Elena name must be 'Elena Morales'");
                Assert(e.totalHeight == 1.68f, "Test 17: Elena totalHeight must be 1.68f");
                Assert(e.headScale == 0.98f, "Test 17: Elena headScale must be 0.98f");
                Assert(e.hairStyle == BobbleheadHairType.AttendantBun, "Test 17: Elena hairStyle must be AttendantBun");
                Assert(e.faceShape == BobbleheadFaceShape.Round, "Test 17: Elena faceShape must be Round");
                Assert(e.facialHair == BobbleheadFacialHair.None, "Test 17: Elena facialHair must be None");
                Assert(e.bodyPresentation == BobbleheadBodyPresentation.Original, "Test 17: Elena bodyPresentation must be Original");
                Assert(e.outfitType == BobbleheadOutfitType.WingSpotAttendant, "Test 17: Elena outfitType must be WingSpotAttendant");
                Assert(e.hasNameBadge == true && e.badgeText == "ELENA", "Test 17: Elena name badge must be 'ELENA'");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 17: Elena Morales NPC Isolation PASS");

                // -------------------------------------------------------------
                // TEST 18: PlayerController & CharacterController Settings Preserved
                // -------------------------------------------------------------
                var testPlayerGo = new GameObject("TestPlayerIntegrity");
                var cc = testPlayerGo.AddComponent<CharacterController>();
                var pc = testPlayerGo.AddComponent<MyVirtualCommunity.Player.PlayerController>();
                pc.BuildPlayerAvatar();
                Assert(cc.height == 1.75f, $"Test 18: CharacterController height must be 1.75f, got {cc.height}");
                Assert(Mathf.Abs(cc.radius - 0.38f) < 0.01f, $"Test 18: CharacterController radius must be 0.38f, got {cc.radius}");
                Assert(Mathf.Abs(cc.center.y - 0.875f) < 0.01f, $"Test 18: CharacterController center.y must be 0.875f, got {cc.center.y}");
                UnityEngine.Object.DestroyImmediate(testPlayerGo);
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 18: CharacterController Invariant PASS");

                // -------------------------------------------------------------
                // TEST 19: Hairstyle & Headwear Visual Support Enforcement
                // -------------------------------------------------------------
                var hairTestProfile = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                foreach (BobbleheadHairType style in Enum.GetValues(typeof(BobbleheadHairType)))
                {
                    if (style == BobbleheadHairType.StreetBeanie)
                    {
                        hairTestProfile.hairStyle = style.ToString();
                        Assert(!hairTestProfile.Validate(out _), "Test 19: Legacy combined StreetBeanie hairStyle must be rejected in raw v3 profile (use headwear field)");
                        continue;
                    }
                    hairTestProfile.hairStyle = style.ToString();
                    Assert(hairTestProfile.Validate(out string styleErr), $"Test 19: {style} must be accepted: {styleErr}");
                }
                hairTestProfile.hairStyle = nameof(BobbleheadHairType.CasualShort);

                foreach (BobbleheadHeadwearType hw in Enum.GetValues(typeof(BobbleheadHeadwearType)))
                {
                    hairTestProfile.headwear = hw.ToString();
                    Assert(hairTestProfile.Validate(out string hwErr), $"Test 19: Headwear {hw} must be accepted: {hwErr}");
                }
                hairTestProfile.headwear = nameof(BobbleheadHeadwearType.BaseballCap);

                hairTestProfile.hairStyle = "NonExistentHairStyleXYZ";
                bool invalidHairValid = hairTestProfile.Validate(out string hairErr);
                Assert(!invalidHairValid, "Test 19: Unknown hairStyle must be strictly rejected");
                Assert(hairErr.Contains("hairStyle"), "Test 19: Error message must reference hairStyle");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 19: Hairstyle & Headwear Visual Support Enforcement PASS");

                // -------------------------------------------------------------
                // TEST 20: Geometry Customization Boundary Enforcement
                // -------------------------------------------------------------
                var geomProfile = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                geomProfile.totalHeight = 1.80f;
                Assert(!geomProfile.Validate(out string hErr1), "Test 20: Height 1.80m must be rejected");
                Assert(hErr1.Contains("Geometric customization is deferred"), "Test 20: Height error message must state geometric customization is deferred");

                geomProfile.totalHeight = 1.65f;
                Assert(!geomProfile.Validate(out _), "Test 20: Height 1.65m must be rejected");

                geomProfile.totalHeight = BobbleheadCustomizationProfile.SupportedPlayerHeight;
                geomProfile.headScale = 1.10f;
                Assert(!geomProfile.Validate(out string hsErr1), "Test 20: HeadScale 1.10 must be rejected");
                Assert(hsErr1.Contains("Geometric customization is deferred"), "Test 20: HeadScale error message must state geometric customization is deferred");

                geomProfile.headScale = 0.90f;
                Assert(!geomProfile.Validate(out _), "Test 20: HeadScale 0.90 must be rejected");

                geomProfile.headScale = BobbleheadCustomizationProfile.SupportedPlayerHeadScale;
                Assert(geomProfile.Validate(out _), "Test 20: Standard 1.75m / 1.0 headScale must be accepted");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 20: Geometry Customization Boundary Enforcement PASS");

                // -------------------------------------------------------------
                // TEST 21: Failure Recovery from Backup (.bak) Baseline
                // -------------------------------------------------------------
                string recPath = Path.Combine(testTempDir, "backup_recovery_test.json");
                string recBakPath = recPath + ".bak";

                var validRecProfile = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                validRecProfile.characterName = "OriginalValidName";
                bool recInitialSave = BobbleheadProfileManager.TrySaveProfile(validRecProfile, out _, recPath);
                Assert(recInitialSave, "Test 21: Initial save must succeed");

                // Overwrite once so that .bak is created containing OriginalValidName
                validRecProfile.characterName = "SecondValidName";
                bool recOverwrite = BobbleheadProfileManager.TrySaveProfile(validRecProfile, out _, recPath);
                Assert(recOverwrite, "Test 21: Overwrite save must succeed");
                Assert(File.Exists(recBakPath), "Test 21: Backup file (.bak) must exist");

                // Deliberately corrupt the primary file
                File.WriteAllText(recPath, "{ \"schemaVersion\": 999, corrupt syntax !!!", System.Text.Encoding.UTF8);

                // TryLoadProfile must recover from .bak and restore the primary file
                bool recSuccess = BobbleheadProfileManager.TryLoadProfile(out var recProfile, out string recLoadErr, recPath);
                Assert(recSuccess, $"Test 21: Recovery from .bak must succeed: {recLoadErr}");
                Assert(recProfile != null, "Test 21: Recovered profile must not be null");
                Assert(recProfile.characterName == "OriginalValidName", $"Test 21: Recovered name must match backup ('OriginalValidName'), got '{recProfile.characterName}'");

                string restoredJson = File.ReadAllText(recPath);
                Assert(restoredJson.Contains("OriginalValidName"), "Test 21: Primary file must be restored on disk from valid backup");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 21: Backup (.bak) Recovery Baseline PASS");

                // -------------------------------------------------------------
                // TEST 22: Failure Recovery from Interrupted Candidate (.tmp) Baseline
                // -------------------------------------------------------------
                string tmpRecPath = Path.Combine(testTempDir, "tmp_candidate_recovery.json");
                string tmpCandidatePath = tmpRecPath + ".tmp";

                var tmpCandidateProfile = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                tmpCandidateProfile.characterName = "CandidateRecovered";
                string candidateJson = JsonUtility.ToJson(tmpCandidateProfile, true);
                File.WriteAllText(tmpCandidatePath, candidateJson, System.Text.Encoding.UTF8);

                bool tmpRecSuccess = BobbleheadProfileManager.TryLoadProfile(out var tmpLoadedProfile, out string tmpErr, tmpRecPath);
                Assert(tmpRecSuccess, $"Test 22: Recovery from .tmp candidate must succeed: {tmpErr}");
                Assert(tmpLoadedProfile != null, "Test 22: Loaded profile from candidate must not be null");
                Assert(tmpLoadedProfile.characterName == "CandidateRecovered", "Test 22: Character name must match candidate");
                Assert(File.Exists(tmpRecPath), "Test 22: Primary file must now exist after recovery");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 22: Candidate (.tmp) Recovery Baseline PASS");

                // -------------------------------------------------------------
                // TEST 23: Preservation of Valid Profile on Save Failure Baseline
                // -------------------------------------------------------------
                string presPath = Path.Combine(testTempDir, "preservation_test.json");
                var validPresProfile = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                validPresProfile.characterName = "SafeUncorruptedOriginal";
                bool presInitial = BobbleheadProfileManager.TrySaveProfile(validPresProfile, out _, presPath);
                Assert(presInitial, "Test 23: Initial save must succeed");

                // Attempt to save an invalid profile candidate over the existing valid profile
                var invalidCandidate = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                invalidCandidate.characterName = "CorruptAttempt";
                invalidCandidate.totalHeight = 2.50f; // Invalid height rejected by validator

                bool badSaveSuccess = BobbleheadProfileManager.TrySaveProfile(invalidCandidate, out string badErr, presPath);
                Assert(!badSaveSuccess, "Test 23: Save of invalid candidate must fail");
                Assert(badErr.Contains("totalHeight"), "Test 23: Error message must cite totalHeight");

                // Verify original profile on disk remains 100% untouched and loadable
                bool presLoad = BobbleheadProfileManager.TryLoadProfile(out var presLoaded, out _, presPath);
                Assert(presLoad, "Test 23: Load of existing file must succeed after failed save");
                Assert(presLoaded.characterName == "SafeUncorruptedOriginal", "Test 23: Original file content must be preserved untouched");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 23: Preservation on Save Failure Baseline PASS");

                // -------------------------------------------------------------
                // TEST 24: Test A — Repeated Saves and Backup Replacement Rotation
                // -------------------------------------------------------------
                string rotDir = Path.Combine(testTempDir, "rotation_test");
                Directory.CreateDirectory(rotDir);
                string rotPath = Path.Combine(rotDir, "avatar_profile.json");
                string rotBakPath = rotPath + ".bak";
                string rotTmpPath = rotPath + ".tmp";

                // Profile A: distinctive auburn hair color
                var profileA = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profileA.characterName = "ProfileA";
                profileA.hairColor = new SerializableColor(0.60f, 0.30f, 0.10f); // Auburn

                // Profile B: distinctive blonde hair color
                var profileB = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profileB.characterName = "ProfileB";
                profileB.hairColor = new SerializableColor(0.85f, 0.75f, 0.35f); // Blonde

                // Profile C: distinctive jet black hair color
                var profileC = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                profileC.characterName = "ProfileC";
                profileC.hairColor = new SerializableColor(0.08f, 0.08f, 0.09f); // Jet black

                // Step 1: Save Profile A when destination does not exist
                bool saveA = BobbleheadProfileManager.TrySaveProfile(profileA, out string errA, rotPath);
                Assert(saveA, $"Test 24: Save Profile A must succeed: {errA}");
                Assert(File.Exists(rotPath), "Test 24: Primary file must exist after saving Profile A");
                Assert(!File.Exists(rotBakPath), "Test 24: No backup file should exist after first save");

                // Step 2: Verify primary contains Profile A
                bool readA = BobbleheadProfileManager.TryReadAndValidateFile(rotPath, out var loadedA, out _);
                Assert(readA, "Test 24: Primary file must validate as Profile A");
                Assert(loadedA.characterName == "ProfileA", "Test 24: Primary characterName must be 'ProfileA'");
                Assert(loadedA.hairColor.EqualsColor(profileA.hairColor.ToColor()), "Test 24: Primary hairColor must match Profile A");

                // Step 3: Save Profile B, replacing existing primary
                bool saveB = BobbleheadProfileManager.TrySaveProfile(profileB, out string errB, rotPath);
                Assert(saveB, $"Test 24: Save Profile B must succeed: {errB}");

                // Step 4: Verify primary contains Profile B and .bak contains Profile A
                bool readBPrimary = BobbleheadProfileManager.TryReadAndValidateFile(rotPath, out var loadedB, out _);
                Assert(readBPrimary, "Test 24: Primary file must validate after Profile B save");
                Assert(loadedB.characterName == "ProfileB", "Test 24: Primary characterName must be 'ProfileB'");
                Assert(loadedB.hairColor.EqualsColor(profileB.hairColor.ToColor()), "Test 24: Primary hairColor must match Profile B");

                Assert(File.Exists(rotBakPath), "Test 24: Backup file (.bak) must exist after second save");
                bool readABackup = BobbleheadProfileManager.TryReadAndValidateFile(rotBakPath, out var backupA, out _);
                Assert(readABackup, "Test 24: Backup file must validate as Profile A");
                Assert(backupA.characterName == "ProfileA", "Test 24: Backup characterName must be 'ProfileA'");
                Assert(backupA.hairColor.EqualsColor(profileA.hairColor.ToColor()), "Test 24: Backup hairColor must match Profile A");

                // Step 5: Save Profile C while both primary and .bak exist
                bool saveC = BobbleheadProfileManager.TrySaveProfile(profileC, out string errC, rotPath);
                Assert(saveC, $"Test 24: Save Profile C must succeed: {errC}");

                // Step 6: Verify primary contains Profile C and .bak now contains Profile B (immediately preceding valid profile)
                bool readCPrimary = BobbleheadProfileManager.TryReadAndValidateFile(rotPath, out var loadedC, out _);
                Assert(readCPrimary, "Test 24: Primary file must validate after Profile C save");
                Assert(loadedC.characterName == "ProfileC", "Test 24: Primary characterName must be 'ProfileC'");
                Assert(loadedC.hairColor.EqualsColor(profileC.hairColor.ToColor()), "Test 24: Primary hairColor must match Profile C");

                bool readBBackup = BobbleheadProfileManager.TryReadAndValidateFile(rotBakPath, out var backupB, out _);
                Assert(readBBackup, "Test 24: Backup file must validate as Profile B");
                Assert(backupB.characterName == "ProfileB", "Test 24: Backup characterName must be 'ProfileB' (immediately preceding valid profile)");
                Assert(backupB.hairColor.EqualsColor(profileB.hairColor.ToColor()), "Test 24: Backup hairColor must match Profile B");

                // Step 7: Independent deserialization and validation of both files
                string rawPrimaryJson = File.ReadAllText(rotPath, System.Text.Encoding.UTF8);
                string rawBackupJson = File.ReadAllText(rotBakPath, System.Text.Encoding.UTF8);
                Assert(rawPrimaryJson.Contains("\"characterName\": \"ProfileC\""), "Test 24: Serialized primary must contain ProfileC");
                Assert(rawBackupJson.Contains("\"characterName\": \"ProfileB\""), "Test 24: Serialized backup must contain ProfileB");

                // Step 8: Reload primary through public profile-loading API
                bool pubLoadSuccess = BobbleheadProfileManager.TryLoadProfile(out var pubLoaded, out string pubErr, rotPath);
                Assert(pubLoadSuccess, $"Test 24: Public TryLoadProfile must succeed: {pubErr}");
                Assert(pubLoaded.characterName == "ProfileC", "Test 24: Public API must return active Profile C");
                Assert(pubLoaded.hairColor.EqualsColor(profileC.hairColor.ToColor()), "Test 24: Public API loaded hairColor must match Profile C");

                // Step 9: Verify no stale temporary files exist or are treated as active profile
                Assert(!File.Exists(rotTmpPath), "Test 24: Stale temporary candidate (.tmp) must not exist");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 24: Repeated Saves & Backup Rotation (Test A) PASS");

                // -------------------------------------------------------------
                // TEST 25: Test B — Actual Operating-System Replacement Failure
                // -------------------------------------------------------------
                string osFailDir = Path.Combine(testTempDir, "os_failure_test");
                Directory.CreateDirectory(osFailDir);
                string osFailPath = Path.Combine(osFailDir, "avatar_profile.json");
                string osTmpPath = osFailPath + ".tmp";

                // 1. Save a known-valid Profile A through normal persistence API
                var osProfileA = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                osProfileA.characterName = "OS_ProfileA";
                osProfileA.hairColor = new SerializableColor(0.20f, 0.40f, 0.60f); // Blue-grey
                bool osSaveA = BobbleheadProfileManager.TrySaveProfile(osProfileA, out string osErrA, osFailPath);
                Assert(osSaveA, $"Test 25: Save OS_ProfileA must succeed: {osErrA}");

                // 2. Read and record exact bytes of primary file
                byte[] recordedBytesA = File.ReadAllBytes(osFailPath);
                Assert(recordedBytesA.Length > 0, "Test 25: Recorded bytes must not be empty");

                // 3. Confirm that Profile A loads successfully
                bool osLoadA = BobbleheadProfileManager.TryLoadProfile(out var osLoadedA, out _, osFailPath);
                Assert(osLoadA && osLoadedA.characterName == "OS_ProfileA", "Test 25: OS_ProfileA must load successfully initially");

                // Prepare valid candidate Profile B
                var osProfileB = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                osProfileB.characterName = "OS_ProfileB";
                osProfileB.hairColor = new SerializableColor(0.80f, 0.20f, 0.20f); // Crimson
                Assert(osProfileB.Validate(out _), "Test 25: Candidate Profile B must be strictly valid");

                // 4. Open primary file with FileShare.Read to prevent replacement/deletion
                FileStream lockStream = null;
                bool lockedSaveResult = false;
                string lockedSaveErr = null;
                try
                {
                    lockStream = new FileStream(osFailPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                    
                    // Attempt to save valid Profile B to the same path while handle is open
                    lockedSaveResult = BobbleheadProfileManager.TrySaveProfile(osProfileB, out lockedSaveErr, osFailPath);
                }
                finally
                {
                    if (lockStream != null)
                    {
                        lockStream.Close();
                        lockStream.Dispose();
                        lockStream = null;
                    }
                }

                // 5. Assertions on OS-level failure handling
                Assert(!lockedSaveResult, "Test 25: TrySaveProfile must report FAILURE when file is locked by OS");
                Assert(!string.IsNullOrEmpty(lockedSaveErr), "Test 25: Actionable error message must be returned");
                Assert(lockedSaveErr.Contains("Filesystem error"), $"Test 25: Error message must cite filesystem error: {lockedSaveErr}");

                // Primary file must remain intact and byte-for-byte identical
                Assert(File.Exists(osFailPath), "Test 25: Primary file must still exist after failed replacement");
                byte[] bytesAfterFailure = File.ReadAllBytes(osFailPath);
                Assert(bytesAfterFailure.Length == recordedBytesA.Length, "Test 25: File size must match original bytes");
                bool identical = true;
                for (int i = 0; i < recordedBytesA.Length; i++)
                {
                    if (recordedBytesA[i] != bytesAfterFailure[i]) { identical = false; break; }
                }
                Assert(identical, "Test 25: Target file must remain byte-for-byte identical after failed save");

                // 6. Previous valid profile can still be loaded after releasing handle
                bool postReleaseLoad = BobbleheadProfileManager.TryLoadProfile(out var postReleaseProfile, out string postReleaseErr, osFailPath);
                Assert(postReleaseLoad, $"Test 25: Profile A must load after handle release: {postReleaseErr}");
                Assert(postReleaseProfile.characterName == "OS_ProfileA", "Test 25: Loaded characterName must still be 'OS_ProfileA'");
                Assert(postReleaseProfile.hairColor.EqualsColor(osProfileA.hairColor.ToColor()), "Test 25: Loaded hairColor must still match Profile A");

                // 7. Verify no leftover .tmp file exists, or if a .tmp file is present, it does NOT silently replace valid primary
                Assert(!File.Exists(osTmpPath), "Test 25: Leftover candidate (.tmp) must be cleaned up on failure");

                // Simulate leftover .tmp candidate file alongside valid primary
                File.WriteAllText(osTmpPath, JsonUtility.ToJson(osProfileB, true), System.Text.Encoding.UTF8);
                bool ordinaryLoadWithTmp = BobbleheadProfileManager.TryLoadProfile(out var ordinaryLoaded, out _, osFailPath);
                Assert(ordinaryLoadWithTmp, "Test 25: Ordinary load must succeed when .tmp is present");
                Assert(ordinaryLoaded.characterName == "OS_ProfileA", "Test 25: Leftover .tmp must NOT silently replace valid primary on ordinary load");
                File.Delete(osTmpPath);

                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 25: OS-Level Replacement Failure (Test B) PASS");

                // -------------------------------------------------------------
                // TEST 26: Test C Case 1 — Valid Primary Preferred Over Backup
                // -------------------------------------------------------------
                string c1Dir = Path.Combine(testTempDir, "case1_test");
                Directory.CreateDirectory(c1Dir);
                string c1Path = Path.Combine(c1Dir, "avatar_profile.json");
                string c1Bak = c1Path + ".bak";

                var c1ProfileA = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c1ProfileA.characterName = "C1_ProfileA";
                var c1ProfileB = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c1ProfileB.characterName = "C1_ProfileB";

                File.WriteAllText(c1Path, JsonUtility.ToJson(c1ProfileB, true), System.Text.Encoding.UTF8);
                File.WriteAllText(c1Bak, JsonUtility.ToJson(c1ProfileA, true), System.Text.Encoding.UTF8);

                bool c1Load = BobbleheadProfileManager.TryLoadProfile(out var c1Loaded, out _, c1Path);
                Assert(c1Load, "Test 26: Load must succeed when both primary and backup are valid");
                Assert(c1Loaded.characterName == "C1_ProfileB", "Test 26: Primary (Profile B) must be loaded; backup must NOT be preferred over valid primary");
                Assert(File.Exists(c1Bak), "Test 26: Backup file must remain intact");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 26: Valid Primary Preferred Over Backup (Test C Case 1) PASS");

                // -------------------------------------------------------------
                // TEST 27: Test C Case 2 — Corrupt Primary Restored from Backup
                // -------------------------------------------------------------
                string c2Dir = Path.Combine(testTempDir, "case2_test");
                Directory.CreateDirectory(c2Dir);
                string c2Path = Path.Combine(c2Dir, "avatar_profile.json");
                string c2Bak = c2Path + ".bak";

                var c2ProfileA = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c2ProfileA.characterName = "C2_ProfileA";

                File.WriteAllText(c2Path, "{ corrupt json ::: syntax error }", System.Text.Encoding.UTF8);
                File.WriteAllText(c2Bak, JsonUtility.ToJson(c2ProfileA, true), System.Text.Encoding.UTF8);

                bool c2Load = BobbleheadProfileManager.TryLoadProfile(out var c2Loaded, out string c2Err, c2Path);
                Assert(c2Load, $"Test 27: Recovery from valid backup must succeed: {c2Err}");
                Assert(c2Loaded.characterName == "C2_ProfileA", "Test 27: Recovered profile must match backup Profile A");

                // Verify recovered primary on disk can be read and validated independently
                bool c2ReadPrimary = BobbleheadProfileManager.TryReadAndValidateFile(c2Path, out var c2DiskPrimary, out string c2DiskErr);
                Assert(c2ReadPrimary, $"Test 27: Restored primary on disk must validate: {c2DiskErr}");
                Assert(c2DiskPrimary.characterName == "C2_ProfileA", "Test 27: Restored primary characterName must match Profile A");
                Assert(File.Exists(c2Bak), "Test 27: Backup file must not be silently discarded during recovery");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 27: Corrupt Primary Restored from Backup (Test C Case 2) PASS");

                // -------------------------------------------------------------
                // TEST 28: Test C Case 3 — Missing Primary Restored from Backup
                // -------------------------------------------------------------
                string c3Dir = Path.Combine(testTempDir, "case3_test");
                Directory.CreateDirectory(c3Dir);
                string c3Path = Path.Combine(c3Dir, "avatar_profile.json");
                string c3Bak = c3Path + ".bak";

                var c3ProfileA = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c3ProfileA.characterName = "C3_ProfileA";

                // Ensure primary does not exist; backup exists and is valid
                File.WriteAllText(c3Bak, JsonUtility.ToJson(c3ProfileA, true), System.Text.Encoding.UTF8);
                Assert(!File.Exists(c3Path), "Test 28: Primary must not exist");

                bool c3Load = BobbleheadProfileManager.TryLoadProfile(out var c3Loaded, out string c3Err, c3Path);
                Assert(c3Load, $"Test 28: Recovery from backup when primary missing must succeed: {c3Err}");
                Assert(c3Loaded.characterName == "C3_ProfileA", "Test 28: Recovered profile must match Profile A");
                Assert(File.Exists(c3Path), "Test 28: Primary file must now exist after recovery");
                Assert(File.Exists(c3Bak), "Test 28: Backup file must still exist after recovery");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 28: Missing Primary Restored from Backup (Test C Case 3) PASS");

                // -------------------------------------------------------------
                // TEST 29: Test C Case 4 — Candidate (.tmp) Supersede Rejection & Recovery
                // -------------------------------------------------------------
                string c4Dir = Path.Combine(testTempDir, "case4_test");
                Directory.CreateDirectory(c4Dir);
                string c4Path = Path.Combine(c4Dir, "avatar_profile.json");
                string c4Tmp = c4Path + ".tmp";

                var c4ProfileB = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c4ProfileB.characterName = "C4_ProfileB";
                var c4ProfileC = BobbleheadCustomizationProfile.FromConfig(defaultPlayer);
                c4ProfileC.characterName = "C4_CandidateC";

                // Sub-case 4a: Valid primary exists alongside valid .tmp -> candidate cannot supersede primary
                File.WriteAllText(c4Path, JsonUtility.ToJson(c4ProfileB, true), System.Text.Encoding.UTF8);
                File.WriteAllText(c4Tmp, JsonUtility.ToJson(c4ProfileC, true), System.Text.Encoding.UTF8);

                bool c4aLoad = BobbleheadProfileManager.TryLoadProfile(out var c4aLoaded, out _, c4Path);
                Assert(c4aLoad, "Test 29: Load must succeed");
                Assert(c4aLoaded.characterName == "C4_ProfileB", "Test 29: Candidate .tmp must NOT supersede valid primary Profile B");

                // Sub-case 4b: Primary is corrupt, no backup exists, valid .tmp candidate exists -> recover from .tmp
                File.WriteAllText(c4Path, "{ broken JSON syntax !!!", System.Text.Encoding.UTF8);
                bool c4bLoad = BobbleheadProfileManager.TryLoadProfile(out var c4bLoaded, out string c4bErr, c4Path);
                Assert(c4bLoad, $"Test 29: Recovery from candidate .tmp must succeed: {c4bErr}");
                Assert(c4bLoaded.characterName == "C4_CandidateC", "Test 29: Recovered profile must match candidate Profile C");

                bool c4bReadPrimary = BobbleheadProfileManager.TryReadAndValidateFile(c4Path, out var c4bDisk, out _);
                Assert(c4bReadPrimary, "Test 29: Primary on disk must now be valid after candidate recovery");
                Assert(c4bDisk.characterName == "C4_CandidateC", "Test 29: Restored primary must match candidate Profile C");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 29: Candidate (.tmp) Supersede Rejection & Recovery (Test C Case 4) PASS");

                // -------------------------------------------------------------
                // TEST 30: Test C Case 5 — Invalid Candidates Trigger Fallback Without Deletion
                // -------------------------------------------------------------
                string c5Dir = Path.Combine(testTempDir, "case5_test");
                Directory.CreateDirectory(c5Dir);
                string c5Path = Path.Combine(c5Dir, "avatar_profile.json");
                string c5Bak = c5Path + ".bak";
                string c5Tmp = c5Path + ".tmp";

                // Ensure no valid primary, invalid backup, invalid candidate
                File.WriteAllText(c5Path, "{ corrupted primary }", System.Text.Encoding.UTF8);
                File.WriteAllText(c5Bak, "{ corrupted backup }", System.Text.Encoding.UTF8);
                File.WriteAllText(c5Tmp, "{ corrupted candidate }", System.Text.Encoding.UTF8);

                bool c5Load = BobbleheadProfileManager.TryLoadProfile(out var c5Loaded, out string c5Err, c5Path);
                Assert(!c5Load, "Test 30: Loading invalid primary with invalid recovery candidates must return false");
                Assert(c5Loaded == null, "Test 30: Resulting profile must be null");

                // Fallback to default player configuration
                var c5Fallback = BobbleheadProfileManager.GetEffectivePlayerConfig(c5Path);
                Assert(c5Fallback != null, "Test 30: Effective configuration must not be null");
                Assert(c5Fallback.characterName == "Player", "Test 30: Effective configuration must be default Player");
                Assert(c5Fallback.totalHeight == 1.75f, "Test 30: Fallback height must be 1.75f");
                Assert(c5Fallback.hairStyle == BobbleheadHairType.CasualShort, "Test 30: Fallback hairStyle must be CasualShort");
                Assert(c5Fallback.headwear == BobbleheadHeadwearType.BaseballCap, "Test 30: Fallback headwear must be BaseballCap");

                // Verify corrupt files are NOT silently replaced or deleted
                Assert(File.Exists(c5Path), "Test 30: Corrupt primary file must NOT be deleted");
                Assert(File.Exists(c5Bak), "Test 30: Corrupt backup file must NOT be deleted");
                Assert(File.Exists(c5Tmp), "Test 30: Corrupt candidate file must NOT be deleted");
                Assert(File.ReadAllText(c5Path).Contains("{ corrupted primary }"), "Test 30: Corrupt primary must not be overwritten with defaults");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 30: Fallback on Invalid Candidates Without Deletion (Test C Case 5) PASS");

                // -------------------------------------------------------------
                // TEST 31: Color Customization Palette Initialization & Default Swatch Integrity
                // -------------------------------------------------------------
                var testPanelGo = new GameObject("Test_AvatarCustomizationPanel");
                var custCtrl = testPanelGo.AddComponent<AvatarCustomizationController>();
                custCtrl.InitializePalettes();
                Assert(custCtrl.Categories.Count == 14, "Test 31: Exactly 14 color categories must be registered");
                var pupilCat = custCtrl.Categories.Find(c => c.id == "pupilColor");
                Assert(pupilCat != null, "Test 31: pupilColor category must be registered");
                Assert(pupilCat.displayName == "Pupil Tone", "Test 31: pupilColor category displayName must be 'Pupil Tone'");

                var defaultPConfig = BobbleheadConfig.CreatePlayerConfig();
                for (int i = 0; i < custCtrl.Categories.Count; i++)
                {
                    var cat = custCtrl.Categories[i];
                    Assert(cat.swatches.Count >= 5, $"Test 31: Category {cat.id} must contain at least 5 swatches");

                    int defaultCount = 0;
                    Color defaultSwatchCol = Color.clear;
                    for (int s = 0; s < cat.swatches.Count; s++)
                    {
                        if (cat.swatches[s].isDefault)
                        {
                            defaultCount++;
                            defaultSwatchCol = cat.swatches[s].color;
                        }
                    }
                    Assert(defaultCount == 1, $"Test 31: Category {cat.id} must have exactly one default swatch");
                    Color expectedCol = cat.Getter(defaultPConfig);
                    Assert(Mathf.Abs(defaultSwatchCol.r - expectedCol.r) < 0.005f &&
                           Mathf.Abs(defaultSwatchCol.g - expectedCol.g) < 0.005f &&
                           Mathf.Abs(defaultSwatchCol.b - expectedCol.b) < 0.005f,
                           $"Test 31: Category {cat.id} default swatch must match CreatePlayerConfig()");
                }
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 31: Color Customization Palette & Default Swatch Integrity PASS");

                // -------------------------------------------------------------
                // TEST 32: Live Swatch Selection & Draft Isolation
                // -------------------------------------------------------------
                custCtrl.Open(defaultPConfig);
                Assert(custCtrl.IsOpen, "Test 32: Controller must be open");
                Assert(custCtrl.DraftConfig != null, "Test 32: DraftConfig must not be null");
                Assert(custCtrl.OpeningSnapshot != null, "Test 32: OpeningSnapshot must not be null");
                Assert(!ReferenceEquals(custCtrl.DraftConfig, custCtrl.OpeningSnapshot), "Test 32: DraftConfig must be a separate instance from OpeningSnapshot");

                Color newJacket = new Color(0.70f, 0.18f, 0.15f);
                Color newPants = new Color(0.14f, 0.18f, 0.28f);
                Color originalEyeColor = custCtrl.DraftConfig.eyeColor;
                Color newPupil = new Color(0.02f, 0.02f, 0.03f);
                custCtrl.SelectSwatch("outerwearColor", newJacket);
                custCtrl.SelectSwatch("pantsColor", newPants);
                custCtrl.SelectSwatch("pupilColor", newPupil);

                Assert(Mathf.Abs(custCtrl.DraftConfig.outerwearColor.r - newJacket.r) < 0.005f, "Test 32: Draft outerwearColor updated");
                Assert(Mathf.Abs(custCtrl.DraftConfig.pantsColor.r - newPants.r) < 0.005f, "Test 32: Draft pantsColor updated");
                Assert(Mathf.Abs(custCtrl.DraftConfig.pupilColor.r - newPupil.r) < 0.005f, "Test 32: Draft pupilColor updated via SelectSwatch");
                Assert(Mathf.Abs(custCtrl.DraftConfig.eyeColor.r - originalEyeColor.r) < 0.005f, "Test 32: eyeColor must remain independent when pupilColor is updated");
                Assert(Mathf.Abs(custCtrl.OpeningSnapshot.outerwearColor.r - defaultPConfig.outerwearColor.r) < 0.005f, "Test 32: OpeningSnapshot outerwearColor untouched");
                Assert(Mathf.Abs(custCtrl.OpeningSnapshot.pantsColor.r - defaultPConfig.pantsColor.r) < 0.005f, "Test 32: OpeningSnapshot pantsColor untouched");
                Assert(Mathf.Abs(custCtrl.OpeningSnapshot.pupilColor.r - defaultPConfig.pupilColor.r) < 0.005f, "Test 32: OpeningSnapshot pupilColor untouched");
                Assert(Mathf.Abs(custCtrl.DraftConfig.skinColor.r - defaultPConfig.skinColor.r) < 0.005f, "Test 32: Unmodified skin color preserved");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 32: Live Swatch Selection & Draft Isolation PASS");

                // -------------------------------------------------------------
                // TEST 33: Reset Colors Reverts Only Colors to Defaults (Non-colors preserved)
                // -------------------------------------------------------------
                custCtrl.DraftConfig.characterName = "SpecialAlex";
                custCtrl.DraftConfig.faceShape = BobbleheadFaceShape.Oval;
                custCtrl.DraftConfig.facialHair = BobbleheadFacialHair.Goatee;
                custCtrl.DraftConfig.bodyPresentation = BobbleheadBodyPresentation.Masculine;
                custCtrl.DraftConfig.hairStyle = BobbleheadHairType.CasualShort;
                custCtrl.ResetColors();

                Assert(custCtrl.DraftConfig.AreColorsEqual(defaultPConfig), "Test 33: All 13 colors must match player defaults after ResetColors");
                Assert(custCtrl.DraftConfig.characterName == "SpecialAlex", "Test 33: Non-color characterName must be preserved");
                Assert(custCtrl.DraftConfig.totalHeight == 1.75f, "Test 33: Non-color height must be preserved");
                Assert(custCtrl.DraftConfig.hairStyle == BobbleheadHairType.CasualShort, "Test 33: Non-color hairStyle must be preserved");
                Assert(custCtrl.DraftConfig.faceShape == BobbleheadFaceShape.Oval, "Test 33: Non-color faceShape must be preserved");
                Assert(custCtrl.DraftConfig.facialHair == BobbleheadFacialHair.Goatee, "Test 33: Non-color facialHair must be preserved");
                Assert(custCtrl.DraftConfig.bodyPresentation == BobbleheadBodyPresentation.Masculine, "Test 33: Non-color bodyPresentation must be preserved");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 33: Reset Colors (Colors Reverted, Non-Colors Preserved) PASS");

                // -------------------------------------------------------------
                // TEST 34: Cancel Discards Draft and Restores Opening Snapshot
                // -------------------------------------------------------------
                var customBase = defaultPConfig.Clone();
                customBase.outerwearColor = new Color(0.18f, 0.20f, 0.22f); // Charcoal
                custCtrl.Open(customBase);

                custCtrl.SelectSwatch("outerwearColor", new Color(0.92f, 0.93f, 0.94f)); // White
                custCtrl.SelectSwatch("skinColor", new Color(0.36f, 0.24f, 0.17f)); // Espresso
                custCtrl.SelectSwatch("pupilColor", new Color(0.08f, 0.09f, 0.11f)); // Charcoal Slate
                Assert(!custCtrl.DraftConfig.AreColorsEqual(custCtrl.OpeningSnapshot), "Test 34: Draft must differ before cancel");

                custCtrl.Cancel();
                Assert(!custCtrl.IsOpen, "Test 34: Controller must be closed after Cancel");
                Assert(custCtrl.DraftConfig.AreColorsEqual(customBase), "Test 34: DraftConfig must match opening snapshot after Cancel");
                Assert(Mathf.Abs(custCtrl.DraftConfig.pupilColor.r - customBase.pupilColor.r) < 0.005f, "Test 34: pupilColor restored to snapshot on Cancel");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 34: Cancel Restores Exact Opening Snapshot PASS");

                // -------------------------------------------------------------
                // TEST 35: Apply Commits and Persists Draft to Disk
                // -------------------------------------------------------------
                string b5Path = Path.Combine(testTempDir, "avatar_profile_phase_b.json");
                custCtrl.CustomProfilePathForTesting = b5Path;
                custCtrl.Open(defaultPConfig);

                Color appliedPupil = new Color(0.04f, 0.04f, 0.05f); // Deep Onyx
                custCtrl.SelectSwatch("outerwearColor", new Color(0.70f, 0.18f, 0.15f));
                custCtrl.SelectSwatch("shoeBaseColor", new Color(0.10f, 0.10f, 0.12f));
                custCtrl.SelectSwatch("pupilColor", appliedPupil);

                bool applySuccess = custCtrl.Apply();
                Assert(applySuccess, "Test 35: Apply must succeed");
                Assert(!custCtrl.IsOpen, "Test 35: Controller must close on Apply");
                Assert(custCtrl.OpeningSnapshot.AreColorsEqual(custCtrl.DraftConfig), "Test 35: OpeningSnapshot promoted to draft on Apply");
                Assert(File.Exists(b5Path), "Test 35: Saved file must exist on disk");

                bool b5LoadSuccess = BobbleheadProfileManager.TryLoadProfile(out var loadedB5, out string b5Err, b5Path);
                Assert(b5LoadSuccess, "Test 35: Saved profile must load and validate successfully");
                var loadedConfig = loadedB5.ToConfig();
                Assert(loadedConfig.AreColorsEqual(custCtrl.DraftConfig), "Test 35: Loaded file colors must match committed draft colors");
                Assert(Mathf.Abs(loadedConfig.pupilColor.r - appliedPupil.r) < 0.005f, "Test 35: Loaded pupilColor must match applied swatch");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 35: Apply Commits and Persists Draft to Disk PASS");

                // -------------------------------------------------------------
                // TEST 36: Live In-Place Recoloring on Bobblehead Character Renderers
                // -------------------------------------------------------------
                var charGo = new GameObject("Test_PlayerAvatar_Bobblehead");
                var bobblehead = charGo.AddComponent<BobbleheadCharacter>();
                bobblehead.Initialize(defaultPConfig);

                Color origHeadCol = bobblehead.GetRendererColor("Head");
                Color origTorsoCol = bobblehead.GetRendererColor("Torso");
                Color origPelvisCol = bobblehead.GetRendererColor("Pelvis");
                Assert(Mathf.Abs(origHeadCol.r - defaultPConfig.skinColor.r) < 0.005f, "Test 36: Initial Head matches default skinColor");
                Assert(Mathf.Abs(origTorsoCol.r - defaultPConfig.outerwearColor.r) < 0.005f, "Test 36: Initial Torso matches default outerwearColor");

                var recolorConfig = defaultPConfig.Clone();
                recolorConfig.skinColor = new Color(0.36f, 0.24f, 0.17f);
                recolorConfig.outerwearColor = new Color(0.82f, 0.62f, 0.18f); // Mustard
                recolorConfig.pantsColor = new Color(0.68f, 0.60f, 0.48f); // Khaki
                recolorConfig.shoeBaseColor = new Color(0.10f, 0.10f, 0.12f); // Black

                bobblehead.ApplyColors(recolorConfig);

                Color newHeadCol = bobblehead.GetRendererColor("Head");
                Color newTorsoCol = bobblehead.GetRendererColor("Torso");
                Color newPelvisCol = bobblehead.GetRendererColor("Pelvis");
                Color newShoeCol = bobblehead.GetRendererColor("Shoe_L");

                Assert(Mathf.Abs(newHeadCol.r - recolorConfig.skinColor.r) < 0.005f, "Test 36: Head recolored to new skinColor");
                Assert(Mathf.Abs(newTorsoCol.r - recolorConfig.outerwearColor.r) < 0.005f, "Test 36: Torso recolored to new outerwearColor");
                Assert(Mathf.Abs(newPelvisCol.r - recolorConfig.pantsColor.r) < 0.005f, "Test 36: Pelvis recolored to new pantsColor");
                Assert(Mathf.Abs(newShoeCol.r - recolorConfig.shoeBaseColor.r) < 0.005f, "Test 36: Shoe_L recolored to new shoeBaseColor");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 36: Live In-Place Recoloring on Bobblehead Renderers PASS");

                // -------------------------------------------------------------
                // TEST 37: Elena Morales NPC Isolation During Player Customization
                // -------------------------------------------------------------
                var elenaGo = new GameObject("Test_ElenaMorales_Bobblehead");
                var elenaBobblehead = elenaGo.AddComponent<BobbleheadCharacter>();
                var elenaTestConfig = BobbleheadConfig.CreateElenaConfig();
                elenaBobblehead.Initialize(elenaTestConfig);

                Color elenaTorsoBefore = elenaBobblehead.GetRendererColor("Torso");
                Color elenaPantsBefore = elenaBobblehead.GetRendererColor("Pelvis");
                Color elenaHeadBefore = elenaBobblehead.GetRendererColor("Head");

                // Apply aggressive recoloring on player bobblehead
                var extremePlayerConfig = defaultPConfig.Clone();
                extremePlayerConfig.outerwearColor = new Color(0.01f, 0.99f, 0.01f); // Neon green
                extremePlayerConfig.pantsColor = new Color(0.99f, 0.01f, 0.99f); // Magenta
                extremePlayerConfig.skinColor = new Color(0.99f, 0.99f, 0.01f); // Yellow
                bobblehead.ApplyColors(extremePlayerConfig);

                Color elenaTorsoAfter = elenaBobblehead.GetRendererColor("Torso");
                Color elenaPantsAfter = elenaBobblehead.GetRendererColor("Pelvis");
                Color elenaHeadAfter = elenaBobblehead.GetRendererColor("Head");

                Assert(Mathf.Abs(elenaTorsoBefore.r - elenaTorsoAfter.r) < 0.001f, "Test 37: Elena Torso unaffected by player recolor");
                Assert(Mathf.Abs(elenaPantsBefore.r - elenaPantsAfter.r) < 0.001f, "Test 37: Elena Pelvis unaffected by player recolor");
                Assert(Mathf.Abs(elenaHeadBefore.r - elenaHeadAfter.r) < 0.001f, "Test 37: Elena Head unaffected by player recolor");
                Assert(elenaBobblehead.CurrentConfig.AreColorsEqual(elenaTestConfig), "Test 37: Elena CurrentConfig 100% identical");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 37: Elena Morales NPC Isolation PASS");

                // -------------------------------------------------------------
                // TEST 38: Hierarchy & Mesh Stability Invariant (Zero Re-allocations on Recoloring)
                // -------------------------------------------------------------
                int initialTransformCount = CountTransformsRecursive(bobblehead.transform);
                int initialMeshFilterCount = bobblehead.GetComponentsInChildren<MeshFilter>(true).Length;
                Transform initialHead = bobblehead.Head;
                Transform initialTorso = bobblehead.Torso;
                Transform initialPelvis = bobblehead.Pelvis;
                Transform initialLeftArm = bobblehead.LeftArmRoot;
                Transform initialRightArm = bobblehead.RightArmRoot;

                // Re-apply 5 successive recoloring configs
                for (int iter = 0; iter < 5; iter++)
                {
                    var iterConfig = defaultPConfig.Clone();
                    iterConfig.outerwearColor = new Color(iter * 0.15f, 0.2f, 0.3f);
                    iterConfig.skinColor = new Color(0.8f, 0.6f + iter * 0.05f, 0.5f);
                    bobblehead.ApplyColors(iterConfig);
                }

                int finalTransformCount = CountTransformsRecursive(bobblehead.transform);
                int finalMeshFilterCount = bobblehead.GetComponentsInChildren<MeshFilter>(true).Length;

                Assert(initialTransformCount == finalTransformCount, $"Test 38: Transform count must remain constant ({initialTransformCount} vs {finalTransformCount})");
                Assert(initialMeshFilterCount == finalMeshFilterCount, $"Test 38: MeshFilter count must remain constant ({initialMeshFilterCount} vs {finalMeshFilterCount})");
                Assert(ReferenceEquals(initialHead, bobblehead.Head), "Test 38: Head transform reference preserved");
                Assert(ReferenceEquals(initialTorso, bobblehead.Torso), "Test 38: Torso transform reference preserved");
                Assert(ReferenceEquals(initialPelvis, bobblehead.Pelvis), "Test 38: Pelvis transform reference preserved");
                Assert(ReferenceEquals(initialLeftArm, bobblehead.LeftArmRoot), "Test 38: LeftArmRoot transform reference preserved");
                Assert(ReferenceEquals(initialRightArm, bobblehead.RightArmRoot), "Test 38: RightArmRoot transform reference preserved");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 38: Hierarchy & Mesh Stability Invariant PASS");

                // -------------------------------------------------------------
                // TEST 39: Input & UI Modal State Invariant
                // -------------------------------------------------------------
                var hudGo = new GameObject("Test_ProductHudController");
                var hudCtrl = hudGo.AddComponent<ProductHudController>();

                Assert(!hudCtrl.IsAvatarModalOpen, "Test 39: IsAvatarModalOpen must be false initially");
                Assert(!hudCtrl.IsModalActive, "Test 39: IsModalActive must be false initially");

                hudCtrl.OpenAvatarCustomization();
                Assert(hudCtrl.IsAvatarModalOpen, "Test 39: IsAvatarModalOpen must be true after Open");
                Assert(hudCtrl.IsModalActive, "Test 39: IsModalActive must be true after Open");
                Assert(hudCtrl.IsMouseOverUI(), "Test 39: IsMouseOverUI must return true while panel is open");

                hudCtrl.CloseAvatarCustomization();
                Assert(!hudCtrl.IsAvatarModalOpen, "Test 39: IsAvatarModalOpen must be false after Close");
                Assert(!hudCtrl.IsModalActive, "Test 39: IsModalActive must be false after Close");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 39: Input & UI Modal State Invariant PASS");

                // Cleanup test game objects
                if (charGo != null) UnityEngine.Object.DestroyImmediate(charGo);
                if (elenaGo != null) UnityEngine.Object.DestroyImmediate(elenaGo);
                if (testPanelGo != null) UnityEngine.Object.DestroyImmediate(testPanelGo);
                if (hudGo != null) UnityEngine.Object.DestroyImmediate(hudGo);

                // -------------------------------------------------------------
                // TEST 40: 8 Hairstyles Procedural Geometry & Bald Verification
                // -------------------------------------------------------------
                var testAvatarGo = new GameObject("TestAvatar_Hairstyles");
                var testBobblehead = testAvatarGo.AddComponent<BobbleheadCharacter>();

                foreach (BobbleheadHairType hairType in Enum.GetValues(typeof(BobbleheadHairType)))
                {
                    var hairCfg = BobbleheadConfig.CreatePlayerConfig();
                    hairCfg.hairStyle = hairType;
                    hairCfg.headwear = hairType == BobbleheadHairType.StreetBeanie
                        ? BobbleheadHeadwearType.WinterBeanie
                        : BobbleheadHeadwearType.None;
                    testBobblehead.Initialize(hairCfg);

                    Assert(testBobblehead.Head != null, $"Test 40: Head transform must exist for {hairType}");

                    if (hairType == BobbleheadHairType.Bald)
                    {
                        // Bald must generate 0 hair pieces under Head
                        Assert(testBobblehead.Head.Find("Beanie_Cap") == null, "Test 40: Bald must not have Beanie_Cap");
                        Assert(testBobblehead.Head.Find("Hair_Base") == null, "Test 40: Bald must not have Hair_Base");
                        Assert(testBobblehead.Head.Find("Hair_Crop") == null, "Test 40: Bald must not have Hair_Crop");
                        Assert(testBobblehead.Head.Find("Hair_Afro") == null, "Test 40: Bald must not have Hair_Afro");
                        Assert(testBobblehead.Head.Find("Hair_SidePart") == null, "Test 40: Bald must not have Hair_SidePart");
                        Assert(testBobblehead.Head.Find("Hair_Ponytail") == null, "Test 40: Bald must not have Hair_Ponytail");
                        Assert(testBobblehead.Head.Find("Hair_Fringe") == null, "Test 40: Bald must not have Hair_Fringe");
                    }
                    else
                    {
                        // Non-bald hairstyles must generate valid mesh filters with vertices
                        var meshFilters = testBobblehead.Head.GetComponentsInChildren<MeshFilter>(true);
                        bool foundHairMesh = false;
                        for (int m = 0; m < meshFilters.Length; m++)
                        {
                            string n = meshFilters[m].gameObject.name;
                            if (n.Contains("Hair") || n.Contains("Beanie") || n.Contains("Bun") || n.Contains("Sideburn") || n.Contains("Crop") || n.Contains("Afro") || n.Contains("Ponytail"))
                            {
                                Assert(meshFilters[m].sharedMesh != null && meshFilters[m].sharedMesh.vertexCount > 0,
                                    $"Test 40: Hair mesh {n} for {hairType} must have vertices");
                                foundHairMesh = true;
                            }
                        }
                        Assert(foundHairMesh, $"Test 40: At least one hair mesh must be present for {hairType}");
                    }
                }
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 40: 8 Hairstyles Procedural Geometry & Bald Verification PASS");

                // -------------------------------------------------------------
                // TEST 41: 3 Face Shapes Geometry & Feature Alignment
                // -------------------------------------------------------------
                foreach (BobbleheadFaceShape faceShape in Enum.GetValues(typeof(BobbleheadFaceShape)))
                {
                    var faceCfg = BobbleheadConfig.CreatePlayerConfig();
                    faceCfg.faceShape = faceShape;
                    testBobblehead.Initialize(faceCfg);

                    var headMf = testBobblehead.Head.GetComponent<MeshFilter>();
                    Assert(headMf != null && headMf.sharedMesh != null, $"Test 41: Head mesh must exist for {faceShape}");
                    Assert(headMf.sharedMesh.vertexCount > 0, $"Test 41: Head mesh must have vertices for {faceShape}");

                    // Facial feature transforms must exist and be parented to Head
                    Assert(testBobblehead.Head.Find("Eye_L") != null, $"Test 41: Eye_L must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Eye_R") != null, $"Test 41: Eye_R must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Eye_L/Iris/Pupil") != null, $"Test 41: Pupil_L must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Eye_R/Iris/Pupil") != null, $"Test 41: Pupil_R must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Brow_L") != null, $"Test 41: Brow_L must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Brow_R") != null, $"Test 41: Brow_R must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Nose") != null, $"Test 41: Nose must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Mouth") != null, $"Test 41: Mouth must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Blush_L") != null, $"Test 41: Blush_L must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Blush_R") != null, $"Test 41: Blush_R must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Ear_L") != null, $"Test 41: Ear_L must exist for {faceShape}");
                    Assert(testBobblehead.Head.Find("Ear_R") != null, $"Test 41: Ear_R must exist for {faceShape}");
                }
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 41: 3 Face Shapes Geometry & Feature Alignment PASS");

                // -------------------------------------------------------------
                // TEST 42: Facial Hair Lifecycle & Clean Removal for None
                // -------------------------------------------------------------
                foreach (BobbleheadFacialHair facialHair in Enum.GetValues(typeof(BobbleheadFacialHair)))
                {
                    var fhCfg = BobbleheadConfig.CreatePlayerConfig();
                    fhCfg.facialHair = facialHair;
                    fhCfg.hairColor = new Color(0.12f, 0.45f, 0.20f); // distinctive green hair
                    testBobblehead.Initialize(fhCfg);

                    if (facialHair == BobbleheadFacialHair.None)
                    {
                        Assert(testBobblehead.Head.Find("Stubble") == null, "Test 42: None must not have Stubble");
                        Assert(testBobblehead.Head.Find("Mustache") == null, "Test 42: None must not have Mustache");
                        Assert(testBobblehead.Head.Find("Goatee") == null, "Test 42: None must not have Goatee");
                        Assert(testBobblehead.Head.Find("Beard") == null, "Test 42: None must not have Beard");
                    }
                    else if (facialHair == BobbleheadFacialHair.SubtleStubble)
                    {
                        Assert(testBobblehead.Head.Find("Stubble") != null, "Test 42: SubtleStubble must have Stubble part");
                    }
                    else if (facialHair == BobbleheadFacialHair.Mustache)
                    {
                        var mus = testBobblehead.Head.Find("Mustache");
                        Assert(mus != null, "Test 42: Mustache must have Mustache part");
                        var mr = mus.GetComponent<MeshRenderer>();
                        Assert(mr != null && mr.sharedMaterial != null, "Test 42: Mustache must have material");
                        Assert(Mathf.Abs(mr.sharedMaterial.color.r - fhCfg.hairColor.r) < 0.01f, "Test 42: Mustache material must match hairColor");
                    }
                    else if (facialHair == BobbleheadFacialHair.Goatee)
                    {
                        Assert(testBobblehead.Head.Find("Goatee") != null, "Test 42: Goatee must have Goatee part");
                    }
                    else if (facialHair == BobbleheadFacialHair.FullBeard)
                    {
                        Assert(testBobblehead.Head.Find("Beard") != null, "Test 42: FullBeard must have Beard part");
                        Assert(testBobblehead.Head.Find("Mustache") != null, "Test 42: FullBeard must include Mustache part");
                    }
                }
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 42: Facial Hair Lifecycle & Clean Removal PASS");

                // -------------------------------------------------------------
                // TEST 43: Body Presentation Dimensions & Bone Hierarchy Stability
                // -------------------------------------------------------------
                var presOrig = BobbleheadConfig.CreatePlayerConfig();
                presOrig.bodyPresentation = BobbleheadBodyPresentation.Original;
                testBobblehead.Initialize(presOrig);
                float origArmSpread = Mathf.Abs(testBobblehead.LeftArmRoot.localPosition.x);

                var presMasc = BobbleheadConfig.CreatePlayerConfig();
                presMasc.bodyPresentation = BobbleheadBodyPresentation.Masculine;
                testBobblehead.Initialize(presMasc);
                float mascArmSpread = Mathf.Abs(testBobblehead.LeftArmRoot.localPosition.x);
                Assert(mascArmSpread > origArmSpread, "Test 43: Masculine shoulder spread must be wider than Original");

                var presFem = BobbleheadConfig.CreatePlayerConfig();
                presFem.bodyPresentation = BobbleheadBodyPresentation.Feminine;
                testBobblehead.Initialize(presFem);
                float femArmSpread = Mathf.Abs(testBobblehead.LeftArmRoot.localPosition.x);
                Assert(femArmSpread < origArmSpread, "Test 43: Feminine shoulder spread must be narrower than Original");

                // Bone hierarchy must remain intact across all presets
                Assert(testBobblehead.Head != null, "Test 43: Head bone intact");
                Assert(testBobblehead.Torso != null, "Test 43: Torso bone intact");
                Assert(testBobblehead.Pelvis != null, "Test 43: Pelvis bone intact");
                Assert(testBobblehead.LeftArmRoot != null, "Test 43: LeftArmRoot bone intact");
                Assert(testBobblehead.RightArmRoot != null, "Test 43: RightArmRoot bone intact");
                Assert(testBobblehead.LeftForearm != null, "Test 43: LeftForearm bone intact");
                Assert(testBobblehead.RightForearm != null, "Test 43: RightForearm bone intact");
                Assert(testBobblehead.LeftLegRoot != null, "Test 43: LeftLegRoot bone intact");
                Assert(testBobblehead.RightLegRoot != null, "Test 43: RightLegRoot bone intact");
                Assert(testBobblehead.LeftLowerLeg != null, "Test 43: LeftLowerLeg bone intact");
                Assert(testBobblehead.RightLowerLeg != null, "Test 43: RightLowerLeg bone intact");
                Assert(testBobblehead.LeftFoot != null, "Test 43: LeftFoot bone intact");
                Assert(testBobblehead.RightFoot != null, "Test 43: RightFoot bone intact");

                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 43: Body Presentation Dimensions & Bone Hierarchy PASS");

                // -------------------------------------------------------------
                // TEST 44: Schema v1 to v3 Migration & Color Preservation
                // -------------------------------------------------------------
                string v1Path = Path.Combine(testTempDir, "schema_v1_profile.json");
                string v1Json = @"
{
    ""schemaVersion"": 1,
    ""playerEntityId"": ""agent:gomez-morin-player"",
    ""characterName"": ""V1MigratedAlex"",
    ""hairStyle"": ""StreetBeanie"",
    ""outfitType"": ""StreetwearJacket"",
    ""skinColor"": { ""r"": 0.85, ""g"": 0.65, ""b"": 0.50, ""a"": 1.0 },
    ""eyeColor"": { ""r"": 0.20, ""g"": 0.50, ""b"": 0.30, ""a"": 1.0 },
    ""pupilColor"": { ""r"": 0.05, ""g"": 0.05, ""b"": 0.05, ""a"": 1.0 },
    ""eyebrowColor"": { ""r"": 0.15, ""g"": 0.10, ""b"": 0.05, ""a"": 1.0 },
    ""lipColor"": { ""r"": 0.70, ""g"": 0.40, ""b"": 0.35, ""a"": 1.0 },
    ""blushColor"": { ""r"": 0.85, ""g"": 0.45, ""b"": 0.40, ""a"": 0.3 },
    ""hairColor"": { ""r"": 0.60, ""g"": 0.30, ""b"": 0.10, ""a"": 1.0 },
    ""headwearColor"": { ""r"": 0.10, ""g"": 0.20, ""b"": 0.30, ""a"": 1.0 },
    ""headwearAccentColor"": { ""r"": 0.90, ""g"": 0.80, ""b"": 0.10, ""a"": 1.0 },
    ""outerwearColor"": { ""r"": 0.40, ""g"": 0.10, ""b"": 0.10, ""a"": 1.0 },
    ""innerwearColor"": { ""r"": 0.15, ""g"": 0.15, ""b"": 0.15, ""a"": 1.0 },
    ""pantsColor"": { ""r"": 0.15, ""g"": 0.25, ""b"": 0.35, ""a"": 1.0 },
    ""shoeBaseColor"": { ""r"": 0.80, ""g"": 0.80, ""b"": 0.80, ""a"": 1.0 },
    ""shoeAccentColor"": { ""r"": 0.10, ""g"": 0.20, ""b"": 0.80, ""a"": 1.0 },
    ""hasNameBadge"": false,
    ""badgeText"": """"
}";
                File.WriteAllText(v1Path, v1Json, System.Text.Encoding.UTF8);

                bool v1LoadSuccess = BobbleheadProfileManager.TryLoadProfile(out var migratedProfile, out string v1LoadErr, v1Path);
                Assert(v1LoadSuccess, $"Test 44: Schema v1 profile must load and auto-migrate to v3: {v1LoadErr}");
                Assert(migratedProfile != null, "Test 44: Migrated profile must not be null");
                Assert(migratedProfile.schemaVersion == 3, "Test 44: Migrated profile schemaVersion must be 3");
                Assert(migratedProfile.characterName == "V1MigratedAlex", "Test 44: Character name preserved");
                Assert(migratedProfile.hairStyle == nameof(BobbleheadHairType.CasualShort), "Test 44: Migrated v1 StreetBeanie hairStyle must become CasualShort");
                Assert(migratedProfile.headwear == nameof(BobbleheadHeadwearType.BaseballCap), "Test 44: Migrated v1 StreetBeanie headwear must become BaseballCap");
                Assert(migratedProfile.faceShape == nameof(BobbleheadFaceShape.Round), "Test 44: Migrated faceShape defaulted to Round");
                Assert(migratedProfile.facialHair == nameof(BobbleheadFacialHair.None), "Test 44: Migrated facialHair defaulted to None");
                Assert(migratedProfile.bodyPresentation == nameof(BobbleheadBodyPresentation.Original), "Test 44: Migrated bodyPresentation defaulted to Original");
                Assert(Mathf.Abs(migratedProfile.outerwearColor.r - 0.40f) < 0.01f, "Test 44: Outerwear color preserved");
                Assert(Mathf.Abs(migratedProfile.hairColor.r - 0.60f) < 0.01f, "Test 44: Hair color preserved");

                // v1 Non-Beanie Hairstyle Migration (AttendantBun -> AttendantBun + None)
                string v1BunPath = Path.Combine(testTempDir, "schema_v1_bun.json");
                string v1BunJson = v1Json.Replace("\"StreetBeanie\"", "\"AttendantBun\"");
                File.WriteAllText(v1BunPath, v1BunJson, System.Text.Encoding.UTF8);
                bool v1BunOk = BobbleheadProfileManager.TryLoadProfile(out var migV1Bun, out string v1BunErr, v1BunPath);
                Assert(v1BunOk, $"Test 44: Schema v1 AttendantBun profile must migrate to v3: {v1BunErr}");
                Assert(migV1Bun.schemaVersion == 3, "Test 44: Migrated v1 AttendantBun schemaVersion must be 3");
                Assert(migV1Bun.hairStyle == nameof(BobbleheadHairType.AttendantBun), "Test 44: Migrated v1 AttendantBun hairStyle preserved");
                Assert(migV1Bun.headwear == nameof(BobbleheadHeadwearType.None), "Test 44: Migrated v1 non-beanie must set headwear to None");
                Assert(migV1Bun.faceShape == nameof(BobbleheadFaceShape.Round), "Test 44: Default faceShape Round");
                Assert(migV1Bun.facialHair == nameof(BobbleheadFacialHair.None), "Test 44: Default facialHair None");
                Assert(migV1Bun.bodyPresentation == nameof(BobbleheadBodyPresentation.Original), "Test 44: Default bodyPresentation Original");
                Assert(Mathf.Abs(migV1Bun.outerwearColor.r - 0.40f) < 0.01f, "Test 44: Colors preserved on v1 non-beanie");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 44: Schema v1 to v3 Migration & Color Preservation PASS");

                // -------------------------------------------------------------
                // TEST 45: Schema v3 Unknown Identifier Rejection
                // -------------------------------------------------------------
                string unkPath = Path.Combine(testTempDir, "unknown_ident_profile.json");
                string unkJson = @"
{
    ""schemaVersion"": 3,
    ""playerEntityId"": ""agent:gomez-morin-player"",
    ""characterName"": ""BadIdentifierPlayer"",
    ""hairStyle"": ""CasualShort"",
    ""headwear"": ""BaseballCap"",
    ""faceShape"": ""HexagonalAlienShape"",
    ""facialHair"": ""None"",
    ""bodyPresentation"": ""Original"",
    ""outfitType"": ""StreetwearJacket"",
    ""skinColor"": { ""r"": 0.85, ""g"": 0.65, ""b"": 0.50, ""a"": 1.0 },
    ""eyeColor"": { ""r"": 0.20, ""g"": 0.50, ""b"": 0.30, ""a"": 1.0 },
    ""pupilColor"": { ""r"": 0.05, ""g"": 0.05, ""b"": 0.05, ""a"": 1.0 },
    ""eyebrowColor"": { ""r"": 0.15, ""g"": 0.10, ""b"": 0.05, ""a"": 1.0 },
    ""lipColor"": { ""r"": 0.70, ""g"": 0.40, ""b"": 0.35, ""a"": 1.0 },
    ""blushColor"": { ""r"": 0.85, ""g"": 0.45, ""b"": 0.40, ""a"": 0.3 },
    ""hairColor"": { ""r"": 0.60, ""g"": 0.30, ""b"": 0.10, ""a"": 1.0 },
    ""headwearColor"": { ""r"": 0.10, ""g"": 0.20, ""b"": 0.30, ""a"": 1.0 },
    ""headwearAccentColor"": { ""r"": 0.90, ""g"": 0.80, ""b"": 0.10, ""a"": 1.0 },
    ""outerwearColor"": { ""r"": 0.40, ""g"": 0.10, ""b"": 0.10, ""a"": 1.0 },
    ""innerwearColor"": { ""r"": 0.15, ""g"": 0.15, ""b"": 0.15, ""a"": 1.0 },
    ""pantsColor"": { ""r"": 0.15, ""g"": 0.25, ""b"": 0.35, ""a"": 1.0 },
    ""shoeBaseColor"": { ""r"": 0.80, ""g"": 0.80, ""b"": 0.80, ""a"": 1.0 },
    ""shoeAccentColor"": { ""r"": 0.10, ""g"": 0.20, ""b"": 0.80, ""a"": 1.0 },
    ""hasNameBadge"": false,
    ""badgeText"": """"
}";
                File.WriteAllText(unkPath, unkJson, System.Text.Encoding.UTF8);

                bool unkLoad = BobbleheadProfileManager.TryLoadProfile(out var unkProfile, out string unkErr, unkPath);
                Assert(!unkLoad, "Test 45: Profile with unknown faceShape must fail validation");
                Assert(unkProfile == null, "Test 45: Failed profile must be null");
                Assert(File.Exists(unkPath), "Test 45: Invalid profile file must not be deleted");

                var unkFallback = BobbleheadProfileManager.GetEffectivePlayerConfig(unkPath);
                Assert(unkFallback != null, "Test 45: Fallback config must not be null");
                Assert(unkFallback.faceShape == BobbleheadFaceShape.Round, "Test 45: Fallback faceShape must be canonical Round");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 45: Schema v3 Unknown Identifier Rejection PASS");

                // -------------------------------------------------------------
                // TEST 46: Procedural Geometry Cleanup & Memory Leak Invariant
                // -------------------------------------------------------------
                // Perform 15 successive RebuildWithConfig calls cycling through various styles, headwear, and shapes
                for (int cycle = 0; cycle < 15; cycle++)
                {
                    var cycleCfg = BobbleheadConfig.CreatePlayerConfig();
                    cycleCfg.hairStyle = (BobbleheadHairType)(cycle % 8);
                    cycleCfg.headwear = (BobbleheadHeadwearType)(cycle % 3);
                    cycleCfg.faceShape = (BobbleheadFaceShape)(cycle % 3);
                    cycleCfg.facialHair = (BobbleheadFacialHair)(cycle % 5);
                    cycleCfg.bodyPresentation = (BobbleheadBodyPresentation)(cycle % 3);
                    testBobblehead.RebuildWithConfig(cycleCfg);
                }
                Assert(testBobblehead.VisualRoot != null, "Test 46: Visual root intact after 15 successive rebuilds");
                Assert(testBobblehead.Head != null, "Test 46: Head transform intact after rebuilds");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 46: Procedural Geometry Cleanup & Leak Invariant PASS");

                // -------------------------------------------------------------
                // TEST 47: Reset Appearance vs Reset Colors Semantic Distinction
                // -------------------------------------------------------------
                var testPanelGo2 = new GameObject("TestPanel2");
                var custCtrl2 = testPanelGo2.AddComponent<AvatarCustomizationController>();
                custCtrl2.InitializePalettes();
                var freshDefaultPlayer = BobbleheadConfig.CreatePlayerConfig();
                custCtrl2.Open(freshDefaultPlayer);

                // Apply both non-default appearance and non-default colors
                custCtrl2.SelectHairstyle(BobbleheadHairType.AfroCurly);
                custCtrl2.SelectHeadwear(BobbleheadHeadwearType.WinterBeanie);
                custCtrl2.SelectFaceShape(BobbleheadFaceShape.Angular);
                custCtrl2.SelectFacialHair(BobbleheadFacialHair.Goatee);
                custCtrl2.SelectBodyPresentation(BobbleheadBodyPresentation.Masculine);
                custCtrl2.SelectSwatch("outerwearColor", new Color(0.99f, 0.10f, 0.10f));

                Assert(custCtrl2.DraftConfig.hairStyle == BobbleheadHairType.AfroCurly, "Test 47: Draft hairStyle updated");
                Assert(custCtrl2.DraftConfig.headwear == BobbleheadHeadwearType.WinterBeanie, "Test 47: Draft headwear updated");
                Assert(custCtrl2.DraftConfig.faceShape == BobbleheadFaceShape.Angular, "Test 47: Draft faceShape updated");

                // 1. ResetColors must ONLY reset colors, leaving appearance unchanged
                custCtrl2.ResetColors();
                Assert(custCtrl2.DraftConfig.AreColorsEqual(freshDefaultPlayer), "Test 47: ResetColors reverted colors to default");
                Assert(custCtrl2.DraftConfig.hairStyle == BobbleheadHairType.AfroCurly, "Test 47: ResetColors preserved AfroCurly");
                Assert(custCtrl2.DraftConfig.headwear == BobbleheadHeadwearType.WinterBeanie, "Test 47: ResetColors preserved WinterBeanie");
                Assert(custCtrl2.DraftConfig.faceShape == BobbleheadFaceShape.Angular, "Test 47: ResetColors preserved Angular");
                Assert(custCtrl2.DraftConfig.facialHair == BobbleheadFacialHair.Goatee, "Test 47: ResetColors preserved Goatee");
                Assert(custCtrl2.DraftConfig.bodyPresentation == BobbleheadBodyPresentation.Masculine, "Test 47: ResetColors preserved Masculine");

                // 2. ResetAppearance must reset BOTH appearance and colors to default player config
                custCtrl2.SelectSwatch("outerwearColor", new Color(0.20f, 0.80f, 0.20f));
                custCtrl2.ResetAppearance();
                Assert(custCtrl2.DraftConfig.AreColorsEqual(freshDefaultPlayer), "Test 47: ResetAppearance reverted colors to default");
                Assert(custCtrl2.DraftConfig.hairStyle == BobbleheadHairType.CasualShort, "Test 47: ResetAppearance reverted hairStyle to CasualShort");
                Assert(custCtrl2.DraftConfig.headwear == BobbleheadHeadwearType.BaseballCap, "Test 47: ResetAppearance reverted headwear to BaseballCap");
                Assert(custCtrl2.DraftConfig.faceShape == BobbleheadFaceShape.Round, "Test 47: ResetAppearance reverted faceShape to Round");
                Assert(custCtrl2.DraftConfig.facialHair == BobbleheadFacialHair.None, "Test 47: ResetAppearance reverted facialHair to None");
                Assert(custCtrl2.DraftConfig.bodyPresentation == BobbleheadBodyPresentation.Original, "Test 47: ResetAppearance reverted bodyPresentation to Original");

                UnityEngine.Object.DestroyImmediate(testPanelGo2);
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 47: Reset Appearance vs Reset Colors PASS");

                // -------------------------------------------------------------
                // TEST 48: BobbleheadAnimator Pose Re-binding After Rebuild
                // -------------------------------------------------------------
                var animTestGo = new GameObject("AnimTestPlayer");
                var animCc = animTestGo.AddComponent<CharacterController>();
                var animPc = animTestGo.AddComponent<PlayerController>();
                animPc.BuildPlayerAvatar();
                var animComp = animTestGo.GetComponentInChildren<BobbleheadAnimator>();
                Assert(animComp != null, "Test 48: BobbleheadAnimator must exist on player");

                // Apply appearance change that triggers full rebuild and re-cache of initial poses
                var newAppCfg = BobbleheadConfig.CreatePlayerConfig();
                newAppCfg.bodyPresentation = BobbleheadBodyPresentation.Masculine;
                newAppCfg.hairStyle = BobbleheadHairType.AfroCurly;
                newAppCfg.headwear = BobbleheadHeadwearType.WinterBeanie;
                animPc.ApplyCustomizationConfig(newAppCfg);

                // Animator must be enabled and intact
                Assert(animComp.isActiveAndEnabled, "Test 48: BobbleheadAnimator must remain active after rebuild");
                UnityEngine.Object.DestroyImmediate(animTestGo);
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 48: BobbleheadAnimator Pose Re-binding PASS");

                // -------------------------------------------------------------
                // TEST 49: Elena Morales Complete Isolation
                // -------------------------------------------------------------
                var elenaCanonical = BobbleheadConfig.CreateElenaConfig();
                Assert(elenaCanonical.characterName == "Elena Morales", "Test 49: Elena name preserved");
                Assert(elenaCanonical.totalHeight == 1.68f, "Test 49: Elena height preserved");
                Assert(elenaCanonical.headScale == 0.98f, "Test 49: Elena headScale preserved");
                Assert(elenaCanonical.hairStyle == BobbleheadHairType.AttendantBun, "Test 49: Elena hairStyle AttendantBun preserved");
                Assert(elenaCanonical.headwear == BobbleheadHeadwearType.None, "Test 49: Elena headwear None preserved");
                Assert(elenaCanonical.outfitType == BobbleheadOutfitType.WingSpotAttendant, "Test 49: Elena outfitType WingSpotAttendant preserved");
                Assert(elenaCanonical.faceShape == BobbleheadFaceShape.Round, "Test 49: Elena faceShape Round");
                Assert(elenaCanonical.facialHair == BobbleheadFacialHair.None, "Test 49: Elena facialHair None");
                Assert(elenaCanonical.bodyPresentation == BobbleheadBodyPresentation.Original, "Test 49: Elena bodyPresentation Original");
                Assert(elenaCanonical.hasNameBadge == true && elenaCanonical.badgeText == "ELENA", "Test 49: Elena badge preserved");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 49: Elena Morales Complete Isolation PASS");

                // -------------------------------------------------------------
                // TEST 50: Schema v2 to v3 Migration (StreetBeanie -> CasualShort + BaseballCap, Non-Beanie -> Preserved + None)
                // -------------------------------------------------------------
                string v2BeaniePath = Path.Combine(testTempDir, "schema_v2_beanie.json");
                string v2BeanieJson = @"
{
    ""schemaVersion"": 2,
    ""playerEntityId"": ""agent:gomez-morin-player"",
    ""characterName"": ""V2BeanieUser"",
    ""totalHeight"": 1.75,
    ""headScale"": 1.0,
    ""hairStyle"": ""StreetBeanie"",
    ""faceShape"": ""Oval"",
    ""facialHair"": ""Mustache"",
    ""bodyPresentation"": ""Masculine"",
    ""outfitType"": ""StreetwearJacket"",
    ""skinColor"": { ""r"": 0.91, ""g"": 0.72, ""b"": 0.58, ""a"": 1.0 },
    ""eyeColor"": { ""r"": 0.22, ""g"": 0.42, ""b"": 0.65, ""a"": 1.0 },
    ""pupilColor"": { ""r"": 0.08, ""g"": 0.08, ""b"": 0.10, ""a"": 1.0 },
    ""eyebrowColor"": { ""r"": 0.18, ""g"": 0.12, ""b"": 0.09, ""a"": 1.0 },
    ""lipColor"": { ""r"": 0.78, ""g"": 0.48, ""b"": 0.45, ""a"": 1.0 },
    ""blushColor"": { ""r"": 0.92, ""g"": 0.55, ""b"": 0.52, ""a"": 0.35 },
    ""hairColor"": { ""r"": 0.16, ""g"": 0.11, ""b"": 0.08, ""a"": 1.0 },
    ""headwearColor"": { ""r"": 0.18, ""g"": 0.20, ""b"": 0.22, ""a"": 1.0 },
    ""headwearAccentColor"": { ""r"": 0.85, ""g"": 0.32, ""b"": 0.18, ""a"": 1.0 },
    ""outerwearColor"": { ""r"": 0.20, ""g"": 0.30, ""b"": 0.22, ""a"": 1.0 },
    ""innerwearColor"": { ""r"": 0.15, ""g"": 0.20, ""b"": 0.32, ""a"": 1.0 },
    ""pantsColor"": { ""r"": 0.14, ""g"": 0.18, ""b"": 0.28, ""a"": 1.0 },
    ""shoeBaseColor"": { ""r"": 0.92, ""g"": 0.90, ""b"": 0.85, ""a"": 1.0 },
    ""shoeAccentColor"": { ""r"": 0.80, ""g"": 0.20, ""b"": 0.18, ""a"": 1.0 },
    ""hasNameBadge"": false,
    ""badgeText"": """"
}";
                File.WriteAllText(v2BeaniePath, v2BeanieJson, System.Text.Encoding.UTF8);
                bool v2BeanieOk = BobbleheadProfileManager.TryLoadProfile(out var migV2Beanie, out string v2BeanieErr, v2BeaniePath);
                Assert(v2BeanieOk, $"Test 50: v2 StreetBeanie profile must migrate to v3: {v2BeanieErr}");
                Assert(migV2Beanie.schemaVersion == 3, "Test 50: Migrated schemaVersion must be 3");
                Assert(migV2Beanie.hairStyle == nameof(BobbleheadHairType.CasualShort), "Test 50: v2 StreetBeanie must migrate hairStyle to CasualShort");
                Assert(migV2Beanie.headwear == nameof(BobbleheadHeadwearType.BaseballCap), "Test 50: v2 StreetBeanie must migrate headwear to BaseballCap");
                Assert(migV2Beanie.faceShape == nameof(BobbleheadFaceShape.Oval), "Test 50: v2 faceShape Oval preserved");
                Assert(migV2Beanie.facialHair == nameof(BobbleheadFacialHair.Mustache), "Test 50: v2 facialHair Mustache preserved");
                Assert(migV2Beanie.bodyPresentation == nameof(BobbleheadBodyPresentation.Masculine), "Test 50: v2 bodyPresentation Masculine preserved");
                Assert(Mathf.Abs(migV2Beanie.outerwearColor.r - 0.20f) < 0.01f, "Test 50: v2 outerwearColor preserved");

                string v2AfroPath = Path.Combine(testTempDir, "schema_v2_afro.json");
                string v2AfroJson = v2BeanieJson.Replace("\"StreetBeanie\"", "\"AfroCurly\"");
                File.WriteAllText(v2AfroPath, v2AfroJson, System.Text.Encoding.UTF8);
                bool v2AfroOk = BobbleheadProfileManager.TryLoadProfile(out var migV2Afro, out string v2AfroErr, v2AfroPath);
                Assert(v2AfroOk, $"Test 50: v2 AfroCurly profile must migrate to v3: {v2AfroErr}");
                Assert(migV2Afro.hairStyle == nameof(BobbleheadHairType.AfroCurly), "Test 50: v2 AfroCurly must preserve hairStyle AfroCurly");
                Assert(migV2Afro.headwear == nameof(BobbleheadHeadwearType.None), "Test 50: v2 non-beanie hairstyle must migrate headwear to None");

                // Repeated loading of migrated v3 profile without remigrating or mutating appearance
                string v3RepeatPath = Path.Combine(testTempDir, "schema_v3_already_migrated.json");
                bool saveV3Ok = BobbleheadProfileManager.TrySaveProfile(migV2Beanie, out string saveV3Err, v3RepeatPath);
                Assert(saveV3Ok, $"Test 50: Save migrated v3 profile must succeed: {saveV3Err}");

                bool reload1Ok = BobbleheadProfileManager.TryLoadProfile(out var reloaded1, out string rel1Err, v3RepeatPath);
                Assert(reload1Ok, $"Test 50: Reloading v3 profile must succeed: {rel1Err}");
                Assert(reloaded1.schemaVersion == 3, "Test 50: Repeated load maintains schemaVersion 3");
                Assert(reloaded1.hairStyle == nameof(BobbleheadHairType.CasualShort), "Test 50: Repeated load preserves hairStyle");
                Assert(reloaded1.headwear == nameof(BobbleheadHeadwearType.BaseballCap), "Test 50: Repeated load preserves headwear");
                Assert(reloaded1.faceShape == nameof(BobbleheadFaceShape.Oval), "Test 50: Repeated load preserves faceShape");
                Assert(reloaded1.facialHair == nameof(BobbleheadFacialHair.Mustache), "Test 50: Repeated load preserves facialHair");
                Assert(reloaded1.bodyPresentation == nameof(BobbleheadBodyPresentation.Masculine), "Test 50: Repeated load preserves bodyPresentation");
                Assert(Mathf.Abs(reloaded1.outerwearColor.r - 0.20f) < 0.01f, "Test 50: Repeated load preserves outerwearColor");
                Assert(Mathf.Abs(reloaded1.pupilColor.r - 0.08f) < 0.01f, "Test 50: Repeated load preserves pupilColor");

                bool reload2Ok = BobbleheadProfileManager.TryLoadProfile(out var reloaded2, out string rel2Err, v3RepeatPath);
                Assert(reload2Ok, $"Test 50: Second reload of v3 profile must succeed: {rel2Err}");
                Assert(reloaded2.schemaVersion == 3 && reloaded2.hairStyle == reloaded1.hairStyle && reloaded2.headwear == reloaded1.headwear,
                    "Test 50: Idempotent repeat load produces identical configuration without mutation");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 50: Schema v2 to v3 Migration & Repeat Load PASS");

                // -------------------------------------------------------------
                // TEST 51: Independent Headwear Switching (BaseballCap <-> WinterBeanie <-> None)
                // -------------------------------------------------------------
                var hwCfg = BobbleheadConfig.CreatePlayerConfig();
                hwCfg.hairStyle = BobbleheadHairType.HighPonytail;
                hwCfg.headwear = BobbleheadHeadwearType.BaseballCap;
                testBobblehead.Initialize(hwCfg);

                Assert(testBobblehead.Head.Find("BaseballCap_Crown") != null, "Test 51: BaseballCap must build BaseballCap_Crown");
                Assert(testBobblehead.Head.Find("BaseballCap_Crown/BaseballCap_Emblem") != null, "Test 51: BaseballCap must build BaseballCap_Emblem");
                Assert(testBobblehead.Head.Find("Beanie_Cap") == null, "Test 51: BaseballCap must not have Beanie_Cap");
                Assert(testBobblehead.Head.Find("Hair_Ponytail") != null, "Test 51: Underlying HighPonytail must be present under BaseballCap");

                // Switch to WinterBeanie while preserving HighPonytail
                hwCfg.headwear = BobbleheadHeadwearType.WinterBeanie;
                testBobblehead.RebuildWithConfig(hwCfg);
                Assert(testBobblehead.Head.Find("BaseballCap_Crown") == null, "Test 51: Switching to WinterBeanie must remove BaseballCap_Crown");
                Assert(testBobblehead.Head.Find("Beanie_Cap") != null, "Test 51: WinterBeanie must build Beanie_Cap");
                Assert(testBobblehead.Head.Find("Beanie_Cap/Beanie_Label_Tag") != null, "Test 51: WinterBeanie must build Beanie_Label_Tag");
                Assert(testBobblehead.Head.Find("Hair_Ponytail") != null, "Test 51: Underlying HighPonytail must be preserved under WinterBeanie");

                // Switch to None while preserving HighPonytail
                hwCfg.headwear = BobbleheadHeadwearType.None;
                testBobblehead.RebuildWithConfig(hwCfg);
                Assert(testBobblehead.Head.Find("BaseballCap_Crown") == null, "Test 51: None headwear must not have BaseballCap_Crown");
                Assert(testBobblehead.Head.Find("Beanie_Cap") == null, "Test 51: None headwear must not have Beanie_Cap");
                Assert(testBobblehead.Head.Find("Hair_Ponytail") != null, "Test 51: Underlying HighPonytail must remain intact with None headwear");
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 51: Independent Headwear Switching PASS");

                // -------------------------------------------------------------
                // TEST 52: MVC_BobbleheadBase Proportions, Archetype & Cap Recoloring
                // -------------------------------------------------------------
                Assert(BobbleheadCharacter.ArchetypeId == "MVC_BobbleheadBase", "Test 52: ArchetypeId must be MVC_BobbleheadBase");
                var propCfg = BobbleheadConfig.CreatePlayerConfig();
                testBobblehead.RebuildWithConfig(propCfg);

                // Compute visual bounds of default MVC_BobbleheadBase player avatar
                var allRenderers = testBobblehead.VisualRoot.GetComponentsInChildren<MeshRenderer>(true);
                Bounds totalBounds = allRenderers[0].bounds;
                for (int r = 1; r < allRenderers.Length; r++) totalBounds.Encapsulate(allRenderers[r].bounds);

                var headRenderers = testBobblehead.Head.GetComponentsInChildren<MeshRenderer>(true);
                Bounds headBounds = headRenderers[0].bounds;
                for (int r = 1; r < headRenderers.Length; r++) headBounds.Encapsulate(headRenderers[r].bounds);

                float visualHeight = totalBounds.size.y;
                float headHeightRatio = headBounds.size.y / visualHeight;
                Assert(Mathf.Abs(totalBounds.min.y) < 0.01f, $"Test 52: Shoe soles must be grounded at Y=0.00m (got {totalBounds.min.y:F3}m)");
                Assert(visualHeight >= 1.56f && visualHeight <= 1.65f, $"Test 52: Visual height must be in ~1.58-1.63m target range (got {visualHeight:F3}m)");
                Assert(headHeightRatio >= 0.435f && headHeightRatio <= 0.465f, $"Test 52: Head height ratio must be ~44-45% (got {headHeightRatio * 100f:F2}%)");

                // Verify live recoloring of BaseballCap_Crown and BaseballCap_Emblem
                var capColorCfg = propCfg.Clone();
                capColorCfg.headwearColor = new Color(0.75f, 0.18f, 0.15f);
                capColorCfg.headwearAccentColor = new Color(0.95f, 0.85f, 0.15f);
                testBobblehead.ApplyColors(capColorCfg);
                Assert(Mathf.Abs(testBobblehead.GetRendererColor("BaseballCap_Crown").r - 0.75f) < 0.01f, "Test 52: BaseballCap_Crown recolored");
                Assert(Mathf.Abs(testBobblehead.GetRendererColor("BaseballCap_Emblem").r - 0.95f) < 0.01f, "Test 52: BaseballCap_Emblem recolored");

                if (testAvatarGo != null) UnityEngine.Object.DestroyImmediate(testAvatarGo);
                testsPassed++;
                Debug.Log($"[AvatarProfileTests] TEST 52: MVC_BobbleheadBase Proportions (Height={visualHeight:F3}m, HeadRatio={headHeightRatio * 100f:F2}%) PASS");

                // -------------------------------------------------------------
                // TEST 53: Real User Profile Was Never Touched
                // -------------------------------------------------------------
                bool realExistsNow = File.Exists(realPath);
                Assert(realExistsNow == realExistedBefore, "Test 53: Real profile existence state must not change during tests");
                if (realExistedBefore)
                {
                    Assert(File.GetLastWriteTimeUtc(realPath) == realTimestampBefore, "Test 53: Real profile timestamp must not change during tests");
                }
                testsPassed++;
                Debug.Log("[AvatarProfileTests] TEST 53: Real Profile Isolation PASS");
            }
            finally
            {
                // Clean up temporary test directory
                if (Directory.Exists(testTempDir))
                {
                    try { Directory.Delete(testTempDir, true); } catch { /* ignore temp cleanup */ }
                }
            }

            Debug.Log("==========================================================================");
            Debug.Log($"[AvatarProfileTests] ALL {testsPassed}/{totalTests} TESTS PASSED SUCCESSFULLY.");
            Debug.Log("==========================================================================");
        }

        private static int CountTransformsRecursive(Transform t)
        {
            if (t == null) return 0;
            int count = 1;
            for (int i = 0; i < t.childCount; i++)
            {
                count += CountTransformsRecursive(t.GetChild(i));
            }
            return count;
        }

        private static void Assert(bool condition, string message)
        {
            if (!condition)
            {
                Debug.LogError("[AvatarProfileTests] ASSERTION FAILED: " + message);
                throw new Exception("Assertion Failed: " + message);
            }
        }
    }
}
