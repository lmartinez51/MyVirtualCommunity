using System;
using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Core
{
    // =========================================================================
    // Authoritative State Models & DTOs
    // Matches World Core HTTP endpoints (/api/status, /api/location, /api/npc/*)
    // =========================================================================

    [Serializable]
    public class WorldStatusResponse
    {
        public bool success;
        public WorldStatusData result;
    }

    [Serializable]
    public class WorldStatusData
    {
        public string status;
        public int schemaVersion;
        public string worldTime;
        public bool ready;
        public string activePlayerId;
        public string worldSeed;
    }

    [Serializable]
    public class CivilTimeDto
    {
        public int year;
        public int month;
        public int day;
        public int hour;
        public int minute;
        public int second;
        public string isoDate;
        public string timeZone;
        public string displayString;
    }

    [Serializable]
    public class AttendantInfo
    {
        public string id;
        public string agentId; // alias
        public string name;
        public string establishmentId;
        public string role;
        public bool isPresent;
        public string locationId;
        public string interiorSpaceId;
        public string activityState;
        public string interactionState; // "available", "service-accepted", "off-duty"
    }

    [Serializable]
    public class LocationDetails
    {
        public string id;
        public string name;
        public string type;
        public string parentPlaceId;
        public CivilTimeDto civilTime;
        public AttendantInfo attendant;
    }

    [Serializable]
    public class SpatialPosition
    {
        public float x;
        public float y;
        public float z;
    }

    [Serializable]
    public class SpatialData
    {
        public SpatialPosition currentPosition;
        public float currentOrientation;
        public string entranceId;
    }

    [Serializable]
    public class AvailableAction
    {
        public string id;
        public string label;
        public string commandName;
        public bool isAvailable;
    }

    [Serializable]
    public class TemporalContextDto
    {
        public CivilTimeDto civilTime;
    }

    [Serializable]
    public class LocationViewResponse
    {
        public bool success;
        public LocationViewData result;
    }

    [Serializable]
    public class LocationViewData
    {
        public string playerId;
        public LocationDetails location;
        public TemporalContextDto temporalContext;
        public SpatialData spatial;
        public List<AvailableAction> availableActions;
    }

    [Serializable]
    public class ServerErrorDto
    {
        public string code;
        public string message;
    }

    [Serializable]
    public class CommandResultDto
    {
        public bool success;
        public string code;
        public string message;
        public string prompt;
    }

    [Serializable]
    public class CommandEnvelope
    {
        public bool success;
        public bool committed;
        public CommandResultDto result;
        public ServerErrorDto error;
    }

    [Serializable]
    public class CommandResponse
    {
        public bool success;
        public string code;
        public string message;
        public string commandName;
        public CommandResultDto result;
    }

    // =========================================================================
    // NPC AI Perception & Diagnostics DTOs
    // =========================================================================

    [Serializable]
    public class EstablishmentPerception
    {
        public string id;
        public string name;
        public string operationalState;
    }

    [Serializable]
    public class PerceivedPlayerInfo
    {
        public string id;
        public string name;
        public bool isCoLocated;
        public bool hasActiveService;
    }

    [Serializable]
    public class NpcPerceptionData
    {
        public string agentId;
        public string agentName;
        public string role;
        public string locationId;
        public string interiorSpaceId;
        public bool isOnDutyShift;
        public EstablishmentPerception establishment;
        public PerceivedPlayerInfo perceivedPlayer;
        public CivilTimeDto civilTime;
    }

    [Serializable]
    public class NpcPerceptionResponse
    {
        public bool success;
        public NpcPerceptionData result;
    }

    [Serializable]
    public class NpcActionProposalData
    {
        public string actionType;
        public string targetAgentId;
        public string establishmentId;
        public string requestedAt;
        public string reasoningContext;
    }

    [Serializable]
    public class NpcAiCycleData
    {
        public string cycleId;
        public string agentId;
        public string worldTime;
        public string status; // "executed", "noop", "invalid_proposal", "provider_failed"
        public NpcActionProposalData proposal;
        public CommandResponse commandDispatched;
        public int durationMs;
    }

    [Serializable]
    public class NpcAiCycleResponse
    {
        public bool success;
        public NpcAiCycleData result;
    }

    [Serializable]
    public class NpcAiDiagnosticsData
    {
        public string agentId;
        public string providerId;
        public int totalCycles;
        public NpcAiCycleData lastCycle;
        public int memoriesCount;
    }

    [Serializable]
    public class NpcAiDiagnosticsResponse
    {
        public bool success;
        public NpcAiDiagnosticsData result;
    }
}
