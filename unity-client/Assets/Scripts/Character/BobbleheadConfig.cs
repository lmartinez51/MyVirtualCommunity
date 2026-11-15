using System;
using UnityEngine;

namespace MyVirtualCommunity.Character
{
    public enum BobbleheadHairType
    {
        StreetBeanie, // Legacy Schema v1/v2 combined option; migrated to CasualShort + BaseballCap in Schema v3
        AttendantBun,
        CasualShort,
        ShortTexturedCrop,
        AfroCurly,
        SidePartedWavy,
        HighPonytail,
        Bald
    }

    public enum BobbleheadHeadwearType
    {
        None = 0,
        BaseballCap = 1,
        WinterBeanie = 2
    }

    public enum BobbleheadFaceShape
    {
        Round,
        Oval,
        Angular
    }

    public enum BobbleheadFacialHair
    {
        None,
        SubtleStubble,
        Mustache,
        Goatee,
        FullBeard
    }

    public enum BobbleheadBodyPresentation
    {
        Original,
        Masculine,
        Feminine
    }

    public enum BobbleheadOutfitType
    {
        StreetwearJacket,
        WingSpotAttendant
    }

    /// <summary>
    /// Data-driven configuration container for stylized Bobblehead characters.
    /// Provides modular presets for the Player avatar and Elena Morales.
    /// </summary>
    [Serializable]
    public class BobbleheadConfig
    {
        public const string ArchetypeIdentifier = "MVC_BobbleheadBase";

        public string archetypeId = ArchetypeIdentifier;
        public string characterName = "Character";
        public float totalHeight = 1.75f;
        public float headScale = 1.0f;

        // Appearance Variations (Phase C)
        public BobbleheadFaceShape faceShape = BobbleheadFaceShape.Round;
        public BobbleheadFacialHair facialHair = BobbleheadFacialHair.None;
        public BobbleheadBodyPresentation bodyPresentation = BobbleheadBodyPresentation.Original;

        // Skin & Face Colors
        public Color skinColor = new Color(0.92f, 0.77f, 0.67f);
        public Color eyeColor = new Color(0.28f, 0.18f, 0.12f);
        public Color pupilColor = new Color(0.06f, 0.06f, 0.08f);
        public Color eyebrowColor = new Color(0.12f, 0.10f, 0.08f);
        public Color lipColor = new Color(0.78f, 0.45f, 0.42f);
        public Color blushColor = new Color(0.92f, 0.55f, 0.50f, 0.35f);

        // Hair & Headwear (Separated in Schema v3: Hairstyle != Headwear)
        public BobbleheadHairType hairStyle = BobbleheadHairType.CasualShort;
        public BobbleheadHeadwearType headwear = BobbleheadHeadwearType.BaseballCap;
        public Color hairColor = new Color(0.12f, 0.10f, 0.08f);
        public Color headwearColor = new Color(0.18f, 0.22f, 0.26f);
        public Color headwearAccentColor = new Color(0.85f, 0.20f, 0.12f);

        // Clothing
        public BobbleheadOutfitType outfitType = BobbleheadOutfitType.StreetwearJacket;
        public Color outerwearColor = new Color(0.18f, 0.24f, 0.32f);
        public Color innerwearColor = new Color(0.75f, 0.75f, 0.78f);
        public Color pantsColor = new Color(0.22f, 0.25f, 0.28f);
        public Color shoeBaseColor = new Color(0.92f, 0.92f, 0.94f);
        public Color shoeAccentColor = new Color(0.85f, 0.20f, 0.12f);

        // Accessories & Badges
        public bool hasNameBadge = false;
        public string badgeText = "";

        public static BobbleheadConfig CreatePlayerConfig()
        {
            return new BobbleheadConfig
            {
                archetypeId = ArchetypeIdentifier,
                characterName = "Player",
                totalHeight = 1.75f,
                headScale = 1.0f,
                faceShape = BobbleheadFaceShape.Round,
                facialHair = BobbleheadFacialHair.None,
                bodyPresentation = BobbleheadBodyPresentation.Original,
                skinColor = new Color(0.93f, 0.79f, 0.70f),
                eyeColor = new Color(0.25f, 0.18f, 0.12f),
                pupilColor = new Color(0.05f, 0.05f, 0.06f),
                hairColor = new Color(0.14f, 0.11f, 0.09f),
                eyebrowColor = new Color(0.14f, 0.11f, 0.09f),
                lipColor = new Color(0.75f, 0.48f, 0.45f),
                hairStyle = BobbleheadHairType.CasualShort,
                headwear = BobbleheadHeadwearType.BaseballCap,
                headwearColor = new Color(0.20f, 0.24f, 0.28f),      // Charcoal/slate cap & beanie base
                headwearAccentColor = new Color(0.88f, 0.32f, 0.16f),// Subtle orange-red cap emblem / beanie label
                outfitType = BobbleheadOutfitType.StreetwearJacket,
                outerwearColor = new Color(0.16f, 0.24f, 0.32f),     // Navy casual streetwear overshirt
                innerwearColor = new Color(0.78f, 0.80f, 0.82f),     // Heather grey inner tee
                pantsColor = new Color(0.22f, 0.26f, 0.24f),         // Olive-slate streetwear cargos
                shoeBaseColor = new Color(0.95f, 0.95f, 0.96f),      // Retro white sneakers
                shoeAccentColor = new Color(0.85f, 0.20f, 0.15f),    // Red contrast side stripe
                hasNameBadge = false,
                badgeText = ""
            };
        }

        public static BobbleheadConfig CreateElenaConfig()
        {
            return new BobbleheadConfig
            {
                archetypeId = ArchetypeIdentifier,
                characterName = "Elena Morales",
                totalHeight = 1.68f,
                headScale = 0.98f,
                faceShape = BobbleheadFaceShape.Round,
                facialHair = BobbleheadFacialHair.None,
                bodyPresentation = BobbleheadBodyPresentation.Original,
                skinColor = new Color(0.91f, 0.76f, 0.66f),
                eyeColor = new Color(0.18f, 0.12f, 0.08f),          // Dark espresso eyes
                pupilColor = new Color(0.04f, 0.04f, 0.05f),
                hairColor = new Color(0.10f, 0.07f, 0.05f),         // Rich dark hair
                eyebrowColor = new Color(0.10f, 0.07f, 0.05f),
                lipColor = new Color(0.82f, 0.42f, 0.40f),          // Gentle friendly rose lip
                hairStyle = BobbleheadHairType.AttendantBun,
                headwear = BobbleheadHeadwearType.None,
                headwearColor = new Color(0.85f, 0.20f, 0.12f),     // Wing Spot signature red visor/band
                headwearAccentColor = Color.white,
                outfitType = BobbleheadOutfitType.WingSpotAttendant,
                outerwearColor = new Color(0.85f, 0.20f, 0.12f),     // Wing Spot red attendant polo/apron
                innerwearColor = Color.white,                         // Crisp white service collar
                pantsColor = new Color(0.14f, 0.14f, 0.16f),         // Professional charcoal-black trousers
                shoeBaseColor = new Color(0.12f, 0.12f, 0.14f),      // Practical non-slip black shoes
                shoeAccentColor = new Color(0.26f, 0.26f, 0.28f),    // Dark grey rubber sole
                hasNameBadge = true,
                badgeText = "ELENA"
            };
        }

        /// <summary>
        /// Creates a deep copy of this BobbleheadConfig instance.
        /// </summary>
        public BobbleheadConfig Clone()
        {
            return new BobbleheadConfig
            {
                archetypeId = this.archetypeId,
                characterName = this.characterName,
                totalHeight = this.totalHeight,
                headScale = this.headScale,
                faceShape = this.faceShape,
                facialHair = this.facialHair,
                bodyPresentation = this.bodyPresentation,
                skinColor = this.skinColor,
                eyeColor = this.eyeColor,
                pupilColor = this.pupilColor,
                eyebrowColor = this.eyebrowColor,
                lipColor = this.lipColor,
                blushColor = this.blushColor,
                hairStyle = this.hairStyle,
                headwear = this.headwear,
                hairColor = this.hairColor,
                headwearColor = this.headwearColor,
                headwearAccentColor = this.headwearAccentColor,
                outfitType = this.outfitType,
                outerwearColor = this.outerwearColor,
                innerwearColor = this.innerwearColor,
                pantsColor = this.pantsColor,
                shoeBaseColor = this.shoeBaseColor,
                shoeAccentColor = this.shoeAccentColor,
                hasNameBadge = this.hasNameBadge,
                badgeText = this.badgeText
            };
        }

        /// <summary>
        /// Copies ONLY color fields from source into this instance.
        /// Leaves characterName, totalHeight, headScale, hairStyle, outfitType, hasNameBadge, and badgeText unchanged.
        /// </summary>
        public void CopyColorsFrom(BobbleheadConfig source)
        {
            if (source == null) return;
            this.skinColor = source.skinColor;
            this.eyeColor = source.eyeColor;
            this.pupilColor = source.pupilColor;
            this.eyebrowColor = source.eyebrowColor;
            this.lipColor = source.lipColor;
            this.blushColor = source.blushColor;
            this.hairColor = source.hairColor;
            this.headwearColor = source.headwearColor;
            this.headwearAccentColor = source.headwearAccentColor;
            this.outerwearColor = source.outerwearColor;
            this.innerwearColor = source.innerwearColor;
            this.pantsColor = source.pantsColor;
            this.shoeBaseColor = source.shoeBaseColor;
            this.shoeAccentColor = source.shoeAccentColor;
        }

        /// <summary>
        /// Compares all color fields with another configuration within a numerical tolerance.
        /// </summary>
        public bool AreColorsEqual(BobbleheadConfig other, float tolerance = 0.002f)
        {
            if (other == null) return false;
            return ColorsMatch(this.skinColor, other.skinColor, tolerance) &&
                   ColorsMatch(this.eyeColor, other.eyeColor, tolerance) &&
                   ColorsMatch(this.pupilColor, other.pupilColor, tolerance) &&
                   ColorsMatch(this.eyebrowColor, other.eyebrowColor, tolerance) &&
                   ColorsMatch(this.lipColor, other.lipColor, tolerance) &&
                   ColorsMatch(this.blushColor, other.blushColor, tolerance) &&
                   ColorsMatch(this.hairColor, other.hairColor, tolerance) &&
                   ColorsMatch(this.headwearColor, other.headwearColor, tolerance) &&
                   ColorsMatch(this.headwearAccentColor, other.headwearAccentColor, tolerance) &&
                   ColorsMatch(this.outerwearColor, other.outerwearColor, tolerance) &&
                   ColorsMatch(this.innerwearColor, other.innerwearColor, tolerance) &&
                   ColorsMatch(this.pantsColor, other.pantsColor, tolerance) &&
                   ColorsMatch(this.shoeBaseColor, other.shoeBaseColor, tolerance) &&
                   ColorsMatch(this.shoeAccentColor, other.shoeAccentColor, tolerance);
        }

        /// <summary>
        /// Copies appearance options (hairStyle, headwear, faceShape, facialHair, bodyPresentation) AND colors from source.
        /// Leaves non-appearance identity fields (characterName, totalHeight, headScale, outfitType, hasNameBadge, badgeText) unchanged.
        /// </summary>
        public void CopyAppearanceFrom(BobbleheadConfig source)
        {
            if (source == null) return;
            this.hairStyle = source.hairStyle;
            this.headwear = source.headwear;
            this.faceShape = source.faceShape;
            this.facialHair = source.facialHair;
            this.bodyPresentation = source.bodyPresentation;
            CopyColorsFrom(source);
        }

        /// <summary>
        /// Compares all appearance fields (hairStyle, headwear, faceShape, facialHair, bodyPresentation) and colors with another configuration.
        /// </summary>
        public bool AreAppearancesEqual(BobbleheadConfig other, float tolerance = 0.002f)
        {
            if (other == null) return false;
            return this.hairStyle == other.hairStyle &&
                   this.headwear == other.headwear &&
                   this.faceShape == other.faceShape &&
                   this.facialHair == other.facialHair &&
                   this.bodyPresentation == other.bodyPresentation &&
                   AreColorsEqual(other, tolerance);
        }

        private static bool ColorsMatch(Color a, Color b, float tolerance)
        {
            return Mathf.Abs(a.r - b.r) <= tolerance &&
                   Mathf.Abs(a.g - b.g) <= tolerance &&
                   Mathf.Abs(a.b - b.b) <= tolerance &&
                   Mathf.Abs(a.a - b.a) <= tolerance;
        }
    }
}
