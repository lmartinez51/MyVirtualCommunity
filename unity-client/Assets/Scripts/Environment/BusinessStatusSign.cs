using System;
using UnityEngine;
using MyVirtualCommunity.Core;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Automatic business status signage mounted above customer-facing entrances.
    /// Dynamically displays operational availability, closing cutoff, and operating hours.
    /// </summary>
    public class BusinessStatusSign : MonoBehaviour
    {
        [Header("Configuration")]
        [Tooltip("The World Core business entity ID (e.g. 'restaurant:wing-spot').")]
        [SerializeField] private string businessId = "restaurant:wing-spot";

        [Header("Display Elements")]
        [SerializeField] private TextMesh statusTextMesh;
        [SerializeField] private TextMesh subtitleTextMesh;
        [SerializeField] private Renderer backingRenderer;

        [Header("Color Palette")]
        [SerializeField] private Color openColor = new Color(0.18f, 0.80f, 0.44f); // Emerald Green
        [SerializeField] private Color closingSoonColor = new Color(0.95f, 0.55f, 0.15f); // Amber Orange
        [SerializeField] private Color closedColor = new Color(0.90f, 0.25f, 0.20f); // Crimson Red

        private BusinessOperationalState lastEvaluatedState = (BusinessOperationalState)(-1);
        private float updateInterval = 1.0f;
        private float nextUpdateTime = 0f;
        private DateTime? simulatedTimeOverride = null;

        public string BusinessId { get => businessId; set => businessId = value; }
        public BusinessOperationalState CurrentState => lastEvaluatedState;
        public string StatusText => statusTextMesh != null ? statusTextMesh.text : "";
        public string SubtitleText => subtitleTextMesh != null ? subtitleTextMesh.text : "";

        private DateTime ResolveEvaluationTime()
        {
            if (simulatedTimeOverride.HasValue) return simulatedTimeOverride.Value;
            return BusinessScheduleRegistry.GetAuthoritativeTimeUtc();
        }

        private void OnEnable()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated += HandleWorldStateHydrated;
            }
        }

        private void OnDisable()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated -= HandleWorldStateHydrated;
            }
        }

        private void HandleWorldStateHydrated(LocationViewData view)
        {
            UpdateDisplay(ResolveEvaluationTime());
        }

        private void Start()
        {
            if (WorldCoreClient.Instance != null)
            {
                WorldCoreClient.Instance.OnWorldStateHydrated -= HandleWorldStateHydrated;
                WorldCoreClient.Instance.OnWorldStateHydrated += HandleWorldStateHydrated;
            }
            UpdateDisplay(ResolveEvaluationTime());
        }

        private void Update()
        {
            if (Time.time >= nextUpdateTime)
            {
                nextUpdateTime = Time.time + updateInterval;
                UpdateDisplay(ResolveEvaluationTime());
            }
        }

        public void Configure(string id, TextMesh statusMesh, TextMesh subMesh, Renderer backing = null)
        {
            businessId = id;
            statusTextMesh = statusMesh;
            subtitleTextMesh = subMesh;
            backingRenderer = backing;
            UpdateDisplay(ResolveEvaluationTime());
        }

        /// <summary>
        /// Explicit time override for unit tests and simulation scenarios.
        /// </summary>
        public void SetSimulatedTime(DateTime utcTime)
        {
            simulatedTimeOverride = utcTime;
            UpdateDisplay(utcTime);
        }

        public void ClearSimulatedTime()
        {
            simulatedTimeOverride = null;
            UpdateDisplay(ResolveEvaluationTime());
        }

        private MaterialPropertyBlock _statusPropBlock = null;
        private MaterialPropertyBlock _subPropBlock = null;

        private void SetTextColor(TextMesh tm, ref MaterialPropertyBlock block, Color color)
        {
            if (tm == null) return;
            tm.color = color;
            var rend = tm.GetComponent<Renderer>();
            if (rend != null)
            {
                if (block == null) block = new MaterialPropertyBlock();
                rend.GetPropertyBlock(block);
                block.SetColor("_Color", Color.white);
                rend.SetPropertyBlock(block);
            }
        }

        /// <summary>
        /// Explicit update entry point for tests and time transitions.
        /// </summary>
        public void UpdateDisplay(DateTime utcTime)
        {
            var schedule = BusinessScheduleRegistry.GetSchedule(businessId);
            var state = BusinessScheduleRegistry.EvaluateStatus(businessId, utcTime);
            lastEvaluatedState = state;

            string openStr = schedule != null ? $"{schedule.hours.openHour:D2}:{schedule.hours.openMinute:D2}" : "09:00";
            string closeStr = schedule != null ? $"{schedule.hours.closeHour:D2}:{schedule.hours.closeMinute:D2}" : "18:00";

            // High-contrast solid black lettering for operating hours / subtitle on white card background
            Color subtitleBlack = new Color(0.10f, 0.10f, 0.12f);

            switch (state)
            {
                case BusinessOperationalState.Open:
                    if (statusTextMesh != null)
                    {
                        statusTextMesh.text = "ABIERTO";
                        SetTextColor(statusTextMesh, ref _statusPropBlock, openColor);
                    }
                    if (subtitleTextMesh != null)
                    {
                        subtitleTextMesh.text = $"Cierre: {closeStr}";
                        SetTextColor(subtitleTextMesh, ref _subPropBlock, subtitleBlack);
                    }
                    break;

                case BusinessOperationalState.ClosingSoon:
                    if (statusTextMesh != null)
                    {
                        statusTextMesh.text = "CIERRE PRÓXIMO";
                        SetTextColor(statusTextMesh, ref _statusPropBlock, closingSoonColor);
                    }
                    if (subtitleTextMesh != null)
                    {
                        subtitleTextMesh.text = "NO SE PERMITE EL INGRESO";
                        SetTextColor(subtitleTextMesh, ref _subPropBlock, subtitleBlack);
                    }
                    break;

                case BusinessOperationalState.Closed:
                default:
                    if (statusTextMesh != null)
                    {
                        statusTextMesh.text = "CERRADO";
                        SetTextColor(statusTextMesh, ref _statusPropBlock, closedColor);
                    }
                    if (subtitleTextMesh != null)
                    {
                        subtitleTextMesh.text = $"Horario: {openStr} - {closeStr}";
                        SetTextColor(subtitleTextMesh, ref _subPropBlock, subtitleBlack);
                    }
                    break;
            }
        }
    }
}
