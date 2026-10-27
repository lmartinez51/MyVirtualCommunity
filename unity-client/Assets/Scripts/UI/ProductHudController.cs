using System;
using UnityEngine;
using UnityEngine.UI;
using MyVirtualCommunity.Core;
using MyVirtualCommunity.Player;
using MyVirtualCommunity.Npc;

namespace MyVirtualCommunity.UI
{
    /// <summary>
    /// ProductHudController renders the product-quality presentation HUD:
    /// - World time (Ciudad Juárez local civil time)
    /// - Current location badge
    /// - Contextual interaction prompt
    /// - Controls legend
    /// - Elena dialogue speech panel
    /// - Dedicated, styled Wing Spot Restaurant Menu Modal (toggled via Elena service inquiry, [M], or button)
    /// - Developer diagnostics overlay (toggled via F3)
    /// 
    /// Includes an immediate-mode OnGUI fallback so the HUD is 100% visible
    /// even if UI Canvas prefabs are not pre-baked in the scene.
    /// </summary>
    public class ProductHudController : MonoBehaviour
    {
        public static ProductHudController Instance { get; private set; }

        [Header("Optional Canvas UI References")]
        [SerializeField] private Text worldTimeText;
        [SerializeField] private Text locationText;
        [SerializeField] private GameObject interactionPromptPanel;
        [SerializeField] private Text interactionPromptText;
        [SerializeField] private GameObject dialoguePanel;
        [SerializeField] private Text dialogueSpeakerText;
        [SerializeField] private Text dialogueBodyText;
        [SerializeField] private Image connectionIndicator;
        [SerializeField] private GameObject diagnosticsPanel;
        [SerializeField] private Text diagnosticsText;

        private float dialogueDismissTimer = 0f;
        private const float DIALOGUE_DISPLAY_DURATION = 6.0f;
        private bool showDiagnostics = false;
        private bool isMenuModalOpen = false;
        private bool isPauseMenuOpen = false;
        private bool isExitConfirmOpen = false;
        private bool isQuickTravelMenuOpen = false;
        private string activeToast = "";
        private float toastDismissTimer = 0f;
        private Texture2D shimmerTexture;

        private string activePrompt = "";
        private string activeSpeaker = "";
        private string activeDialogue = "";
        private string activeLocationName = "Blvd. Manuel Gómez Morín";
        private string activeCivilTimeString = "10:00 AM (Ciudad Juárez)";
        private bool isServerConnected = false;
        private AvatarCustomizationController avatarCustomizationController;

        public AvatarCustomizationController AvatarCustomization
        {
            get
            {
                if (avatarCustomizationController == null)
                {
                    avatarCustomizationController = GetComponent<AvatarCustomizationController>() ?? gameObject.AddComponent<AvatarCustomizationController>();
                }
                return avatarCustomizationController;
            }
        }

        public bool IsAvatarModalOpen => AvatarCustomization != null && AvatarCustomization.IsOpen;
        public bool IsMenuModalOpen => isMenuModalOpen;
        public bool IsPauseMenuOpen => isPauseMenuOpen;
        public bool IsExitConfirmOpen => isExitConfirmOpen;
        public bool IsModalActive => isMenuModalOpen || isPauseMenuOpen || isExitConfirmOpen || IsAvatarModalOpen;

        public void ShowToast(string message, float duration = 4.0f)
        {
            activeToast = message;
            toastDismissTimer = duration;
        }

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

            avatarCustomizationController = GetComponent<AvatarCustomizationController>();
            if (avatarCustomizationController == null)
            {
                avatarCustomizationController = gameObject.AddComponent<AvatarCustomizationController>();
            }
        }

        private void Start()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated += HandleWorldStateHydrated;
                WorldCoreClient.Instance.OnConnectionStatusChanged += HandleConnectionStatusChanged;
            }

            var player = FindFirstObjectByType<PlayerController>();
            if (player != null)
            {
                player.OnPromptAvailable += ShowPrompt;
                player.OnPromptCleared += HidePrompt;
            }

            var elena = FindFirstObjectByType<ElenaNpcController>();
            if (elena != null)
            {
                elena.OnDialogueTriggered += ShowDialogue;
            }

            HidePrompt();
            HideDialogue();
            if (diagnosticsPanel != null) diagnosticsPanel.SetActive(false);
        }

        private void OnDestroy()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated -= HandleWorldStateHydrated;
                WorldCoreClient.Instance.OnConnectionStatusChanged -= HandleConnectionStatusChanged;
            }
            if (shimmerTexture != null)
            {
                Destroy(shimmerTexture);
                shimmerTexture = null;
            }
        }

        private void Update()
        {
            if (dialogueDismissTimer > 0f)
            {
                dialogueDismissTimer -= Time.deltaTime;
                if (dialogueDismissTimer <= 0f)
                {
                    HideDialogue();
                }
            }

            if (toastDismissTimer > 0f)
            {
                toastDismissTimer -= Time.deltaTime;
                if (toastDismissTimer <= 0f)
                {
                    activeToast = "";
                }
            }

            // Hotkeys [1] to [6] for camera preset switching
            if (!isMenuModalOpen && !IsAvatarModalOpen)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1)) SetCameraPreset(CameraPreset.ThirdPerson);
                else if (Input.GetKeyDown(KeyCode.Alpha2)) SetCameraPreset(CameraPreset.FirstPerson);
                else if (Input.GetKeyDown(KeyCode.Alpha3)) SetCameraPreset(CameraPreset.FrontView);
                else if (Input.GetKeyDown(KeyCode.Alpha4)) SetCameraPreset(CameraPreset.SideView);
                else if (Input.GetKeyDown(KeyCode.Alpha5)) SetCameraPreset(CameraPreset.TopDown);
                else if (Input.GetKeyDown(KeyCode.Alpha6)) ResetCameraPreset();
            }

            // [M] key toggles the Wing Spot Restaurant Menu
            if (Input.GetKeyDown(KeyCode.M))
            {
                if (!isPauseMenuOpen && !isExitConfirmOpen && !IsAvatarModalOpen)
                {
                    ToggleMenuModal();
                }
            }

            // [C] key toggles the Avatar Customization Panel
            if (Input.GetKeyDown(KeyCode.C))
            {
                if (!isPauseMenuOpen && !isExitConfirmOpen && !isMenuModalOpen)
                {
                    ToggleAvatarCustomization();
                }
            }

            // [Escape] key handles clean priority closing / pause toggle / cursor release
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                if (IsAvatarModalOpen)
                {
                    CloseAvatarCustomization();
                }
                else if (isMenuModalOpen)
                {
                    CloseMenuModal();
                }
                else if (isExitConfirmOpen)
                {
                    isExitConfirmOpen = false;
                }
                else if (isPauseMenuOpen)
                {
                    ResumeGame();
                }
                else if (Cursor.lockState == CursorLockMode.Locked)
                {
                    // If cursor is locked, pressing Esc releases/frees the cursor without opening pause menu
                    Cursor.lockState = CursorLockMode.None;
                    Cursor.visible = true;
                }
                else
                {
                    OpenPauseMenu();
                }
            }

            // F3 key toggles developer diagnostics overlay
            if (Input.GetKeyDown(KeyCode.F3))
            {
                showDiagnostics = !showDiagnostics;
                if (diagnosticsPanel != null)
                {
                    diagnosticsPanel.SetActive(showDiagnostics);
                }
            }

            if (showDiagnostics && diagnosticsText != null)
            {
                UpdateDiagnosticsText();
            }
        }

        public void OpenAvatarCustomization()
        {
            if (avatarCustomizationController != null)
            {
                avatarCustomizationController.Open();
            }
        }

        public void CloseAvatarCustomization()
        {
            if (avatarCustomizationController != null)
            {
                avatarCustomizationController.Cancel();
            }
        }

        public void ToggleAvatarCustomization()
        {
            if (avatarCustomizationController != null)
            {
                avatarCustomizationController.Toggle();
            }
        }

        public void OpenMenuModal()
        {
            isMenuModalOpen = true;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void CloseMenuModal()
        {
            isMenuModalOpen = false;
        }

        public void ToggleMenuModal()
        {
            if (isMenuModalOpen)
            {
                CloseMenuModal();
            }
            else
            {
                OpenMenuModal();
            }
        }

        public void OpenPauseMenu()
        {
            isPauseMenuOpen = true;
            isExitConfirmOpen = false;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void ResumeGame()
        {
            isPauseMenuOpen = false;
            isExitConfirmOpen = false;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        public void RequestExitGame()
        {
            isExitConfirmOpen = true;
        }

        public void ConfirmExitGame()
        {
            Debug.Log("[ProductHudController] Exit confirmed. Quitting application safely.");
            Application.Quit();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#endif
        }

        public void CancelExitGame()
        {
            isExitConfirmOpen = false;
        }

        public void SetCameraPreset(CameraPreset preset)
        {
            var cam = Camera.main != null ? Camera.main.GetComponent<ThirdPersonCamera>() : FindFirstObjectByType<ThirdPersonCamera>();
            cam?.ApplyPreset(preset);
        }

        public void ResetCameraPreset()
        {
            var cam = Camera.main != null ? Camera.main.GetComponent<ThirdPersonCamera>() : FindFirstObjectByType<ThirdPersonCamera>();
            cam?.ResetCamera();
        }

        /// <summary>
        /// Determines if the mouse pointer is currently positioned over an interactive UI element
        /// (uGUI or IMGUI toolbars, buttons, dropdowns, or open modal windows).
        /// </summary>
        public bool IsMouseOverUI()
        {
            if (isMenuModalOpen || isPauseMenuOpen || isExitConfirmOpen || IsAvatarModalOpen) return true;
            if (UnityEngine.EventSystems.EventSystem.current != null &&
                UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject()) return true;

            if (Screen.width <= 0 || Screen.height <= 0) return false;

            Vector2 guiMouse = new Vector2(Input.mousePosition.x, Screen.height - Input.mousePosition.y);

            // Top-Left: Location badge & Quick Travel panel
            float qtHeight = isQuickTravelMenuOpen ? 340f : 85f;
            if (new Rect(10, 10, 350, qtHeight).Contains(guiMouse)) return true;

            // Top-Center: Camera preset toolbar
            float barWidth = 580f;
            float barX = (Screen.width - barWidth) / 2f;
            if (new Rect(barX - 10, 10, barWidth + 20, 50).Contains(guiMouse)) return true;

            // Top-Right: Pause shortcut button, Clock, & Avatar button
            if (new Rect(Screen.width - 430, 10, 425, 48).Contains(guiMouse)) return true;

            // F3 Developer diagnostics overlay
            if (showDiagnostics && new Rect(10, 55, 410, 235).Contains(guiMouse)) return true;

            // Bottom controls / dialogue / prompt areas
            if (dialogueDismissTimer > 0f && new Rect(Screen.width / 2f - 275, Screen.height - 185, 550, 85).Contains(guiMouse)) return true;
            if (!string.IsNullOrEmpty(activePrompt) && new Rect(Screen.width / 2f - 225, Screen.height - 90, 450, 50).Contains(guiMouse)) return true;

            return false;
        }

        public void ShowPrompt(string prompt)
        {
            activePrompt = prompt;
            if (interactionPromptPanel != null) interactionPromptPanel.SetActive(true);
            if (interactionPromptText != null) interactionPromptText.text = prompt;
        }

        public void HidePrompt()
        {
            activePrompt = "";
            if (interactionPromptPanel != null) interactionPromptPanel.SetActive(false);
        }

        public void ShowDialogue(string speaker, string body)
        {
            activeSpeaker = speaker;
            activeDialogue = body;
            dialogueDismissTimer = DIALOGUE_DISPLAY_DURATION;

            if (dialoguePanel != null) dialoguePanel.SetActive(true);
            if (dialogueSpeakerText != null) dialogueSpeakerText.text = speaker;
            if (dialogueBodyText != null) dialogueBodyText.text = $"\"{body}\"";
        }

        public void HideDialogue()
        {
            activeSpeaker = "";
            activeDialogue = "";
            if (dialoguePanel != null) dialoguePanel.SetActive(false);
        }

        private void HandleWorldStateHydrated(LocationViewData view)
        {
            if (view?.location != null)
            {
                activeLocationName = view.location.name;
                if (locationText != null)
                {
                    locationText.text = $"📍 {view.location.name}";
                }

                var ct = view.temporalContext?.civilTime ?? view.location?.civilTime;
                if (ct != null)
                {
                    string amPm = ct.hour >= 12 ? "PM" : "AM";
                    int displayHour = ct.hour % 12;
                    if (displayHour == 0) displayHour = 12;
                    activeCivilTimeString = $"{displayHour:D2}:{ct.minute:D2} {amPm} (Ciudad Juárez)";

                    if (worldTimeText != null)
                    {
                        worldTimeText.text = $"🕒 {activeCivilTimeString}";
                    }
                }
            }
        }

        private void HandleConnectionStatusChanged(bool isConnected, string statusMessage)
        {
            isServerConnected = isConnected;
            if (connectionIndicator != null)
            {
                connectionIndicator.color = isConnected ? new Color(0.2f, 0.85f, 0.3f) : new Color(0.9f, 0.2f, 0.2f);
            }
        }

        private void UpdateDiagnosticsText()
        {
            if (diagnosticsText == null || WorldCoreClient.Instance == null) return;
            diagnosticsText.text = BuildDiagnosticsString();
        }

        private string BuildDiagnosticsString()
        {
            var client = WorldCoreClient.Instance;
            if (client == null) return "WorldCoreClient not found";
            var diag = client.ElenaDiagnostics;

            return
                $"[WORLD CORE DIAGNOSTICS (F3)]\n" +
                $"Server: {client.ServerBaseUrl} | Connected: {client.IsConnected}\n" +
                $"Schema: Version {client.SchemaVersion}\n" +
                $"Player: {client.CurrentStatus?.activePlayerId ?? "unknown"}\n" +
                $"Location: {client.CurrentLocationView?.location?.id ?? "unknown"}\n" +
                $"Attendant: {client.CurrentLocationView?.location?.attendant?.name ?? "none"}\n" +
                $"Interaction State: {client.CurrentLocationView?.location?.attendant?.interactionState ?? "none"}\n" +
                $"Elena AI Provider: {diag?.providerId ?? "deterministic"}\n" +
                $"Total Cycles: {diag?.totalCycles ?? 0}\n" +
                $"Last Cycle: {diag?.lastCycle?.status ?? "none"}\n" +
                $"Memories: {diag?.memoriesCount ?? 0}";
        }

        /// <summary>
        /// Immediate-mode GUI renders clean product HUD, camera preset toolbar, pause menu, and exit modal.
        /// </summary>
        private void OnGUI()
        {
            if (Screen.width <= 0 || Screen.height <= 0) return;

            // 1. Top-Left Location Badge
            GUI.Box(new Rect(15, 15, 340, 35), $"<b>📍 {activeLocationName}</b>");

            // 1b. Quick Travel Dropdown (Top-Left, below location badge)
            if (!isMenuModalOpen && !isPauseMenuOpen && !isExitConfirmOpen && !IsAvatarModalOpen)
            {
                DrawQuickTravelUI();
            }

            // Toast notification banner (centered at top)
            if (toastDismissTimer > 0f && !string.IsNullOrEmpty(activeToast))
            {
                DrawToastBanner();
            }

            // Teleportation presentation shimmer effect
            DrawTeleportationEffect();

            // 2. Top-Right World Clock Badge, Avatar Customization Button & Pause Shortcut Button
            if (GUI.Button(new Rect(Screen.width - 415, 15, 85, 35), "<b>👤 Avatar</b>"))
            {
                ToggleAvatarCustomization();
            }

            GUI.Box(new Rect(Screen.width - 295, 15, 235, 35), $"<b>🕒 {activeCivilTimeString}</b>");

            if (GUI.Button(new Rect(Screen.width - 55, 15, 45, 35), "<b>⏸️</b>"))
            {
                if (isPauseMenuOpen) ResumeGame();
                else OpenPauseMenu();
            }

            // Connection indicator dot
            Color originalCol = GUI.color;
            GUI.color = isServerConnected ? new Color(0.2f, 0.9f, 0.3f) : new Color(0.9f, 0.2f, 0.2f);
            GUI.Box(new Rect(Screen.width - 325, 20, 20, 25), "●");
            GUI.color = originalCol;

            // 3. Top-Center Camera Presets Toolbar (visible when no modal window is open)
            if (!isMenuModalOpen && !isPauseMenuOpen && !isExitConfirmOpen && !IsAvatarModalOpen)
            {
                DrawCameraPresetToolbar();
            }

            // 4. Bottom-Left Controls Guide & Cursor State Indicator
            bool isLocked = Cursor.lockState == CursorLockMode.Locked;
            string cursorStatus = isLocked ? "<color=#FFCC00>🔒 [Fijado]</color> (Alt/Tab/Esc para Liberar)" : "<color=#55FF88>🔓 [Libre]</color> (Clic en escena para Fijar)";
            GUI.Box(new Rect(15, Screen.height - 45, 680, 30),
                $"<b><size=11>WASD: Mover | Shift: Correr | C: Avatar | Cursor: {cursorStatus} | 1-6: Cámara | M: Menú | Esc: Menú</size></b>");

            // 5. Center-Bottom Interaction Prompt (only if no modal active)
            if (!isMenuModalOpen && !isPauseMenuOpen && !isExitConfirmOpen && !IsAvatarModalOpen && !string.IsNullOrEmpty(activePrompt))
            {
                GUI.Box(new Rect(Screen.width / 2f - 220, Screen.height - 85, 440, 42), $"<b><size=14>{activePrompt}</size></b>");
            }

            // 6. Elena Dialogue Bubble
            if (dialogueDismissTimer > 0f && !string.IsNullOrEmpty(activeDialogue))
            {
                GUI.Box(new Rect(Screen.width / 2f - 270, Screen.height - 180, 540, 75),
                    $"<b><color=#E05030>{activeSpeaker}</color></b>\n<size=13>\"{activeDialogue}\"</size>");
            }

            // 7. F3 Developer Diagnostics Overlay
            if (showDiagnostics)
            {
                GUI.Box(new Rect(15, 60, 400, 220), BuildDiagnosticsString());
            }

            // 8. WING SPOT RESTAURANT MENU MODAL
            if (isMenuModalOpen)
            {
                DrawRestaurantMenuModal();
            }

            // 9. PAUSE MENU MODAL
            if (isPauseMenuOpen)
            {
                DrawPauseMenuModal();
            }

            // 10. EXIT CONFIRMATION MODAL (renders above pause menu)
            if (isExitConfirmOpen)
            {
                DrawExitConfirmModal();
            }
        }

        /// <summary>
        /// Renders an in-game Camera Preset Toolbar with 6 clickable views and active preset highlighting.
        /// </summary>
        private void DrawCameraPresetToolbar()
        {
            var cam = Camera.main != null ? Camera.main.GetComponent<ThirdPersonCamera>() : FindFirstObjectByType<ThirdPersonCamera>();
            CameraPreset activePreset = cam != null ? cam.ActivePreset : CameraPreset.ThirdPerson;

            float barWidth = 560f;
            float barHeight = 32f;
            float barX = (Screen.width - barWidth) / 2f;
            float barY = 16f;

            GUI.Box(new Rect(barX - 6, barY - 4, barWidth + 12, barHeight + 8), "");

            float btnW = 88f;
            float spacing = 5f;
            float startX = barX;

            Color origBg = GUI.backgroundColor;

            // 1. Third Person
            if (activePreset == CameraPreset.ThirdPerson) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>3rd Person</b>"))
            {
                SetCameraPreset(CameraPreset.ThirdPerson);
            }
            GUI.backgroundColor = origBg;

            // 2. First Person
            startX += btnW + spacing;
            if (activePreset == CameraPreset.FirstPerson) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>1st Person</b>"))
            {
                SetCameraPreset(CameraPreset.FirstPerson);
            }
            GUI.backgroundColor = origBg;

            // 3. Front View
            startX += btnW + spacing;
            if (activePreset == CameraPreset.FrontView) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>Front View</b>"))
            {
                SetCameraPreset(CameraPreset.FrontView);
            }
            GUI.backgroundColor = origBg;

            // 4. Side View
            startX += btnW + spacing;
            if (activePreset == CameraPreset.SideView) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>Side View</b>"))
            {
                SetCameraPreset(CameraPreset.SideView);
            }
            GUI.backgroundColor = origBg;

            // 5. Top-Down
            startX += btnW + spacing;
            if (activePreset == CameraPreset.TopDown) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>Top-Down</b>"))
            {
                SetCameraPreset(CameraPreset.TopDown);
            }
            GUI.backgroundColor = origBg;

            // 6. Reset Camera
            startX += btnW + spacing;
            if (GUI.Button(new Rect(startX, barY, btnW, barHeight), "<b>Reset [6]</b>"))
            {
                ResetCameraPreset();
            }
        }

        /// <summary>
        /// Renders the Pause Menu modal window with Resume, Camera Presets, and Exit Game actions.
        /// </summary>
        private void DrawPauseMenuModal()
        {
            // Dim background overlay
            Color dimColor = new Color(0f, 0f, 0f, 0.75f);
            Color prevColor = GUI.color;
            GUI.color = dimColor;
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = prevColor;

            float modalWidth = 520f;
            float modalHeight = 440f;
            float modalX = (Screen.width - modalWidth) / 2f;
            float modalY = (Screen.height - modalHeight) / 2f;

            // Outer Box
            GUI.Box(new Rect(modalX, modalY, modalWidth, modalHeight), "");

            // Header Banner
            GUI.Box(new Rect(modalX + 15, modalY + 15, modalWidth - 30, 60),
                "<b><size=18><color=#FFAA22>⏸️ JUEGO PAUSADO / PAUSE MENU</color></size></b>\n" +
                "<size=12><color=#CCCCCC>MyVirtualCommunity • Ciudad Juárez, Chihuahua</color></size>");

            // Resume Game Button
            Color origBg = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.20f, 0.75f, 0.35f);
            if (GUI.Button(new Rect(modalX + 35, modalY + 90, modalWidth - 70, 48), "<b><size=14>▶ CONTINUAR / RESUME GAME (Esc)</size></b>"))
            {
                ResumeGame();
            }
            GUI.backgroundColor = origBg;

            // Camera Presets Section in Pause Menu
            GUI.Box(new Rect(modalX + 25, modalY + 155, modalWidth - 50, 160),
                "<b><size=13><color=#FFDD66>📷 VISTAS DE CÁMARA / CAMERA PRESETS</color></size></b>\n\n\n\n\n\n\n" +
                "<i><size=11><color=#AAAAAA>Selecciona una perspectiva o usa las teclas numéricas 1 a 6.</color></size></i>");

            var cam = Camera.main != null ? Camera.main.GetComponent<ThirdPersonCamera>() : FindFirstObjectByType<ThirdPersonCamera>();
            CameraPreset activePreset = cam != null ? cam.ActivePreset : CameraPreset.ThirdPerson;

            float pBtnW = 140f;
            float pBtnH = 32f;
            float pCol1 = modalX + 45;
            float pCol2 = modalX + 45 + pBtnW + 15;
            float pCol3 = modalX + 45 + (pBtnW + 15) * 2;

            // Row 1
            if (activePreset == CameraPreset.ThirdPerson) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(pCol1, modalY + 185, pBtnW, pBtnH), "<b>Third Person [1]</b>")) SetCameraPreset(CameraPreset.ThirdPerson);
            GUI.backgroundColor = origBg;

            if (activePreset == CameraPreset.FirstPerson) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(pCol2, modalY + 185, pBtnW, pBtnH), "<b>First Person [2]</b>")) SetCameraPreset(CameraPreset.FirstPerson);
            GUI.backgroundColor = origBg;

            if (activePreset == CameraPreset.FrontView) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(pCol3, modalY + 185, pBtnW, pBtnH), "<b>Front View [3]</b>")) SetCameraPreset(CameraPreset.FrontView);
            GUI.backgroundColor = origBg;

            // Row 2
            if (activePreset == CameraPreset.SideView) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(pCol1, modalY + 225, pBtnW, pBtnH), "<b>Side View [4]</b>")) SetCameraPreset(CameraPreset.SideView);
            GUI.backgroundColor = origBg;

            if (activePreset == CameraPreset.TopDown) GUI.backgroundColor = new Color(0.25f, 0.85f, 0.45f);
            if (GUI.Button(new Rect(pCol2, modalY + 225, pBtnW, pBtnH), "<b>Top-Down [5]</b>")) SetCameraPreset(CameraPreset.TopDown);
            GUI.backgroundColor = origBg;

            if (GUI.Button(new Rect(pCol3, modalY + 225, pBtnW, pBtnH), "<b>Reset [6]</b>")) ResetCameraPreset();

            // World Core Server Info footer
            GUI.Box(new Rect(modalX + 25, modalY + 330, modalWidth - 50, 36),
                "<i><size=11><color=#BBBBBB>Servidor World Core: Conectado • Estado persistente asegurado</color></size></i>");

            // Exit Game Button
            GUI.backgroundColor = new Color(0.85f, 0.25f, 0.25f);
            if (GUI.Button(new Rect(modalX + 35, modalY + 380, modalWidth - 70, 42), "<b><size=13>🚪 SALIR DEL JUEGO / EXIT GAME</size></b>"))
            {
                RequestExitGame();
            }
            GUI.backgroundColor = origBg;
        }

        /// <summary>
        /// Renders the Exit Confirmation modal window.
        /// </summary>
        private void DrawExitConfirmModal()
        {
            // Darker overlay
            Color dimColor = new Color(0f, 0f, 0f, 0.85f);
            Color prevColor = GUI.color;
            GUI.color = dimColor;
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = prevColor;

            float modalWidth = 480f;
            float modalHeight = 270f;
            float modalX = (Screen.width - modalWidth) / 2f;
            float modalY = (Screen.height - modalHeight) / 2f;

            GUI.Box(new Rect(modalX, modalY, modalWidth, modalHeight), "");

            // Header Banner
            GUI.Box(new Rect(modalX + 15, modalY + 15, modalWidth - 30, 45),
                "<b><size=16><color=#FF5544>⚠️ CONFIRMAR SALIDA / EXIT GAME</color></size></b>");

            // Prompt message
            GUI.Box(new Rect(modalX + 20, modalY + 70, modalWidth - 40, 120),
                "<b>¿Estás seguro de que deseas salir del juego?</b>\n\n" +
                "<size=12><color=#DDDDDD>El servidor World Core permanecerá activo en segundo plano y todo el estado de la comunidad permanece guardado.</color></size>\n\n" +
                "<i><size=11><color=#AAAAAA>Are you sure you want to quit the presentation client?</color></size></i>");

            Color origBg = GUI.backgroundColor;

            // Confirm Exit Button
            GUI.backgroundColor = new Color(0.85f, 0.20f, 0.20f);
            if (GUI.Button(new Rect(modalX + 35, modalY + 205, 195, 45), "<b><size=13>✓ SÍ, SALIR / YES</size></b>"))
            {
                ConfirmExitGame();
            }
            GUI.backgroundColor = origBg;

            // Cancel Button
            GUI.backgroundColor = new Color(0.40f, 0.45f, 0.50f);
            if (GUI.Button(new Rect(modalX + modalWidth - 230, modalY + 205, 195, 45), "<b><size=13>✕ CANCELAR / NO</size></b>"))
            {
                CancelExitGame();
            }
            GUI.backgroundColor = origBg;
        }

        /// <summary>
        /// Renders an authentic, high-quality restaurant menu modal window for Wing Spot Gómez Morín.
        /// </summary>
        private void DrawRestaurantMenuModal()
        {
            // Dim background overlay
            Color dimColor = new Color(0f, 0f, 0f, 0.72f);
            Texture2D dimTex = Texture2D.whiteTexture;
            Color prevColor = GUI.color;
            GUI.color = dimColor;
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), dimTex);
            GUI.color = prevColor;

            // Modal dialog frame
            float modalWidth = 660f;
            float modalHeight = 520f;
            float modalX = (Screen.width - modalWidth) / 2f;
            float modalY = (Screen.height - modalHeight) / 2f;

            // Outer Frame
            GUI.Box(new Rect(modalX, modalY, modalWidth, modalHeight), "");

            // Header Banner
            GUI.Box(new Rect(modalX + 10, modalY + 10, modalWidth - 20, 65),
                "<b><size=20><color=#FFAA22>🍗 WING SPOT — GÓMEZ MORÍN</color></size></b>\n" +
                "<size=12><color=#CCCCCC>Blvd. Manuel Gómez Morín • Ciudad Juárez, Chih. • Menú Oficial de Sucursal</color></size>");

            // Close (X) button in header
            if (GUI.Button(new Rect(modalX + modalWidth - 45, modalY + 15, 30, 28), "<b>X</b>"))
            {
                CloseMenuModal();
            }

            // Section 1: ALITAS Y BONELESS
            GUI.Box(new Rect(modalX + 20, modalY + 85, modalWidth - 40, 115),
                "<b><size=14><color=#FFDD66>★ ALITAS Y BONELESS</color></size></b>\n\n" +
                "<b>Boneless Wings (10 piezas)</b> ......................................... <b><color=#44FF88>$12.00</color></b>\n" +
                "<i><size=11><color=#BBBBBB>Pechuga de pollo empanizada bañada en tu salsa favorita, servida con aderezo ranch.</color></size></i>\n" +
                "<b>Traditional Wings (10 piezas)</b> ...................................... <b><color=#44FF88>$14.00</color></b>\n" +
                "<i><size=11><color=#BBBBBB>Alitas clásicas crujientes bañadas en salsa a elección con bastones de apio fresco.</color></size></i>");

            // Section 2: SALSAS Y ADEREZOS DE LA CASA
            GUI.Box(new Rect(modalX + 20, modalY + 210, modalWidth - 40, 80),
                "<b><size=14><color=#FFDD66>🔥 SALSAS Y ADEREZOS DE LA CASA</color></size></b>\n\n" +
                "<size=12>• <b>Mango Habanero</b> <i>(Picante Dulce)</i>       • <b>Buffalo Classic</b> <i>(Tradicional)</i>\n" +
                "• <b>Honey BBQ</b> <i>(Ahumado Suave)</i>           • <b>Lemon Pepper</b> <i>(Cítrico Especiado)</i>\n" +
                "• <b>Garlic Parmesan</b> <i>(Ajo y Parmesano)</i>     • <b>Ranch Especial</b></size>");

            // Section 3: COMPLEMENTOS Y BEBIDAS
            GUI.Box(new Rect(modalX + 20, modalY + 300, modalWidth - 40, 115),
                "<b><size=14><color=#FFDD66>🍟 COMPLEMENTOS Y BEBIDAS</color></size></b>\n\n" +
                "<b>Seasoned French Fries (Papas Sazonadas)</b> ............................. <b><color=#44FF88>$4.50</color></b>\n" +
                "<i><size=11><color=#BBBBBB>Papas a la francesa de corte clásico con sal sazonada especial de la casa.</color></size></i>\n" +
                "<b>Fountain Soda (Refresco de Máquina 500ml)</b> ......................... <b><color=#44FF88>$2.50</color></b>\n" +
                "<i><size=11><color=#BBBBBB>Variedad de refrescos de máquina bien fríos (Coca-Cola, Sprite, Fanta, Agua).</color></size></i>");

            // Attendant & Status Footer
            GUI.Box(new Rect(modalX + 20, modalY + 425, modalWidth - 40, 35),
                "<i><size=11><color=#DDDDDD>Atendido en mostrador por: <b>Elena Morales</b> • Orden autorizada vía World Core</color></size></i>");

            // Close Menu Button
            if (GUI.Button(new Rect(modalX + (modalWidth - 220) / 2f, modalY + 470, 220, 38), "<b><size=13>[ Cerrar Menú (Esc) ]</size></b>"))
            {
                CloseMenuModal();
            }
        }

        /// <summary>
        /// Renders the compact Quick Travel expandable/collapsible menu with up to 6 slots.
        /// </summary>
        private void DrawQuickTravelUI()
        {
            var qtController = QuickTravelController.Instance ?? FindFirstObjectByType<QuickTravelController>();
            if (qtController == null || qtController.Config == null) return;

            string toggleLabel = isQuickTravelMenuOpen ? "<b>🚀 Quick Travel ▲</b>" : "<b>🚀 Quick Travel ▼</b>";
            if (GUI.Button(new Rect(15, 55, 150, 30), toggleLabel))
            {
                isQuickTravelMenuOpen = !isQuickTravelMenuOpen;
            }

            if (isQuickTravelMenuOpen)
            {
                var destinations = qtController.Config.destinations;
                int count = destinations != null ? destinations.Count : 0;
                float panelW = 270f;
                float itemH = 36f;
                float panelH = count * itemH + 34f;

                GUI.Box(new Rect(15, 90, panelW, panelH), "<b>Destinos de Viaje Rápido</b>");

                Color origCol = GUI.backgroundColor;
                for (int i = 0; i < count; i++)
                {
                    var dest = destinations[i];
                    Rect btnRect = new Rect(22, 116 + i * itemH, panelW - 14, 30);

                    if (dest.isEnabled)
                    {
                        GUI.backgroundColor = new Color(0.25f, 0.85f, 0.55f);
                        if (GUI.Button(btnRect, $"<b>{dest.displayName}</b>"))
                        {
                            isQuickTravelMenuOpen = false;
                            qtController.RequestQuickTravel(dest);
                        }
                    }
                    else
                    {
                        GUI.backgroundColor = new Color(0.40f, 0.40f, 0.44f);
                        if (GUI.Button(btnRect, $"<color=#AAAAAA>🔒 {dest.displayName}</color>"))
                        {
                            ShowToast($"'{dest.displayName}' se habilitará en una futura expansión del mapa.");
                        }
                    }
                    GUI.backgroundColor = origCol;
                }
            }
        }

        /// <summary>
        /// Renders a prominent toast notification banner at the top of the screen.
        /// </summary>
        private void DrawToastBanner()
        {
            float w = 540f;
            float h = 42f;
            float x = (Screen.width - w) / 2f;
            float y = 58f;

            Color prevCol = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.12f, 0.14f, 0.18f, 0.95f);
            GUI.Box(new Rect(x, y, w, h), $"<b><size=13>{activeToast}</size></b>");
            GUI.backgroundColor = prevCol;
        }

        /// <summary>
        /// Renders the fullscreen phase-shift shimmer effect during quick travel / teleportation.
        /// </summary>
        private void DrawTeleportationEffect()
        {
            var qtController = QuickTravelController.Instance ?? FindFirstObjectByType<QuickTravelController>();
            if (qtController == null || !qtController.IsTeleporting) return;

            float alpha = qtController.TeleportAlpha;
            if (alpha <= 0.01f) return;

            if (shimmerTexture == null)
            {
                shimmerTexture = new Texture2D(1, 1);
                shimmerTexture.SetPixel(0, 0, Color.white);
                shimmerTexture.Apply();
            }

            Color prevCol = GUI.color;
            // Azure/cyan shimmer overlay
            GUI.color = new Color(0.15f, 0.85f, 1.0f, alpha * 0.48f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), shimmerTexture);
            GUI.color = prevCol;

            if (alpha > 0.4f)
            {
                float bannerW = 420f;
                float bannerH = 64f;
                float bx = (Screen.width - bannerW) / 2f;
                float by = (Screen.height - bannerH) / 2f;

                Color prevBg = GUI.backgroundColor;
                GUI.backgroundColor = new Color(0.10f, 0.12f, 0.16f, 0.90f);
                GUI.Box(new Rect(bx, by, bannerW, bannerH),
                    $"<b><size=18><color=#55EEFF>✨ Viajando a {qtController.CurrentTargetName}...</color></size></b>\n" +
                    "<size=12><color=#CCCCCC>Alineando coordenadas authoritative World Core</color></size>");
                GUI.backgroundColor = prevBg;
            }
        }
    }
}
