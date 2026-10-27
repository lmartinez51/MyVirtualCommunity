using System;
using System.Collections.Generic;
using UnityEngine;
using MyVirtualCommunity.Character;
using MyVirtualCommunity.Player;

namespace MyVirtualCommunity.UI
{
    /// <summary>
    /// Phase B: In-game Avatar Appearance Panel Controller.
    /// Provides interactive runtime color customization for the player's stylized Bobblehead avatar.
    /// 
    /// GUARANTEES & INVARIANTS:
    /// 1. Draft/Preview: Changes are immediately reflected on the visible 3D avatar without saving to disk.
    /// 2. Apply: Validates candidate profile, saves to avatar_profile.json via BobbleheadProfileManager,
    ///    and promotes draft to session baseline.
    /// 3. Cancel: Restores the exact session opening snapshot onto the avatar and releases input lock.
    /// 4. Reset Colors: Restores only color fields to BobbleheadConfig.CreatePlayerConfig() defaults
    ///    in draft preview; requires Apply to persist. Non-color fields (hairStyle, outfitType, height) are preserved.
    /// 5. NPC Isolation: Only player avatar is recolored; Elena Morales and other NPCs remain unaffected.
    /// 6. Hierarchy Stability: In-place recoloring never destroys or recreates GameObject transforms or meshes.
    /// 7. Test Isolation: Supports CustomProfilePathForTesting so automated tests never touch the live profile.
    /// </summary>
    public class AvatarCustomizationController : MonoBehaviour
    {
        public static AvatarCustomizationController Instance { get; private set; }

        public bool IsOpen { get; private set; } = false;
        public BobbleheadConfig OpeningSnapshot { get; private set; }
        public BobbleheadConfig DraftConfig { get; private set; }
        public BobbleheadConfig CommittedConfig { get; private set; }
        public string StatusMessage { get; private set; } = "";
        public string CustomProfilePathForTesting { get; set; } = null;

        public int SelectedTabIndex { get; set; } = 0;
        public Vector2 ScrollPosition { get; set; } = Vector2.zero;

        [Serializable]
        public struct ColorSwatch
        {
            public string name;
            public Color color;
            public bool isDefault;

            public ColorSwatch(string name, Color color, bool isDefault = false)
            {
                this.name = name;
                this.color = color;
                this.isDefault = isDefault;
            }
        }

        public class ColorCategory
        {
            public string id;
            public string displayName;
            public string description;
            public int tabIndex; // 0: Face & Skin, 1: Hair & Headwear, 2: Clothing, 3: Footwear
            public List<ColorSwatch> swatches = new List<ColorSwatch>();
            public Func<BobbleheadConfig, Color> Getter;
            public Action<BobbleheadConfig, Color> Setter;
        }

        public List<ColorCategory> Categories { get; private set; } = new List<ColorCategory>();

        private readonly string[] TabNames = new string[]
        {
            "🙂 Face & Skin",
            "🧢 Hair & Headwear",
            "👕 Clothing",
            "👟 Footwear"
        };

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
            }
            else if (Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            InitializePalettes();
        }

        public void InitializePalettes()
        {
            Categories.Clear();
            var defaults = BobbleheadConfig.CreatePlayerConfig();

            // -----------------------------------------------------------------
            // TAB 0: FACE & SKIN
            // -----------------------------------------------------------------
            // 1. Skin Tone
            Categories.Add(new ColorCategory
            {
                id = "skinColor",
                displayName = "Skin Tone",
                description = "Head, neck, and hands",
                tabIndex = 0,
                Getter = c => c.skinColor,
                Setter = (c, v) => c.skinColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Warm Sand (Default)", defaults.skinColor, true),
                    new ColorSwatch("Fair Rose", new Color(0.96f, 0.86f, 0.80f)),
                    new ColorSwatch("Light Peach", new Color(0.94f, 0.82f, 0.72f)),
                    new ColorSwatch("Golden Warm", new Color(0.88f, 0.73f, 0.60f)),
                    new ColorSwatch("Olive Tan", new Color(0.80f, 0.65f, 0.50f)),
                    new ColorSwatch("Rich Honey", new Color(0.72f, 0.55f, 0.40f)),
                    new ColorSwatch("Deep Bronze", new Color(0.55f, 0.38f, 0.26f)),
                    new ColorSwatch("Espresso", new Color(0.36f, 0.24f, 0.17f))
                }
            });

            // 2. Eye Color (Iris)
            Categories.Add(new ColorCategory
            {
                id = "eyeColor",
                displayName = "Eye Color (Iris)",
                description = "Stylized eye iris disc",
                tabIndex = 0,
                Getter = c => c.eyeColor,
                Setter = (c, v) => c.eyeColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Deep Brown (Default)", defaults.eyeColor, true),
                    new ColorSwatch("Dark Obsidian", new Color(0.12f, 0.10f, 0.09f)),
                    new ColorSwatch("Hazel Amber", new Color(0.42f, 0.32f, 0.16f)),
                    new ColorSwatch("Forest Green", new Color(0.18f, 0.38f, 0.22f)),
                    new ColorSwatch("Ocean Blue", new Color(0.18f, 0.38f, 0.58f)),
                    new ColorSwatch("Steel Sky", new Color(0.35f, 0.50f, 0.65f)),
                    new ColorSwatch("Amethyst", new Color(0.40f, 0.25f, 0.48f))
                }
            });

            // 2b. Pupil Tone
            Categories.Add(new ColorCategory
            {
                id = "pupilColor",
                displayName = "Pupil Tone",
                description = "Stylized eye pupil center",
                tabIndex = 0,
                Getter = c => c.pupilColor,
                Setter = (c, v) => c.pupilColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("True Obsidian (Default)", defaults.pupilColor, true),
                    new ColorSwatch("Midnight Black", new Color(0.02f, 0.02f, 0.03f)),
                    new ColorSwatch("Charcoal Slate", new Color(0.08f, 0.09f, 0.11f)),
                    new ColorSwatch("Deep Onyx", new Color(0.04f, 0.04f, 0.05f)),
                    new ColorSwatch("Dark Espresso", new Color(0.09f, 0.06f, 0.05f)),
                    new ColorSwatch("Smoky Navy", new Color(0.05f, 0.07f, 0.10f))
                }
            });

            // 3. Eyebrows
            Categories.Add(new ColorCategory
            {
                id = "eyebrowColor",
                displayName = "Eyebrows",
                description = "Facial brow accents",
                tabIndex = 0,
                Getter = c => c.eyebrowColor,
                Setter = (c, v) => c.eyebrowColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Natural Dark (Default)", defaults.eyebrowColor, true),
                    new ColorSwatch("Jet Black", new Color(0.06f, 0.06f, 0.07f)),
                    new ColorSwatch("Warm Brown", new Color(0.28f, 0.18f, 0.12f)),
                    new ColorSwatch("Soft Chestnut", new Color(0.40f, 0.26f, 0.18f)),
                    new ColorSwatch("Ash Blonde", new Color(0.65f, 0.55f, 0.42f)),
                    new ColorSwatch("Silver Grey", new Color(0.50f, 0.52f, 0.55f))
                }
            });

            // 4. Lips & Smile
            Categories.Add(new ColorCategory
            {
                id = "lipColor",
                displayName = "Lips & Smile",
                description = "Stylized smile curve",
                tabIndex = 0,
                Getter = c => c.lipColor,
                Setter = (c, v) => c.lipColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Natural Rose (Default)", defaults.lipColor, true),
                    new ColorSwatch("Soft Peach", new Color(0.82f, 0.56f, 0.52f)),
                    new ColorSwatch("Warm Coral", new Color(0.85f, 0.45f, 0.40f)),
                    new ColorSwatch("Gentle Berry", new Color(0.72f, 0.35f, 0.42f)),
                    new ColorSwatch("Nude Neutral", new Color(0.70f, 0.52f, 0.48f)),
                    new ColorSwatch("Deep Wine", new Color(0.55f, 0.25f, 0.28f))
                }
            });

            // 5. Cheek Blush
            Categories.Add(new ColorCategory
            {
                id = "blushColor",
                displayName = "Cheek Blush",
                description = "Subtle cheek warmth",
                tabIndex = 0,
                Getter = c => c.blushColor,
                Setter = (c, v) => c.blushColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Subtle Rose (Default)", defaults.blushColor, true),
                    new ColorSwatch("Fresh Peach", new Color(0.95f, 0.60f, 0.45f, 0.35f)),
                    new ColorSwatch("Soft Coral", new Color(0.90f, 0.45f, 0.40f, 0.35f)),
                    new ColorSwatch("Warm Glow", new Color(0.88f, 0.52f, 0.42f, 0.30f)),
                    new ColorSwatch("Barely There", new Color(0.85f, 0.60f, 0.55f, 0.18f))
                }
            });

            // -----------------------------------------------------------------
            // TAB 1: HAIR & HEADWEAR
            // -----------------------------------------------------------------
            // 6. Hair Color
            Categories.Add(new ColorCategory
            {
                id = "hairColor",
                displayName = "Hair Color",
                description = "Forehead bangs & sideburns",
                tabIndex = 1,
                Getter = c => c.hairColor,
                Setter = (c, v) => c.hairColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Dark Espresso (Default)", defaults.hairColor, true),
                    new ColorSwatch("Jet Black", new Color(0.06f, 0.06f, 0.07f)),
                    new ColorSwatch("Chestnut Brown", new Color(0.30f, 0.18f, 0.12f)),
                    new ColorSwatch("Auburn Rust", new Color(0.48f, 0.22f, 0.14f)),
                    new ColorSwatch("Honey Blonde", new Color(0.78f, 0.62f, 0.38f)),
                    new ColorSwatch("Platinum Ash", new Color(0.85f, 0.85f, 0.88f)),
                    new ColorSwatch("Steel Silver", new Color(0.55f, 0.58f, 0.62f)),
                    new ColorSwatch("Vibrant Teal", new Color(0.12f, 0.52f, 0.54f))
                }
            });

            // 7. Headwear / Cap or Beanie
            Categories.Add(new ColorCategory
            {
                id = "headwearColor",
                displayName = "Headwear (Cap / Beanie)",
                description = "Baseball cap or winter beanie base",
                tabIndex = 1,
                Getter = c => c.headwearColor,
                Setter = (c, v) => c.headwearColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Charcoal Cap (Default)", defaults.headwearColor, true),
                    new ColorSwatch("Crimson Red", new Color(0.75f, 0.18f, 0.15f)),
                    new ColorSwatch("Deep Navy", new Color(0.12f, 0.18f, 0.28f)),
                    new ColorSwatch("Olive Drab", new Color(0.28f, 0.34f, 0.22f)),
                    new ColorSwatch("Golden Ochre", new Color(0.82f, 0.60f, 0.15f)),
                    new ColorSwatch("Off-White Cream", new Color(0.88f, 0.87f, 0.84f)),
                    new ColorSwatch("Pitch Black", new Color(0.08f, 0.08f, 0.09f)),
                    new ColorSwatch("Burgundy", new Color(0.45f, 0.12f, 0.18f))
                }
            });

            // 8. Headwear Accent / Emblem or Tag
            Categories.Add(new ColorCategory
            {
                id = "headwearAccentColor",
                displayName = "Headwear Emblem / Tag",
                description = "Cap front emblem or beanie label tag",
                tabIndex = 1,
                Getter = c => c.headwearAccentColor,
                Setter = (c, v) => c.headwearAccentColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Safety Orange (Default)", defaults.headwearAccentColor, true),
                    new ColorSwatch("Signal White", new Color(0.95f, 0.95f, 0.95f)),
                    new ColorSwatch("Bright Yellow", new Color(0.95f, 0.85f, 0.15f)),
                    new ColorSwatch("Electric Cyan", new Color(0.15f, 0.75f, 0.85f)),
                    new ColorSwatch("Scarlet Red", new Color(0.85f, 0.15f, 0.15f)),
                    new ColorSwatch("Lime Neon", new Color(0.55f, 0.85f, 0.15f)),
                    new ColorSwatch("Stealth Charcoal", new Color(0.18f, 0.20f, 0.22f))
                }
            });

            // -----------------------------------------------------------------
            // TAB 2: CLOTHING
            // -----------------------------------------------------------------
            // 9. Jacket / Outerwear
            Categories.Add(new ColorCategory
            {
                id = "outerwearColor",
                displayName = "Jacket / Outerwear",
                description = "Streetwear jacket & sleeves",
                tabIndex = 2,
                Getter = c => c.outerwearColor,
                Setter = (c, v) => c.outerwearColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Navy Casual (Default)", defaults.outerwearColor, true),
                    new ColorSwatch("Forest Utility", new Color(0.20f, 0.30f, 0.22f)),
                    new ColorSwatch("Crimson Streetwear", new Color(0.70f, 0.18f, 0.15f)),
                    new ColorSwatch("Charcoal Denim", new Color(0.18f, 0.20f, 0.22f)),
                    new ColorSwatch("Sand Trench", new Color(0.75f, 0.68f, 0.58f)),
                    new ColorSwatch("Mustard Gold", new Color(0.82f, 0.62f, 0.18f)),
                    new ColorSwatch("Deep Plum", new Color(0.38f, 0.18f, 0.30f)),
                    new ColorSwatch("Clean White", new Color(0.92f, 0.93f, 0.94f))
                }
            });

            // 10. Inner Tee / Collar
            Categories.Add(new ColorCategory
            {
                id = "innerwearColor",
                displayName = "Inner Tee / Collar",
                description = "Layered collar accent",
                tabIndex = 2,
                Getter = c => c.innerwearColor,
                Setter = (c, v) => c.innerwearColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Heather Grey (Default)", defaults.innerwearColor, true),
                    new ColorSwatch("Crisp White", new Color(0.95f, 0.95f, 0.96f)),
                    new ColorSwatch("Pitch Black", new Color(0.10f, 0.10f, 0.12f)),
                    new ColorSwatch("Navy Blue", new Color(0.15f, 0.20f, 0.32f)),
                    new ColorSwatch("Warm Cream", new Color(0.90f, 0.88f, 0.82f)),
                    new ColorSwatch("Crimson Accent", new Color(0.75f, 0.18f, 0.15f))
                }
            });

            // 11. Pants / Cargos
            Categories.Add(new ColorCategory
            {
                id = "pantsColor",
                displayName = "Pants / Cargos",
                description = "Waist, thighs, and calves",
                tabIndex = 2,
                Getter = c => c.pantsColor,
                Setter = (c, v) => c.pantsColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Olive Slate (Default)", defaults.pantsColor, true),
                    new ColorSwatch("Dark Indigo", new Color(0.14f, 0.18f, 0.28f)),
                    new ColorSwatch("Black Denim", new Color(0.10f, 0.10f, 0.12f)),
                    new ColorSwatch("Khaki Chino", new Color(0.68f, 0.60f, 0.48f)),
                    new ColorSwatch("Charcoal Grey", new Color(0.20f, 0.22f, 0.24f)),
                    new ColorSwatch("Desert Tan", new Color(0.78f, 0.72f, 0.62f))
                }
            });

            // -----------------------------------------------------------------
            // TAB 3: FOOTWEAR
            // -----------------------------------------------------------------
            // 12. Sneaker Base
            Categories.Add(new ColorCategory
            {
                id = "shoeBaseColor",
                displayName = "Sneaker Base",
                description = "Main shoe body",
                tabIndex = 3,
                Getter = c => c.shoeBaseColor,
                Setter = (c, v) => c.shoeBaseColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Retro White (Default)", defaults.shoeBaseColor, true),
                    new ColorSwatch("Triple Black", new Color(0.10f, 0.10f, 0.12f)),
                    new ColorSwatch("Cement Grey", new Color(0.60f, 0.62f, 0.65f)),
                    new ColorSwatch("Off-White Sail", new Color(0.92f, 0.90f, 0.85f)),
                    new ColorSwatch("Midnight Navy", new Color(0.14f, 0.18f, 0.28f)),
                    new ColorSwatch("Cardinal Red", new Color(0.72f, 0.16f, 0.14f))
                }
            });

            // 13. Sneaker Stripe
            Categories.Add(new ColorCategory
            {
                id = "shoeAccentColor",
                displayName = "Sneaker Stripe",
                description = "Side contrast stripe",
                tabIndex = 3,
                Getter = c => c.shoeAccentColor,
                Setter = (c, v) => c.shoeAccentColor = v,
                swatches = new List<ColorSwatch>
                {
                    new ColorSwatch("Speed Red (Default)", defaults.shoeAccentColor, true),
                    new ColorSwatch("Electric Neon", new Color(0.95f, 0.85f, 0.10f)),
                    new ColorSwatch("Royal Blue", new Color(0.15f, 0.40f, 0.85f)),
                    new ColorSwatch("Pitch Black", new Color(0.08f, 0.08f, 0.09f)),
                    new ColorSwatch("Pure White", new Color(0.96f, 0.96f, 0.98f)),
                    new ColorSwatch("Emerald Green", new Color(0.15f, 0.65f, 0.35f))
                }
            });
        }

        public void Open(BobbleheadConfig config = null)
        {
            if (Categories.Count == 0) InitializePalettes();

            if (config != null)
            {
                OpeningSnapshot = config.Clone();
            }
            else
            {
                var player = FindFirstObjectByType<PlayerController>();
                OpeningSnapshot = player != null ? player.CurrentBobbleheadConfig.Clone() : BobbleheadProfileManager.GetEffectivePlayerConfig();
            }

            DraftConfig = OpeningSnapshot.Clone();
            CommittedConfig = OpeningSnapshot.Clone();
            IsOpen = true;
            StatusMessage = "Draft session active. Changes preview live on your avatar.";

            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void Close(bool applied = false)
        {
            if (!applied && OpeningSnapshot != null)
            {
                Cancel();
                return;
            }

            IsOpen = false;
        }

        public void Toggle()
        {
            if (IsOpen)
            {
                Cancel();
            }
            else
            {
                Open();
            }
        }

        public void SelectSwatch(string categoryId, Color color)
        {
            if (DraftConfig == null) return;

            var cat = Categories.Find(c => c.id == categoryId);
            if (cat != null)
            {
                cat.Setter(DraftConfig, color);
                ApplyDraftToAvatar();
                StatusMessage = $"Updated {cat.displayName}. Previewing live.";
            }
        }

        public bool Apply(string customFilePath = null)
        {
            if (DraftConfig == null)
            {
                StatusMessage = "No draft configuration available to apply.";
                return false;
            }

            // 1. Explicit validation
            var candidateProfile = BobbleheadCustomizationProfile.FromConfig(DraftConfig);
            if (!candidateProfile.Validate(out string valErr))
            {
                StatusMessage = $"Validation failed: {valErr}";
                Debug.LogWarning($"[AvatarCustomizationController] {StatusMessage}");
                return false;
            }

            // 2. Local persistence via Phase A profile manager
            string savePath = customFilePath ?? CustomProfilePathForTesting;
            bool saved = BobbleheadProfileManager.TrySavePlayerConfig(DraftConfig, out string saveErr, savePath);
            if (!saved)
            {
                StatusMessage = $"Failed to save profile: {saveErr}";
                Debug.LogError($"[AvatarCustomizationController] {StatusMessage}");
                return false;
            }

            // 3. Promote draft to session baseline
            OpeningSnapshot = DraftConfig.Clone();
            CommittedConfig = DraftConfig.Clone();
            StatusMessage = "✓ Avatar appearance saved successfully!";
            Debug.Log("[AvatarCustomizationController] Avatar cosmetic profile saved and committed.");

            if (ProductHudController.Instance != null)
            {
                ProductHudController.Instance.ShowToast("✓ Avatar appearance saved successfully!");
            }

            Close(true);
            return true;
        }

        public void Cancel()
        {
            if (OpeningSnapshot != null)
            {
                DraftConfig = OpeningSnapshot.Clone();
                ApplyDraftToAvatar();
            }

            IsOpen = false;
            StatusMessage = "Editing cancelled. Reverted to opening appearance.";
            Debug.Log("[AvatarCustomizationController] Avatar editing cancelled. Restored session opening snapshot.");
        }

        public void SelectHairstyle(BobbleheadHairType hairType)
        {
            if (DraftConfig == null) return;
            DraftConfig.hairStyle = hairType;
            ApplyDraftToAvatar();
            StatusMessage = $"Selected hairstyle: {hairType}. Previewing live.";
        }

        public void SelectHeadwear(BobbleheadHeadwearType headwearType)
        {
            if (DraftConfig == null) return;
            DraftConfig.headwear = headwearType;
            ApplyDraftToAvatar();
            StatusMessage = $"Selected headwear: {headwearType}. Previewing live.";
        }

        public void SelectFaceShape(BobbleheadFaceShape shape)
        {
            if (DraftConfig == null) return;
            DraftConfig.faceShape = shape;
            ApplyDraftToAvatar();
            StatusMessage = $"Selected face shape: {shape}. Previewing live.";
        }

        public void SelectFacialHair(BobbleheadFacialHair facialHair)
        {
            if (DraftConfig == null) return;
            DraftConfig.facialHair = facialHair;
            ApplyDraftToAvatar();
            StatusMessage = $"Selected facial hair: {facialHair}. Previewing live.";
        }

        public void SelectBodyPresentation(BobbleheadBodyPresentation presentation)
        {
            if (DraftConfig == null) return;
            DraftConfig.bodyPresentation = presentation;
            ApplyDraftToAvatar();
            StatusMessage = $"Selected presentation: {presentation}. Previewing live.";
        }

        public void ResetAppearance()
        {
            if (DraftConfig == null) return;

            var defaultPlayer = BobbleheadConfig.CreatePlayerConfig();
            DraftConfig.CopyAppearanceFrom(defaultPlayer);
            ApplyDraftToAvatar();
            StatusMessage = "↺ Appearance & colors reset to defaults. Click Apply & Save to persist.";
            Debug.Log("[AvatarCustomizationController] Draft appearance reset to defaults (uncommitted).");
        }

        public void ResetColors()
        {
            if (DraftConfig == null) return;

            var defaultPlayer = BobbleheadConfig.CreatePlayerConfig();
            DraftConfig.CopyColorsFrom(defaultPlayer);
            ApplyDraftToAvatar();
            StatusMessage = "↺ Colors reset to defaults. Click Apply & Save to persist.";
            Debug.Log("[AvatarCustomizationController] Draft colors reset to defaults (uncommitted).");
        }

        public void ApplyDraftToAvatar()
        {
            if (DraftConfig == null) return;
            var player = FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                player.ApplyCustomizationConfig(DraftConfig);
            }
        }

        public int GetSelectedSwatchIndex(ColorCategory cat)
        {
            if (DraftConfig == null || cat == null) return -1;
            Color currentColor = cat.Getter(DraftConfig);
            for (int i = 0; i < cat.swatches.Count; i++)
            {
                if (ColorsMatch(cat.swatches[i].color, currentColor))
                {
                    return i;
                }
            }
            return -1;
        }

        private static bool ColorsMatch(Color a, Color b, float tolerance = 0.005f)
        {
            return Mathf.Abs(a.r - b.r) <= tolerance &&
                   Mathf.Abs(a.g - b.g) <= tolerance &&
                   Mathf.Abs(a.b - b.b) <= tolerance &&
                   Mathf.Abs(a.a - b.a) <= tolerance;
        }

        private void OnGUI()
        {
            if (!IsOpen || Screen.width <= 0 || Screen.height <= 0) return;

            DrawCustomizationPanel();
        }

        private void DrawCustomizationPanel()
        {
            // Soft overlay dimming
            Color prevColor = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.40f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = prevColor;

            // Panel frame on the left side of the screen so the 3D avatar remains visible on the right
            float panelWidth = Mathf.Min(600f, Screen.width - 40f);
            float panelHeight = Mathf.Min(620f, Screen.height - 70f);
            float panelX = 20f;
            float panelY = (Screen.height - panelHeight) / 2f;

            GUI.Box(new Rect(panelX, panelY, panelWidth, panelHeight), "");

            // 1. Header Banner
            GUI.Box(new Rect(panelX + 10, panelY + 10, panelWidth - 20, 52),
                "<b><size=17><color=#55CCFF>👤 CUSTOMIZE YOUR AVATAR</color></size></b>\n" +
                "<size=11><color=#CCCCCC>Personaliza los colores de tu personaje • Vista previa en vivo</color></size>");

            // Close (X) button in header
            if (GUI.Button(new Rect(panelX + panelWidth - 40, panelY + 14, 28, 26), "<b>X</b>"))
            {
                Cancel();
                return;
            }

            // Quick Camera View Toolbar right under header
            float camBarY = panelY + 68;
            GUI.Box(new Rect(panelX + 10, camBarY, panelWidth - 20, 32), "");
            GUI.Label(new Rect(panelX + 16, camBarY + 5, 80, 24), "<size=11><b>Cámara:</b></size>");

            Color origBg = GUI.backgroundColor;
            if (GUI.Button(new Rect(panelX + 90, camBarY + 4, 110, 24), "<size=11>Front View</size>"))
            {
                ProductHudController.Instance?.SetCameraPreset(CameraPreset.FrontView);
            }
            if (GUI.Button(new Rect(panelX + 205, camBarY + 4, 110, 24), "<size=11>Side View</size>"))
            {
                ProductHudController.Instance?.SetCameraPreset(CameraPreset.SideView);
            }
            if (GUI.Button(new Rect(panelX + 320, camBarY + 4, 110, 24), "<size=11>3rd Person</size>"))
            {
                ProductHudController.Instance?.SetCameraPreset(CameraPreset.ThirdPerson);
            }
            if (GUI.Button(new Rect(panelX + 435, camBarY + 4, 130, 24), "<size=11>Top Down</size>"))
            {
                ProductHudController.Instance?.SetCameraPreset(CameraPreset.TopDown);
            }

            // 2. Category Tab Navigation
            float tabY = camBarY + 38;
            float tabBtnWidth = (panelWidth - 20) / TabNames.Length;
            for (int t = 0; t < TabNames.Length; t++)
            {
                if (SelectedTabIndex == t) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                else GUI.backgroundColor = origBg;

                if (GUI.Button(new Rect(panelX + 10 + t * tabBtnWidth, tabY, tabBtnWidth - 2, 32), $"<b><size=11>{TabNames[t]}</size></b>"))
                {
                    SelectedTabIndex = t;
                    ScrollPosition = Vector2.zero;
                }
            }
            GUI.backgroundColor = origBg;

            // 3. Scrollable Color Swatch Content Area
            float scrollY = tabY + 38;
            float scrollHeight = panelHeight - 215;
            Rect viewRect = new Rect(panelX + 10, scrollY, panelWidth - 20, scrollHeight);

            // Compute total height of categories and appearance pickers in active tab
            List<ColorCategory> activeCats = Categories.FindAll(c => c.tabIndex == SelectedTabIndex);
            float appearanceHeaderHeight = 0f;
            if (SelectedTabIndex == 0) appearanceHeaderHeight = 152f; // Face Shape (74px) + Facial Hair (74px) + 4px
            else if (SelectedTabIndex == 1) appearanceHeaderHeight = 192f; // Headwear (74px) + Hairstyle (114px) + 4px
            else if (SelectedTabIndex == 2) appearanceHeaderHeight = 78f;  // Body Presentation (74px) + 4px

            float contentHeight = appearanceHeaderHeight + activeCats.Count * 92f;
            Rect contentRect = new Rect(0, 0, panelWidth - 40, Mathf.Max(contentHeight, scrollHeight));

            ScrollPosition = GUI.BeginScrollView(viewRect, ScrollPosition, contentRect);

            float currentCatY = 5f;

            // Appearance Pickers per Tab
            if (SelectedTabIndex == 0)
            {
                // 1. Face Shape
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 68), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>Forma del Rostro</b> <size=11><color=#88CCFF>[{DraftConfig.faceShape}]</color></size> — <size=10><color=#AAAAAA>Silueta y proporciones de mejillas/mandíbula</color></size>");

                float fsBtnW = (contentRect.width - 38) / 3f;
                var faceShapes = new[] { BobbleheadFaceShape.Round, BobbleheadFaceShape.Oval, BobbleheadFaceShape.Angular };
                var faceShapeNames = new[] { "Round (Default)", "Oval", "Angular" };
                for (int i = 0; i < faceShapes.Length; i++)
                {
                    bool isSel = DraftConfig.faceShape == faceShapes[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (fsBtnW + 5), currentCatY + 28, fsBtnW, 32), $"<b><size=11>{faceShapeNames[i]}</size></b>"))
                    {
                        SelectFaceShape(faceShapes[i]);
                    }
                }
                GUI.backgroundColor = origBg;
                currentCatY += 74f;

                // 2. Facial Hair
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 68), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>Vello Facial</b> <size=11><color=#88CCFF>[{DraftConfig.facialHair}]</color></size> — <size=10><color=#AAAAAA>Estilos de barba y bigote estilizados</color></size>");

                float fhBtnW = (contentRect.width - 44) / 5f;
                var facialHairs = new[] { BobbleheadFacialHair.None, BobbleheadFacialHair.SubtleStubble, BobbleheadFacialHair.Mustache, BobbleheadFacialHair.Goatee, BobbleheadFacialHair.FullBeard };
                var facialHairNames = new[] { "None (Def)", "Stubble", "Mustache", "Goatee", "Full Beard" };
                for (int i = 0; i < facialHairs.Length; i++)
                {
                    bool isSel = DraftConfig.facialHair == facialHairs[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (fhBtnW + 4), currentCatY + 28, fhBtnW, 32), $"<b><size=10>{facialHairNames[i]}</size></b>"))
                    {
                        SelectFacialHair(facialHairs[i]);
                    }
                }
                GUI.backgroundColor = origBg;
                currentCatY += 74f;
            }
            else if (SelectedTabIndex == 1)
            {
                // 1. Independent Headwear Selection (BaseballCap default, WinterBeanie, None)
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 68), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>Gorra / Accesorio de Cabeza</b> <size=11><color=#88CCFF>[{DraftConfig.headwear}]</color></size> — <size=10><color=#AAAAAA>Independiente del estilo de cabello</color></size>");

                float hwBtnW = (contentRect.width - 38) / 3f;
                var headwearTypes = new[] { BobbleheadHeadwearType.BaseballCap, BobbleheadHeadwearType.WinterBeanie, BobbleheadHeadwearType.None };
                var headwearNames = new[] { "Baseball Cap (Def)", "Winter Beanie", "None (Sin Gorra)" };
                for (int i = 0; i < headwearTypes.Length; i++)
                {
                    bool isSel = DraftConfig.headwear == headwearTypes[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (hwBtnW + 5), currentCatY + 28, hwBtnW, 32), $"<b><size=10>{headwearNames[i]}</size></b>"))
                    {
                        SelectHeadwear(headwearTypes[i]);
                    }
                }
                GUI.backgroundColor = origBg;
                currentCatY += 74f;

                // 2. Hairstyle Selection (6 player styles across 2 rows of 3)
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 108), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>Estilo de Cabello</b> <size=11><color=#88CCFF>[{DraftConfig.hairStyle}]</color></size> — <size=10><color=#AAAAAA>Se conserva debajo de la gorra o gorro</color></size>");

                var hairStylesRow1 = new[] { BobbleheadHairType.CasualShort, BobbleheadHairType.ShortTexturedCrop, BobbleheadHairType.AfroCurly };
                var hairNamesRow1 = new[] { "Casual Short (Def)", "Textured Crop", "Afro / Curly" };
                float hairBtnW = (contentRect.width - 38) / 3f;

                for (int i = 0; i < hairStylesRow1.Length; i++)
                {
                    bool isSel = DraftConfig.hairStyle == hairStylesRow1[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (hairBtnW + 5), currentCatY + 28, hairBtnW, 32), $"<b><size=10>{hairNamesRow1[i]}</size></b>"))
                    {
                        SelectHairstyle(hairStylesRow1[i]);
                    }
                }

                var hairStylesRow2 = new[] { BobbleheadHairType.SidePartedWavy, BobbleheadHairType.HighPonytail, BobbleheadHairType.Bald };
                var hairNamesRow2 = new[] { "Wavy Side-Part", "High Ponytail", "Bald" };
                for (int i = 0; i < hairStylesRow2.Length; i++)
                {
                    bool isSel = DraftConfig.hairStyle == hairStylesRow2[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (hairBtnW + 5), currentCatY + 66, hairBtnW, 32), $"<b><size=10>{hairNamesRow2[i]}</size></b>"))
                    {
                        SelectHairstyle(hairStylesRow2[i]);
                    }
                }
                GUI.backgroundColor = origBg;
                currentCatY += 114f;
            }
            else if (SelectedTabIndex == 2)
            {
                // Body Presentation Selection
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 68), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>Presentación Corporal</b> <size=11><color=#88CCFF>[{DraftConfig.bodyPresentation}]</color></size> — <size=10><color=#AAAAAA>Proporciones visuales de hombros, torso y silueta</color></size>");

                float bpBtnW = (contentRect.width - 38) / 3f;
                var presentations = new[] { BobbleheadBodyPresentation.Original, BobbleheadBodyPresentation.Masculine, BobbleheadBodyPresentation.Feminine };
                var presentationNames = new[] { "Original (Def)", "Masculine", "Feminine" };
                for (int i = 0; i < presentations.Length; i++)
                {
                    bool isSel = DraftConfig.bodyPresentation == presentations[i];
                    if (isSel) GUI.backgroundColor = new Color(0.20f, 0.75f, 0.85f);
                    else GUI.backgroundColor = origBg;

                    if (GUI.Button(new Rect(14 + i * (bpBtnW + 5), currentCatY + 28, bpBtnW, 32), $"<b><size=11>{presentationNames[i]}</size></b>"))
                    {
                        SelectBodyPresentation(presentations[i]);
                    }
                }
                GUI.backgroundColor = origBg;
                currentCatY += 74f;
            }

            for (int cIdx = 0; cIdx < activeCats.Count; cIdx++)
            {
                var cat = activeCats[cIdx];
                int selectedIdx = GetSelectedSwatchIndex(cat);
                Color currentColor = cat.Getter(DraftConfig);
                string currentName = selectedIdx >= 0 ? cat.swatches[selectedIdx].name : $"Custom (#{ColorUtility.ToHtmlStringRGB(currentColor)})";

                // Category Title Box
                GUI.Box(new Rect(5, currentCatY, contentRect.width - 10, 84), "");
                GUI.Label(new Rect(14, currentCatY + 4, contentRect.width - 30, 22),
                    $"<b>{cat.displayName}</b> <size=11><color=#88CCFF>[{currentName}]</color></size> — <size=10><color=#AAAAAA>{cat.description}</color></size>");

                // Render Swatches
                float swatchStartX = 14f;
                float swatchY = currentCatY + 28f;
                float swatchW = 54f;
                float swatchH = 46f;
                float spacing = 6f;

                for (int s = 0; s < cat.swatches.Count; s++)
                {
                    var swatch = cat.swatches[s];
                    bool isSelected = s == selectedIdx;
                    Rect swatchRect = new Rect(swatchStartX + s * (swatchW + spacing), swatchY, swatchW, swatchH);

                    // Draw swatch background
                    GUI.backgroundColor = swatch.color;
                    string label = isSelected ? "<b><size=16>✓</size></b>" : (swatch.isDefault ? "<size=9>DEF</size>" : "");
                    if (GUI.Button(swatchRect, label))
                    {
                        SelectSwatch(cat.id, swatch.color);
                    }
                    GUI.backgroundColor = origBg;

                    // Selected highlight frame
                    if (isSelected)
                    {
                        GUI.Box(new Rect(swatchRect.x - 2, swatchRect.y - 2, swatchRect.width + 4, swatchRect.height + 4), "");
                    }
                }

                currentCatY += 92f;
            }

            GUI.EndScrollView();

            // 4. Status Bar
            float statusY = panelY + panelHeight - 75;
            GUI.Box(new Rect(panelX + 10, statusY, panelWidth - 20, 26), $"<b><size=11>{StatusMessage}</size></b>");

            // 5. Action Buttons (Apply, Reset Colors, Reset Appearance, Cancel)
            float btnY = statusY + 30;
            float btnSpacing = 6f;
            float btnW = (panelWidth - 20 - btnSpacing * 3) / 4f;

            // Apply & Save
            GUI.backgroundColor = new Color(0.20f, 0.75f, 0.35f);
            if (GUI.Button(new Rect(panelX + 10, btnY, btnW, 36), "<b><size=11>✓ GUARDAR</size></b>"))
            {
                Apply();
            }
            GUI.backgroundColor = origBg;

            // Reset Colors
            GUI.backgroundColor = new Color(0.85f, 0.55f, 0.15f);
            if (GUI.Button(new Rect(panelX + 10 + (btnW + btnSpacing), btnY, btnW, 36), "<b><size=10>↺ COLORES</size></b>"))
            {
                ResetColors();
            }
            GUI.backgroundColor = origBg;

            // Reset Full Appearance (Phase C)
            GUI.backgroundColor = new Color(0.85f, 0.38f, 0.18f);
            if (GUI.Button(new Rect(panelX + 10 + (btnW + btnSpacing) * 2, btnY, btnW, 36), "<b><size=10>↺ APARIENCIA</size></b>"))
            {
                ResetAppearance();
            }
            GUI.backgroundColor = origBg;

            // Cancel
            GUI.backgroundColor = new Color(0.65f, 0.25f, 0.25f);
            if (GUI.Button(new Rect(panelX + 10 + (btnW + btnSpacing) * 3, btnY, btnW, 36), "<b><size=11>✕ CANCELAR</size></b>"))
            {
                Cancel();
            }
            GUI.backgroundColor = origBg;
        }
    }
}
