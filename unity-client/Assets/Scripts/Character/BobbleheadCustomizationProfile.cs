using System;
using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Explicit serializable representation of a Color with finite numeric RGBA components.
    /// Provides explicit validation and bidirectional conversion to/from UnityEngine.Color.
    /// </summary>
    [Serializable]
    public struct SerializableColor
    {
        public float r;
        public float g;
        public float b;
        public float a;

        public SerializableColor(float r, float g, float b, float a = 1.0f)
        {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }

        public SerializableColor(Color color)
        {
            this.r = color.r;
            this.g = color.g;
            this.b = color.b;
            this.a = color.a;
        }

        public Color ToColor()
        {
            return new Color(r, g, b, a);
        }

        public bool IsValid()
        {
            return !float.IsNaN(r) && !float.IsInfinity(r) && r >= 0.0f && r <= 1.0f &&
                   !float.IsNaN(g) && !float.IsInfinity(g) && g >= 0.0f && g <= 1.0f &&
                   !float.IsNaN(b) && !float.IsInfinity(b) && b >= 0.0f && b <= 1.0f &&
                   !float.IsNaN(a) && !float.IsInfinity(a) && a >= 0.0f && a <= 1.0f;
        }

        public bool EqualsColor(Color c, float tolerance = 0.002f)
        {
            return Mathf.Abs(r - c.r) <= tolerance &&
                   Mathf.Abs(g - c.g) <= tolerance &&
                   Mathf.Abs(b - c.b) <= tolerance &&
                   Mathf.Abs(a - c.a) <= tolerance;
        }

        public override string ToString()
        {
            return $"RGBA({r:F2}, {g:F2}, {b:F2}, {a:F2})";
        }
    }

    /// <summary>
    /// Phase A, B, C & MVC_BobbleheadBase Foundation: Dedicated, explicitly serializable data-transfer object
    /// for the player's cosmetic avatar profile.
    /// 
    /// INVARIANTS:
    /// 1. Cosmetic presentation only: never mutates authoritative World Core schemas, contracts, or simulation state.
    /// 2. Schema versioning is explicit (SchemaVersion = 3; provides explicit safe migration from v1 and v2).
    /// 3. Bound to the authoritative player entity identity ('agent:gomez-morin-player').
    /// 4. Decoupled from runtime UnityEngine objects (zero GameObject, Transform, Mesh, or Material references).
    /// 5. Geometry customization boundary: totalHeight (1.75m) and headScale (1.0) must match supported collision/camera envelope.
    /// 6. Visual enum support: hairstyles and headwear are persisted independently (Hair Style != Headwear Type != Character Identity).
    /// </summary>
    [Serializable]
    public class BobbleheadCustomizationProfile
    {
        public const int CurrentSchemaVersion = 3;
        public const string ExpectedPlayerEntityId = "agent:gomez-morin-player";

        // Supported geometry constraints (matches CharacterController height 1.75m and camera framing)
        public const float SupportedPlayerHeight = 1.75f;
        public const float SupportedPlayerHeadScale = 1.0f;

        // Metadata
        public int schemaVersion = CurrentSchemaVersion;
        public string playerEntityId = ExpectedPlayerEntityId;

        // Identity & Proportions
        public string characterName = "Player";
        public float totalHeight = SupportedPlayerHeight;
        public float headScale = SupportedPlayerHeadScale;

        // Appearance Variations (Phase C)
        public string faceShape = nameof(BobbleheadFaceShape.Round);
        public string facialHair = nameof(BobbleheadFacialHair.None);
        public string bodyPresentation = nameof(BobbleheadBodyPresentation.Original);

        // Skin & Face Colors
        public SerializableColor skinColor = new SerializableColor(0.93f, 0.79f, 0.70f);
        public SerializableColor eyeColor = new SerializableColor(0.25f, 0.18f, 0.12f);
        public SerializableColor pupilColor = new SerializableColor(0.05f, 0.05f, 0.06f);
        public SerializableColor eyebrowColor = new SerializableColor(0.14f, 0.11f, 0.09f);
        public SerializableColor lipColor = new SerializableColor(0.75f, 0.48f, 0.45f);
        public SerializableColor blushColor = new SerializableColor(0.92f, 0.55f, 0.50f, 0.35f);

        // Hair & Headwear (Separated in Schema v3; stored as stable string representations)
        public string hairStyle = nameof(BobbleheadHairType.CasualShort);
        public string headwear = nameof(BobbleheadHeadwearType.BaseballCap);
        public SerializableColor hairColor = new SerializableColor(0.14f, 0.11f, 0.09f);
        public SerializableColor headwearColor = new SerializableColor(0.20f, 0.24f, 0.28f);
        public SerializableColor headwearAccentColor = new SerializableColor(0.88f, 0.32f, 0.16f);

        // Clothing & Footwear (Stored as stable string representations)
        public string outfitType = nameof(BobbleheadOutfitType.StreetwearJacket);
        public SerializableColor outerwearColor = new SerializableColor(0.16f, 0.24f, 0.32f);
        public SerializableColor innerwearColor = new SerializableColor(0.78f, 0.80f, 0.82f);
        public SerializableColor pantsColor = new SerializableColor(0.22f, 0.26f, 0.24f);
        public SerializableColor shoeBaseColor = new SerializableColor(0.95f, 0.95f, 0.96f);
        public SerializableColor shoeAccentColor = new SerializableColor(0.85f, 0.20f, 0.15f);

        // Accessories & Badges
        public bool hasNameBadge = false;
        public string badgeText = "";

        /// <summary>
        /// Verifies whether a hairstyle has a concrete visual builder implementation in Schema v3.
        /// Note: StreetBeanie was a legacy v1/v2 combined hair+hat value and is migrated to CasualShort + BaseballCap in v3.
        /// </summary>
        public static bool IsSupportedHairType(BobbleheadHairType hairType)
        {
            return Enum.IsDefined(typeof(BobbleheadHairType), hairType) &&
                   hairType != BobbleheadHairType.StreetBeanie;
        }

        /// <summary>
        /// Verifies whether a headwear option has a concrete visual builder implementation in Schema v3.
        /// Supported: None, BaseballCap, WinterBeanie.
        /// </summary>
        public static bool IsSupportedHeadwearType(BobbleheadHeadwearType headwearType)
        {
            return Enum.IsDefined(typeof(BobbleheadHeadwearType), headwearType);
        }

        public static bool IsSupportedFaceShape(BobbleheadFaceShape shape)
        {
            return Enum.IsDefined(typeof(BobbleheadFaceShape), shape);
        }

        public static bool IsSupportedFacialHair(BobbleheadFacialHair style)
        {
            return Enum.IsDefined(typeof(BobbleheadFacialHair), style);
        }

        public static bool IsSupportedBodyPresentation(BobbleheadBodyPresentation presentation)
        {
            return Enum.IsDefined(typeof(BobbleheadBodyPresentation), presentation);
        }

        /// <summary>
        /// Explicit mapping from runtime BobbleheadConfig to serializable BobbleheadCustomizationProfile.
        /// </summary>
        public static BobbleheadCustomizationProfile FromConfig(BobbleheadConfig config, string playerId = ExpectedPlayerEntityId)
        {
            if (config == null) config = BobbleheadConfig.CreatePlayerConfig();

            BobbleheadHairType effectiveHair = config.hairStyle;
            BobbleheadHeadwearType effectiveHeadwear = config.headwear;
            if (effectiveHair == BobbleheadHairType.StreetBeanie)
            {
                effectiveHair = BobbleheadHairType.CasualShort;
                effectiveHeadwear = BobbleheadHeadwearType.BaseballCap;
            }

            return new BobbleheadCustomizationProfile
            {
                schemaVersion = CurrentSchemaVersion,
                playerEntityId = string.IsNullOrEmpty(playerId) ? ExpectedPlayerEntityId : playerId,
                characterName = config.characterName ?? "Player",
                totalHeight = config.totalHeight,
                headScale = config.headScale,
                faceShape = config.faceShape.ToString(),
                facialHair = config.facialHair.ToString(),
                bodyPresentation = config.bodyPresentation.ToString(),
                skinColor = new SerializableColor(config.skinColor),
                eyeColor = new SerializableColor(config.eyeColor),
                pupilColor = new SerializableColor(config.pupilColor),
                eyebrowColor = new SerializableColor(config.eyebrowColor),
                lipColor = new SerializableColor(config.lipColor),
                blushColor = new SerializableColor(config.blushColor),
                hairStyle = effectiveHair.ToString(),
                headwear = effectiveHeadwear.ToString(),
                hairColor = new SerializableColor(config.hairColor),
                headwearColor = new SerializableColor(config.headwearColor),
                headwearAccentColor = new SerializableColor(config.headwearAccentColor),
                outfitType = config.outfitType.ToString(),
                outerwearColor = new SerializableColor(config.outerwearColor),
                innerwearColor = new SerializableColor(config.innerwearColor),
                pantsColor = new SerializableColor(config.pantsColor),
                shoeBaseColor = new SerializableColor(config.shoeBaseColor),
                shoeAccentColor = new SerializableColor(config.shoeAccentColor),
                hasNameBadge = config.hasNameBadge,
                badgeText = config.badgeText ?? ""
            };
        }

        /// <summary>
        /// Explicit mapping from serializable BobbleheadCustomizationProfile to runtime BobbleheadConfig.
        /// </summary>
        public BobbleheadConfig ToConfig()
        {
            var config = new BobbleheadConfig
            {
                archetypeId = BobbleheadConfig.ArchetypeIdentifier,
                characterName = characterName ?? "Player",
                totalHeight = totalHeight,
                headScale = headScale,
                skinColor = skinColor.ToColor(),
                eyeColor = eyeColor.ToColor(),
                pupilColor = pupilColor.ToColor(),
                eyebrowColor = eyebrowColor.ToColor(),
                lipColor = lipColor.ToColor(),
                blushColor = blushColor.ToColor(),
                hairColor = hairColor.ToColor(),
                headwearColor = headwearColor.ToColor(),
                headwearAccentColor = headwearAccentColor.ToColor(),
                outerwearColor = outerwearColor.ToColor(),
                innerwearColor = innerwearColor.ToColor(),
                pantsColor = pantsColor.ToColor(),
                shoeBaseColor = shoeBaseColor.ToColor(),
                shoeAccentColor = shoeAccentColor.ToColor(),
                hasNameBadge = hasNameBadge,
                badgeText = badgeText ?? ""
            };

            if (Enum.TryParse<BobbleheadHairType>(hairStyle, out var parsedHair) && Enum.IsDefined(typeof(BobbleheadHairType), parsedHair))
            {
                if (parsedHair == BobbleheadHairType.StreetBeanie)
                {
                    config.hairStyle = BobbleheadHairType.CasualShort;
                    config.headwear = BobbleheadHeadwearType.BaseballCap;
                }
                else
                {
                    config.hairStyle = parsedHair;
                }
            }

            if (Enum.TryParse<BobbleheadHeadwearType>(headwear, out var parsedHeadwear) && Enum.IsDefined(typeof(BobbleheadHeadwearType), parsedHeadwear))
            {
                config.headwear = parsedHeadwear;
            }

            if (Enum.TryParse<BobbleheadFaceShape>(faceShape, out var parsedFaceShape) && Enum.IsDefined(typeof(BobbleheadFaceShape), parsedFaceShape))
            {
                config.faceShape = parsedFaceShape;
            }

            if (Enum.TryParse<BobbleheadFacialHair>(facialHair, out var parsedFacialHair) && Enum.IsDefined(typeof(BobbleheadFacialHair), parsedFacialHair))
            {
                config.facialHair = parsedFacialHair;
            }

            if (Enum.TryParse<BobbleheadBodyPresentation>(bodyPresentation, out var parsedBody) && Enum.IsDefined(typeof(BobbleheadBodyPresentation), parsedBody))
            {
                config.bodyPresentation = parsedBody;
            }

            if (Enum.TryParse<BobbleheadOutfitType>(outfitType, out var parsedOutfit) && Enum.IsDefined(typeof(BobbleheadOutfitType), parsedOutfit))
            {
                config.outfitType = parsedOutfit;
            }

            return config;
        }

        /// <summary>
        /// Migrates a valid schema v1 profile to schema v3 in-memory:
        /// - Upgrades schemaVersion to 3.
        /// - Preserves all existing colors, outfit, name, height, and badge.
        /// - Supplies canonical defaults for v2 appearance fields (Round, None, Original).
        /// - Separates legacy StreetBeanie into hairStyle = CasualShort and headwear = BaseballCap.
        /// </summary>
        public bool MigrateFromV1(out string migrationError)
        {
            if (schemaVersion != 1)
            {
                migrationError = $"Profile schema version is {schemaVersion}, expected 1 for migration";
                return false;
            }

            if (!ValidateV1(out string v1Err))
            {
                migrationError = $"Cannot migrate invalid v1 profile: {v1Err}";
                return false;
            }

            if (string.IsNullOrEmpty(faceShape)) faceShape = nameof(BobbleheadFaceShape.Round);
            if (string.IsNullOrEmpty(facialHair)) facialHair = nameof(BobbleheadFacialHair.None);
            if (string.IsNullOrEmpty(bodyPresentation)) bodyPresentation = nameof(BobbleheadBodyPresentation.Original);

            MigrateHairAndHeadwearSeparation();
            schemaVersion = CurrentSchemaVersion;

            migrationError = null;
            return true;
        }

        /// <summary>
        /// Migrates a valid schema v2 profile to schema v3 in-memory:
        /// - Upgrades schemaVersion to 3.
        /// - Preserves all existing colors, faceShape, facialHair, bodyPresentation, outfit, name, height, and badge.
        /// - If hairStyle was the legacy combined "StreetBeanie", maps hairStyle to "CasualShort" and headwear to "BaseballCap".
        /// - If hairStyle was a specific non-beanie style (CasualShort, AfroCurly, etc.), preserves hairStyle and sets headwear to "None".
        /// </summary>
        public bool MigrateFromV2(out string migrationError)
        {
            if (schemaVersion != 2)
            {
                migrationError = $"Profile schema version is {schemaVersion}, expected 2 for migration";
                return false;
            }

            if (!ValidateV2(out string v2Err))
            {
                migrationError = $"Cannot migrate invalid v2 profile: {v2Err}";
                return false;
            }

            MigrateHairAndHeadwearSeparation();
            schemaVersion = CurrentSchemaVersion;

            migrationError = null;
            return true;
        }

        private void MigrateHairAndHeadwearSeparation()
        {
            if (hairStyle == nameof(BobbleheadHairType.StreetBeanie))
            {
                hairStyle = nameof(BobbleheadHairType.CasualShort);
                headwear = nameof(BobbleheadHeadwearType.BaseballCap);
            }
            else
            {
                headwear = nameof(BobbleheadHeadwearType.None);
            }
        }

        /// <summary>
        /// Validates strict schema v1 constraints for backward compatibility checking and migration verification.
        /// </summary>
        public bool ValidateV1(out string validationError)
        {
            if (schemaVersion != 1)
            {
                validationError = $"Expected schema version 1, received {schemaVersion}";
                return false;
            }

            if (string.IsNullOrEmpty(playerEntityId) || playerEntityId != ExpectedPlayerEntityId)
            {
                validationError = $"Player identity mismatch: '{playerEntityId}' (expected '{ExpectedPlayerEntityId}')";
                return false;
            }

            if (float.IsNaN(totalHeight) || float.IsInfinity(totalHeight) || Mathf.Abs(totalHeight - SupportedPlayerHeight) > 0.001f)
            {
                validationError = $"totalHeight must be {SupportedPlayerHeight:F2}m (received {totalHeight})";
                return false;
            }

            if (float.IsNaN(headScale) || float.IsInfinity(headScale) || Mathf.Abs(headScale - SupportedPlayerHeadScale) > 0.001f)
            {
                validationError = $"headScale must be {SupportedPlayerHeadScale:F1} (received {headScale})";
                return false;
            }

            if (!ValidateColors(out validationError)) return false;

            if (string.IsNullOrEmpty(hairStyle) || !Enum.TryParse<BobbleheadHairType>(hairStyle, out var parsedHair) ||
                (parsedHair != BobbleheadHairType.StreetBeanie && parsedHair != BobbleheadHairType.AttendantBun))
            {
                validationError = $"Unsupported v1 hairstyle: '{hairStyle}'";
                return false;
            }

            if (string.IsNullOrEmpty(outfitType) || !Enum.TryParse<BobbleheadOutfitType>(outfitType, out var parsedOutfit) || !Enum.IsDefined(typeof(BobbleheadOutfitType), parsedOutfit))
            {
                validationError = $"Unknown outfitType: '{outfitType}'";
                return false;
            }

            validationError = null;
            return true;
        }

        /// <summary>
        /// Validates strict schema v2 constraints for backward compatibility checking and migration verification.
        /// </summary>
        public bool ValidateV2(out string validationError)
        {
            if (schemaVersion != 2)
            {
                validationError = $"Expected schema version 2, received {schemaVersion}";
                return false;
            }

            if (string.IsNullOrEmpty(playerEntityId) || playerEntityId != ExpectedPlayerEntityId)
            {
                validationError = $"Player identity mismatch: '{playerEntityId}' (expected '{ExpectedPlayerEntityId}')";
                return false;
            }

            if (float.IsNaN(totalHeight) || float.IsInfinity(totalHeight) || Mathf.Abs(totalHeight - SupportedPlayerHeight) > 0.001f)
            {
                validationError = $"Geometric customization is deferred to a future milestone: totalHeight must be {SupportedPlayerHeight:F2}m (received {totalHeight})";
                return false;
            }

            if (float.IsNaN(headScale) || float.IsInfinity(headScale) || Mathf.Abs(headScale - SupportedPlayerHeadScale) > 0.001f)
            {
                validationError = $"Geometric customization is deferred to a future milestone: headScale must be {SupportedPlayerHeadScale:F1} (received {headScale})";
                return false;
            }

            if (!ValidateColors(out validationError)) return false;

            if (string.IsNullOrEmpty(hairStyle) || !Enum.TryParse<BobbleheadHairType>(hairStyle, out var parsedHair) || !Enum.IsDefined(typeof(BobbleheadHairType), parsedHair))
            {
                validationError = $"Unknown or unsupported v2 hairStyle enum value: '{hairStyle}'";
                return false;
            }

            if (string.IsNullOrEmpty(faceShape) || !Enum.TryParse<BobbleheadFaceShape>(faceShape, out var parsedFace) || !IsSupportedFaceShape(parsedFace))
            {
                validationError = $"Unknown or unsupported faceShape enum value: '{faceShape}'";
                return false;
            }

            if (string.IsNullOrEmpty(facialHair) || !Enum.TryParse<BobbleheadFacialHair>(facialHair, out var parsedFacialHair) || !IsSupportedFacialHair(parsedFacialHair))
            {
                validationError = $"Unknown or unsupported facialHair enum value: '{facialHair}'";
                return false;
            }

            if (string.IsNullOrEmpty(bodyPresentation) || !Enum.TryParse<BobbleheadBodyPresentation>(bodyPresentation, out var parsedBody) || !IsSupportedBodyPresentation(parsedBody))
            {
                validationError = $"Unknown or unsupported bodyPresentation enum value: '{bodyPresentation}'";
                return false;
            }

            if (string.IsNullOrEmpty(outfitType) || !Enum.TryParse<BobbleheadOutfitType>(outfitType, out var parsedOutfit) || !Enum.IsDefined(typeof(BobbleheadOutfitType), parsedOutfit))
            {
                validationError = $"Unknown or unsupported outfitType enum value: '{outfitType}'";
                return false;
            }

            validationError = null;
            return true;
        }

        private bool ValidateColors(out string validationError)
        {
            if (!skinColor.IsValid()) { validationError = $"Invalid skinColor: {skinColor}"; return false; }
            if (!eyeColor.IsValid()) { validationError = $"Invalid eyeColor: {eyeColor}"; return false; }
            if (!pupilColor.IsValid()) { validationError = $"Invalid pupilColor: {pupilColor}"; return false; }
            if (!eyebrowColor.IsValid()) { validationError = $"Invalid eyebrowColor: {eyebrowColor}"; return false; }
            if (!lipColor.IsValid()) { validationError = $"Invalid lipColor: {lipColor}"; return false; }
            if (!blushColor.IsValid()) { validationError = $"Invalid blushColor: {blushColor}"; return false; }
            if (!hairColor.IsValid()) { validationError = $"Invalid hairColor: {hairColor}"; return false; }
            if (!headwearColor.IsValid()) { validationError = $"Invalid headwearColor: {headwearColor}"; return false; }
            if (!headwearAccentColor.IsValid()) { validationError = $"Invalid headwearAccentColor: {headwearAccentColor}"; return false; }
            if (!outerwearColor.IsValid()) { validationError = $"Invalid outerwearColor: {outerwearColor}"; return false; }
            if (!innerwearColor.IsValid()) { validationError = $"Invalid innerwearColor: {innerwearColor}"; return false; }
            if (!pantsColor.IsValid()) { validationError = $"Invalid pantsColor: {pantsColor}"; return false; }
            if (!shoeBaseColor.IsValid()) { validationError = $"Invalid shoeBaseColor: {shoeBaseColor}"; return false; }
            if (!shoeAccentColor.IsValid()) { validationError = $"Invalid shoeAccentColor: {shoeAccentColor}"; return false; }
            validationError = null;
            return true;
        }

        /// <summary>
        /// Comprehensive validation verifying schema version (v3), player ID, finite values, and valid enum values.
        /// </summary>
        public bool Validate(out string validationError)
        {
            if (schemaVersion != CurrentSchemaVersion)
            {
                validationError = $"Unsupported schema version '{schemaVersion}' (expected {CurrentSchemaVersion})";
                return false;
            }

            if (string.IsNullOrEmpty(playerEntityId))
            {
                validationError = "Missing playerEntityId";
                return false;
            }

            if (playerEntityId != ExpectedPlayerEntityId)
            {
                validationError = $"Player identity mismatch: '{playerEntityId}' (expected '{ExpectedPlayerEntityId}')";
                return false;
            }

            if (float.IsNaN(totalHeight) || float.IsInfinity(totalHeight) || Mathf.Abs(totalHeight - SupportedPlayerHeight) > 0.001f)
            {
                validationError = $"Geometric customization is deferred to a future milestone: totalHeight must be {SupportedPlayerHeight:F2}m (received {totalHeight})";
                return false;
            }

            if (float.IsNaN(headScale) || float.IsInfinity(headScale) || Mathf.Abs(headScale - SupportedPlayerHeadScale) > 0.001f)
            {
                validationError = $"Geometric customization is deferred to a future milestone: headScale must be {SupportedPlayerHeadScale:F1} (received {headScale})";
                return false;
            }

            if (!ValidateColors(out validationError)) return false;

            // Validate enumeration names
            if (string.IsNullOrEmpty(hairStyle) || !Enum.TryParse<BobbleheadHairType>(hairStyle, out var parsedHair) || !IsSupportedHairType(parsedHair))
            {
                validationError = $"Unknown or unsupported hairStyle enum value: '{hairStyle}'";
                return false;
            }

            if (string.IsNullOrEmpty(headwear) || !Enum.TryParse<BobbleheadHeadwearType>(headwear, out var parsedHeadwear) || !IsSupportedHeadwearType(parsedHeadwear))
            {
                validationError = $"Unknown or unsupported headwear enum value: '{headwear}'";
                return false;
            }

            if (string.IsNullOrEmpty(faceShape) || !Enum.TryParse<BobbleheadFaceShape>(faceShape, out var parsedFace) || !IsSupportedFaceShape(parsedFace))
            {
                validationError = $"Unknown or unsupported faceShape enum value: '{faceShape}'";
                return false;
            }

            if (string.IsNullOrEmpty(facialHair) || !Enum.TryParse<BobbleheadFacialHair>(facialHair, out var parsedFacialHair) || !IsSupportedFacialHair(parsedFacialHair))
            {
                validationError = $"Unknown or unsupported facialHair enum value: '{facialHair}'";
                return false;
            }

            if (string.IsNullOrEmpty(bodyPresentation) || !Enum.TryParse<BobbleheadBodyPresentation>(bodyPresentation, out var parsedBody) || !IsSupportedBodyPresentation(parsedBody))
            {
                validationError = $"Unknown or unsupported bodyPresentation enum value: '{bodyPresentation}'";
                return false;
            }

            if (string.IsNullOrEmpty(outfitType) || !Enum.TryParse<BobbleheadOutfitType>(outfitType, out var parsedOutfit) || !Enum.IsDefined(typeof(BobbleheadOutfitType), parsedOutfit))
            {
                validationError = $"Unknown or unsupported outfitType enum value: '{outfitType}'";
                return false;
            }

            validationError = null;
            return true;
        }
    }
}
