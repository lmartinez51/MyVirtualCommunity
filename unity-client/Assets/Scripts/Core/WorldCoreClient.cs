using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace MyVirtualCommunity.Core
{
    /// <summary>
    /// WorldCoreClient provides the authoritative HTTP bridge between the Unity 3D presentation layer
    /// and the Node.js/TypeScript World Core server.
    /// 
    /// INVARIANT (Section 19):
    /// Unity is STRICTLY presentation-only.
    /// This client never invents or validates world mutations locally.
    /// All mutations flow through authoritative commands evaluated by World Core.
    /// </summary>
    public class WorldCoreClient : MonoBehaviour
    {
        public static WorldCoreClient Instance { get; private set; }

        [Header("Server Configuration")]
        [SerializeField] private string serverBaseUrl = "http://127.0.0.1:3000";
        [SerializeField] private float pollIntervalSeconds = 1.0f;
        [SerializeField] private bool autoConnectOnStart = true;

        [Header("State")]
        [SerializeField] private bool isConnected = false;
        [SerializeField] private string activePlayerId = "agent:gomez-morin-player";
        [SerializeField] private int schemaVersion = 19;

        // Cached authoritative views
        public WorldStatusData CurrentStatus { get; private set; }
        public LocationViewData CurrentLocationView { get; private set; }
        public NpcAiDiagnosticsData ElenaDiagnostics { get; private set; }
        // Milestone 94: Camila diagnostics (Elena property kept for back-compat).
        public NpcAiDiagnosticsData CamilaDiagnostics { get; private set; }
        public Dictionary<string, NpcAiDiagnosticsData> NpcDiagnosticsByAgent { get; } =
            new Dictionary<string, NpcAiDiagnosticsData>();

        // Events
        public event Action<bool, string> OnConnectionStatusChanged;
        public event Action<LocationViewData> OnWorldStateHydrated;
        public event Action<AttendantInfo> OnAttendantStateChanged;
        public event Action<NpcAiCycleData> OnAiCycleExecuted;

        private Coroutine pollCoroutine;
        private string lastKnownInteractionState = "";

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            BusinessScheduleRegistry.AuthoritativeTimeProvider = GetAuthoritativeWorldTimeUtc;
            ConfigureServerUrl();
        }

        private void ConfigureServerUrl()
        {
            // 1. Environment variables
            string envUrl = System.Environment.GetEnvironmentVariable("WORLD_CORE_URL");
            if (!string.IsNullOrEmpty(envUrl))
            {
                serverBaseUrl = envUrl.TrimEnd('/');
            }
            else
            {
                string envPort = System.Environment.GetEnvironmentVariable("WORLD_CORE_PORT");
                if (!string.IsNullOrEmpty(envPort) && int.TryParse(envPort, out int port))
                {
                    serverBaseUrl = $"http://127.0.0.1:{port}";
                }
            }

            // 2. Command-line arguments (override env vars)
            string[] args = System.Environment.GetCommandLineArgs();
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i].Equals("-serverUrl", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    {
                        serverBaseUrl = args[i + 1].TrimEnd('/');
                        i++;
                    }
                    else if (args[i].Equals("-serverPort", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    {
                        if (int.TryParse(args[i + 1], out int port))
                        {
                            serverBaseUrl = $"http://127.0.0.1:{port}";
                        }
                        i++;
                    }
                }
            }

            // Normalize localhost to 127.0.0.1 for consistent IPv4 binding across platforms
            if (serverBaseUrl.Contains("localhost"))
            {
                serverBaseUrl = serverBaseUrl.Replace("localhost", "127.0.0.1");
            }

            Debug.Log($"[WorldCoreClient] Active server base URL: {serverBaseUrl}");
        }

        private void Start()
        {
            if (autoConnectOnStart)
            {
                Connect();
            }
        }

        public void Connect()
        {
            if (pollCoroutine != null)
            {
                StopCoroutine(pollCoroutine);
            }
            pollCoroutine = StartCoroutine(PollRoutine());
        }

        public void Disconnect()
        {
            if (pollCoroutine != null)
            {
                StopCoroutine(pollCoroutine);
                pollCoroutine = null;
            }
            SetConnectionState(false, "Disconnected by client");
        }

        private void SetConnectionState(bool connected, string reason)
        {
            if (isConnected != connected)
            {
                isConnected = connected;
                OnConnectionStatusChanged?.Invoke(isConnected, reason);
            }
        }

        /// <summary>
        /// Periodic hydration and synchronization loop.
        /// Reconstructs authoritative state upon reconnect.
        /// </summary>
        private IEnumerator PollRoutine()
        {
            while (true)
            {
                yield return CheckServerStatus();

                if (isConnected)
                {
                    yield return FetchLocationView();
                    yield return FetchNpcDiagnostics("agent:elena-npc");
                    yield return FetchNpcDiagnostics("agent:camila-npc");
                }

                yield return new WaitForSeconds(pollIntervalSeconds);
            }
        }

        public IEnumerator CheckServerStatus()
        {
            string url = $"{serverBaseUrl}/api/status";
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.timeout = 3;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var res = JsonUtility.FromJson<WorldStatusResponse>(req.downloadHandler.text);
                        if (res != null && res.success && res.result != null)
                        {
                            CurrentStatus = res.result;
                            schemaVersion = res.result.schemaVersion;
                            activePlayerId = res.result.activePlayerId;
                            SetConnectionState(true, "Connected to World Core");
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[WorldCoreClient] Error parsing status: {ex.Message}");
                    }
                }
                else
                {
                    SetConnectionState(false, $"Connection error: {req.error}");
                }
            }
        }

        public IEnumerator FetchLocationView()
        {
            string url = $"{serverBaseUrl}/api/location";
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.timeout = 3;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var res = JsonUtility.FromJson<LocationViewResponse>(req.downloadHandler.text);
                        if (res != null && res.success && res.result != null)
                        {
                            CurrentLocationView = res.result;
                            OnWorldStateHydrated?.Invoke(CurrentLocationView);

                            var attendant = res.result.location?.attendant;
                            if (attendant != null)
                            {
                                string currentState = attendant.interactionState ?? "none";
                                if (currentState != lastKnownInteractionState)
                                {
                                    lastKnownInteractionState = currentState;
                                    OnAttendantStateChanged?.Invoke(attendant);
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[WorldCoreClient] Error parsing location: {ex.Message}");
                    }
                }
            }
        }

        /// <summary>
        /// Milestone 94: generic NPC diagnostics fetch. FetchElenaDiagnostics
        /// is kept as a back-compat wrapper around it.
        /// </summary>
        public IEnumerator FetchNpcDiagnostics(string agentId)
        {
            string url = $"{serverBaseUrl}/api/npc/{agentId}/diagnostics";
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.timeout = 3;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var res = JsonUtility.FromJson<NpcAiDiagnosticsResponse>(req.downloadHandler.text);
                        if (res != null && res.success)
                        {
                            NpcDiagnosticsByAgent[agentId] = res.result;
                            if (agentId == "agent:elena-npc") ElenaDiagnostics = res.result;
                            if (agentId == "agent:camila-npc") CamilaDiagnostics = res.result;
                        }
                    }
                    catch (Exception) { /* Non-critical diagnostic */ }
                }
            }
        }

        public IEnumerator FetchElenaDiagnostics()
        {
            yield return FetchNpcDiagnostics("agent:elena-npc");
        }

        /// <summary>
        /// Sends an authoritative command to World Core.
        /// </summary>
        public IEnumerator SendCommand(string commandName, string jsonPayload, Action<CommandResponse> onComplete)
        {
            string url = $"{serverBaseUrl}/api/commands/{commandName}";
            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonPayload);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 5;

                yield return req.SendWebRequest();

                CommandResponse response = null;
                string responseText = req.downloadHandler != null ? req.downloadHandler.text : null;

                if (!string.IsNullOrEmpty(responseText))
                {
                    try
                    {
                        var envelope = JsonUtility.FromJson<CommandEnvelope>(responseText);
                        if (envelope != null)
                        {
                            response = new CommandResponse
                            {
                                success = envelope.success,
                                code = envelope.result?.code ?? envelope.error?.code ?? (req.result == UnityWebRequest.Result.Success ? "success" : "domain-error"),
                                message = envelope.result?.message ?? envelope.error?.message ?? req.error,
                                commandName = commandName,
                                result = envelope.result
                            };
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[WorldCoreClient] Error parsing command response: {ex.Message}");
                    }
                }

                if (response == null)
                {
                    response = new CommandResponse
                    {
                        success = req.result == UnityWebRequest.Result.Success,
                        code = req.result == UnityWebRequest.Result.Success ? "success" : "network-error",
                        message = req.error,
                        commandName = commandName
                    };
                }

                // Immediately refresh location view after command execution
                StartCoroutine(FetchLocationView());

                onComplete?.Invoke(response);
            }
        }

        /// <summary>
        /// Fetches read-only bounded perception for an NPC (used on startup to hydrate
        /// Camila's physical spawn location and held object from World Core truth).
        /// </summary>
        public IEnumerator FetchNpcPerception(string agentId, Action<NpcPerceptionData> onComplete)
        {
            string url = $"{serverBaseUrl}/api/npc/{agentId}/perception";
            NpcPerceptionData resultData = null;

            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                req.timeout = 8;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var res = JsonUtility.FromJson<NpcPerceptionResponse>(req.downloadHandler.text);
                        if (res != null && res.success && res.result != null)
                        {
                            resultData = res.result;
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[WorldCoreClient] Error parsing NPC perception for {agentId}: {ex.Message}");
                    }
                }
            }

            onComplete?.Invoke(resultData);
        }

        /// <summary>
        /// Living World: notifies World Core when the human Player moves/drops/kicks
        /// a tangible world prop so Camila perceives the new location & delta.
        /// </summary>
        public IEnumerator SyncWorldPropPosition(string objectId, Vector3 position)
        {
            if (string.IsNullOrEmpty(objectId) || !IsConnected) yield break;

            string url = $"{serverBaseUrl}/api/world/props/sync";
            string safeId = objectId.Replace("\"", "");
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            string payload = $"{{\"objectId\":\"{safeId}\",\"position\":{{\"x\":{position.x.ToString(inv)},\"y\":{position.y.ToString(inv)},\"z\":{position.z.ToString(inv)}}}}}";

            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(payload);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 6;
                yield return req.SendWebRequest();
            }
        }

        /// <summary>
        /// Triggers an authoritative AI cognition cycle for an NPC.
        /// Always invokes onComplete (with null on failure) so callers never deadlock.
        /// </summary>
        public IEnumerator TriggerNpcAiCycle(string agentId, Action<NpcAiCycleData> onComplete, string liveContextJson = null)
        {
            string url = $"{serverBaseUrl}/api/npc/{agentId}/cycle";
            NpcAiCycleData cycleResult = null;

            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = string.IsNullOrEmpty(liveContextJson)
                    ? new byte[0]
                    : Encoding.UTF8.GetBytes(liveContextJson);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                // Muse Spark 1.3 with reasoningEffort='medium' can take 8-22s
                req.timeout = 35;

                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var res = JsonUtility.FromJson<NpcAiCycleResponse>(req.downloadHandler.text);
                        if (res != null && res.success && res.result != null)
                        {
                            cycleResult = res.result;
                            OnAiCycleExecuted?.Invoke(cycleResult);
                            StartCoroutine(FetchLocationView());
                        }
                        else
                        {
                            Debug.LogWarning($"[WorldCoreClient] AI cycle for {agentId} returned unsuccessful payload: {req.downloadHandler.text}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[WorldCoreClient] Error parsing AI cycle: {ex.Message}");
                    }
                }
                else
                {
                    Debug.LogWarning($"[WorldCoreClient] AI cycle HTTP failure for {agentId} ({req.responseCode}): {req.error} {req.downloadHandler?.text}");
                }
            }

            onComplete?.Invoke(cycleResult);
        }

        /// <summary>
        /// Milestone 94: Reports physical arrival (or interruption) of an active NPC traversal
        /// to World Core (POST /api/npc/:agentId/arrival) so M69/M73 commits Agent.locationId.
        /// </summary>
        public IEnumerator ReportNpcArrival(
            string agentId,
            string destinationPlaceId,
            string status = "arrived",
            string message = null,
            Action<bool> onComplete = null)
        {
            string url = $"{serverBaseUrl}/api/npc/{agentId}/arrival";
            string safeDest = (destinationPlaceId ?? "").Replace("\"", "");
            string safeStatus = (status ?? "arrived").Replace("\"", "");
            string safeMsg = (message ?? "").Replace("\"", "'");
            string payload = $"{{\"destinationPlaceId\":\"{safeDest}\",\"status\":\"{safeStatus}\",\"message\":\"{safeMsg}\"}}";

            bool succeeded = false;
            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(payload);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 10;

                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    succeeded = true;
                    StartCoroutine(FetchNpcDiagnostics(agentId));
                }
                else
                {
                    Debug.LogWarning($"[WorldCoreClient] ReportNpcArrival failed for {agentId} ({req.responseCode}): {req.error}");
                }
            }

            onComplete?.Invoke(succeeded);
        }

        /// <summary>
        /// Milestone 94 Phase 2a: Reports the physical result of a dispatched Camila
        /// push (or its failure) to World Core (POST /api/npc/:agentId/object-interaction)
        /// so the object's new position is committed — or nothing is committed on failure.
        /// Floats are formatted with InvariantCulture so a comma-decimal locale never
        /// produces invalid JSON.
        /// </summary>
        public IEnumerator ReportObjectInteraction(
            string agentId,
            string targetObjectId,
            string status = "applied",
            Vector3 newPosition = default,
            string message = null,
            Action<bool> onComplete = null)
        {
            string url = $"{serverBaseUrl}/api/npc/{agentId}/object-interaction";
            string safeTarget = (targetObjectId ?? "").Replace("\"", "");
            string safeStatus = (status ?? "failed").Replace("\"", "");
            string safeMsg = (message ?? "").Replace("\"", "'");
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            string payload = $"{{\"targetObjectId\":\"{safeTarget}\",\"status\":\"{safeStatus}\",\"newPosition\":{{\"x\":{newPosition.x.ToString(inv)},\"y\":{newPosition.y.ToString(inv)},\"z\":{newPosition.z.ToString(inv)}}},\"message\":\"{safeMsg}\"}}";

            bool succeeded = false;
            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(payload);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 10;

                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    succeeded = true;
                    StartCoroutine(FetchNpcDiagnostics(agentId));
                }
                else
                {
                    Debug.LogWarning($"[WorldCoreClient] ReportObjectInteraction failed for {agentId} ({req.responseCode}): {req.error}");
                }
            }

            onComplete?.Invoke(succeeded);
        }

        /// <summary>
        /// Parses the authoritative simulation world time received from World Core.
        /// Returns null if not yet connected or hydrated.
        /// </summary>
        /// <summary>
        /// Living World: notifies World Core when the human Player moves a prop or
        /// changes its physical substance state (water/sand/pothole fill) so Camila perceives it.
        /// </summary>
        public IEnumerator SyncWorldPropState(
            string objectId,
            Vector3 position,
            string contents = null,
            float waterLevel = -1f,
            float sandFillLevel = -1f,
            int chalkMarks = -1)
        {
            if (string.IsNullOrEmpty(objectId)) yield break;
            string url = $"{serverBaseUrl}/api/world/props/sync";
            string safeId = objectId.Replace("\"", "");
            var inv = System.Globalization.CultureInfo.InvariantCulture;

            var stateParts = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrEmpty(contents)) stateParts.Add($"\"contents\":\"{contents.Replace("\"", "")}\"");
            if (waterLevel >= 0f) stateParts.Add($"\"waterLevel\":{waterLevel.ToString("F2", inv)}");
            if (sandFillLevel >= 0f) stateParts.Add($"\"sandFillLevel\":{sandFillLevel.ToString("F2", inv)}");
            if (chalkMarks >= 0) stateParts.Add($"\"chalkMarks\":{chalkMarks}");

            string stateJson = stateParts.Count > 0 ? $",\"physicalState\":{{{string.Join(",", stateParts)}}}" : "";
            string payload = $"{{\"objectId\":\"{safeId}\",\"position\":{{\"x\":{position.x.ToString(inv)},\"y\":{position.y.ToString(inv)},\"z\":{position.z.ToString(inv)}}}{stateJson}}}";

            using (UnityWebRequest req = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(payload);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 8;
                yield return req.SendWebRequest();
            }
        }

        public DateTime? AuthoritativeWorldTimeUtc
        {
            get
            {
                if (CurrentStatus != null && !string.IsNullOrEmpty(CurrentStatus.worldTime))
                {
                    if (DateTime.TryParse(CurrentStatus.worldTime, null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out DateTime dt))
                    {
                        return dt;
                    }
                }
                if (CurrentLocationView != null && CurrentLocationView.temporalContext != null && CurrentLocationView.temporalContext.civilTime != null)
                {
                    var ct = CurrentLocationView.temporalContext.civilTime;
                    if (!string.IsNullOrEmpty(ct.isoDate))
                    {
                        if (DateTime.TryParse(ct.isoDate, null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out DateTime dt))
                        {
                            return dt;
                        }
                    }
                }
                return null;
            }
        }

        /// <summary>
        /// Returns authoritative world time if available, or DateTime.UtcNow if disconnected/standalone.
        /// </summary>
        public DateTime GetAuthoritativeWorldTimeUtc()
        {
            if (AuthoritativeWorldTimeUtc.HasValue)
            {
                return AuthoritativeWorldTimeUtc.Value;
            }
            return DateTime.UtcNow;
        }

        public bool IsConnected => isConnected;
        public string ServerBaseUrl => serverBaseUrl;
        public int SchemaVersion => schemaVersion;
    }
}
